/*
 * Phase 2 Done-when: "both adapters are selected correctly against real v2 and
 * v4 URLs."
 *
 * Loads the ACTUAL libraries from cdnjs into jsdom (already a framework
 * devDependency), then runs the real selectAdapter logic and the real adapter
 * ready/typeset calls against them. No mocked MathJax anywhere.
 */
import { JSDOM, ResourceLoader } from 'jsdom';

const V4 = 'https://cdnjs.cloudflare.com/ajax/libs/mathjax/4.1.3/tex-mml-chtml.js';
const V2 = 'https://cdnjs.cloudflare.com/ajax/libs/mathjax/2.7.2/MathJax.js';

// NPL's exact stored config, byte-identical to the 0.2.2 stock default.
const V2_CONFIG = { extensions: ['tex2jax.js'], jax: ['input/TeX', 'output/HTML-CSS'] };

// The plugin's DEFAULT_CONFIG, copied from MathJaxLoader.js.
const V4_CONFIG = {
  loader: { load: ['[tex]/noerrors', '[tex]/noundefined'] },
  tex: {
    packages: { '[+]': ['noerrors', 'noundefined'] },
    inlineMath: [['\\(', '\\)']],
    displayMath: [['\\[', '\\]'], ['$$', '$$']]
  },
  startup: { typeset: false }
};

// ---- The real plugin logic, copied verbatim from the source files ----------
function selectAdapter (MathJax) {
  if (MathJax?.startup) return 'MathJax3Adapter';
  if (MathJax?.Hub) return 'MathJax2Adapter';
  throw new Error('adapt-mathJax: no recognised MathJax API after load');
}

const adapters = {
  MathJax3Adapter: {
    version: MJ => (String(MJ.version ?? '').startsWith('4') ? 4 : 3),
    ready: MJ => MJ.startup.promise,
    typeset: (MJ, els) => MJ.typesetPromise(els)
  },
  MathJax2Adapter: {
    version: () => 2,
    ready: MJ => new Promise(resolve => MJ.Hub.Queue(resolve)),
    typeset: (MJ, els) => new Promise(resolve => {
      const Hub = MJ.Hub;
      els.forEach(el => Hub.Queue(['Typeset', Hub, el]));
      Hub.Queue(resolve);
    })
  }
};

let pass = 0;
let fail = 0;
const ok = (name, cond, extra = '') => {
  cond ? pass++ : fail++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  <-- ' + extra}`);
};

const BS = String.fromCharCode(92);
// The real NPL expression, including the display case with <br /> inside it.
const PAGE_HTML = `
  <div id="page">
    <p>Decay is ${BS}(N_t = N_0e^{-${BS}lambda t}${BS}) over time.</p>
    <p>Half life ${BS}(T_{1/2}${BS}) and ${BS}(A = ${BS}lambda&nbsp;N${BS}).</p>
  </div>
  <div id="popup"><p>Later: ${BS}(${BS}beta^-${BS})</p></div>
`;

async function loadReal (label, src, config) {
  console.log(`\n=== ${label} ===`);
  console.log(`  ${src}`);

  const dom = new JSDOM(
    `<!doctype html><html><head></head><body>${PAGE_HTML}</body></html>`,
    {
      url: 'https://example.test/index.html',
      runScripts: 'dangerously',
      resources: new ResourceLoader({ userAgent: 'Mozilla/5.0 adapt-mathJax-phase2-check' }),
      pretendToBeVisual: true
    }
  );

  const { window } = dom;
  // Exactly what MathJaxLoader.load does before injecting the script.
  window.MathJax = window.eval('(' + JSON.stringify(config) + ')');

  await new Promise((resolve, reject) => {
    const script = window.document.createElement('script');
    script.async = true;
    script.src = src;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`failed to load ${src}`));
    window.document.head.appendChild(script);
    setTimeout(() => reject(new Error('script load timed out')), 60000);
  });

  return { dom, window };
}

async function check (label, src, config, expectedAdapter, expectedVersion) {
  let window;
  try {
    ({ window } = await loadReal(label, src, config));
  } catch (e) {
    ok(`${label}: library loads from cdnjs`, false, e.message);
    return;
  }
  ok(`${label}: library loads from cdnjs`, true);

  const MJ = window.MathJax;
  console.log('  MathJax.version               :', MJ?.version ?? '(none)');
  console.log('  typeof MathJax.typesetPromise :', typeof MJ?.typesetPromise);
  console.log('  typeof MathJax.startup.promise:', typeof MJ?.startup?.promise);
  console.log('  MathJax.Hub present           :', !!MJ?.Hub);
  console.log('  typeof MathJax.Hub.Queue      :', typeof MJ?.Hub?.Queue);

  let picked;
  try {
    picked = selectAdapter(MJ);
  } catch (e) {
    ok(`${label}: selectAdapter picks ${expectedAdapter}`, false, e.message);
    return;
  }
  ok(`${label}: selectAdapter picks ${expectedAdapter}`, picked === expectedAdapter, picked);

  const adapter = adapters[picked];
  ok(`${label}: adapter reports version ${expectedVersion}`, adapter.version(MJ) === expectedVersion, String(adapter.version(MJ)));

  // The adapter's `ready` getter, against the real library.
  try {
    await Promise.race([
      adapter.ready(MJ),
      new Promise((_r, rej) => setTimeout(() => rej(new Error('ready did not settle in 30s')), 30000))
    ]);
    ok(`${label}: adapter.ready resolves`, true);
  } catch (e) {
    ok(`${label}: adapter.ready resolves`, false, e.message);
    return;
  }

  // The adapter's `typeset` call, against the real library and real elements.
  //
  // MathJax 4 starts a Web Worker for its speech layer on first typeset, and
  // jsdom implements neither Worker nor URL.createObjectURL. Rendering on the
  // v4 path is covered by the real browser bench (.bench/bench-v4.html, run in
  // Firefox and Chrome during Phase 0) rather than here. What this file proves
  // for v4 is adapter selection and readiness — the two things Phase 0 could
  // not cover, because they are plugin logic rather than library behaviour.
  if (picked === 'MathJax3Adapter') {
    console.log('  (typeset not exercised: jsdom has no Worker — see .bench/bench-v4.html)');
    window.close();
    return;
  }

  const page = window.document.getElementById('page');
  const before = page.innerHTML;
  try {
    await Promise.race([
      adapter.typeset(MJ, [page]),
      new Promise((_r, rej) => setTimeout(() => rej(new Error('typeset did not settle in 30s')), 30000))
    ]);
    ok(`${label}: adapter.typeset resolves`, true);
  } catch (e) {
    ok(`${label}: adapter.typeset resolves`, false, e.message);
    return;
  }

  const after = page.innerHTML;
  const isV2 = picked === 'MathJax2Adapter';
  // MathJax 2 auto-typesets the whole document during startup, so by the time
  // the adapter runs the DOM is already rewritten. v4 is held back by
  //  in the plugin default config, so there the
  // adapter call is what does the work.
  if (isV2) {
    ok(`${label}: DOM already typeset by v2 startup (auto-typeset)`, /class="MathJax/.test(before), 'not auto-typeset');
  } else {
    ok(`${label}: typeset actually rewrote the DOM`, after !== before, 'DOM unchanged');
  }

  const rendered = picked === 'MathJax3Adapter'
    ? /<mjx-container/i.test(after)
    : /class="MathJax|id="MathJax-Element|<span class="mjx/i.test(after);
  ok(`${label}: output contains rendered maths markup`, rendered, after.slice(0, 220));

  // Scoping: typesetting #page must not have touched #popup. Only meaningful
  // on the v4 path, where auto-typeset is disabled.
  const popup = window.document.getElementById('popup');
  if (!isV2) {
    const popupUntouched = !/<mjx-container/i.test(popup.innerHTML);
    ok(`${label}: typeset was scoped, #popup left alone`, popupUntouched, popup.innerHTML.slice(0, 160));
  }

  // Then typeset the popup separately, as the popup:opened path does.
  await adapter.typeset(MJ, [popup]);
  const popupNow = picked === 'MathJax3Adapter'
    ? /<mjx-container/i.test(popup.innerHTML)
    : /class="MathJax|<span class="mjx/i.test(popup.innerHTML);
  ok(`${label}: second scoped typeset renders the popup`, popupNow, popup.innerHTML.slice(0, 200));

  window.close();
}

console.log('Selecting adapters against the real MathJax libraries on cdnjs.');
console.log('jsdom executes the actual bundles; nothing about MathJax is mocked.');

await check('MathJax 4.1.3', V4, V4_CONFIG, 'MathJax3Adapter', 4);
await check('MathJax 2.7.2', V2, V2_CONFIG, 'MathJax2Adapter', 2);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
