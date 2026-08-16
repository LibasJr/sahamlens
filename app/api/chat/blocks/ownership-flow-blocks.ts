import { getOwnershipFlowConfig } from '@/modules/ownership-flow/config/ownership-flow.config';
import { getOwnershipFlowView } from '@/modules/ownership-flow/service/ownership-flow-query.service';
import { getPrimarySource } from '@/modules/ownership-flow/source/source-registry';

/**
 * Blok Ownership Flow untuk LensAI.
 *
 * BATAS BAHASA YANG WAJIB DIPATUHI MODEL - dan alasannya:
 *
 * Yang kita ukur adalah KOMPOSISI KEPEMILIKAN pada dua tanggal, bukan transaksi.
 * Dari "porsi asing naik 0,51 pp" TIDAK dapat disimpulkan "asing membeli":
 * porsi bisa naik karena pemegang lokal menjual ke sesama asing, karena aksi
 * korporasi mengubah jumlah saham beredar, atau karena reklasifikasi kustodian.
 * Karena itu blok ini secara eksplisit melarang klaim transaksi dan memberi
 * model kalimat pengganti yang tepat ("konsisten dengan akumulasi").
 *
 * Fungsi ini TIDAK PERNAH melempar: kegagalannya muncul sebagai baris "tidak
 * tersedia" supaya model tahu bedanya "tidak ditanyakan" dan "tidak terbaca".
 */
export async function ownershipFlowBlock(ticker: string): Promise<string> {
  const code = ticker.replace(/\.JK$/i, '').toUpperCase();
  const lines = [`### ${code}`];

  const config = getOwnershipFlowConfig();
  if (!config.enabled) {
    lines.push(
      '- Ownership Flow: fitur belum aktif pada deployment ini. Katakan apa adanya bahwa datanya belum tersedia; JANGAN menyebut angka kepemilikan apa pun.'
    );
    return lines.join('\n');
  }

  try {
    const view = await getOwnershipFlowView(ticker);
    const source = getPrimarySource();

    if (!view || view.observedDate === null) {
      lines.push(
        '- Ownership Flow: belum ada observasi kepemilikan tersimpan untuk emiten ini.',
        `- Status sumber: ${source.id} (audit ${source.auditStatus}).`,
        '- WAJIB: katakan datanya belum tersedia. JANGAN mengarang persentase kepemilikan lokal/asing, dan JANGAN memakai angka dari ingatan model.'
      );
      return lines.join('\n');
    }

    lines.push(
      `- Kepemilikan asing: ${fmtPct(view.foreignPct)} (per ${view.observedDate})`,
      `- Kepemilikan lokal: ${fmtPct(view.localPct)}`,
    );
    if (view.scriplessPct !== null) lines.push(`- Scripless: ${fmtPct(view.scriplessPct)}`);

    lines.push('- Perubahan terhadap SNAPSHOT SEBELUMNYA dari sumber yang sama (percentage point / pp):');
    if (view.previous.basisObservedDate === null) {
      lines.push('  - Belum ada snapshot pembanding. Ini BUKAN berarti kepemilikan stabil.');
    } else {
      lines.push(
        `  - Pembanding: ${view.previous.basisObservedDate} (jarak ${view.previous.actualGapDays} hari kalender)`,
        `  - Δ asing: ${view.previous.foreignPp === null ? 'tidak tersedia' : `${fmtPp(view.previous.foreignPp)} pp`}`,
        `  - Δ lokal: ${view.previous.localPp === null ? 'tidak tersedia' : `${fmtPp(view.previous.localPp)} pp`}`,
      );
    }

    lines.push(
      `- Klasifikasi: ${view.trend} - ${view.trendReason}`,
      `- Kesegaran: ${view.freshness}${view.ageDays === null ? '' : ` (umur ${view.ageDays} hari)`}; cadence sumber: ${view.cadence}`,
      `- Sumber: ${view.source ?? source.id}${view.sourceUrl ? ` (${view.sourceUrl})` : ''}`,
      `- Jumlah observasi historis tersimpan: ${view.historyCount}`,
      '- Status: EKSPERIMENTAL, TIDAK ikut menghitung LensScore.',
      '',
      '- ATURAN BAHASA WAJIB untuk bagian ini:',
      '  - Ini data KOMPOSISI KEPEMILIKAN, BUKAN data transaksi broker.',
      '  - DILARANG menyimpulkan "asing sedang beli/jual", "broker asing X membeli", atau menyebut nama broker mana pun dari angka ini.',
      '  - Kenaikan porsi asing bisa terjadi tanpa pembelian baru (mis. pemegang lokal menjual ke sesama asing, aksi korporasi, atau reklasifikasi kustodian).',
      '  - Gunakan rumusan seperti "kepemilikan asing naik X pp dibanding snapshot sebelumnya". Jangan menyebut akumulasi/distribusi sebagai sinyal sebelum ambangnya tervalidasi.',
      '  - SELALU sebut satuan pp (percentage point), bukan %. Naik dari 40% ke 41% = +1 pp, bukan +1%.',
      '  - SELALU sebut tanggal observasi dan sumbernya.',
      '  - DILARANG menurunkan rekomendasi beli/jual dari data ini.',
    );

    return lines.join('\n');
  } catch (error) {
    console.warn(
      '[LensAI:ownership-flow] gagal dibaca',
      code,
      error instanceof Error ? error.message : String(error)
    );
    lines.push('- Ownership Flow: gagal dibaca dari database. Katakan datanya tidak terbaca; jangan mengarang angka.');
    return lines.join('\n');
  }
}

function fmtPct(value: number | null): string {
  return value === null ? 'tidak tersedia' : `${value.toFixed(2)}%`;
}

function fmtPp(value: number): string {
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}`;
}
