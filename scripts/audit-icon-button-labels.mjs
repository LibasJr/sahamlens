#!/usr/bin/env node
/**
 * Menolak kontrol yang isinya hanya ikon dan tidak punya nama aksesibel.
 *
 * MASALAH YANG DIJAGA. Tombol yang isinya cuma <Trash2 /> dibacakan pembaca layar
 * sebagai "tombol" - tanpa kata benda, tanpa objek. Di daftar watchlist dengan tujuh
 * baris, itu tujuh "tombol" yang identik dan tidak satu pun memberi tahu saham mana
 * yang akan dihapus. Kontrol semacam ini juga tidak bisa disebut namanya oleh pengguna
 * kendali suara.
 *
 * KENAPA `title=` TIDAK DIHITUNG SEBAGAI PERBAIKAN. Atribut title native memang
 * dipungut sebagian pembaca layar sebagai nama cadangan, tapi ia tidak pernah muncul di
 * perangkat sentuh (tidak ada hover), tidak bisa dibuka lewat papan ketik, dan urutan
 * pemungutannya berbeda antar-mesin. Ia berguna sebagai tooltip tambahan; ia bukan
 * mekanisme pelabelan. Karena itu skrip ini menuntut aria-label/aria-labelledby dan
 * membiarkan title tetap ada di sampingnya.
 *
 * KENAPA BERBASIS AST, BUKAN GREP. Atribut JSX rutin memuat panah gemuk
 * (`onClick={() => ...}`), dan tanda `>` di dalamnya memotong regex tag mana pun di
 * tengah jalan. Versi grep dari pemeriksaan ini menemukan 17 kandidat; parser TypeScript
 * yang sama persis menemukan 40. Selisih itu bukan detail - itu mayoritas temuannya.
 *
 * AMBANG. Nol, dan sengaja bukan ratchet seperti audit adopsi: temuan di sini adalah
 * cacat, bukan utang gaya penulisan, dan biaya memperbaikinya satu atribut.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOTS = ['app', 'components'];

/** Tag yang selalu interaktif, di luar apa pun yang punya onClick. */
const INTERACTIVE_TAGS = new Set(['button', 'a', 'Link', 'Button']);

function collectFiles() {
  const out = [];
  for (const root of ROOTS) {
    const dir = path.join(ROOT, root);
    if (!fs.existsSync(dir)) continue;
    (function walk(d) {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) {
          if (!['node_modules', '.next'].includes(e.name)) walk(p);
        } else if (e.name.endsWith('.tsx')) out.push(p);
      }
    })(dir);
  }
  return out.sort();
}

/**
 * Apakah ekspresi ini pasti merender ikon saja (bukan teks)?
 *
 * Pola yang ditargetkan adalah tombol alih: `{aktif ? <Volume2 /> : <VolumeX />}`.
 * Menganggap SEMUA ekspresi sebagai teks membuat pola itu lolos - dan itu justru
 * kelas tombol ikon yang paling umum kedua di kode ini. Menganggap semua ekspresi
 * sebagai ikon akan salah ke arah sebaliknya dan menandai `{t('simpan')}`. Jadi yang
 * diputuskan hanya kasus yang bisa dibaca dari sintaksisnya: percabangan yang SETIAP
 * cabangnya elemen JSX atau null.
 */
function isDefinitelyIconOnlyExpression(expr, sf) {
  if (!expr) return false;

  // Cabang yang berupa elemen/fragmen HARUS ditelusuri, tidak boleh dianggap ikon
  // begitu saja: `{kiri ? <>{label} {ikon}</> : <>{ikon} {label}</>}` di kepala tabel
  // /recommendations adalah percabangan JSX murni yang isinya justru teks.
  const isIconish = (n) => {
    if (n.kind === ts.SyntaxKind.NullKeyword) return true;
    if (ts.isIdentifier(n) && n.text === 'undefined') return true;
    if (ts.isJsxSelfClosingElement(n)) return true;
    if (ts.isJsxElement(n)) return !hasVisibleText(n.children, sf);
    if (ts.isJsxFragment(n)) return !hasVisibleText(n.children, sf);
    return false;
  };

  if (ts.isConditionalExpression(expr)) {
    return isIconish(expr.whenTrue) && isIconish(expr.whenFalse);
  }
  if (ts.isParenthesizedExpression(expr)) return isDefinitelyIconOnlyExpression(expr.expression, sf);
  return false;
}

/** Apakah anak-anak elemen ini memuat sesuatu yang bisa jadi teks terlihat? */
function hasVisibleText(children, sf) {
  for (const c of children) {
    if (ts.isJsxText(c)) {
      if (c.getText(sf).trim()) return true;
    } else if (ts.isJsxExpression(c)) {
      if (!isDefinitelyIconOnlyExpression(c.expression, sf)) return true;
    } else if (ts.isJsxElement(c)) {
      if (hasVisibleText(c.children, sf)) return true;
    } else if (ts.isJsxFragment(c)) {
      if (hasVisibleText(c.children, sf)) return true;
    }
  }
  return false;
}

const findings = [];

for (const file of collectFiles()) {
  const src = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

  const inspect = (opening, children, node) => {
    const tag = opening.tagName.getText(sf);
    const attrs = new Set();
    let spread = false;
    for (const a of opening.attributes.properties) {
      if (ts.isJsxAttribute(a)) attrs.add(a.name.getText(sf));
      else spread = true; // {...props} bisa membawa aria-label dari pemanggil
    }

    if (!(INTERACTIVE_TAGS.has(tag) || attrs.has('onClick'))) return;
    if (spread) return;
    if (attrs.has('aria-label') || attrs.has('aria-labelledby')) return;
    // aria-hidden: sengaja disembunyikan dari pohon aksesibilitas, jadi tidak perlu nama.
    if (attrs.has('aria-hidden')) return;
    if (hasVisibleText(children, sf)) return;
    if (children.length === 0) return;

    findings.push({
      file: path.relative(ROOT, file),
      line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1,
      tag,
      hasTitle: attrs.has('title'),
    });
  };

  const visit = (node) => {
    if (ts.isJsxElement(node)) inspect(node.openingElement, node.children, node);
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

if (findings.length > 0) {
  console.error(`[a11y] ${findings.length} kontrol berisi ikon saja tanpa nama aksesibel:`);
  for (const f of findings) {
    const catatan = f.hasTitle ? ' (punya title=, tapi itu bukan pelabelan)' : '';
    console.error(`  ${f.file}:${f.line}  <${f.tag}>${catatan}`);
  }
  console.error('');
  console.error('[a11y] Tambahkan aria-label yang menyebut OBJEKNYA, bukan hanya aksinya:');
  console.error('[a11y]   aria-label={`Hapus ${kode} dari watchlist`}  bukan  aria-label="Hapus"');
  console.error('[a11y] Sepuluh tombol "Hapus" yang identik tidak menolong siapa pun.');
  process.exit(1);
}

console.log('[a11y] Semua kontrol berisi ikon punya nama aksesibel.');
