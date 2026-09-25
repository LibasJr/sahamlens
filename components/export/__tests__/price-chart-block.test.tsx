import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PriceChartBlock, siapkanCandle, volumeRingkas, type PriceCandle } from '../PriceChartBlock';

// Deret uji: dibangkitkan rumus, bukan angka contoh yang disalin dari produksi - tujuannya
// menguji perilaku gambar (jumlah candle, sumbu, penyaringan), bukan mengklaim data pasar.
function deretUji(jumlah: number): PriceCandle[] {
  const hasil: PriceCandle[] = [];
  let tanggal = new Date(Date.UTC(2026, 0, 1));
  for (let i = 0; i < jumlah; i += 1) {
    const gelombang = Math.sin(i / 7) * 120;
    const close = 5000 + gelombang + i * 3;
    hasil.push({
      time: tanggal.toISOString().slice(0, 10),
      open: close - 15,
      high: close + 42,
      low: close - 38,
      close,
      volume: 1_000_000 + i * 5_000,
    });
    tanggal = new Date(tanggal.getTime() + 86_400_000);
  }
  return hasil;
}

const ACCENT = '#1B3A6B';

/** Label sumbu memakai angka bulat, jadi pembanding di uji ini juga dibulatkan. */
function angkaBulu(nilai: number): string {
  return nilai.toLocaleString('id-ID', { maximumFractionDigits: 0 });
}

describe('siapkanCandle', () => {
  it('membuang candle tanpa harga penutup sah, bukan menebaknya', () => {
    const bersih = siapkanCandle(
      [
        { time: '2026-01-01', close: 100, open: 90, high: 110, low: 80, volume: 10 },
        { time: '2026-01-02', close: null, open: 95, high: 99, low: 90, volume: 10 },
        { time: '2026-01-03', close: 0, open: 95, high: 99, low: 90, volume: 10 },
        { time: '2026-01-04', close: Number.NaN, open: 95 },
        { time: '2026-01-05', close: 105, open: 100, high: 108, low: 98, volume: 12 },
      ],
      90,
    );
    expect(bersih.map((bar) => bar.time)).toEqual(['2026-01-01', '2026-01-05']);
  });

  it('mengurutkan menurut waktu dan mengambil sesi terakhir saja', () => {
    const terbalik = [...deretUji(30)].reverse();
    const bersih = siapkanCandle(terbalik, 10);
    expect(bersih).toHaveLength(10);
    expect(bersih[0].time < bersih[bersih.length - 1].time).toBe(true);
    expect(bersih[bersih.length - 1].time).toBe('2026-01-30');
  });

  it('menutup candle yang high/low-nya kosong dengan harga penutup', () => {
    const [bar] = siapkanCandle([{ time: '2026-02-02', close: 250 }], 5);
    expect(bar).toMatchObject({ open: 250, high: 250, low: 250, close: 250, volume: null });
  });
});

describe('volumeRingkas', () => {
  it('menulis volume ringkas dan tidak kehilangan besaran', () => {
    expect(volumeRingkas(1_240_000_000)).toBe('1,2 m');
    expect(volumeRingkas(197_935_000)).toBe('197,9 jt');
    expect(volumeRingkas(4_400)).toBe('4 rb');
    expect(volumeRingkas(950)).toBe('950');
  });
});

describe('PriceChartBlock', () => {
  it('menggambar satu candle untuk setiap sesi yang digambar', () => {
    const markah = renderToStaticMarkup(<PriceChartBlock history={deretUji(120)} accent={ACCENT} sessions={90} />);
    expect(markah.match(/data-candle="/g) ?? []).toHaveLength(90);
    expect(markah.match(/data-volume="/g) ?? []).toHaveLength(90);
  });

  it('menampilkan rentang sesi yang benar-benar digambar', () => {
    const markah = renderToStaticMarkup(<PriceChartBlock history={deretUji(30)} accent={ACCENT} sessions={90} />);
    expect(markah).toContain('30 sesi');
    expect(markah).toContain('2026-01-01');
    expect(markah).toContain('2026-01-30');
  });

  it('menuliskan "tidak tersedia" kalau sesi tidak cukup, tanpa menggambar grafik kosong', () => {
    const markah = renderToStaticMarkup(<PriceChartBlock history={deretUji(3)} accent={ACCENT} />);
    expect(markah).toContain('tidak tersedia');
    expect(markah).not.toContain('<svg');
  });

  it('merenggangkan label level yang berdekatan supaya tidak saling menimpa', () => {
    const history = deretUji(60);
    const tertinggi = Math.max(...history.map((c) => c.high as number));
    // Dua level hanya 4 poin terpisah: tanpa perenggangan, dua teks 12 px akan bertumpuk.
    const markah = renderToStaticMarkup(
      <PriceChartBlock
        history={history}
        accent={ACCENT}
        levels={[
          { value: tertinggi - 8, label: 'R1', tone: 'bear' },
          { value: tertinggi - 4, label: 'S1', tone: 'bull' },
        ]}
      />,
    );
    const posisi = [...markah.matchAll(/<text x="\d+" y="([\d.]+)"/g)].map((m) => Number(m[1]));
    expect(posisi.length).toBeGreaterThanOrEqual(2);
    expect(Math.abs(posisi[0] - posisi[1])).toBeGreaterThanOrEqual(15);
  });

  it('menyaring candle tidak sah tanpa menebak angkanya', () => {
    const hasil = siapkanCandle(
      [
        { time: '2026-01-01', close: 100, high: 110, low: 90, volume: 1_000 },
        { time: '2026-01-02', close: null as unknown as number, high: 110, low: 90 },
        null as unknown as PriceCandle,
        { time: '2026-01-03', close: -5, high: 1, low: 1 },
      ],
      90,
    );
    expect(hasil).toHaveLength(1);
    expect(hasil[0].time).toBe('2026-01-01');
  });

  it('menandai harga terakhir supaya posisi kini terbaca terhadap level', () => {
    const history = deretUji(30);
    const markah = renderToStaticMarkup(<PriceChartBlock history={history} accent={ACCENT} />);
    const terakhir = history[history.length - 1].close as number;
    expect(markah).toContain(`data-last-price="${terakhir}"`);
  });

  it('tidak menghasilkan angka rusak (NaN/Infinity) pada gambar', () => {
    const markah = renderToStaticMarkup(<PriceChartBlock history={deretUji(120)} accent={ACCENT} />);
    expect(markah).not.toMatch(/NaN|Infinity/);
  });

  it('menggambar garis bantu hanya untuk level yang ada di dalam rentang candle', () => {
    const history = deretUji(60);
    const terendah = Math.min(...history.map((h) => h.low as number));
    const tertinggi = Math.max(...history.map((h) => h.high as number));
    const batasLuar = tertinggi + 5_000;

    const tanpaLevel = renderToStaticMarkup(<PriceChartBlock history={history} accent="#1B3A6B" />);
    // Garis harga terakhir memang putus-putus; yang harus tidak ada adalah garis LEVEL ("4 4").
    expect(tanpaLevel).not.toContain('stroke-dasharray="4 4"');
    expect(tanpaLevel).toContain('data-last-price');

    const denganLevel = renderToStaticMarkup(
      <PriceChartBlock
        history={history}
        accent="#1B3A6B"
        levels={[
          { value: terendah + 25, label: 'S1', tone: 'bull' },
          { value: tertinggi - 25, label: 'R1', tone: 'bear' },
          // Level jauh (mis. batas 52 minggu di luar jendela gambar) TIDAK dipaksa masuk:
          // kalau digambar, seluruh candle akan menjadi garis datar.
          { value: batasLuar, label: '52m tertinggi', tone: 'neutral' },
        ]}
      />,
    );
    // Hanya garis level yang putus-putus "4 4"; garis harga terakhir polanya beda.
    expect(denganLevel.match(/stroke-dasharray="4 4"/g) ?? []).toHaveLength(2);
    expect(denganLevel).toContain(`S1 ${angkaBulu(terendah + 25)}`);
    expect(denganLevel).toContain(`R1 ${angkaBulu(tertinggi - 25)}`);
    // Label level ditulis di DALAM area gambar (rata kanan) supaya tidak bertabrakan dengan
    // label sumbu harga di selokan kanan.
    expect(denganLevel).toContain('text-anchor="end"');
    expect(denganLevel).toContain('paint-order="stroke"');
    expect(denganLevel).not.toContain('52m tertinggi');

    // Sumbu tetap mengikuti candle, bukan level di luar rentang.
    expect(denganLevel).toContain(angkaBulu(tertinggi));
    expect(denganLevel).toContain(angkaBulu(terendah));
    expect(denganLevel).not.toContain(angkaBulu(batasLuar));
  });

  it('menyebut volume maksimum, atau menyatakan volume tidak tersedia', () => {
    const adaVolume = renderToStaticMarkup(<PriceChartBlock history={deretUji(40)} accent={ACCENT} />);
    expect(adaVolume).toContain('Volume maks');

    const tanpaVolume = renderToStaticMarkup(
      <PriceChartBlock history={deretUji(40).map(({ time, close, open, high, low }) => ({ time, close, open, high, low }))} accent={ACCENT} />,
    );
    expect(tanpaVolume).toContain('Volume tidak tersedia');
    expect(tanpaVolume).not.toContain('data-volume=');
  });

  it('memakai sumbu harga yang mencakup rentang candle yang digambar', () => {
    const deret = deretUji(90);
    const digambar = siapkanCandle(deret, 90);
    const markah = renderToStaticMarkup(<PriceChartBlock history={deret} accent={ACCENT} sessions={90} />);
    const tertinggi = Math.max(...digambar.map((bar) => bar.high));
    const terendah = Math.min(...digambar.map((bar) => bar.low));
    // Label sumbu ditulis tanpa pecahan (mesin cetak kartu memakai angka bulat).
    expect(markah).toContain(tertinggi.toLocaleString('id-ID', { maximumFractionDigits: 0 }));
    expect(markah).toContain(terendah.toLocaleString('id-ID', { maximumFractionDigits: 0 }));
  });

  it('menghasilkan gambar yang sama untuk urutan masukan yang berbeda', () => {
    const deret = deretUji(50);
    const maju = renderToStaticMarkup(<PriceChartBlock history={deret} accent={ACCENT} />);
    const mundur = renderToStaticMarkup(<PriceChartBlock history={[...deret].reverse()} accent={ACCENT} />);
    expect(mundur).toBe(maju);
  });

  it('menyebutkan asal data pada baris bawah supaya tidak dibaca sebagai proyeksi', () => {
    const markah = renderToStaticMarkup(<PriceChartBlock history={deretUji(40)} accent={ACCENT} />);
    expect(markah).toContain('data harga pasar');
    expect(markah).toContain('Bukan proyeksi');
  });
});