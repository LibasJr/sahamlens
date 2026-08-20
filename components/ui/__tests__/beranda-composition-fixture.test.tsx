import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Badge } from '../Badge';
import { InsightRow } from '../InsightRow';
import { MetricBand } from '../MetricBand';
import { SectionHeader } from '../SectionHeader';
import { StatusMeta } from '../StatusMeta';

/**
 * Mock KOMPOSISI beranda - bukan galeri primitif.
 *
 * KENAPA TERPISAH DARI workbench-fixture. Workbench memotret primitif berdampingan, dan
 * itu memang menangkap ketidakkonsistenan spacing. Yang TIDAK pernah ditangkapnya adalah
 * susunan halamannya: sebuah halaman bisa memakai primitif yang sempurna dan tetap
 * terbaca rata, karena yang salah bukan komponennya melainkan urutan dan bobotnya.
 * Itulah persis kegagalan yang dicatat docs/notes/UTANG_V3_TAMPILAN_BELUM_BERUBAH.
 *
 * RANCANGAN INI MENGIKUTI PRD SEC.11 - "editorial, bukan grid dashboard". Percobaan
 * pertama memakai rail kanan permanen; itu dibatalkan karena rail permanen justru
 * membaca sebagai dashboard, dan karena ia mengembalikan snapshot pasar ke dalam kartu
 * yang SEC.13 minta ditinggalkan.
 *
 * YANG DIUJI DI SINI BUKAN PIKSEL. Berkas ini menulis markup untuk dipotret Playwright.
 * Assertion di bawah menjaga agar rancangannya tidak diam-diam kehilangan keputusan
 * strukturalnya - potretnya sendiri untuk DILIHAT manusia.
 *
 * Angka contoh diambil dari screenshot produksi 20 Agustus 2026, supaya perbandingan
 * sebelum/sesudah membandingkan halaman yang isinya sama.
 */
const FIXTURE = path.resolve(__dirname, '../../../e2e/__fixtures__/beranda.html');

/**
 * Pemisah antar bagian.
 *
 * SEC.6 mengurutkan alat hierarki: whitespace, lalu nada latar, lalu divider, baru border.
 * Beranda produksi melompat ke urutan terakhir - setiap bagian dibingkai - sehingga tidak
 * ada satu pun bagian yang bisa terlihat lebih penting dari yang lain.
 */
function Pemisah() {
  return <hr className="border-0 border-t border-tv-border/60" />;
}

/** Baris peluang di "Hari ini": ringkas, tanpa skor besar, tanpa kotak.
 *  Tugasnya menjawab "apa yang layak dilihat hari ini", bukan menyajikan peringkat. */
function BarisPeluang({ kode, perubahan, alasan }: { kode: string; perubahan: string; alasan: string }) {
  return (
    <div
      data-peluang-hariini={kode}
      className="flex items-baseline gap-3 border-b border-tv-border/40 py-2.5 last:border-0"
    >
      <span className="w-16 shrink-0 lens-label text-tv-text">{kode}</span>
      <span className="w-16 shrink-0 lens-meta text-tv-green">{perubahan}</span>
      <span className="min-w-0 flex-1 truncate lens-body-sm text-tv-muted">{alasan}</span>
    </div>
  );
}

/** Kandidat LensRadar: skor menonjol, alasan lengkap, harga.
 *  Tugasnya berbeda dari baris di atas - ini peringkat berikut buktinya. */
function KandidatRadar({
  kode, nama, harga, perubahan, skor, alasan, teratas = false,
}: {
  kode: string; nama: string; harga: string; perubahan: string; skor: number; alasan: string; teratas?: boolean;
}) {
  return (
    <div
      data-kandidat-radar={kode}
      // Sorotan kandidat teratas memakai NADA LATAR, bukan bingkai - SEC.6 menaruh nada
      // latar di atas border pada urutan alat hierarki. Sengaja tanpa negative margin:
      // `-mx-4` full-bleed membentur lebar scrollbar dan membuat halaman menggulir
      // horizontal di 375px, yang justru dilarang SEC.23.
      className={`flex items-start gap-4 rounded-lg border-b border-tv-border/40 py-4 last:border-0 ${
        teratas ? 'border-b-0 bg-tv-blue/[0.05] px-4' : ''
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className={teratas ? 'lens-card-title text-tv-text' : 'lens-label text-tv-text'}>{kode}</span>
          <span className="lens-meta text-tv-green">{perubahan}</span>
          <span className="lens-meta text-tv-muted">{harga}</span>
          {teratas && <Badge variant="success">Sinyal kuat</Badge>}
        </div>
        <p className="lens-meta text-tv-muted">{nama}</p>
        <p className="mt-1 lens-body-sm text-tv-muted">{alasan}</p>
      </div>

      <div className="shrink-0 text-right">
        <div className={teratas ? 'lens-metric-lg text-tv-text' : 'lens-metric text-tv-text'}>
          {skor}
          <span className="lens-meta text-tv-muted">/100</span>
        </div>
        <div className="mt-1.5 h-1 w-20 overflow-hidden rounded-full bg-white/[0.06]">
          <div className="h-full rounded-full bg-tv-green" style={{ width: `${skor}%` }} />
        </div>
      </div>
    </div>
  );
}

/** Baris watchlist / agenda: label kiri, angka kanan, dipisah divider - bukan kartu. */
function BarisRingkas({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-3 border-b border-tv-border/40 py-2.5 last:border-0">{children}</div>
  );
}

const SEKTOR = [
  { nama: 'Healthcare', nilai: '+1,91%', lebar: 100 },
  { nama: 'Basic Materials', nilai: '+1,68%', lebar: 88 },
  { nama: 'Energy', nilai: '+1,39%', lebar: 73 },
  { nama: 'Technology', nilai: '+1,17%', lebar: 61 },
  { nama: 'Industrials', nilai: '+0,91%', lebar: 48 },
  { nama: 'Infra & Transport', nilai: '+0,77%', lebar: 40 },
  { nama: 'Consumer Defensive', nilai: '+0,75%', lebar: 39 },
  { nama: 'Financial', nilai: '+0,60%', lebar: 31 },
  { nama: 'Property', nilai: '+0,52%', lebar: 27 },
  { nama: 'Consumer Cyclical', nilai: '+0,52%', lebar: 27 },
  { nama: 'Telecom', nilai: '+0,48%', lebar: 25 },
];

function markupBeranda(): string {
  return renderToStaticMarkup(
    // SEC.6: lebar konten 1440-1600, gutter 24-40px, ritme bagian 32-48px.
    <div className="min-h-screen bg-tv-bg px-4 py-6 md:px-6 lg:px-10 lg:py-10">
      <div className="mx-auto max-w-[1440px] space-y-10 lg:space-y-12">

        {/* SEC.12 HERO COMPACT. Utang terbesar beranda: hero produksi memakan satu
            viewport penuh, jadi layar pertama hanya berisi janji - jawabannya baru
            muncul setelah menggulir. Di sini judul, kalimat pendukung, dan pencarian
            selesai dalam sepertiga tinggi itu. Tanpa kotak, tanpa glow, tanpa CTA
            bersaing - "no giant empty hero". */}
        <section className="space-y-4">
          <p className="lens-eyebrow text-tv-muted">SahamLens &middot; Beta research workspace</p>
          <h1 className="lens-hero-title text-tv-text">
            Lihat Peluang <span className="text-tv-blue">Lebih Jelas.</span>
          </h1>
          {/* Kalimat pendukung ini DITENTUKAN PRD SEC.12, bukan pilihan penulis. */}
          <p className="lens-body max-w-2xl text-tv-muted">
            Riset saham Indonesia dengan data, konteks pasar, dan intelligence yang dapat ditelusuri.
          </p>
          <div className="flex max-w-2xl gap-2 pt-1">
            <div className="flex h-11 flex-1 items-center rounded-lg border border-tv-border bg-tv-surface px-3 lens-body-sm text-tv-muted">
              Cari kode saham (contoh: BBCA, TLKM, BREN)&hellip;
            </div>
            <div className="flex h-11 items-center rounded-lg bg-tv-blue px-5 lens-label text-white">Cari</div>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 lens-meta text-tv-muted">
            <span>Populer:</span>
            <span className="text-tv-text">BBCA</span>
            <span className="text-tv-text">BBRI</span>
            <span className="text-tv-text">BMRI</span>
            <span className="text-tv-text">TLKM</span>
          </div>
        </section>

        {/* SEC.13 MARKET SNAPSHOT - band tipografis, bukan empat kartu. Produksi SUDAH
            benar di sini; yang berubah cuma posisinya, kini tepat di bawah hero sesuai
            urutan SEC.11. */}
        <MetricBand
          items={[
            { label: 'IHSG', value: '6.500,94', detail: '+1,67%', tone: 'positive' },
            // Titik pemisahnya karakter sungguhan, bukan entitas HTML: nilai ini masuk
            // sebagai prop string, jadi React akan meng-escape "&middot;" dan pengguna
            // membaca teks mentahnya.
            { label: 'Breadth', value: '74%', detail: '74 naik · 13 turun', tone: 'positive' },
            { label: 'Regime', value: 'Bull Expansion', detail: 'Keyakinan 95%' },
            { label: 'LensRadar', value: '8 kandidat', detail: 'Sesi terakhir' },
          ]}
        />

        <Pemisah />

        {/* SEC.14 HARI INI - jangkar visual utama sesudah hero. Judul besar, lede, lalu
            dua kolom baris ringan: Peluang | Risiko. Tanpa kartu sama sekali; bobotnya
            datang dari ukuran judul dan ruang di sekelilingnya, bukan dari bingkai. */}
        <section className="space-y-6">
          <SectionHeader
            eyebrow="Hari ini"
            title="Pasar cukup positif"
            lede="IHSG menguat dan kenaikan cukup tersebar. Fokus berikutnya memilih saham dengan alasan yang tetap kuat, bukan mengejar warna hijau."
          />

          {/* `min-w-0` pada ITEM grid, bukan pada anaknya. Item grid bawaannya
              `min-width: auto`, jadi baris ber-`truncate` di dalamnya mendorong kolom
              melewati lebar track-nya - halaman menggulir horizontal di 375px meski
              setiap anak sudah `min-w-0`. */}
          <div className="grid gap-8 md:grid-cols-2 lg:gap-12">
            <div className="min-w-0 space-y-2">
              <h3 className="lens-eyebrow text-tv-muted">Peluang</h3>
              {/* Ringkas dengan sengaja. Peringkat lengkap berikut skornya adalah tugas
                  LensRadar di bawah - di sini yang dibutuhkan cuma "apa yang layak
                  dilihat", supaya dua bagian berhenti terbaca sebagai salinan. */}
              <div>
                <BarisPeluang kode="DMAS" perubahan="+3,68%" alasan="Uptrend sempurna, momentum kuat" />
                <BarisPeluang kode="STAA" perubahan="+4,11%" alasan="MACD bullish" />
                <BarisPeluang kode="TAPG" perubahan="+4,64%" alasan="Uptrend sempurna" />
              </div>
            </div>

            <div className="min-w-0 space-y-2">
              <h3 className="lens-eyebrow text-tv-muted">Risiko</h3>
              <div>
                <InsightRow
                  direction="BEARISH"
                  title="3 Dead Cross vs 1 Golden Cross"
                  detail="Lebih banyak saham kehilangan tren jangka menengahnya daripada yang mendapatkannya."
                />
                <InsightRow
                  direction="BEARISH"
                  title="KING turun 9,33%"
                  detail="Salah satu tekanan terbesar hari ini, di tengah pasar yang mayoritas menguat."
                />
                <InsightRow
                  direction="NEUTRAL"
                  title="RSI DMAS 84,5 - overbought ekstrem"
                  detail="Kandidat teratas hari ini justru yang paling rawan koreksi jangka pendek."
                />
              </div>
            </div>
          </div>

          <StatusMeta
            items={[
              { label: 'Data sesi Kamis, 20 Agu 15.45 WIB' },
              { label: 'Kelengkapan data 100%' },
              { label: 'Sumber Yahoo Finance, delay ~15 menit', tone: 'caution' },
            ]}
          />
        </section>

        <Pemisah />

        {/* SEC.15 LENSRADAR - daftar terkurasi 3-5 kandidat berikut buktinya, "bukan mini
            terminal". Inilah rumah peringkat dan skor. */}
        <section className="space-y-4">
          <SectionHeader
            eyebrow="LensRadar"
            title="Peluang hari ini"
            lede="Kandidat yang lolos ambang kualitas dan kelengkapan data pada sesi terakhir."
            action={<span className="lens-label text-tv-blue">Lihat semua peluang &rarr;</span>}
          />

          <div>
            <KandidatRadar
              teratas
              kode="DMAS"
              nama="Puradelta Lestari"
              harga="Rp 169"
              perubahan="+3,68%"
              skor={89}
              alasan="Harga bertahan di atas MA20, MA50, dan MA200. MACD bullish, tetapi RSI 84,5 sudah overbought ekstrem - risiko koreksi jangka pendek nyata."
            />
            <KandidatRadar kode="STAA" nama="Sumber Tani Agung" harga="Rp 1.140" perubahan="+4,11%" skor={88} alasan="MACD bullish (Hist 1,14) dengan volume di atas rata-rata." />
            <KandidatRadar kode="TAPG" nama="Triputra Agro Persada" harga="Rp 1.915" perubahan="+4,64%" skor={87} alasan="Uptrend sempurna: 1.915 di atas MA20 1.758 dan MA50 1.585." />
            <KandidatRadar kode="DGWG" nama="Dharma Guna Wibawa" harga="Rp 332" perubahan="+1,84%" skor={81} alasan="MACD bullish (Hist 3,07), masih di bawah resistance sesi." />
          </div>
        </section>

        <Pemisah />

        {/* SEC.16 WATCHLIST + SEC.11 CALENDAR. Dua kolom baris ringkas, tanpa kartu. */}
        <section className="grid gap-8 md:grid-cols-2 lg:gap-12">
          <div className="min-w-0 space-y-3">
            <SectionHeader as="h3" eyebrow="LensWatch" title="Saham dipantau" action={<span className="lens-label text-tv-blue">Lihat semua</span>} />
            <p className="lens-body-sm text-tv-muted">
              Belum ada saham dipantau. Tambahkan emiten untuk memantau harga, LensScore, dan kesegaran datanya di satu tempat.
            </p>
            <div className="flex h-11 w-full max-w-xs items-center justify-center rounded-lg border border-dashed border-tv-border lens-label text-tv-muted">
              + Tambah saham
            </div>
          </div>

          <div className="min-w-0 space-y-3">
            <SectionHeader as="h3" eyebrow="Agenda" title="Jadwal terdekat" action={<span className="lens-label text-tv-blue">Lihat semua</span>} />
            <div>
              {[
                ['SMGR', 'Perkiraan rilis laporan keuangan', '20 Agu'],
                ['JPFA', 'Perkiraan rilis laporan keuangan', '20 Agu'],
                ['ADRO', 'Perkiraan rilis laporan keuangan', '27 Agu'],
                ['PGAS', 'Perkiraan rilis laporan keuangan', '27 Agu'],
              ].map(([kode, ket, tanggal]) => (
                <BarisRingkas key={kode}>
                  <span className="w-16 shrink-0 lens-label text-tv-text">{kode}</span>
                  <span className="min-w-0 flex-1 truncate lens-body-sm text-tv-muted">{ket}</span>
                  <span className="shrink-0 lens-meta text-tv-muted">{tanggal}</span>
                </BarisRingkas>
              ))}
            </div>
          </div>
        </section>

        <Pemisah />

        {/* SEC.11 DEEP MARKET EVIDENCE - PALING BAWAH. Di produksi bagian ini ("Kondisi
            Pasar") duduk di TENGAH halaman, sebelum LensRadar dan Watchlist, sehingga
            bukti mentah memotong jalan antara jawaban dan tindakan. Urutan PRD menaruh
            evidence terakhir: jawaban dulu, bukti untuk yang mau menggali. */}
        <section className="space-y-6">
          <SectionHeader
            eyebrow="Bukti pasar"
            title="Kondisi pasar selengkapnya"
            lede="Angka mentah di balik pembacaan di atas."
            action={<span className="lens-label text-tv-blue">Lihat semua</span>}
          />

          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] lg:gap-12">
            <div className="min-w-0 space-y-3">
              <h3 className="lens-eyebrow text-tv-muted">Market breadth &middot; 100 saham likuid</h3>
              <div className="flex h-2 overflow-hidden rounded-full">
                <div className="bg-tv-green" style={{ width: '74%' }} />
                <div className="bg-white/[0.08]" style={{ width: '13%' }} />
                <div className="bg-tv-red" style={{ width: '13%' }} />
              </div>
              <p className="lens-body-sm text-tv-muted">
                74 naik &middot; 13 netral &middot; 13 turun. Partisipasi naik luas &mdash; mayoritas saham ikut menguat.
              </p>

              <div className="pt-3">
                <h3 className="lens-eyebrow text-tv-muted">Persilangan rata-rata bergerak</h3>
                <BarisRingkas>
                  <span className="min-w-0 flex-1 lens-body-sm text-tv-muted">Golden cross</span>
                  <span className="lens-label text-tv-green">1 saham</span>
                </BarisRingkas>
                <BarisRingkas>
                  <span className="min-w-0 flex-1 lens-body-sm text-tv-muted">Dead cross</span>
                  <span className="lens-label text-tv-red">3 saham</span>
                </BarisRingkas>
                <p className="pt-2 lens-meta text-tv-muted">
                  Persilangan MA mengonfirmasi tren yang sudah jalan, bukan memprediksinya.
                </p>
              </div>
            </div>

            <div className="min-w-0 space-y-2">
              <h3 className="lens-eyebrow text-tv-muted">Performa 11 sektor IDX</h3>
              {/* Produksi memakai 11 ubin berwarna 4 kolom - satu-satunya permukaan
                  bersaturasi di seluruh halaman, sehingga ia menarik mata lebih kuat
                  daripada jawaban di atasnya. Sebagai baris berbar, urutannya justru
                  lebih mudah dibaca dan bobotnya kembali proporsional. */}
              <div className="space-y-1.5">
                {SEKTOR.map((s) => (
                  <div key={s.nama} className="flex items-center gap-3">
                    <span className="w-36 shrink-0 truncate lens-body-sm text-tv-muted">{s.nama}</span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.05]">
                      <div className="h-full rounded-full bg-tv-green/70" style={{ width: `${s.lebar}%` }} />
                    </div>
                    <span className="w-16 shrink-0 text-right lens-meta text-tv-green">{s.nilai}</span>
                  </div>
                ))}
              </div>
              <p className="pt-1 lens-meta text-tv-muted">
                Healthcare memimpin (+1,91%), Telecom tertinggal (+0,48%) &mdash; selisih 1,43 poin persen.
                Heatmap memakai sampel saham representatif per sektor, bukan seluruh emiten.
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>,
  );
}

describe('mock komposisi beranda', () => {
  it('menulis fixture untuk dipotret Playwright', () => {
    const markup = markupBeranda();
    fs.mkdirSync(path.dirname(FIXTURE), { recursive: true });
    fs.writeFileSync(FIXTURE, markup, 'utf8');
    expect(fs.existsSync(FIXTURE)).toBe(true);
  });

  it('editorial satu kolom - tidak ada rail permanen (PRD SEC.11)', () => {
    // Percobaan pertama memakai <aside> rail kanan. PRD SEC.11 meminta beranda terasa
    // editorial, BUKAN grid dashboard, dan rail permanen membaca sebagai yang kedua.
    const markup = markupBeranda();
    expect(markup).not.toContain('<aside');
  });

  it('snapshot pasar tetap band, bukan kartu (PRD SEC.13)', () => {
    // Ini sudah benar di produksi. Penjaganya ada supaya rancangan berikutnya tidak
    // mengembalikannya ke dalam kartu - percobaan pertama sempat melakukannya.
    const markup = markupBeranda();
    expect(markup).toContain('IHSG');
    expect(markup).toContain('Bull Expansion');
    expect(markup).toContain('LensRadar');
  });

  it('bukti pasar berada SESUDAH LensRadar dan Watchlist (PRD SEC.11)', () => {
    // Di produksi "Kondisi Pasar" duduk di tengah halaman, memotong jalan antara
    // jawaban dan tindakan. Urutan PRD: jawaban dulu, evidence terakhir.
    const markup = markupBeranda();
    const radar = markup.indexOf('Peluang hari ini');
    const watchlist = markup.indexOf('Saham dipantau');
    const bukti = markup.indexOf('Kondisi pasar selengkapnya');
    expect(radar).toBeGreaterThan(-1);
    expect(watchlist).toBeGreaterThan(radar);
    expect(bukti).toBeGreaterThan(watchlist);
  });

  it('peluang di Hari Ini dan kandidat LensRadar punya tugas berbeda', () => {
    // Dua-duanya ada sesuai PRD SEC.14 dan SEC.15, tetapi tidak boleh menjadi salinan:
    // yang di atas ringkas tanpa skor, yang di bawah membawa peringkat dan buktinya.
    const markup = markupBeranda();
    expect(markup.split('data-peluang-hariini=').length - 1).toBe(3);
    expect(markup.split('data-kandidat-radar=').length - 1).toBe(4);
    // Skor hanya muncul di LensRadar. Kalau baris Hari Ini ikut membawa /100, keduanya
    // kembali terbaca sebagai daftar yang sama.
    const hariIni = markup.slice(markup.indexOf('data-peluang-hariini='), markup.indexOf('data-kandidat-radar='));
    expect(hariIni).not.toContain('/100');
  });
});
