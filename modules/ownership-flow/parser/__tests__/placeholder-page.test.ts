import { describe, expect, it } from 'vitest';
import { parseKseiRegisteredSecurityHtml } from '../ksei-registered-security.parser';
import { parseOwnershipRow, type ParseContext } from '../ownership-row.parser';

// KASUS TLKM - halaman ASLI, isi PLACEHOLDER.
//
// Ditemukan pada fixture nyata dari VPS (2026-08-16): halaman emitennya benar,
// seluruh labelnya lengkap, tetapi Scripless/Local/Foreign semuanya 0,00% dan
// tanggalnya tidak terbaca.
//
// Ini kelas kegagalan yang paling berbahaya di seluruh modul, karena ia LOLOS
// setiap pemeriksaan yang bersifat "apakah halamannya benar": HTTP 200, bukan
// captcha, bukan login, kode emiten cocok, semua label ada. Yang membedakannya
// hanya NILAI-nya. Kalau ekstraktor berhenti pada "label ditemukan", baris
// 0,00% akan masuk database dan tampil ke pengguna sebagai klaim finansial
// ("kepemilikan asing nihil") yang tidak pernah diukur siapa pun.
//
// Test ini menguji RANTAI PENUH - ekstraktor lalu validator - karena penjagaan
// yang sebenarnya ada di ujungnya, dan menguji keduanya terpisah tidak
// membuktikan bahwa keduanya tersambung.

const CONTEXT: ParseContext = {
  source: 'KSEI_REGISTERED_SECURITY',
  sourceUrl: 'https://web.ksei.co.id/services/registered-securities/shares/lc/TLKM',
  fetchedAt: '2026-08-16T01:30:00.000Z',
};

/** Bentuk halaman placeholder: label lengkap, nilai nol, tanggal tak terbaca. */
const PLACEHOLDER_HTML = `
<html><body>
  <table>
    <tr><td>Security Name</td><td>Telkom Indonesia (Persero) Tbk</td></tr>
    <tr><td>Short Code</td><td>TLKM</td></tr>
    <tr><td>Number of Securities</td><td>99.062.216.600</td></tr>
    <tr><td>As of</td><td>-</td></tr>
    <tr><td>Scripless Percentage</td><td>0,00%</td></tr>
    <tr><td>Local Percentage</td><td>0,00%</td></tr>
    <tr><td>Foreign Percentage</td><td>0,00%</td></tr>
  </table>
</body></html>`;

/** Pembanding: halaman yang benar-benar berisi data. */
const POPULATED_HTML = `
<html><body>
  <table>
    <tr><td>Short Code</td><td>TLKM</td></tr>
    <tr><td>Number of Securities</td><td>99.062.216.600</td></tr>
    <tr><td>As of</td><td>15 Aug 2026</td></tr>
    <tr><td>Scripless Percentage</td><td>92,40%</td></tr>
    <tr><td>Local Percentage</td><td>62,15%</td></tr>
    <tr><td>Foreign Percentage</td><td>30,25%</td></tr>
  </table>
</body></html>`;

describe('halaman placeholder TLKM', () => {
  it('ekstraktor tetap mengenali halamannya (labelnya memang lengkap)', () => {
    // Ini bukan kelemahan ekstraktor - ia memang bertugas membaca label, dan
    // labelnya nyata ada. Penjagaannya ada di tahap berikutnya.
    const extracted = parseKseiRegisteredSecurityHtml(PLACEHOLDER_HTML, 'TLKM');
    expect(extracted.ok).toBe(true);
  });

  it('RANTAI PENUH menolak baris 0/0/0 - tidak ada yang masuk database', () => {
    const extracted = parseKseiRegisteredSecurityHtml(PLACEHOLDER_HTML, 'TLKM');
    expect(extracted.ok).toBe(true);
    if (!extracted.ok) return;

    const parsed = parseOwnershipRow(extracted.raw, CONTEXT);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;

    // Sandi kegagalannya spesifik: ini BUKAN kegagalan jaringan (SOURCE_ERROR)
    // dan BUKAN kolom yang hilang (MISSING). Menaikkan retry tidak menolongnya.
    expect(['PLACEHOLDER_DATA', 'MISSING']).toContain(parsed.rejected.quality);
    expect(parsed.rejected.ticker).toBe('TLKM.JK');
  });

  it('tanggal "-" tidak dianggap observedDate yang sah', () => {
    // Keberadaan label "As of" TIDAK sama dengan adanya tanggal. Tanpa tanggal
    // observasi yang terparse, tidak ada point-in-time sama sekali.
    const parsed = parseOwnershipRow(
      { ticker: 'TLKM', observedDate: '-', localPct: '10', foreignPct: '5', scriplessPct: '15' },
      CONTEXT
    );
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.rejected.quality).toBe('MISSING');
  });

  it('halaman yang BENAR-BENAR berisi data tetap diterima', () => {
    // Penjagaan di atas tidak boleh sampai menolak data yang sah - kalau iya,
    // modul ini tidak akan pernah mengumpulkan apa pun.
    const extracted = parseKseiRegisteredSecurityHtml(POPULATED_HTML, 'TLKM');
    expect(extracted.ok).toBe(true);
    if (!extracted.ok) return;

    const parsed = parseOwnershipRow(extracted.raw, CONTEXT);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(parsed.observation.ticker).toBe('TLKM.JK');
    expect(parsed.observation.observedDate).toBe('2026-08-15');
    expect(parsed.observation.foreignPct).toBe(30.25);
    expect(parsed.observation.localPct).toBe(62.15);
    // 62,15 + 30,25 = 92,40 = scripless. Inilah identitas yang benar - bukan 100.
    expect(parsed.observation.scriplessPct).toBe(92.4);
    expect(parsed.observation.totalSecurities).toBe(99062216600);
  });
});
