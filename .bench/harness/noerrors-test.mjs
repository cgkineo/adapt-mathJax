/*
 * Does loading [tex]/noerrors + [tex]/noundefined in MathJax 4 actually degrade
 * broken TeX to readable source text instead of an error box?
 *
 * Compares the SAME broken inputs with and without the two packages.
 */
import { mathjax } from '@mathjax/src/js/mathjax.js';
import { TeX } from '@mathjax/src/js/input/tex.js';
import { SVG } from '@mathjax/src/js/output/svg.js';
import { liteAdaptor } from '@mathjax/src/js/adaptors/liteAdaptor.js';
import { RegisterHTMLHandler } from '@mathjax/src/js/handlers/html.js';
import '@mathjax/src/js/input/tex/base/BaseConfiguration.js';
import '@mathjax/src/js/input/tex/ams/AmsConfiguration.js';
import '@mathjax/src/js/input/tex/noerrors/NoErrorsConfiguration.js';
import '@mathjax/src/js/input/tex/noundefined/NoUndefinedConfiguration.js';

const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);

const mk = packages => mathjax.document('', {
  InputJax: new TeX({ packages }),
  OutputJax: new SVG({ fontCache: 'none' })
});

const plain = mk(['base', 'ams']);
const safe = mk(['base', 'ams', 'noerrors', 'noundefined']);

// noerrors still emits an <merror> node — but fills it with the ORIGINAL TeX
// source rather than the error message, keeping the message only in a title
// tooltip. So "is there an merror" is the wrong question. The question the
// learner cares about is: what TEXT is on screen — the source, or "Undefined
// control sequence"?
function probe (doc, tex) {
  try {
    const node = doc.convert(tex, { display: false });
    const out = adaptor.outerHTML(node);
    const err = out.match(/data-mjx-error="([^"]*)"/);
    const message = err ? err[1] : null;
    // Visible text content of the rendered output.
    const text = adaptor.textContent(node).trim();
    const showsMessage = !!(message && text.includes(message.slice(0, 18)));
    return {
      errored: !!/<merror|data-mjx-error/.test(out),
      showsMessage,   // learner sees "Undefined control sequence…"
      text,
      message
    };
  } catch (e) {
    return { errored: true, showsMessage: true, text: 'THROW', message: e.message };
  }
}

const broken = [
  ['undefined macro', '\\notARealCommand{x}'],
  ['undefined, mid-expression', 'x + \\3'],
  ['missing close brace', '\\frac{a}{b'],
  ['missing argument', '\\frac'],
  ['mhchem not loaded', '\\ce{H2O}'],
  ['unclosed group', '{\\alpha']
];

console.log('MathJax 4 — effect of [tex]/noerrors + [tex]/noundefined');
console.log('What the LEARNER actually sees on screen.\n');
console.log('input'.padEnd(26) + 'without'.padEnd(34) + 'with noerrors/noundefined');
console.log('-'.repeat(96));

let improved = 0;
for (const [label, tex] of broken) {
  const a = probe(plain, tex);
  const b = probe(safe, tex);
  const A = a.showsMessage ? 'msg: ' + a.text.slice(0, 26) : a.text.slice(0, 26);
  const B = b.showsMessage ? 'msg: ' + b.text.slice(0, 30) : 'source: ' + b.text.slice(0, 30);
  if (a.showsMessage && !b.showsMessage) improved++;
  console.log(label.padEnd(26) + A.padEnd(34) + B);
}

console.log('-'.repeat(96));
console.log(`\n${improved} of ${broken.length} stopped showing an error message and showed the source instead.`);

// And confirm VALID input is completely unaffected by the two packages.
const valid = [
  'A = \\lambda\u00a0N',
  'T_{1/2}\u00a0= 4.5 \u00d7 10^9',
  '+ \\\u00a0\\beta^-',
  '\\lambda = \\frac{\\ln2}{T_{1/2}}',
  'N_t = N_0e^{-\\lambda t}'
];
const regressions = valid.filter(t => probe(safe, t).errored);
console.log(regressions.length === 0
  ? 'All 5 real NPL expressions still render cleanly with the packages loaded.'
  : 'REGRESSION: ' + regressions.join(' | '));
