'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiRequest } from '@/shared/http/api-client';
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

export default function MarketTicker() {
  const [items, setItems] = useState<Item[]>([]);
  const { language } = useLanguage();

  useEffect(() => {
    apiRequest<any>('/api/market-summary')
      .then((data) => {
        const rows: Item[] = (data?.topValue ?? [])
          // changePct sengaja boleh null dari server saat provider tidak menyediakannya.
          // Baris begitu DIBUANG, bukan ditampilkan sebagai 0% - angka nol di ticker
          // terbaca sebagai "tidak bergerak hari ini", klaim yang tidak kita punya.
          .filter((r: any) =>
            typeof r?.symbol === 'string' &&
            typeof r?.price === 'number' && Number.isFinite(r.price) && r.price > 0 &&
            typeof r?.changePct === 'number' && Number.isFinite(r.changePct))
          .slice(0, MAKS_ITEM)
          .map((r: any) => ({ symbol: r.symbol, price: r.price, changePct: r.changePct }));
        setItems(rows);
      })
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
          <span className="text-[11px] font-semibold text-white/85">{it.symbol}</span>
          <span className="font-number text-[11px] text-tv-muted">{it.price.toLocaleString(locale)}</span>
          {/* Hijau/merah HANYA di sini. Kode saham dan harganya sengaja netral - kalau
              seluruh baris ikut berwarna, warnanya berhenti berarti "naik/turun" dan
              berubah jadi hiasan.

              Nol NETRAL, bukan hijau. Terukur pada data nyata: BBCA tutup di 0,00% dan
              versi pertama menampilkannya "+0,00%" berwarna hijau - membaca sebagai naik
              padahal tidak bergerak sama sekali. Tanda "+" juga hanya untuk yang benar
              benar positif. */}
          <span
            className={`font-number text-[11px] font-semibold ${
              it.changePct > 0 ? 'text-tv-green' : it.changePct < 0 ? 'text-tv-red' : 'text-tv-muted'
            }`}
          >
            {it.changePct > 0 ? '+' : ''}{it.changePct.toFixed(2)}%
          </span>
        </Link>
        <span aria-hidden="true" className="px-3 text-[11px] text-tv-muted/40">·</span>
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
