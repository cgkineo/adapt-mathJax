/* Negative control: prove the harness's detection actually fires. */
import { mathjax } from '@mathjax/src/js/mathjax.js';
import { TeX } from '@mathjax/src/js/input/tex.js';
import { SVG } from '@mathjax/src/js/output/svg.js';
import { liteAdaptor } from '@mathjax/src/js/adaptors/liteAdaptor.js';
import { RegisterHTMLHandler } from '@mathjax/src/js/handlers/html.js';
import '@mathjax/src/js/input/tex/base/BaseConfiguration.js';
import '@mathjax/src/js/input/tex/ams/AmsConfiguration.js';

const a = liteAdaptor();
RegisterHTMLHandler(a);
const doc = mathjax.document('', {
  InputJax: new TeX({ packages: ['base', 'ams'] }),
  OutputJax: new SVG({ fontCache: 'none' })
});

function check (tex) {
  try {
    const out = a.outerHTML(doc.convert(tex, { display: false }));
    const m = out.match(/data-mjx-error="([^"]*)"/) || out.match(/<merror[^>]*>([\s\S]*?)<\/merror>/);
    return m ? 'DETECTED: ' + m[1].replace(/<[^>]+>/g, '').trim() : 'clean';
  } catch (e) { return 'THROW: ' + e.message; }
}

// Things that MUST be caught.
const shouldFail = [
  ['undefined control sequence', '\\notARealCommand{x}'],
  ['unbalanced brace', '\\frac{1}{2'],
  ['missing argument', '\\frac'],
  ['mhchem not loaded', '\\ce{H2O}'],
  ['physics not loaded', '\\dv{f}{x}'],
  ['unclosed group', '{\\alpha']
];
// Things that MUST pass — the real suspect cases, correctly decoded.
const shouldPass = [
  ['nbsp decoded to U+00A0', 'A = \\lambda\u00a0N'],
  ['nbsp + literal multiplication sign', 'T_{1/2}\u00a0= 4.5 \u00d7 10^9'],
  ['br decoded to newline', '\n\\lambda = \\frac{\\ln2}{T_{1/2}}\n'],
  ['control space', '+ \\ \\alpha'],
  // The real NPL case: a backslash immediately followed by U+00A0 once &nbsp;
  // is decoded. v4 treats it as a control space, same as v2 does.
  ['backslash + U+00A0', '+ \\ \\beta^-']
];

console.log('MUST BE CAUGHT (a "clean" here means the harness is blind):');
let blind = 0;
for (const [label, tex] of shouldFail) {
  const r = check(tex);
  if (r === 'clean') blind++;
  console.log('  ' + (r === 'clean' ? '!! BLIND' : '   caught') + '  ' + label.padEnd(34) + r);
}
console.log('');
console.log('MUST PASS (a failure here is a real v4 incompatibility):');
let broke = 0;
for (const [label, tex] of shouldPass) {
  const r = check(tex);
  if (r !== 'clean') broke++;
  console.log('  ' + (r === 'clean' ? '   pass ' : '!! FAIL ') + '  ' + label.padEnd(34) + r);
}
console.log('');
console.log(blind === 0 ? 'Detection works: every planted error was caught.' : `WARNING: harness missed ${blind} planted error(s).`);
console.log(broke === 0 ? 'All real suspect cases parse clean in v4.' : `${broke} real case(s) failed.`);
