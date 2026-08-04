import { describe, it, expect } from 'vitest';
import { matchesCompany } from '../news.service';

// Regresi temuan M-6 (audit logika & algoritma 2026-08-05): pencocokan berita ke emiten
// dulu menerima kecocokan satu kata nama > 3 huruf sebagai substring, sehingga kata
// "bank" membuat setiap berita Bank Indonesia tercatat sebagai berita BBCA/BBRI/BMRI.

describe('matchesCompany', () => {
  it('TIDAK mencocokkan berita Bank Indonesia ke bank mana pun hanya karena kata "bank"', () => {
    const judul = 'Bank Indonesia Tahan Suku Bunga Acuan di Level 5,75%';
    expect(matchesCompany(judul, 'BBCA', 'Bank Central Asia Tbk')).toBe(false);
    expect(matchesCompany(judul, 'BBRI', 'Bank Rakyat Indonesia (Persero) Tbk')).toBe(false);
    expect(matchesCompany(judul, 'BMRI', 'Bank Mandiri (Persero) Tbk')).toBe(false);
  });

  it('mencocokkan lewat kode ticker sebagai kata utuh', () => {
    expect(matchesCompany('Saham BBCA Ditutup Menguat 2%', 'BBCA', 'Bank Central Asia Tbk')).toBe(true);
    expect(matchesCompany('BBCA.JK cetak rekor', 'BBCA.JK', 'Bank Central Asia Tbk')).toBe(true);
  });

  it('tidak mencocokkan kode ticker yang cuma bagian dari kata lain', () => {
    expect(matchesCompany('Program BBCAKEP diluncurkan', 'BBCA', 'Bank Central Asia Tbk')).toBe(false);
  });

  it('mencocokkan lewat kata nama yang distingtif', () => {
    expect(matchesCompany('Telkom Rilis Laporan Kuartal III', 'TLKM', 'Telkom Indonesia (Persero) Tbk')).toBe(true);
    expect(matchesCompany('Laba Astra International Naik', 'ASII', 'Astra International Tbk')).toBe(true);
  });

  it('kata generik di nama emiten tidak dipakai sebagai penanda', () => {
    // "Energi" generik - berita energi umum tidak boleh jadi berita emiten ini.
    expect(matchesCompany('Harga Energi Global Naik Tajam', 'XXXX', 'PT Energi Nusantara Tbk')).toBe(false);
  });
});
