/**
 * LQ45 current constituent snapshot.
 * Effective period: 2026-11-02 through 2027-01-29.
 * Announcement reference: Peng-00205/BEI.POP/10-2026.
 *
 * IMPORTANT: this is a point-in-time universe snapshot. Never use this list to
 * backtest dates before its effectiveFrom without a historical constituent table.
 */
export const CURRENT_LQ45_VERSION = 'lq45-2026-11';
export const CURRENT_LQ45_EFFECTIVE_FROM = '2026-11-02';
export const CURRENT_LQ45_EFFECTIVE_TO = '2027-01-29';

export const CURRENT_LQ45_UNIVERSE = [
  'AADI.JK', 'ADMR.JK', 'ADRO.JK', 'AKRA.JK', 'AMMN.JK',
  'AMRT.JK', 'ANTM.JK', 'ASII.JK', 'BBCA.JK', 'BBNI.JK',
  'BBRI.JK', 'BBTN.JK', 'BMRI.JK', 'BRPT.JK', 'BUMI.JK',
  'CPIN.JK', 'DEWA.JK', 'ELSA.JK', 'EMTK.JK', 'ESSA.JK',
  'EXCL.JK', 'GOTO.JK', 'HRTA.JK', 'ICBP.JK', 'INCO.JK',
  'INDF.JK', 'INDY.JK', 'INKP.JK', 'ISAT.JK', 'ITMG.JK',
  'JPFA.JK', 'KLBF.JK', 'MAPI.JK', 'MBMA.JK', 'MDKA.JK',
  'MEDC.JK', 'NCKL.JK', 'PGAS.JK', 'PGEO.JK', 'PTBA.JK',
  'SMGR.JK', 'TLKM.JK', 'UNTR.JK', 'UNVR.JK', 'WIFI.JK',
] as const;

const CURRENT_LQ45_SET = new Set<string>(CURRENT_LQ45_UNIVERSE);

export function normalizeLq45Ticker(raw: string): string {
  const t = raw.trim().toUpperCase();
  if (!t || t.startsWith('^')) return t;
  return t.endsWith('.JK') ? t : `${t}.JK`;
}

export function isCurrentLq45Ticker(raw: string): boolean {
  return CURRENT_LQ45_SET.has(normalizeLq45Ticker(raw));
}
