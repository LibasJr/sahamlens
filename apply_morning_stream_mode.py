from pathlib import Path
from datetime import datetime
import shutil

root = Path('.')
page = root / 'app/admin/infographic-studio/page.tsx'
if not page.exists():
    raise SystemExit('ERROR: jalankan dari root repository SahamLens (/opt/sahamlens/app).')

source_dir = Path(__file__).resolve().parent / 'components' / 'export'
target_dir = root / 'components' / 'export'
target_dir.mkdir(parents=True, exist_ok=True)

for filename in ['TechnicalMorningStreamCard.tsx', 'FundamentalMorningStreamCard.tsx']:
    src = source_dir / filename
    if not src.exists():
        raise SystemExit(f'ERROR: file patch tidak ditemukan: {src}')
    shutil.copy2(src, target_dir / filename)
    print('✓ Added:', target_dir / filename)

backup = page.with_suffix(page.suffix + '.bak-morning-stream-' + datetime.now().strftime('%Y%m%d-%H%M%S'))
shutil.copy2(page, backup)
print('✓ Backup:', backup)

s = page.read_text()

# Imports
import_marker = "import FundamentalMoatEarningsExportCard3D from '@/components/export/FundamentalMoatEarningsExportCard3D';"
imports = import_marker + "\nimport TechnicalMorningStreamCard from '@/components/export/TechnicalMorningStreamCard';\nimport FundamentalMorningStreamCard from '@/components/export/FundamentalMorningStreamCard';"
if "TechnicalMorningStreamCard" not in s:
    if import_marker not in s:
        raise SystemExit('ERROR: marker import export card tidak ditemukan.')
    s = s.replace(import_marker, imports, 1)

# Layout type
mode_marker = "type StudioCardMode = 'technical' | 'fundamental_moat_earnings';"
mode_add = mode_marker + "\ntype StudioLayoutMode = 'detail' | 'morning';"
if 'type StudioLayoutMode' not in s:
    if mode_marker not in s:
        raise SystemExit('ERROR: StudioCardMode marker tidak ditemukan.')
    s = s.replace(mode_marker, mode_add, 1)

# Layout state
state_marker = "  const [cardMode, setCardMode] = useState<StudioCardMode>('technical');"
state_add = state_marker + "\n  const [layoutMode, setLayoutMode] = useState<StudioLayoutMode>('detail');"
if 'const [layoutMode, setLayoutMode]' not in s:
    if state_marker not in s:
        raise SystemExit('ERROR: cardMode state marker tidak ditemukan.')
    s = s.replace(state_marker, state_add, 1)

# Download filename: support the existing line without changing detail behavior.
old = "      const typeLabel = cardMode === 'technical' ? 'Technical-3D' : 'Fundamental-Moat-Earnings-3D';"
new = """      const typeLabel = layoutMode === 'morning'
        ? (cardMode === 'technical' ? 'Technical-Morning-Stream' : 'Fundamental-Morning-Stream')
        : (cardMode === 'technical' ? 'Technical-3D' : 'Fundamental-Moat-Earnings-3D');"""
if old in s:
    s = s.replace(old, new, 1)
elif 'Technical-Morning-Stream' not in s:
    raise SystemExit('ERROR: typeLabel download marker tidak ditemukan.')

# Toast label can remain, but make Morning explicit if exact current line exists.
old = "      showToast(`Infografis 3D ${cardMode === 'technical' ? 'Teknikal' : 'Fundamental+Moat'} berhasil diekspor (HD PNG)!`, 'success');"
new = """      showToast(
        layoutMode === 'morning'
          ? `Morning Stream ${cardMode === 'technical' ? 'Teknikal' : 'Fundamental'} berhasil diekspor (HD PNG)!`
          : `Infografis 3D ${cardMode === 'technical' ? 'Teknikal' : 'Fundamental+Moat'} berhasil diekspor (HD PNG)!`,
        'success'
      );"""
if old in s:
    s = s.replace(old, new, 1)

# Add format switch just before content selector (or before theme selector on older file).
format_marker = "            {/* 2. Content selectors: only real values available in the loaded payload */}"
if format_marker not in s:
    format_marker = "            {/* 2. Theme Selector & Randomize Button */}"

format_controls = r'''            {/* Format output: detail report vs social-first 4:5 Morning Stream */}
            <div className="flex items-center gap-1.5 rounded-xl border border-slate-800 bg-[#030612] p-1 w-full lg:w-auto">
              <button
                type="button"
                onClick={() => setLayoutMode('detail')}
                className={`flex-1 lg:flex-initial rounded-lg px-3 py-2 text-[11px] font-black transition-all ${
                  layoutMode === 'detail'
                    ? `bg-white/10 text-white border ${active3DTheme.accentBorder}`
                    : 'text-slate-500 hover:text-white'
                }`}
              >
                Detail 360°
              </button>
              <button
                type="button"
                onClick={() => setLayoutMode('morning')}
                className={`flex-1 lg:flex-initial rounded-lg px-3 py-2 text-[11px] font-black transition-all ${
                  layoutMode === 'morning'
                    ? `bg-gradient-to-r ${active3DTheme.buttonGrad} text-white ${active3DTheme.accentShadow}`
                    : 'text-slate-500 hover:text-white'
                }`}
              >
                Morning Stream 4:5
              </button>
            </div>

'''
if 'Morning Stream 4:5' not in s:
    if format_marker not in s:
        raise SystemExit('ERROR: marker area kontrol tidak ditemukan.')
    s = s.replace(format_marker, format_controls + format_marker, 1)

# Preview title.
old = "                Live 3D Preview: {cardMode === 'technical' ? 'Laporan Teknikal & Smart Money' : 'Laporan Fundamental, Moat & Earnings'}"
new = """                {layoutMode === 'morning' ? 'Morning Stream 4:5' : 'Live 3D Preview'}: {cardMode === 'technical' ? 'Teknikal & Smart Money' : 'Fundamental, Moat & Earnings'}"""
if old in s:
    s = s.replace(old, new, 1)
elif "{layoutMode === 'morning' ? 'Morning Stream 4:5'" not in s:
    raise SystemExit('ERROR: preview title marker tidak ditemukan.')

# Existing detail renderer is preserved verbatim and wrapped with the new morning cards.
old_render = r'''                {data ? (
                  cardMode === 'technical' ? (
                    <TechnicalExportCard3D
                      symbol={data.symbol}
                      stockName={data.stock.name}
                      currentPrice={data.stock.current_price}
                      changePct={data.stock.change_pct}
                      volume={data.stock.volume}
                      consensusLabel={data.technical.consensusLabel}
                      consensusTone={data.technical.consensusTone}
                      score={data.technical.score}
                      scoreBreakdown={data.technical.breakdown}
                      buyPct={data.technical.bullPct}
                      sellPct={data.technical.bearPct}
                      neutralPct={data.technical.neutralPct}
                      analyzers={selectedTechnicalAnalyzers}
                      theme={active3DTheme}
                      exportedAt={new Date()}
                    />
                  ) : (
                    <FundamentalMoatEarningsExportCard3D
                      ticker={data.symbol}
                      stock={data.stock}
                      scoring={data.fundamental.scoring}
                      fundamentals={selectedFundamentalsForExport}
                      profile={data.fundamental.profile}
                      moat={data.fundamental.moat}
                      durability={data.fundamental.durability}
                      upcomingEarnings={data.fundamental.upcomingEarnings}
                      earningsExpectation={data.fundamental.earningsExpectation}
                      latestEarningsQuarter={data.fundamental.latestEarningsQuarter}
                      theme={active3DTheme}
                      exportedAt={new Date()}
                    />
                  )
                ) : ('''

# Older version without metric dropdown selection.
old_render_legacy = old_render.replace('analyzers={selectedTechnicalAnalyzers}', 'analyzers={data.technical.analyzers}').replace('fundamentals={selectedFundamentalsForExport}', 'fundamentals={data.fundamental.fundamentals}')

new_render = r'''                {data ? (
                  layoutMode === 'morning' ? (
                    cardMode === 'technical' ? (
                      <TechnicalMorningStreamCard
                        symbol={data.symbol}
                        stockName={data.stock.name}
                        currentPrice={data.stock.current_price}
                        changePct={data.stock.change_pct}
                        volume={data.stock.volume}
                        analyzers={selectedTechnicalAnalyzers}
                        theme={active3DTheme}
                        exportedAt={new Date()}
                      />
                    ) : (
                      <FundamentalMorningStreamCard
                        ticker={data.symbol}
                        stock={data.stock}
                        fundamentals={selectedFundamentalsForExport}
                        profile={data.fundamental.profile}
                        moat={data.fundamental.moat}
                        upcomingEarnings={data.fundamental.upcomingEarnings}
                        theme={active3DTheme}
                        exportedAt={new Date()}
                      />
                    )
                  ) : (
                    cardMode === 'technical' ? (
                      <TechnicalExportCard3D
                        symbol={data.symbol}
                        stockName={data.stock.name}
                        currentPrice={data.stock.current_price}
                        changePct={data.stock.change_pct}
                        volume={data.stock.volume}
                        consensusLabel={data.technical.consensusLabel}
                        consensusTone={data.technical.consensusTone}
                        score={data.technical.score}
                        scoreBreakdown={data.technical.breakdown}
                        buyPct={data.technical.bullPct}
                        sellPct={data.technical.bearPct}
                        neutralPct={data.technical.neutralPct}
                        analyzers={selectedTechnicalAnalyzers}
                        theme={active3DTheme}
                        exportedAt={new Date()}
                      />
                    ) : (
                      <FundamentalMoatEarningsExportCard3D
                        ticker={data.symbol}
                        stock={data.stock}
                        scoring={data.fundamental.scoring}
                        fundamentals={selectedFundamentalsForExport}
                        profile={data.fundamental.profile}
                        moat={data.fundamental.moat}
                        durability={data.fundamental.durability}
                        upcomingEarnings={data.fundamental.upcomingEarnings}
                        earningsExpectation={data.fundamental.earningsExpectation}
                        latestEarningsQuarter={data.fundamental.latestEarningsQuarter}
                        theme={active3DTheme}
                        exportedAt={new Date()}
                      />
                    )
                  )
                ) : ('''

if 'TechnicalMorningStreamCard' in s and 'layoutMode === \'morning\' ? (' not in s[s.find('{data ? ('):]:
    # import alone does not mean render applied.
    pass

if 'analyzers={selectedTechnicalAnalyzers}' in s and 'fundamentals={selectedFundamentalsForExport}' in s:
    if old_render in s:
        s = s.replace(old_render, new_render, 1)
    elif 'TechnicalMorningStreamCard\n                        symbol={data.symbol}' not in s:
        # May already have imports but not render.
        if '<TechnicalMorningStreamCard' not in s:
            raise SystemExit('ERROR: blok renderer current tidak ditemukan; patch dihentikan agar file tidak rusak.')
else:
    # Legacy: create equivalent render using all loaded data.
    legacy_new = new_render.replace('analyzers={selectedTechnicalAnalyzers}', 'analyzers={data.technical.analyzers}').replace('fundamentals={selectedFundamentalsForExport}', 'fundamentals={data.fundamental.fundamentals}')
    if old_render_legacy in s:
        s = s.replace(old_render_legacy, legacy_new, 1)
    elif '<TechnicalMorningStreamCard' not in s:
        raise SystemExit('ERROR: blok renderer legacy tidak ditemukan; patch dihentikan.')

page.write_text(s)
print('✓ Updated:', page)
print('✓ Morning Stream 4:5 aktif untuk Technical + Fundamental')
print('✓ Detail 360° lama tetap tersedia')
print('✓ Morning cards hanya merender data valid; missing tidak diisi fallback')
