import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * LensAI adalah asisten RISET, bukan chatbot sosial (PRD SEC.20).
 *
 * Sebelum fase 6, jawaban asisten dibungkus gelembung percakapan berekor
 * (`rounded-2xl ... rounded-tl-md`, `max-w-[85%]`, border + permukaan kartu). Untuk balasan
 * satu kalimat itu wajar; untuk analisis beberapa paragraf dengan heading Faktor utama /
 * Risiko / Evidence, gelembung adalah chrome yang menghalangi pembacaan - dan tanpa batas
 * lebar baca, satu baris di layar lebar bisa melewati 120 karakter.
 *
 * Pertanyaan PENGGUNA tetap gelembung: ia menandai giliran, dan itu struktur.
 */
const ROOT = path.resolve(__dirname, '../..');
const AI_CHAT = 'components/AIChat.tsx';

function stripComments(source: string): string {
  return source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function baca(): string {
  const full = path.join(ROOT, AI_CHAT);
  expect(fs.existsSync(full), `${AI_CHAT} hilang - pindahkan gerbangnya`).toBe(true);
  return stripComments(fs.readFileSync(full, 'utf8'));
}

describe('presentasi LensAI', () => {
  const source = baca();

  it('pemindainya benar-benar membaca komponennya', () => {
    expect(source.length).toBeGreaterThan(10_000);
  });

  it('jawaban asisten punya batas lebar baca', () => {
    expect(source, 'jawaban tanpa max-w-prose akan melebihi panjang baris yang nyaman dibaca')
      .toContain('max-w-prose');
  });

  it('jawaban asisten bukan gelembung percakapan', () => {
    // Gelembung berekor untuk asisten dikenali dari rounded-tl-md; giliran pengguna
    // memakai rounded-tr-md dan memang boleh tetap ada.
    expect(source, 'ekor gelembung asisten masih ada').not.toContain('rounded-tl-md');
    expect(source, 'giliran pengguna seharusnya tetap ditandai').toContain('rounded-tr-md');
  });

  it('tidak mengarang ukuran font sendiri', () => {
    const arbitrer = source.match(/text-\[[0-9.]+px\]/g) ?? [];
    expect(arbitrer, `masih memuat: ${arbitrer.join(', ')}`).toHaveLength(0);
  });

  it('memakai token border, bukan putih transparan rakitan tangan', () => {
    expect(source).not.toContain('border-white/[0.07]');
  });

  it('provenance dan referensi dukungan tetap dirender', () => {
    // Invarian kepercayaan, bukan visual: sumber/kesegaran harus terlihat (PRD SEC.20),
    // dan LensAI adalah satu-satunya jalur galat yang dulu tidak bisa ditelusuri di log.
    expect(source).toContain('dataProvenance');
    expect(source).toContain('ApiErrorHint');
  });

  it('jalur streaming tidak disentuh', () => {
    // PRD SEC.20 membekukan /api/chat, NDJSON, prompt server, dan verifikasi. Komponen ini
    // sengaja memakai fetch mentah untuk membaca aliran NDJSON - apiRequest membufferkan
    // JSON dan akan mematikan streaming.
    expect(source).toContain('/api/chat');
    expect(source).toMatch(/getReader|TextDecoder/);
  });
});
