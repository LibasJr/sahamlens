from pathlib import Path
from datetime import datetime
import shutil

p = Path("app/admin/infographic-studio/page.tsx")
if not p.exists():
    raise SystemExit("ERROR: jalankan dari root repository SahamLens.")

backup = p.with_suffix(p.suffix + ".bak-ts7006-" + datetime.now().strftime("%Y%m%d-%H%M%S"))
shutil.copy2(p, backup)

s = p.read_text()

# 1. Tambahkan type eksplisit untuk option indikator teknikal.
marker = "type FundamentalMetricKey = (typeof FUNDAMENTAL_METRIC_OPTIONS)[number]['key'];"
addition = """type FundamentalMetricKey = (typeof FUNDAMENTAL_METRIC_OPTIONS)[number]['key'];

type StudioTechnicalIndicatorOption = {
  key: string;
  label: string;
  value: unknown;
};"""

if "type StudioTechnicalIndicatorOption" not in s:
    if marker not in s:
        raise SystemExit("ERROR: FundamentalMetricKey marker tidak ditemukan.")
    s = s.replace(marker, addition, 1)

# 2. Paksa hasil useMemo menjadi array bertipe, bukan any.
old = "const technicalIndicatorOptions = React.useMemo(() => {"
new = "const technicalIndicatorOptions = React.useMemo<StudioTechnicalIndicatorOption[]>(() => {"
if old in s:
    s = s.replace(old, new, 1)
elif new not in s:
    raise SystemExit("ERROR: technicalIndicatorOptions useMemo tidak ditemukan.")

# 3. Jangan biarkan Array.isArray terhadap payload any menyebarkan any ke seluruh map/some.
old = "const analyzers = Array.isArray(data?.technical?.analyzers) ? data.technical.analyzers : [];"
new = "const analyzers: unknown[] = Array.isArray(data?.technical?.analyzers) ? data.technical.analyzers : [];"
if old in s:
    s = s.replace(old, new, 1)
elif new not in s:
    raise SystemExit("ERROR: analyzers source tidak ditemukan.")

# 4. Beri return type eksplisit pada map agar downstream callback terinfer dengan benar.
old = ".map((analyzer: any) => ({"
new = ".map((analyzer: any): StudioTechnicalIndicatorOption => ({"
if old in s:
    s = s.replace(old, new, 1)

# Defensive fallback: bila TS masih melihat callback item sebagai any karena variasi source,
# beri type eksplisit pada empat callback yang dilaporkan CI.
replacements = {
    "technicalIndicatorOptions.some((item) => item.key === key)":
        "technicalIndicatorOptions.some((item: StudioTechnicalIndicatorOption) => item.key === key)",
    "technicalIndicatorOptions.slice(0, MAX_STUDIO_METRICS).map((item) => item.key)":
        "technicalIndicatorOptions.slice(0, MAX_STUDIO_METRICS).map((item: StudioTechnicalIndicatorOption) => item.key)",
    "technicalIndicatorOptions.map((item) => {":
        "technicalIndicatorOptions.map((item: StudioTechnicalIndicatorOption) => {",
}
for a, b in replacements.items():
    s = s.replace(a, b)

p.write_text(s)
print("✓ Backup:", backup)
print("✓ TS7006 hotfix diterapkan:", p)
print("✓ technicalIndicatorOptions sekarang bertipe StudioTechnicalIndicatorOption[]")
