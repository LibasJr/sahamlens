import type { PersistedDecisionSignal } from '@/modules/decision-agent';

export function formatEvidenceNumber(value: number | null, digits = 0): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('id-ID', { maximumFractionDigits: digits }).format(value);
}

export function formatEvidenceTime(value: string | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short' }) + ' WIB';
}

export interface EvidenceDetail { ref: string; label: string; value: string }

/**
 * Terjemahkan evidenceRefs (mis. "E:DGWG:supportingReason3") yang dikutip hybrid
 * analyst menjadi label + nilai aktual yang bisa dibaca manusia, diambil dari data
 * sinyal yang sama yang dikirim ke model - bukan dari teks bebas AI.
 *
 * Dipakai bareng oleh DecisionLabClient (admin/decision-lab) dan panel candidate
 * di halaman detail emiten (/technical/[symbol]), supaya keduanya menampilkan
 * evidence aktual dengan cara yang identik. Kalau menambah field baru ke evidence
 * yang dikirim ke hybrid analyst (lihat buildSignalEvidence di
 * hybrid-analyst.service.ts), tambahkan juga label-nya di sini.
 */
export function mapEvidenceLabels(signal: PersistedDecisionSignal, refs: string[]): EvidenceDetail[] {
  const map = new Map<string, { label: string; value: string }>();
  const t = signal.ticker;
  const set = (field: string, label: string, val: unknown) => {
    if (val === null || val === undefined) return;
    const valueStr = typeof val === 'boolean'
      ? (val ? 'Ya' : 'Tidak (Belum divalidasi OOS)')
      : typeof val === 'number'
        ? formatEvidenceNumber(val, 2)
        : String(val);
    map.set(`E:${t}:${field}`, { label, value: valueStr });
  };

  set('ruleAction', 'Aksi Rule', signal.action);
  set('price', 'Harga', `Rp ${formatEvidenceNumber(signal.price)}`);
  set('lensScore', 'Lens Score', formatEvidenceNumber(signal.lensScore, 1));
  set('coveragePct', 'Cakupan Data', `${formatEvidenceNumber(signal.coveragePct, 1)}%`);
  set('dataAsOf', 'Tanggal Data', formatEvidenceTime(signal.dataAsOf));
  set('stale', 'Data Kadaluarsa', signal.stale);
  set('modelValidated', 'Model Tervalidasi OOS', signal.modelValidated);
  set('sector', 'Sektor', signal.sector);
  set('avgValue20d', 'Rata-rata Transaksi 20H', signal.avgValue20d != null ? `Rp ${formatEvidenceNumber(signal.avgValue20d)}` : null);
  if (signal.scoreBreakdown) {
    set('technicalScore', 'Skor Teknikal', formatEvidenceNumber(signal.scoreBreakdown.technical, 1));
    set('fundamentalScore', 'Skor Fundamental', formatEvidenceNumber(signal.scoreBreakdown.fundamental, 1));
    set('flowScore', 'Skor Flow', formatEvidenceNumber(signal.scoreBreakdown.flow, 1));
  }
  if (signal.riskSetup) {
    set('entry', 'Entry', `Rp ${formatEvidenceNumber(signal.riskSetup.entry)}`);
    set('stop', 'Stop Loss', `Rp ${formatEvidenceNumber(signal.riskSetup.stop)}`);
    set('target1', 'Target 1', `Rp ${formatEvidenceNumber(signal.riskSetup.target1)}`);
    set('target2', 'Target 2', `Rp ${formatEvidenceNumber(signal.riskSetup.target2)}`);
    set('riskReward', 'Risk/Reward Ratio', formatEvidenceNumber(signal.riskSetup.riskReward, 2));
    set('riskPct', 'Risiko Loss', `${formatEvidenceNumber(signal.riskSetup.riskPct, 1)}%`);
  }
  set('newsBasis', 'Basis Berita', signal.news.basis);
  set('newsPositive', 'Berita Positif', signal.news.positive);
  set('newsNeutral', 'Berita Netral', signal.news.neutral);
  set('newsNegative', 'Berita Negatif', signal.news.negative);

  signal.supportingReasons.forEach((reason, index) => set(`supportingReason${index + 1}`, `Alasan Pendukung #${index + 1}`, reason));
  signal.opposingReasons.forEach((reason, index) => set(`opposingReason${index + 1}`, `Alasan Penentang #${index + 1}`, reason));
  signal.invalidationReasons.forEach((reason, index) => set(`invalidationReason${index + 1}`, `Pembatal #${index + 1}`, reason));
  signal.eligibilityReasons.forEach((reason, index) => set(`eligibilityReason${index + 1}`, `Syarat #${index + 1}`, reason));

  return refs.map((ref) => {
    const found = map.get(ref);
    if (found) return { ref, label: found.label, value: found.value };
    const shortField = ref.replace(`E:${t}:`, '');
    return { ref, label: shortField, value: 'Data kualitatif' };
  });
}
