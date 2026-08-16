import { describe, expect, it } from 'vitest';
import { extractLabeledFields, parseKseiRegisteredSecurityHtml } from '../ksei-registered-security.parser';

// PERINGATAN YANG WAJIB DIBACA SEBELUM MENGUBAH TEST INI:
//
// HTML di bawah adalah INPUT SINTETIS yang dibuat untuk menguji PERILAKU
// ekstraktor (pencocokan label, deteksi anti-bot, penolakan saat label hilang).
// Ia BUKAN fixture hasil audit dan BUKAN bukti bahwa halaman KSEI yang asli
// berbentuk seperti ini.
//
// Selama fixture nyata dari VPS belum ada, sumbernya tetap UNVERIFIED dan
// ingestion produksi tetap tertutup. Lolosnya test di bawah TIDAK boleh dipakai
// sebagai alasan menaikkan auditStatus - lihat docs/ownership-flow/source-audit.md.

const TABLE_HTML = `
<html><body>
  <h1>Registered Securities</h1>
  <table>
    <tr><td>Security Name</td><td>Bank Rakyat Indonesia (Persero) Tbk</td></tr>
    <tr><td>Short Code</td><td>BBRI</td></tr>
    <tr><td>ISIN Code</td><td>ID1000096007</td></tr>
    <tr><td>Number of Securities</td><td>151.559.001.604</td></tr>
    <tr><td>As of</td><td>15 Aug 2026</td></tr>
    <tr><td>Scripless Percentage</td><td>99,80%</td></tr>
    <tr><td>Local Percentage</td><td>57,25%</td></tr>
    <tr><td>Foreign Percentage</td><td>42,75%</td></tr>
  </table>
</body></html>`;

describe('extractLabeledFields', () => {
  it('mengumpulkan pasangan label-nilai dari baris tabel', () => {
    const fields = extractLabeledFields(TABLE_HTML);
    expect(fields.get('short code')).toBe('BBRI');
    expect(fields.get('foreign percentage')).toBe('42,75%');
    expect(fields.get('as of')).toBe('15 Aug 2026');
  });

  it('menangani baris 4 sel (dua pasang label-nilai)', () => {
    const html = `<table><tr>
      <td>Local Percentage</td><td>57,25%</td>
      <td>Foreign Percentage</td><td>42,75%</td>
    </tr></table>`;
    const fields = extractLabeledFields(html);
    expect(fields.get('local percentage')).toBe('57,25%');
    expect(fields.get('foreign percentage')).toBe('42,75%');
  });

  it('menangani pola teks sebaris "Label : Nilai"', () => {
    const html = '<div>Foreign Percentage : 42,75%<br>As of : 15 Aug 2026</div>';
    const fields = extractLabeledFields(html);
    expect(fields.get('foreign percentage')).toBe('42,75%');
    expect(fields.get('as of')).toBe('15 Aug 2026');
  });

  it('mengabaikan isi script dan style', () => {
    const html = `<script>var x = "Foreign Percentage: 99%";</script>${TABLE_HTML}`;
    expect(extractLabeledFields(html).get('foreign percentage')).toBe('42,75%');
  });
});

describe('parseKseiRegisteredSecurityHtml - jalur sukses', () => {
  it('mengekstrak seluruh field yang diharapkan', () => {
    const result = parseKseiRegisteredSecurityHtml(TABLE_HTML, 'BBRI');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.raw.ticker).toBe('BBRI');
    expect(result.raw.observedDate).toBe('15 Aug 2026');
    expect(result.raw.localPct).toBe('57,25%');
    expect(result.raw.foreignPct).toBe('42,75%');
    expect(result.raw.scriplessPct).toBe('99,80%');
    expect(result.raw.totalSecurities).toBe('151.559.001.604');
  });
});

describe('parseKseiRegisteredSecurityHtml - fail-closed', () => {
  it('menolak respons kosong', () => {
    const result = parseKseiRegisteredSecurityHtml('', 'BBRI');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('EMPTY_RESPONSE');
  });

  it('menolak respons non-HTML', () => {
    const result = parseKseiRegisteredSecurityHtml('{"error":"nope"}', 'BBRI');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('NOT_HTML');
  });

  it('mendeteksi halaman anti-bot walaupun statusnya 200', () => {
    const html = '<html><body><div>Please complete the captcha to continue</div></body></html>';
    const result = parseKseiRegisteredSecurityHtml(html, 'BBRI');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('ANTI_BOT');
  });

  it('mendeteksi halaman login', () => {
    const html = '<html><body><form><input type="password" name="pin"></form></body></html>';
    const result = parseKseiRegisteredSecurityHtml(html, 'BBRI');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('LOGIN_REQUIRED');
  });

  it('menolak ketika label wajib tidak ada - TIDAK mengembalikan baris kosong', () => {
    const html = '<html><body><table><tr><td>Short Code</td><td>BBRI</td></tr></table></body></html>';
    const result = parseKseiRegisteredSecurityHtml(html, 'BBRI');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('LABELS_MISSING');
    expect(result.reason).toContain('As of');
  });

  it('menolak halaman milik emiten lain', () => {
    // Server yang mengalihkan permintaan tak dikenal ke halaman default akan
    // tertangkap di sini, bukan tersimpan atas nama emiten yang salah.
    const result = parseKseiRegisteredSecurityHtml(TABLE_HTML, 'TLKM');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('TICKER_MISMATCH');
  });
});
