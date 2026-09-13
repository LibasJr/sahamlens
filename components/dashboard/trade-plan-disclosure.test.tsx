import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { buildTradePlanV1 } from '@/modules/recommendation/service/trade-plan';
import { TradePlanDisclosure } from './TradePlanDisclosure';

/**
 * `buildTradePlanV1` menghitung missingData[]/confidenceScore/dataPoints[] sejak awal dan
 * API sudah mengirimkannya, tapi sampai 13 September 2026 TIDAK ADA satu pun pembaca di
 * `components/**` atau `app/**`. Test ini mengunci pembaca pertamanya.
 *
 * Masukan test sengaja dibangun lewat `buildTradePlanV1` yang SUNGGUHAN, bukan objek
 * karangan. Kalau bentuk TradePlan berubah, test ini ikut merah - alih-alih terus hijau
 * di atas bentuk yang sudah tidak ada.
 */

function history(count = 120) {
  return Array.from({ length: count }, (_, i) => {
    const close = 1_000 + i * 5;
    return { High: close + 25, Low: close - 25, Close: close, AdjClose: close };
  });
}

const LENGKAP = {
  history: history(),
  currentPrice: 1_600,
  atr: 30,
  adx: 28.4,
  plusDi: 26.1,
  minusDi: 14.2,
  bollingerPercentB: 0.72,
  volumeRatio: 1.45,
  officialNetPressure20: 18.6,
  officialPositiveRatio20: 0.65,
};

/** `buildTradePlanV1` boleh mengembalikan null (setup tidak valid). Di test itu berarti
 * fixture-nya yang salah, bukan kasus yang perlu ditoleransi diam-diam - jadi digagalkan
 * di sini alih-alih dibungkam dengan `!` atau optional chaining. */
function plan(input: Parameters<typeof buildTradePlanV1>[0]) {
  const result = buildTradePlanV1(input);
  if (result == null) throw new Error('fixture tidak menghasilkan TradePlan - perbaiki fixture-nya');
  return result;
}

function render(plan: NonNullable<ReturnType<typeof buildTradePlanV1>>) {
  return renderToStaticMarkup(
    React.createElement(TradePlanDisclosure, {
      confidenceScore: plan.confidenceScore,
      confidenceLevel: plan.confidenceLevel,
      entryReference: plan.entryReference,
      missingData: plan.missingData,
      caveats: plan.caveats,
      dataPoints: plan.dataPoints,
    }),
  );
}

describe('TradePlanDisclosure', () => {
  it('menyatakan acuan level harga, bukan membiarkan angka berdiri tanpa konteks', () => {
    const html = render(plan(LENGKAP));

    // Inti keluhan yang memicu komponen ini: TP 1.834 terbaca seolah target dari harga
    // terakhir, padahal diturunkan dari pivot struktural + ATR.
    expect(html).toContain('pivot struktural');
    expect(html).toContain('Acuan entry');
  });

  it('menampilkan setiap masukan yang hilang, bukan meringkasnya jadi satu angka', () => {
    const built = plan({
      ...LENGKAP,
      volumeRatio: null,
      officialNetPressure20: null,
      officialPositiveRatio20: null,
    });

    expect(built.missingData.length).toBeGreaterThan(0);
    const html = render(built);

    for (const item of built.missingData) {
      expect(html).toContain(item);
    }
    expect(html).toContain('Data tidak tersedia saat rencana disusun');
  });

  it('membedakan rencana data lengkap dari rencana data hilang', () => {
    const lengkap = plan(LENGKAP);
    const bolong = plan({
      ...LENGKAP,
      volumeRatio: null,
      officialNetPressure20: null,
      officialPositiveRatio20: null,
    });

    // Kalau kedua keluaran identik, disclosure-nya tidak mengungkap apa pun - itulah
    // keadaan sebelum komponen ini ada.
    expect(render(lengkap)).not.toBe(render(bolong));
    expect(lengkap.confidenceScore).toBeGreaterThan(bolong.confidenceScore);
  });

  it('memakai status dari trade-plan.ts, bukan menyimpulkan ulang dari value', () => {
    const html = render(
      plan({ ...LENGKAP, officialNetPressure20: null, officialPositiveRatio20: null }),
    );

    expect(html).toContain('tidak tersedia');
    expect(html).toContain('Foreign flow IDX 20D');
  });

  it('tidak merender apa pun saat tidak ada TradePlan - payload tamu', () => {
    // dashboard-guest-parity.test.ts mengunci `tradePlan: null` untuk tamu. Komponen ini
    // harus menyembunyikan diri sendiri, supaya app/dashboard/page.tsx tidak perlu guard
    // kedua yang menduplikasi aturan itu.
    const html = renderToStaticMarkup(React.createElement(TradePlanDisclosure, {}));
    expect(html).toBe('');
  });

  it('tidak menyatakan level kepercayaan ketika skornya tidak ada', () => {
    const html = renderToStaticMarkup(
      React.createElement(TradePlanDisclosure, { missingData: ['Volume ratio 20D'] }),
    );

    expect(html).toContain('Volume ratio 20D');
    expect(html).not.toContain('%');
  });
});
