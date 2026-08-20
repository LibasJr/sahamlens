import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { JOURNEY_EVENT_NAMES, type JourneyEventName } from '../journey-events';

/**
 * Sebuah event bisa terdefinisi rapi, tervalidasi rapi, tersimpan rapi - dan tidak pernah
 * dikirim satu kali pun. Yang terjadi bukan galat melainkan panel admin yang menampilkan
 * "belum ada data" selamanya, dan tidak ada satu pun test lain yang akan menyadarinya.
 *
 * Gerbang ini memeriksa hal yang tidak diperiksa test lain: bahwa setiap metrik beta yang
 * dijanjikan PRD benar-benar punya pemanggil di kode produksi.
 */

const ROOT = path.resolve(__dirname, '../..');

/** CLAUDE.md SEC.2: buang komentar sebelum mencocokkan pola, atau prosa bisa meluluskan
 *  gerbang - persis yang pernah terjadi pada ratchet adopsi. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === '__tests__') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(entry.name) && !/\.test\./.test(entry.name)) out.push(full);
  }
  return out;
}

const sumber = ['app', 'components', 'shared', 'modules']
  .map((dir) => path.join(ROOT, '..', dir))
  .filter((dir) => fs.existsSync(dir))
  .flatMap(walk)
  // path.relative mengembalikan `app\...` di Windows; tanpa normalisasi ini setiap
  // perbandingan berbasis '/' meleset di sana dan gerbangnya berhenti memeriksa apa pun.
  .map((file) => ({
    rel: path.relative(path.join(ROOT, '..'), file).split(path.sep).join('/'),
    text: stripComments(fs.readFileSync(file, 'utf8')),
  }))
  // Definisi, validator, dan pelacaknya sendiri menyebut setiap nama event - kalau ikut
  // dihitung, gerbang ini lulus tanpa satu pun pemanggil nyata.
  .filter(({ rel }) => !rel.startsWith('shared/analytics/'));

/** Berkas produksi yang benar-benar mengirim event ini. */
function pemanggil(event: JourneyEventName): string[] {
  return sumber
    .filter(({ text }) => (
      text.includes(`trackJourneyEvent('${event}'`) ||
      text.includes(`event="${event}"`)
    ))
    .map(({ rel }) => rel);
}

describe('instrumentasi perjalanan riset', () => {
  it('pemindainya benar-benar membaca kode produksi', () => {
    // Kalau angka ini jatuh, pemindainya yang rusak - bukan berarti instrumentasinya
    // hilang. Tanpa penjaga ini gerbang di bawah bisa lulus dengan memeriksa nol berkas.
    expect(sumber.length).toBeGreaterThan(100);
  });

  it.each(JOURNEY_EVENT_NAMES.filter((event) => event !== 'session_start'))(
    '%s dikirim dari suatu tempat di produksi',
    (event) => {
      expect(pemanggil(event as JourneyEventName), `${event} tidak pernah dikirim`).not.toHaveLength(0);
    },
  );

  it('session_start disisipkan pelacaknya, bukan dipanggil tangan', () => {
    // Kalau sebuah halaman mulai mengirimnya sendiri, sesi bisa punya dua t0 dan
    // "waktu sampai tindakan berguna pertama" berhenti punya arti tunggal.
    expect(pemanggil('session_start')).toHaveLength(0);
  });

  it('tabelnya ikut kebijakan retensi privasi', () => {
    // Tabel analitik tanpa penghapusan adalah kebocoran retensi yang tumbuh diam-diam.
    const cleanup = fs.readFileSync(path.join(ROOT, '..', 'scripts', 'cleanup-privacy-retention.mjs'), 'utf8');
    expect(cleanup).toContain('product_journey_events');
    expect(cleanup).toContain('PRIVACY_JOURNEY_RETENTION_DAYS');
  });

  it('migrasinya ada dan tidak memakai DDL runtime', () => {
    const migrasi = path.join(ROOT, '..', 'database', 'migrations', '010_product_journey_events.sql');
    expect(fs.existsSync(migrasi), 'migrasi 010 hilang - pindahkan gerbangnya, jangan biarkan lulus').toBe(true);
    expect(fs.readFileSync(migrasi, 'utf8')).toContain('CREATE TABLE IF NOT EXISTS product_journey_events');
  });
});
