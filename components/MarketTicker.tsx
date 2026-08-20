'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { sharedMarketRequest } from '@/shared/http/shared-market-request';
import { useLanguage } from '@/lib/i18n';

/**
 * Running text saham teraktif, satu baris, di bawah TopMarketBar.
 *
 * Seluruh perilaku geraknya - loop mulus, jeda saat hover/focus/tahan, berhenti penuh saat
 * prefers-reduced-motion, dan jeda saat tab tersembunyi / Data Saver - sudah disediakan
 * `.sahamlens-ticker-wrap` / `.sahamlens-ticker-track` di app/globals.css. Kelas itu sudah
 * ada di berkas ini sejak lama tapi belum pernah dipakai komponen mana pun; komponen ini
 * memakainya apa adanya, bukan menulis ulang animasinya sendiri.
 *
 * Satu-satunya yang TIDAK disetel di CSS adalah durasi, karena bergantung jumlah item.
 */

/** Detik yang dihabiskan satu item untuk melintasi lebarnya sendiri.
 *
 * Dipikirkan sebagai kecepatan, bukan durasi: satu item selebar ~150px dengan 7 detik
 * berarti ~21 piksel/detik - pelan, terbaca sambil lalu, tidak menarik mata dari isi
 * halaman. Menaikkan angka ini memperlambat; menurunkannya mempercepat. Durasi total
 * ikut jumlah item supaya kecepatannya terasa sama baik daftarnya 8 maupun 20 baris. */
const DETIK_PER_ITEM = 7;
const DURASI_MINIMUM_DETIK = 90;

/** Sebanyak ini saja - daftar yang terlalu panjang membuat satu putaran jadi berjam-jam. */
const MAKS_ITEM = 18;

type Item = { symbol: string; price: number; changePct: number };

/** Ambil baris yang benar-benar lengkap. `changePct` boleh null dari server saat provider
 *  tidak menyediakannya; baris begitu DIBUANG, bukan ditampilkan 0% - nol berarti "tidak
 *  bergerak", klaim yang berbeda dari "tidak diketahui". */
function pakai(daftar: unknown): Item[] {
  if (!Array.isArray(daftar)) return [];
  return daftar
    .filter((r: any) =>
      typeof r?.symbol === 'string' && r.symbol.length > 0 &&
      typeof r?.price === 'number' && Number.isFinite(r.price) && r.price > 0 &&
      typeof r?.changePct === 'number' && Number.isFinite(r.changePct))
    .map((r: any) => ({ symbol: r.symbol, price: r.price, changePct: r.changePct }));
}

/** Naik-turun berselang supaya jalur mundur tidak menampilkan sederet hijau lalu sederet
 *  merah - urutan yang terbaca seperti peringkat, padahal cuma dua daftar disambung. */
function selangSeling(naik: Item[], turun: Item[]): Item[] {
  const keluar: Item[] = [];
  for (let i = 0; i < Math.max(naik.length, turun.length); i++) {
    if (naik[i]) keluar.push(naik[i]!);
    if (turun[i]) keluar.push(turun[i]!);
  }
  return keluar;
}

/**
 * Pilih baris ticker dari payload /api/market-summary.
 *
 * JALUR MUNDUR di sini bukan kehati-hatian teoretis - ia menutup kegagalan yang sudah
 * terjadi. Endpoint itu disajikan lewat `getOrCompute` dengan TTL cron 3 HARI. Saat
 * `changePct` mulai ikut dikirim di `topValue`, Redis masih memegang payload versi lama
 * tanpa field itu, sehingga `pakai()` membuang SELURUH 50 barisnya dan ticker menghilang
 * total - tanpa error, tanpa log. Terukur di produksi: cache berumur 12,9 jam dari jatah
 * 72 jam, jadi fiturnya akan tampak tidak pernah ada selama ~2,5 hari.
 *
 * `topGainers`/`topLosers` SELALU membawa `changePct` (server menyaringnya lebih dulu
 * lewat `quotesWithDailyChange`) dan sudah ada di payload versi lama maupun baru. Jadi
 * bentuk cache yang basi tidak bisa lagi mengosongkan ticker.
 *
 * Diekspor supaya bisa diuji: kegagalannya senyap, jadi satu-satunya cara ia tidak kembali
 * adalah diperiksa langsung.
 */
export function pilihBaris(data: unknown): Item[] {
  const payload = data as any;
  const utama = pakai(payload?.topValue);
  if (utama.length > 0) return utama.slice(0, MAKS_ITEM);
  return selangSeling(pakai(payload?.topGainers), pakai(payload?.topLosers)).slice(0, MAKS_ITEM);
}

export default function MarketTicker() {
  const [items, setItems] = useState<Item[]>([]);
  const { language } = useLanguage();

  useEffect(() => {
    // Endpoint yang sama dipakai daftar mover di beranda; satu request untuk keduanya.
    sharedMarketRequest<any>('/api/market-summary')
      .then((data) => setItems(pilihBaris(data)))
      .catch(() => {});
  }, []);

  // Tidak merender apa pun sampai ada data: bilah kosong yang kemudian terisi menggeser
  // tata letak halaman di bawahnya.
  if (items.length === 0) return null;

  const durasi = Math.max(DURASI_MINIMUM_DETIK, items.length * DETIK_PER_ITEM);
  const locale = language === 'id' ? 'id-ID' : 'en-US';

  const deret = (untukPembacaLayar: boolean) =>
    items.map((it) => (
      <React.Fragment key={`${untukPembacaLayar ? 'a' : 'b'}-${it.symbol}`}>
        <Link
          href={`/technical/${it.symbol}`}
          className="inline-flex items-baseline gap-1.5 rounded px-1 py-0.5 transition-colors hover:bg-white/[0.05] focus-visible:outline focus-visible:outline-1 focus-visible:outline-tv-blue"
        >
          <span className="lens-label text-tv-text/85">{it.symbol}</span>
          <span className="font-number lens-meta text-tv-muted">{it.price.toLocaleString(locale)}</span>
          {/* Hijau/merah HANYA di sini. Kode saham dan harganya sengaja netral - kalau
              seluruh baris ikut berwarna, warnanya berhenti berarti "naik/turun" dan
              berubah jadi hiasan.

              Nol NETRAL, bukan hijau. Terukur pada data nyata: BBCA tutup di 0,00% dan
              versi pertama menampilkannya "+0,00%" berwarna hijau - membaca sebagai naik
              padahal tidak bergerak sama sekali. Tanda "+" juga hanya untuk yang benar
              benar positif. */}
          <span
            className={`font-number lens-meta font-semibold ${
              it.changePct > 0 ? 'text-tv-green' : it.changePct < 0 ? 'text-tv-red' : 'text-tv-muted'
            }`}
          >
            {it.changePct > 0 ? '+' : ''}{it.changePct.toFixed(2)}%
          </span>
        </Link>
        <span aria-hidden="true" className="lens-meta px-3 text-tv-muted/40">·</span>
      </React.Fragment>
    ));

  return (
    <div
      className="sahamlens-ticker-wrap relative shrink-0 overflow-hidden border-b border-white/[0.05] bg-white/[0.012]"
      aria-label="Pergerakan saham teraktif hari ini"
    >
      <div
        className="sahamlens-ticker-track flex items-center whitespace-nowrap py-1"
        style={{ animationDuration: `${durasi}s` }}
      >
        {deret(true)}
        {/* Salinan kedua membuat -50% jadi loop mulus. Disembunyikan dari pembaca layar
            supaya daftarnya tidak terbaca dua kali. */}
        <span aria-hidden="true" className="flex items-center">{deret(false)}</span>
      </div>
    </div>
  );
}
