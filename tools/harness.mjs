/*
 * adapt-mathJax content-compatibility harness — Phase 0, item 2.
 *
 * Walks every course JSON file under one or more roots, extracts each \(…\) / \[…\]
 * expression, and parses it through the MathJax 3.2.2 and MathJax 4 TeX parsers.
 * Reports anything that ERRORS.
 *
 * WHAT THIS DOES AND DOES NOT ANSWER
 * ----------------------------------
 * Answers:     does v3/v4's rewritten TeX parser ACCEPT input that v2 accepts?
 *              That is the "content-level TeX incompatibility" risk in the plan.
 * Does NOT:    visual fidelity — glyphs, size, baseline, spacing. Only the browser
 *              bench answers that, by eye. A "parses clean" verdict here is
 *              necessary but not sufficient.
 *
 * IMPORTANT — the innerHTML step. Authored strings live in JSON and reach the DOM
 * as innerHTML, so &nbsp; is U+00A0 and <br /> is an element BEFORE MathJax sees it.
 * The harness reproduces that decode; parsing the raw JSON string would test the
 * wrong input and give a falsely clean result.
 *
 * Usage: node harness.mjs <course-dir> [<course-dir> …]
 */

import fs from 'node:fs';
import path from 'node:path';

// ---- v3 -------------------------------------------------------------------
import { mathjax as mathjax3 } from 'mathjax-full/js/mathjax.js';
import { TeX as TeX3 } from 'mathjax-full/js/input/tex.js';
import { SVG as SVG3 } from 'mathjax-full/js/output/svg.js';
import { liteAdaptor as liteAdaptor3 } from 'mathjax-full/js/adaptors/liteAdaptor.js';
import { RegisterHTMLHandler as RegisterHTMLHandler3 } from 'mathjax-full/js/handlers/html.js';

// Package set is kept deliberately MODEST and matched across v3/v4 rather than
// using AllPackages. NPL's config loads only input/TeX with no extensions, so a
// maximal package set would be a more forgiving parser than they actually run
// and would understate real risk.
const PACKAGES = ['base', 'ams', 'newcommand', 'configmacros'];

const adaptor3 = liteAdaptor3();
RegisterHTMLHandler3(adaptor3);
const doc3 = mathjax3.document('', {
  InputJax: new TeX3({ packages: PACKAGES }),
  OutputJax: new SVG3({ fontCache: 'none' })
});

// ---- v4 -------------------------------------------------------------------
let doc4 = null;
try {
  // v4's package export path is /js/*, and it REMOVED AllPackages.js — TeX
  // packages are now registered by side-effect import and named individually.
  const { mathjax: mathjax4 } = await import('@mathjax/src/js/mathjax.js');
  const { TeX: TeX4 } = await import('@mathjax/src/js/input/tex.js');
  const { SVG: SVG4 } = await import('@mathjax/src/js/output/svg.js');
  const { liteAdaptor: liteAdaptor4 } = await import('@mathjax/src/js/adaptors/liteAdaptor.js');
  const { RegisterHTMLHandler: RHH4 } = await import('@mathjax/src/js/handlers/html.js');
  await import('@mathjax/src/js/input/tex/base/BaseConfiguration.js');
  await import('@mathjax/src/js/input/tex/ams/AmsConfiguration.js');
  await import('@mathjax/src/js/input/tex/newcommand/NewcommandConfiguration.js');
  await import('@mathjax/src/js/input/tex/configmacros/ConfigMacrosConfiguration.js');
  const AllPackages4 = ['base', 'ams', 'newcommand', 'configmacros'];
  const adaptor4 = liteAdaptor4();
  RHH4(adaptor4);
  doc4 = mathjax4.document('', {
    InputJax: new TeX4({ packages: AllPackages4 }),
    OutputJax: new SVG4({ fontCache: 'none' })
  });
} catch (e) {
  console.error('WARNING: MathJax 4 parser unavailable — ' + e.message);
  console.error('v4 column will be reported as "n/a".\n');
}

// ---------------------------------------------------------------------------

const COURSE_FILES = ['components.json', 'blocks.json', 'articles.json', 'contentObjects.json', 'course.json'];
const RE = /\\\(([\s\S]*?)\\\)|\\\[([\s\S]*?)\\\]/g;

/**
 * Reproduce what the browser does to an authored string before MathJax sees it:
 * decode HTML entities and turn block-level tags into whitespace.
 */
function decodeAsInnerHTML (s) {
  return s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
    .replace(/&rarr;/g, '→')
    .replace(/&times;/g, '×');
}

function tryParse (doc, tex, display) {
  if (!doc) return { ok: null, err: 'n/a' };
  try {
    const node = doc.convert(tex, { display });
    const out = doc.adaptor.outerHTML(node);
    const m = out.match(/data-mjx-error="([^"]*)"/) || out.match(/<merror[^>]*>([\s\S]*?)<\/merror>/);
    if (m) return { ok: false, err: m[1].replace(/<[^>]+>/g, '').trim() };
    return { ok: true, err: null };
  } catch (e) {
    return { ok: false, err: e.message };
  }
}

// ---- walk -----------------------------------------------------------------

const roots = process.argv.slice(2);
if (!roots.length) {
  console.error('usage: node harness.mjs <course-dir> [<course-dir> …]');
  process.exit(1);
}

function findCourseFiles (root) {
  const hits = [];
  const walk = dir => {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (['node_modules', '.git', '.svn', 'build'].includes(e.name)) continue;
        walk(p);
      } else if (COURSE_FILES.includes(e.name)) {
        hits.push(p);
      }
    }
  };
  walk(root);
  return hits;
}

const expressions = [];
let filesScanned = 0;

for (const root of roots) {
  for (const file of findCourseFiles(root)) {
    filesScanned++;
    let data;
    try { data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { continue; }
    const walk = (node, id) => {
      if (node == null) return;
      if (typeof node === 'string') {
        RE.lastIndex = 0;
        let m;
        while ((m = RE.exec(node))) {
          const display = m[2] !== undefined;
          const rawInner = display ? m[2] : m[1];
          expressions.push({
            file, _id: id, display,
            raw: m[0],
            tex: decodeAsInnerHTML(rawInner)
          });
        }
        return;
      }
      if (Array.isArray(node)) return node.forEach(n => walk(n, id));
      if (typeof node === 'object') {
        const nid = node._id || id;
        for (const k of Object.keys(node)) walk(node[k], nid);
      }
    };
    walk(data, null);
  }
}

// ---- dedupe + parse -------------------------------------------------------

const unique = new Map();
for (const e of expressions) {
  if (!unique.has(e.raw)) unique.set(e.raw, { ...e, n: 0, ids: new Set(), files: new Set() });
  const u = unique.get(e.raw);
  u.n++;
  u.ids.add(e._id);
  u.files.add(path.basename(path.dirname(e.file)) + '/' + path.basename(e.file));
}

const results = [];
for (const [raw, e] of unique) {
  const r3 = tryParse(doc3, e.tex, e.display);
  const r4 = tryParse(doc4, e.tex, e.display);
  results.push({ ...e, raw, r3, r4 });
}

// ---- report ---------------------------------------------------------------

const fail = results.filter(r => r.r3.ok === false || r.r4.ok === false);
const pass = results.filter(r => !(r.r3.ok === false || r.r4.ok === false));

const L = s => String(s);
console.log('='.repeat(78));
console.log('adapt-mathJax content-compatibility harness');
console.log('='.repeat(78));
console.log('roots scanned      : ' + roots.length);
console.log('course files found : ' + filesScanned);
console.log('expressions found  : ' + expressions.length + ' (' + unique.size + ' unique forms)');
console.log('  inline           : ' + expressions.filter(e => !e.display).length);
console.log('  display          : ' + expressions.filter(e => e.display).length);
console.log('');
console.log('parse clean in both v3 and v4 : ' + pass.length + ' / ' + unique.size);
console.log('FLAGGED                       : ' + fail.length);
console.log('');

if (fail.length) {
  console.log('-'.repeat(78));
  console.log('FLAGGED EXPRESSIONS — fix at source before taking Step 2');
  console.log('-'.repeat(78));
  for (const r of fail) {
    console.log('');
    console.log('  source : ' + JSON.stringify(r.raw));
    console.log('  parsed : ' + JSON.stringify(r.tex));
    console.log('  count  : ' + r.n + '   ids: ' + [...r.ids].join(', '));
    console.log('  files  : ' + [...r.files].join(', '));
    console.log('  v3     : ' + (r.r3.ok === null ? 'n/a' : r.r3.ok ? 'ok' : 'ERROR — ' + r.r3.err));
    console.log('  v4     : ' + (r.r4.ok === null ? 'n/a' : r.r4.ok ? 'ok' : 'ERROR — ' + r.r4.err));
  }
  console.log('');
}

console.log('-'.repeat(78));
console.log('FULL RESULTS');
console.log('-'.repeat(78));
console.log('  n  v3   v4   expression');
for (const r of results.sort((a, b) => b.n - a.n)) {
  const f = x => x.ok === null ? ' na ' : x.ok ? ' ok ' : 'FAIL';
  console.log(L(r.n).padStart(3) + '  ' + f(r.r3) + ' ' + f(r.r4) + '  ' + JSON.stringify(r.raw));
}

const outPath = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), 'harness-results.json');
fs.writeFileSync(outPath, JSON.stringify(
  results.map(r => ({ raw: r.raw, tex: r.tex, n: r.n, display: r.display, ids: [...r.ids], files: [...r.files], v3: r.r3, v4: r.r4 })),
  null, 1));
console.log('');
console.log('written: ' + outPath);
console.log('');
console.log('NOTE: a clean parse is necessary but NOT sufficient. Visual fidelity —');
console.log('glyphs, size, baseline, spacing — is only answerable from the browser bench.');
