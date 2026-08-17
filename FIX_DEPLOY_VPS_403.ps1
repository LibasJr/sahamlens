$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "=== SahamLens Deploy VPS HTTP 403 Fix ===" -ForegroundColor Cyan
Write-Host "Patch ini HANYA mengganti step 'Smoke test publik setelah deploy'." -ForegroundColor Gray
Write-Host "Step deploy/SSH/secrets lain tidak diubah." -ForegroundColor Gray
Write-Host ""

$root = (Get-Location).Path
$candidates = @(
    (Join-Path $root ".github\workflows\deploy-vps.yml"),
    (Join-Path $root ".github\workflows\deploy-vps.yaml")
)

$workflow = $null
foreach ($candidate in $candidates) {
    if (Test-Path $candidate) {
        $workflow = $candidate
        break
    }
}

if (-not $workflow) {
    $matches = Get-ChildItem -Path (Join-Path $root ".github\workflows") -File -ErrorAction SilentlyContinue |
        Where-Object {
            $_.Extension -in ".yml", ".yaml"
        } |
        Where-Object {
            (Get-Content $_.FullName -Raw) -match "Smoke test publik setelah deploy"
        }

    if ($matches.Count -eq 1) {
        $workflow = $matches[0].FullName
    }
    elseif ($matches.Count -gt 1) {
        throw "Ditemukan lebih dari satu workflow dengan step 'Smoke test publik setelah deploy'. Patch dihentikan agar tidak salah file."
    }
}

if (-not $workflow) {
    throw "Workflow Deploy VPS tidak ditemukan. Jalankan file ini dari folder utama repository SahamLens."
}

Write-Host "Workflow ditemukan:" -ForegroundColor Green
Write-Host "  $workflow"
Write-Host ""

$content = Get-Content -Path $workflow -Raw

if ($content -notmatch "(?m)^(?<indent>[ \t]*)- name:\s*Smoke test publik setelah deploy\s*$") {
    throw "Step 'Smoke test publik setelah deploy' tidak ditemukan. Tidak ada file yang diubah."
}

$indent = $Matches["indent"]
$child = $indent + "  "
$runIndent = $indent + "    "

$replacement = @"
${indent}- name: Smoke test publik setelah deploy
${child}shell: bash
${child}run: |
${runIndent}set -euo pipefail
${runIndent}
${runIndent}node --input-type=module <<'NODE'
${runIndent}const base = 'https://sahamlens.id';
${runIndent}const url = `${base}/`;
${runIndent}
${runIndent}async function smokeTest() {
${runIndent}  let lastError;
${runIndent}
${runIndent}  for (let attempt = 1; attempt <= 5; attempt++) {
${runIndent}    try {
${runIndent}      const res = await fetch(url, {
${runIndent}        redirect: 'follow',
${runIndent}        headers: {
${runIndent}          'user-agent': 'SahamLens-GitHub-Deploy-SmokeTest/1.0',
${runIndent}          'accept': 'text/html,application/xhtml+xml,*/*;q=0.8',
${runIndent}        },
${runIndent}        signal: AbortSignal.timeout(20000),
${runIndent}      });
${runIndent}
${runIndent}      console.log(`Public smoke test attempt ${attempt}: / -> HTTP ${res.status}`);
${runIndent}
${runIndent}      if (res.status === 403) {
${runIndent}        throw new Error(`/ HTTP 403`);
${runIndent}      }
${runIndent}
${runIndent}      if (res.status === 404) {
${runIndent}        throw new Error(`/ HTTP 404`);
${runIndent}      }
${runIndent}
${runIndent}      if (res.status >= 500) {
${runIndent}        throw new Error(`/ HTTP ${res.status}`);
${runIndent}      }
${runIndent}
${runIndent}      console.log('Public smoke test PASS');
${runIndent}      return;
${runIndent}    } catch (err) {
${runIndent}      lastError = err;
${runIndent}      console.error(`Attempt ${attempt} gagal:`, err?.message ?? err);
${runIndent}
${runIndent}      if (attempt < 5) {
${runIndent}        await new Promise(resolve => setTimeout(resolve, 5000));
${runIndent}      }
${runIndent}    }
${runIndent}  }
${runIndent}
${runIndent}  throw lastError ?? new Error('Public smoke test gagal');
${runIndent}}
${runIndent}
${runIndent}await smokeTest();
${runIndent}NODE
"@

# Replace only this step, stopping before the next step at the same indentation
$escapedIndent = [regex]::Escape($indent)
$pattern = "(?ms)^${escapedIndent}- name:\s*Smoke test publik setelah deploy\s*\r?\n.*?(?=^${escapedIndent}- name:|\z)"

$regex = [regex]::new($pattern)
$matchCount = $regex.Matches($content).Count

if ($matchCount -ne 1) {
    throw "Patch mengharapkan tepat 1 step smoke test, tetapi menemukan $matchCount. Tidak ada file yang diubah."
}

$backup = "$workflow.bak-before-403-fix"
Copy-Item -Path $workflow -Destination $backup -Force

$newContent = $regex.Replace($content, ($replacement.TrimEnd() + "`r`n"), 1)
Set-Content -Path $workflow -Value $newContent -Encoding UTF8

Write-Host ""
Write-Host "PATCH BERHASIL." -ForegroundColor Green
Write-Host "Backup:" -ForegroundColor Yellow
Write-Host "  $backup"
Write-Host ""
Write-Host "Yang diubah:" -ForegroundColor Cyan
Write-Host "  /api/health TIDAK lagi dipakai sebagai smoke test publik GitHub."
Write-Host "  GitHub sekarang menguji halaman publik https://sahamlens.id/"
Write-Host "  Health internal VPS tetap tidak dibuka ke publik."
Write-Host ""
Write-Host "Cek hasil:" -ForegroundColor Cyan
Write-Host "  git diff -- .github/workflows/"
Write-Host ""
Write-Host "Jika diff sudah benar:" -ForegroundColor Cyan
Write-Host "  git add .github/workflows/"
Write-Host "  git commit -m `"fix: avoid protected health endpoint in public smoke test`""
Write-Host "  git push"
Write-Host ""
