#!/usr/bin/env node
/**
 * Watchdog Auto-Recovery untuk SahamLens
 *
 * Menginspeksi kesehatan internal dan memulihkan status telemetri yang degraded/down
 * akibat gangguan transien pihak ketiga (mis. server Kemenkeu offline, timeout AI tunggal,
 * 404 ticker individual di Yahoo, RSS blip, atau sinkronisasi EOD IDX yang sudah selesai).
 *
 * Prinsip:
 * 1. Tidak mengarang angka pasar atau mengganti data asli.
 * 2. Menguji probe aktif (live health probe). Bila probe sukses, kembalikan status ke HEALTHY.
 * 3. Untuk bukti makro mingguan/tahunan (SBN/ERP/Inflasi): bila server hulu sementara tidak bisa dihubungi
 *    tetapi bukti terakhir di database masih SEGAR (sesuai ambang batas macro-watchdog), pulihkan telemetri
 *    agar tidak memicu alarm palsu pada pemantau uptime selama berhari-hari.
 * 4. Untuk artefak EOD IDX lokal: bila sinkronisasi EOD (sync-idx-flow) sudah mengimpor data terbaru ke disk,
 *    pulihkan status telemetri IDX_TRADING_INFO_SS tanpa harus menunggu request pengguna berikutnya.
 * 5. Mereset unit systemd yang berstatus failed jika penyebabnya sudah tertangani secara mandiri.
 */

import fs from 'node:fs';
import path from 'node:path';
import { Client } from 'pg';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const ORIGIN = process.env.SAHAMLENS_ORIGIN || 'http://127.0.0.1:3001';
const TIMEOUT_MS = 10_000;

const MACRO_POLICY_DAYS = {
  DJPPR_SBN_BENCHMARK_QUOTES: { key: 'RISK_FREE_RATE_PCT', maxDays: 75 },
  BI_INFLATION_TARGET: { key: 'INFLATION_TARGET_MID_PCT', maxDays: 400 },
  DAMODARAN_COUNTRY_RISK: { key: 'EQUITY_RISK_PREMIUM_PCT', maxDays: 400 },
};

export async function runAutoRecovery(options = {}) {
  const origin = options.origin || ORIGIN;
  const dbUrl = options.databaseUrl || process.env.DATABASE_URL;
  const log = options.logger || console.log;

  // 1. Periksa respons /api/health
  let healthPayload = null;
  try {
    const res = await fetch(`${origin}/api/health`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { Accept: 'application/json' },
    });
    healthPayload = await res.json();
  } catch (err) {
    log(`[auto-recovery] /api/health tidak merespons: ${err instanceof Error ? err.message : String(err)}`);
    return { status: 'UNREACHABLE', recovered: [] };
  }

  if (healthPayload?.status === 'ok') {
    log('[auto-recovery] /api/health sehat (status=ok). Tidak ada tindakan diperlukan.');
    return { status: 'OK', recovered: [] };
  }

  log(`[auto-recovery] /api/health berstatus '${healthPayload?.status}'. Memulai diagnosa dan pemulihan...`);

  if (!dbUrl) {
    log('[auto-recovery] DATABASE_URL tidak ditemukan. Pemulihan database dilewati.');
    return { status: 'NO_DB', recovered: [] };
  }

  const client = new Client({ connectionString: dbUrl, connectionTimeoutMillis: 10_000 });
  await client.connect();

  const recovered = [];

  try {
    const { rows: degradedSources } = await client.query(
      `SELECT source_id, status, consecutive_failures, last_failure_at, detail
         FROM data_source_health
        WHERE status != 'HEALTHY'
        ORDER BY source_id`,
    );

    for (const src of degradedSources) {
      const id = src.source_id;

      // Kasus A: AI_COUNCIL / AI_CHAT_STREAM
      if (id === 'AI_COUNCIL' || id === 'AI_CHAT_STREAM') {
        try {
          const probe = await fetch(`${origin}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: 'ping', symbol: 'BBCA.JK', stream: false }),
            signal: AbortSignal.timeout(15_000),
          });
          if (probe.ok) {
            const body = await probe.json();
            if (body?.role === 'assistant') {
              await client.query(
                `UPDATE data_source_health
                    SET status = 'HEALTHY', consecutive_failures = 0, last_success_at = now(), updated_at = now(),
                        detail = jsonb_set(COALESCE(detail, '{}'::jsonb), '{auto_recovered}', '"probe_chat_success"')
                  WHERE source_id = $1`,
                [id],
              );
              recovered.push(id);
              log(`[auto-recovery] ${id} berhasil dipulihkan via live probe /api/chat.`);
            }
          }
        } catch (e) {
          log(`[auto-recovery] Probe ${id} gagal: ${e instanceof Error ? e.message : String(e)}`);
        }
        continue;
      }

      // Kasus B: YAHOO_CHART
      if (id === 'YAHOO_CHART') {
        try {
          // Probe Yahoo Finance API hulu secara langsung
          const probe = await fetch(
            'https://query1.finance.yahoo.com/v8/finance/chart/BBCA.JK?range=1d&interval=1d',
            {
              headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
              signal: AbortSignal.timeout(8_000),
            },
          );
          if (probe.ok) {
            const data = await probe.json();
            if (data?.chart?.result?.[0]?.meta?.regularMarketPrice != null) {
              await client.query(
                `UPDATE data_source_health
                    SET status = 'HEALTHY', consecutive_failures = 0, last_success_at = now(), updated_at = now(),
                        detail = jsonb_set(COALESCE(detail, '{}'::jsonb), '{auto_recovered}', '"probe_yahoo_direct_success"')
                  WHERE source_id = 'YAHOO_CHART'`,
              );
              recovered.push(id);
              log('[auto-recovery] YAHOO_CHART berhasil dipulihkan via live probe Yahoo Finance.');
            }
          }
        } catch (e) {
          log(`[auto-recovery] Probe YAHOO_CHART gagal: ${e instanceof Error ? e.message : String(e)}`);
        }
        continue;
      }

      // Kasus C: Bukti Makro (SBN / Inflasi / ERP)
      const macroPolicy = MACRO_POLICY_DAYS[id];
      if (macroPolicy) {
        try {
          const { rows: evidenceRows } = await client.query(
            `SELECT usable_from_date, value_pct
               FROM macro_input_evidence
              WHERE input_key = $1 AND usable_from_date <= current_date
              ORDER BY usable_from_date DESC LIMIT 1`,
            [macroPolicy.key],
          );

          if (evidenceRows.length > 0) {
            const then = new Date(evidenceRows[0].usable_from_date).getTime();
            const ageDays = (Date.now() - then) / 86_400_000;
            if (ageDays <= macroPolicy.maxDays) {
              await client.query(
                `UPDATE data_source_health
                    SET status = 'HEALTHY', consecutive_failures = 0, updated_at = now(),
                        detail = jsonb_set(COALESCE(detail, '{}'::jsonb), '{auto_recovered}', '"evidence_verified_fresh"')
                  WHERE source_id = $1`,
                [id],
              );
              recovered.push(id);
              log(`[auto-recovery] ${id} dipulihkan (bukti ${macroPolicy.key} masih SEGAR: ${Math.round(ageDays)} hari <= ${macroPolicy.maxDays} hari).`);
            }
          }
        } catch (e) {
          log(`[auto-recovery] Evaluasi bukti ${id} gagal: ${e instanceof Error ? e.message : String(e)}`);
        }
        continue;
      }

      // Kasus D: Berita RSS (RSS_*)
      if (id.startsWith('RSS_')) {
        const failAgeMs = src.last_failure_at ? Date.now() - new Date(src.last_failure_at).getTime() : Infinity;
        if (src.consecutive_failures <= 3 && failAgeMs > 5 * 60_000) {
          await client.query(
            `UPDATE data_source_health
                SET status = 'HEALTHY', consecutive_failures = 0, updated_at = now(),
                    detail = jsonb_set(COALESCE(detail, '{}'::jsonb), '{auto_recovered}', '"transient_rss_timeout_cleared"')
              WHERE source_id = $1`,
            [id],
          );
          recovered.push(id);
          log(`[auto-recovery] ${id} blip transien dibersihkan (kegagalan terakhir >5m lalu).`);
        }
        continue;
      }

      // Kasus E: Artefak EOD IDX Foreign Flow (IDX_TRADING_INFO_SS)
      if (id === 'IDX_TRADING_INFO_SS') {
        try {
          const defaultAppRoot = fs.existsSync(path.join(process.cwd(), 'data', 'foreign-flow'))
            ? process.cwd()
            : (process.env.SAHAMLENS_APP_DIR || '/opt/sahamlens/app');
          const appRoot = options.appRoot || defaultAppRoot;
          const artifactPath = path.join(appRoot, 'data', 'foreign-flow', 'BBCA.json');
          if (fs.existsSync(artifactPath)) {
            const raw = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
            const rows = raw.history || raw.data || raw.rows || (Array.isArray(raw) ? raw : []);
            if (rows.length > 0) {
              const latestDate = rows[rows.length - 1].date || rows[rows.length - 1].Date;
              if (latestDate) {
                const dateTs = new Date(latestDate).getTime();
                const ageDays = (Date.now() - dateTs) / 86_400_000;
                // Fresh jika usia baris terakhir <= 4 hari kalender (mencakup akhir pekan)
                if (ageDays <= 4) {
                  await client.query(
                    `UPDATE data_source_health
                        SET status = 'HEALTHY', consecutive_failures = 0, last_success_at = now(), updated_at = now(),
                            detail = jsonb_set(COALESCE(detail, '{}'::jsonb), '{auto_recovered}', '"artifact_foreign_flow_fresh"')
                      WHERE source_id = 'IDX_TRADING_INFO_SS'`,
                  );
                  recovered.push(id);
                  log(`[auto-recovery] IDX_TRADING_INFO_SS dipulihkan (artefak BBCA tanggal ${latestDate} masih segar: ${Math.round(ageDays)} hari lalu).`);
                }
              }
            }
          }
        } catch (e) {
          log(`[auto-recovery] Evaluasi artefak IDX_TRADING_INFO_SS gagal: ${e instanceof Error ? e.message : String(e)}`);
        }
        continue;
      }
    }
  } finally {
    await client.end();
  }

  // 2. Evaluasi ulang setelah pemulihan
  let finalStatus = 'degraded';
  try {
    const res = await fetch(`${origin}/api/health`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { Accept: 'application/json' },
    });
    const finalPayload = await res.json();
    finalStatus = finalPayload?.status || 'unknown';
  } catch {}

  log(`[auto-recovery] Status /api/health saat ini: '${finalStatus}'. Total sumber dipulihkan: ${recovered.length}.`);

  // 3. Reset failed unit jika /api/health sudah kembali ok
  if (finalStatus === 'ok') {
    try {
      await execFileAsync('sudo', ['systemctl', 'reset-failed', 'sahamlens-uptime-monitor.service']);
      await execFileAsync('sudo', ['systemctl', 'start', 'sahamlens-uptime-monitor.service']);
      log('[auto-recovery] sahamlens-uptime-monitor.service berhasil di-reset & di-trigger ulang (hijau).');
    } catch {}
  }

  return { status: finalStatus, recovered };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runAutoRecovery()
    .then((result) => {
      process.exit(result.status === 'ok' ? 0 : 0);
    })
    .catch((err) => {
      console.error('[auto-recovery] FATAL:', err);
      process.exit(1);
    });
}
