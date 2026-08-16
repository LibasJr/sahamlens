'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Database, Globe, RefreshCw, Search, ShieldAlert } from 'lucide-react';
import Header from '@/components/Header';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { PageContainer } from '@/components/ui/PageContainer';
import { Skeleton } from '@/components/ui/Skeleton';
import {
  formatObservedDate,
  formatPercent,
  formatPpCell,
  FRESHNESS_LABEL,
  TREND_LABEL,
  type OwnershipFlowApiResponse,
  type OwnershipFlowApiRow,
} from '@/components/ownership-flow/ownership-flow-format';

// HALAMAN OWNERSHIP FLOW.
//
// Menu BARU - bukan Broker Summary yang diganti nama. Broker Summary tetap ada
// di tempatnya dan tetap nonaktif.
//
// Yang SENGAJA tidak ada di halaman ini: rekomendasi beli/jual, skor, dan
// peringkat "saham terbaik". Ownership Flow adalah bukti pendukung - ia
// menjelaskan komposisi kepemilikan, bukan menyarankan transaksi.

type SortKey = 'ticker' | 'foreignPct' | 'd1' | 'd7' | 'd30';
type FilterKey = 'ALL' | 'WITH_DATA' | 'MISSING' | 'STALE';

export default function OwnershipFlowPage() {
  const [data, setData] = useState<OwnershipFlowApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('ticker');
  const [sortAsc, setSortAsc] = useState(true);
  const [filter, setFilter] = useState<FilterKey>('ALL');
  // Header memakai pemilih ticker global yang sama dengan halaman lain. Halaman
  // ini sendiri lintas-emiten, jadi nilainya hanya meneruskan navigasi Header,
  // tidak menyaring tabel di bawah.
  const [headerTicker, setHeaderTicker] = useState('BBCA');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/ownership-flow');
      if (res.status === 404) {
        setError('Ownership Flow belum diaktifkan pada deployment ini.');
        setData(null);
        return;
      }
      if (!res.ok) throw new Error('Gagal memuat data');
      setData((await res.json()) as OwnershipFlowApiResponse);
    } catch {
      setError('Gagal memuat Ownership Flow. Coba muat ulang beberapa saat lagi.');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(() => {
    if (!data) return [];
    const term = query.trim().toUpperCase();
    const filtered = data.rows.filter((row) => {
      if (term && !row.ticker.includes(term)) return false;
      if (filter === 'WITH_DATA') return row.observedDate !== null;
      if (filter === 'MISSING') return row.observedDate === null;
      if (filter === 'STALE') return row.freshness === 'STALE';
      return true;
    });

    const direction = sortAsc ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (sortKey === 'ticker') return a.ticker.localeCompare(b.ticker) * direction;
      const pick = (row: OwnershipFlowApiRow) =>
        sortKey === 'foreignPct' ? row.foreignPct : row.delta[sortKey === 'd1' ? '1d' : sortKey === 'd7' ? '7d' : '30d'];
      const av = pick(a);
      const bv = pick(b);
      // null SELALU di bawah, apa pun arah urutannya: "belum ada data" bukan
      // nilai terkecil, ia bukan nilai sama sekali.
      if (av === null && bv === null) return a.ticker.localeCompare(b.ticker);
      if (av === null) return 1;
      if (bv === null) return -1;
      return (av - bv) * direction;
    });
  }, [data, query, sortKey, sortAsc, filter]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setSortAsc((prev) => !prev);
    else {
      setSortKey(key);
      setSortAsc(key === 'ticker');
    }
  };

  const sourcePending = data?.source.auditStatus !== 'VERIFIED';

  return (
    <>
      <Header
        currentTicker={headerTicker}
        onTickerChange={setHeaderTicker}
        moduleTitle="Ownership Flow"
      />
      <PageContainer className="px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-heading text-xl font-bold text-tv-text sm:text-2xl">Ownership Flow</h1>
              {/* Status eksperimental ditempel di judul, bukan disembunyikan di
                  catatan kaki - pembaca harus tahu sejak detik pertama. */}
              <Badge variant="warning">Eksperimental</Badge>
              <Badge variant="neutral">Tidak masuk LensScore</Badge>
            </div>
            <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-tv-muted">
              Komposisi kepemilikan efek (lokal vs asing) dari sumber resmi kustodian.
              Ini <strong className="text-tv-text">bukan</strong> data transaksi broker &mdash; kenaikan
              kepemilikan asing tidak dapat disimpulkan sebagai pembelian oleh broker asing tertentu.
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Muat ulang
          </Button>
        </div>

        {sourcePending && !loading && (
          <Card className="mb-4 border-tv-warning/20 bg-tv-warning/[0.04]">
            <div className="flex items-start gap-3">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-tv-warning" />
              <div className="min-w-0 text-[13px] leading-relaxed">
                <p className="font-semibold text-tv-text">Verifikasi sumber belum selesai</p>
                <p className="mt-1 text-tv-muted">
                  Pengambilan data produksi masih tertutup (fail-closed) sampai struktur halaman sumber
                  diverifikasi langsung di server. Tabel di bawah menampilkan keadaan sebenarnya:
                  kosong selama belum ada observasi tersimpan. Tidak ada angka contoh atau data sintetis.
                </p>
              </div>
            </div>
          </Card>
        )}

        {error && (
          <Card className="mb-4 border-tv-red/20 bg-tv-red/[0.04]">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-tv-red" />
              <p className="text-[13px] text-tv-text">{error}</p>
            </div>
          </Card>
        )}

        {data && (
          <div className="mb-4 grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
            <StatCard label="Data per" value={formatObservedDate(data.latestObservedDate)} />
            <StatCard label="Emiten ada data" value={`${data.coverage.tickersWithData} / ${data.universeSize}`} />
            <StatCard label="Total observasi" value={String(data.coverage.totalObservations)} />
            <StatCard label="Sumber" value={data.source.id.replace(/_/g, ' ')} icon={<Globe className="h-3 w-3" />} />
          </div>
        )}

        <Card padding="none" className="overflow-hidden">
          <div className="flex flex-col gap-2.5 border-b border-white/[0.06] p-3.5 sm:flex-row sm:items-center sm:justify-between">
            <Input
              size="sm"
              placeholder="Cari kode saham..."
              aria-label="Cari kode saham"
              value={query}
              onChange={(e) => setQuery(e.target.value.toUpperCase())}
              leftIcon={<Search className="h-3.5 w-3.5" />}
              className="sm:max-w-[240px]"
            />
            <div className="flex flex-wrap gap-1.5">
              {(['ALL', 'WITH_DATA', 'STALE', 'MISSING'] as FilterKey[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFilter(key)}
                  className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide transition-colors ${
                    filter === key
                      ? 'border-tv-blue/30 bg-tv-blue/10 text-tv-blue'
                      : 'border-white/[0.07] bg-white/[0.02] text-tv-muted hover:text-tv-text'
                  }`}
                >
                  {FILTER_LABEL[key]}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="space-y-2 p-3.5">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-11 w-full rounded-lg" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-14 text-center">
              <Database className="h-7 w-7 text-tv-muted/50" />
              <p className="text-sm font-semibold text-tv-text">
                {data && data.coverage.totalObservations === 0
                  ? 'Belum ada observasi kepemilikan tersimpan'
                  : 'Tidak ada emiten yang cocok'}
              </p>
              <p className="max-w-md text-[12.5px] leading-relaxed text-tv-muted">
                {data && data.coverage.totalObservations === 0
                  ? 'Histori mulai terkumpul setelah verifikasi sumber selesai dan cron pengambilan diaktifkan. Sampai saat itu, halaman ini sengaja kosong daripada menampilkan angka yang tidak pernah diukur.'
                  : 'Ubah kata kunci atau filter untuk melihat emiten lainnya.'}
              </p>
            </div>
          ) : (
            <>
              {/* Desktop: tabel. Mobile: kartu - tabel 8 kolom tidak pernah
                  terbaca di layar 360px, dan menggulirnya menyamping membuat
                  kode sahamnya sendiri hilang dari pandangan. */}
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[820px] text-left text-[13px]">
                  <thead className="border-b border-white/[0.06] text-[11px] uppercase tracking-wide text-tv-muted">
                    <tr>
                      <Th onClick={() => toggleSort('ticker')} active={sortKey === 'ticker'} asc={sortAsc}>Kode</Th>
                      <Th onClick={() => toggleSort('foreignPct')} active={sortKey === 'foreignPct'} asc={sortAsc} align="right">Asing %</Th>
                      <Th align="right">Lokal %</Th>
                      <Th onClick={() => toggleSort('d1')} active={sortKey === 'd1'} asc={sortAsc} align="right">Δ 1H (pp)</Th>
                      <Th onClick={() => toggleSort('d7')} active={sortKey === 'd7'} asc={sortAsc} align="right">Δ 7H (pp)</Th>
                      <Th onClick={() => toggleSort('d30')} active={sortKey === 'd30'} asc={sortAsc} align="right">Δ 30H (pp)</Th>
                      <Th>Tren</Th>
                      <Th>Data per</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.ticker} className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02]">
                        <td className="px-3.5 py-2.5 font-semibold text-tv-text">{row.ticker}</td>
                        <td className="px-3.5 py-2.5 text-right tabular-nums text-tv-text">{formatPercent(row.foreignPct)}</td>
                        <td className="px-3.5 py-2.5 text-right tabular-nums text-tv-muted">{formatPercent(row.localPct)}</td>
                        <DeltaCell value={row.delta['1d']} gapDays={row.deltaGapDays['1d']} horizon={1} />
                        <DeltaCell value={row.delta['7d']} gapDays={row.deltaGapDays['7d']} horizon={7} />
                        <DeltaCell value={row.delta['30d']} gapDays={row.deltaGapDays['30d']} horizon={30} />
                        <td className="px-3.5 py-2.5"><TrendBadge trend={row.trend} /></td>
                        <td className="px-3.5 py-2.5 whitespace-nowrap">
                          <FreshnessCell observedDate={row.observedDate} freshness={row.freshness} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="divide-y divide-white/[0.04] md:hidden">
                {rows.map((row) => (
                  <div key={row.ticker} className="p-3.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-heading text-[15px] font-bold text-tv-text">{row.ticker}</span>
                      <TrendBadge trend={row.trend} />
                    </div>
                    <div className="mt-2 flex items-baseline gap-3">
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-tv-muted">Asing</p>
                        <p className="text-lg font-bold tabular-nums text-tv-text">{formatPercent(row.foreignPct)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-tv-muted">Lokal</p>
                        <p className="text-lg font-bold tabular-nums text-tv-muted">{formatPercent(row.localPct)}</p>
                      </div>
                    </div>
                    <div className="mt-2.5 grid grid-cols-3 gap-2">
                      {([['1d', 1], ['7d', 7], ['30d', 30]] as const).map(([key, horizon]) => (
                        <div key={key} className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-2 py-1.5">
                          <p className="text-[10px] uppercase tracking-wide text-tv-muted">Δ {horizon}H</p>
                          <p className={`text-[13px] font-bold tabular-nums ${deltaColor(row.delta[key])}`}>
                            {formatPpCell(row.delta[key])}
                          </p>
                        </div>
                      ))}
                    </div>
                    <div className="mt-2.5">
                      <FreshnessCell observedDate={row.observedDate} freshness={row.freshness} />
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>

        <p className="mt-4 text-[11.5px] leading-relaxed text-tv-muted">
          Δ dinyatakan dalam <strong className="text-tv-text">percentage point (pp)</strong>, bukan persen relatif.
          Perubahan kepemilikan asing dari 40,00% ke 41,00% adalah +1,00 pp (setara +2,5% relatif).
          Label horizon memakai observasi terdekat sebelum batas &mdash; arahkan kursor ke nilai Δ untuk
          melihat jarak hari sebenarnya. Ownership Flow bersifat eksperimental dan tidak ikut menghitung LensScore.
        </p>
      </PageContainer>
    </>
  );
}

const FILTER_LABEL: Record<FilterKey, string> = {
  ALL: 'Semua',
  WITH_DATA: 'Ada data',
  STALE: 'Basi',
  MISSING: 'Belum ada',
};

function StatCard({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <Card padding="sm">
      <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-tv-muted">
        {icon}
        {label}
      </p>
      <p className="mt-1 truncate font-heading text-[15px] font-bold text-tv-text">{value}</p>
    </Card>
  );
}

function Th({
  children,
  onClick,
  active,
  asc,
  align = 'left',
}: {
  children: React.ReactNode;
  onClick?: () => void;
  active?: boolean;
  asc?: boolean;
  align?: 'left' | 'right';
}) {
  return (
    <th className={`px-3.5 py-2.5 font-semibold ${align === 'right' ? 'text-right' : 'text-left'}`}>
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          className={`inline-flex items-center gap-1 transition-colors hover:text-tv-text ${active ? 'text-tv-text' : ''}`}
        >
          {children}
          {active && <span aria-hidden="true">{asc ? '↑' : '↓'}</span>}
        </button>
      ) : (
        children
      )}
    </th>
  );
}

function deltaColor(value: number | null): string {
  if (value === null) return 'text-tv-muted';
  if (value > 0) return 'text-tv-green';
  if (value < 0) return 'text-tv-red';
  return 'text-tv-text';
}

function DeltaCell({ value, gapDays, horizon }: { value: number | null; gapDays: number | null; horizon: number }) {
  // Jarak sebenarnya diungkap lewat title: kalau sumber bercadence bulanan,
  // "Δ 7H" bisa saja dihitung dari observasi 31 hari lalu. Angka itu tidak
  // disembunyikan, hanya tidak memenuhi tabel.
  const title =
    value === null
      ? `Belum ada observasi pembanding pada horizon ${horizon} hari`
      : `Dibanding observasi ${gapDays} hari sebelumnya`;
  return (
    <td className={`px-3.5 py-2.5 text-right tabular-nums ${deltaColor(value)}`} title={title}>
      {formatPpCell(value)}
      {value !== null && gapDays !== null && gapDays !== horizon && (
        <span className="ml-1 text-[10px] text-tv-muted">({gapDays}h)</span>
      )}
    </td>
  );
}

function TrendBadge({ trend }: { trend: OwnershipFlowApiRow['trend'] }) {
  const config = TREND_LABEL[trend];
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

function FreshnessCell({
  observedDate,
  freshness,
}: {
  observedDate: string | null;
  freshness: OwnershipFlowApiRow['freshness'];
}) {
  const config = FRESHNESS_LABEL[freshness];
  return (
    <span className="inline-flex items-center gap-2">
      <span className="text-[12.5px] text-tv-muted">{formatObservedDate(observedDate)}</span>
      <Badge variant={config.variant} size="sm">
        {config.label}
      </Badge>
    </span>
  );
}
