import logging from 'core/js/logging';
import MathJax2Adapter from './adapters/MathJax2Adapter';
import MathJax3Adapter from './adapters/MathJax3Adapter';

/**
 * Where the vendored library lands in a build.
 *
 * `grunt/config/copy.js` collates every `extensions/<plugin>/libraries` tree
 * from every installed plugin into one flat `build/libraries/`, keeping only
 * the path *after* the `libraries/` segment — hence the mandatory `mathjax/4/`
 * subfolder in this repo, which is what stops MathJax's files colliding with
 * every other plugin's.
 *
 * Relative, with no leading slash: a course can be served from a subdirectory
 * or played from disk, and both must resolve. This is also what kills the old
 * protocol-relative `//cdnjs…` bug, which resolved to `file://cdnjs…` and
 * silently removed all maths when a package was opened locally.
 *
 * No **trailing** slash either. MathJax's loader resolves a prefixed path by
 * bare concatenation — `paths[prefix] + name.substring(…)` — so `[tex]/noerrors`
 * becomes `libraries/mathjax/4/input/tex/extensions/noerrors.js` from this
 * value, and `libraries/mathjax/4//input/…` from one with a slash on the end.
 */
const LIBRARY_PATH = 'libraries/mathjax/4';

/**
 * The rollback lever.
 *
 * Courses migrated by `migrations/v1.js` store no `_src` or `_inlineConfig`, so
 * they follow this constant and `DEFAULT_CONFIG` below. Reverting the estate to
 * an earlier library is a change here — and, if the major version changes, to
 * `DEFAULT_CONFIG` — plus a redeploy. Never a per-course data edit.
 *
 * Neither constant is mirrored as a schema `default`, deliberately. Their
 * absence from a course is the signal that selects them, so a schema default
 * would be self-defeating: it writes today's library plumbing into every course
 * the authoring tool creates and freezes it there, leaving those courses
 * pointing at a path the next upgrade removes. It would also put settings in
 * front of authors whose only purpose is switching off parts of MathJax this
 * plugin does not vendor, which is not a question an author can answer.
 *
 * A course that stores its own values made a deliberate choice and is honoured
 * instead; see `resolveLibrary` below.
 */
export const DEFAULT_SRC = `${LIBRARY_PATH}/tex-mml-chtml.js`;

/**
 * `noerrors` degrades a failed expression to its original TeX; `noundefined`
 * renders an unknown macro as its own name. Both are softeners rather than
 * guarantees — structural errors (an unclosed brace, a missing argument) still
 * reach the page as a message. See `.bench/FINDINGS.md`.
 *
 * `loader.paths` and `chtml.fontURL` are what make the vendored copy work
 * offline, and both are mandatory rather than tidiness. MathJax resolves lazy
 * `loader.load` requests and its webfonts relative to the *bundle's own* URL,
 * which does not match the collated layout above — left unset, the extensions
 * and fonts 404 and the failure is **silent**: equations still typeset, in a
 * fallback font, with no console error. See Phase 6 in `.bench/PLAN.md`.
 *
 * `fontURL` alone is not enough, and getting this wrong is the trap. The stock
 * `tex-mml-chtml.js` bundle defaults to MathJax 4's **newcm** font and asks for
 * `mjx-ncm-*.woff2`; the vendored font package supplies `mjx-tex-*.woff2`, so a
 * correct `fontURL` still 404s every face — silently, in a fallback font. The
 * bundle here is therefore `tex-mml-chtml-mathjax-tex.js` from
 * `@mathjax/mathjax-tex-font`, which has the TeX font baked in and asks only
 * for files we ship. Swapping it back for the stock bundle reintroduces the
 * bug. `test/e2e/offline.cy.js` asserts every `@font-face` resolves locally.
 *
 * The four `options` flags are **load-bearing, not preferences.** All four
 * default to `true` in MathJax 4, so each one switches off something the
 * library turns on by itself, and every one of them reaches code this plugin
 * does not vendor:
 *
 * - `enableMenu` lazily loads `[mathjax]/ui/menu`.
 * - `enableSpeech` / `enableBraille` / `enableEnrichment` start a speech
 *   webworker and pull in the speech-rule engine from `[mathjax]/sre` (~4.6MB,
 *   deliberately not vendored — accessibility is deferred to #5).
 *
 * Left on, `attachSpeech` saves one never-settling promise per expression into
 * `MathDocument._actionPromises`; `renderPromise` awaits `Promise.all` of them,
 * so the typeset never resolves even though the equations are visibly on screen.
 * The `wait` taken for that content object is then never released and the
 * loading screen stays up forever — with no console error, because nothing
 * rejected. Observed on the second visit to a page, where our typeset is no
 * longer the first render. Diagnosed in Phase 6; see `libraries/README.md`.
 *
 * Turning speech back on requires vendoring `sre/` and its mathmaps, and is part
 * of #5 rather than a config change.
 */
export const DEFAULT_CONFIG = {
  loader: {
    load: ['[tex]/noerrors', '[tex]/noundefined'],
    paths: { mathjax: LIBRARY_PATH }
  },
  tex: {
    packages: { '[+]': ['noerrors', 'noundefined'] },
    inlineMath: [['\\(', '\\)']],
    displayMath: [['\\[', '\\]'], ['$$', '$$']]
  },
  chtml: { fontURL: `${LIBRARY_PATH}/chtml/woff2` },
  options: {
    enableMenu: false,
    enableSpeech: false,
    enableBraille: false,
    enableEnrichment: false,
    // The flags above are not sufficient on their own: MenuHandler recomputes
    // `enableSpeech`/`enableBraille` from its own saved settings after the
    // document is built (`options.enableSpeech = settings.speech && enrich`),
    // putting them back to `true`. Removing the render action is what actually
    // stops `attachSpeech` running — an empty array disables an action.
    renderActions: { attachSpeech: [] }
  },
  startup: { typeset: false }
};

const DEFAULT_LOAD_TIMEOUT = 10000;

/**
 * Injects a script tag and resolves once it has loaded.
 *
 * @param {string} src
 * @returns {Promise}
 */
function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.async = true;
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`adapt-mathJax: failed to load ${src}`));
    document.head.appendChild(script);
  });
}

/**
 * Chooses an adapter by feature detection *after* the library has loaded, so
 * the version is a fact rather than an inference from a URL. `_inlineConfig` is
 * opaque and is never parsed.
 *
 * Detection uses `startup` rather than `typesetPromise`: v4 does not define
 * `typesetPromise` until `startup.promise` has resolved, so at this point the
 * object holds only `{_, config, loader, options, startup, version}`. Testing
 * for the typeset call here would miss v4 entirely and throw. Verified against
 * the real 4.1.3 bundle — see `.bench/adapter-real-check.mjs`.
 *
 * @returns {MathJax2Adapter|MathJax3Adapter}
 */
function selectAdapter() {
  const MathJax = window.MathJax;
  if (MathJax?.startup) return new MathJax3Adapter();
  if (MathJax?.Hub) return new MathJax2Adapter();
  throw new Error('adapt-mathJax: no recognised MathJax API after load');
}

/**
 * Reports an expression MathJax could not parse, so failures surface in QA and
 * bug reports rather than only being noticed on screen.
 *
 * The plugin never rewrites content — malformed TeX is reported so it can be
 * fixed at source, not silently normalised at render time. Searching the course
 * JSON for the reported expression locates the component it came from; MathJax
 * does not give the input jax a route back to the containing element.
 *
 * Falls through to MathJax's own handling, so `noerrors`/`noundefined` still
 * apply.
 *
 * @param {object} jax The TeX input jax.
 * @param {Error} error
 * @returns {object} The node MathJax renders in place of the expression.
 */
function onFormatError(jax, error) {
  logging.warn(`adapt-mathJax: could not parse "${jax.latex ?? ''}" — ${error.message}`);
  return jax.formatError(error);
}

/**
 * Resolves the stored `_src`/`_inlineConfig` pair, treating empty as absent.
 *
 * Neither field carries a schema default, so the authoring tool presents an
 * empty text box and an empty code editor. An author who opens the MathJax
 * config and saves it untouched therefore stores `''` and `{}` — and taken
 * literally those would inject a script with no `src`, and hand the vendored v4
 * bundle an empty config. An empty config is not "no config": it is MathJax 4's
 * own defaults, speech pipeline and all, which is a course that never leaves
 * the loading screen. Both fall back to the plugin's own pair instead.
 *
 * @param {object} [config] The course's `_mathJax` config, if any.
 * @returns {{src: string, inlineConfig: object, isStoredConfig: boolean}}
 */
function resolveLibrary(config) {
  const storedConfig = config?._inlineConfig;
  const storedSrc = config?._src || null;
  // Type-checked as well as counted: `Object.keys('abc').length` is 3, so a
  // config that reached the model as an unparsed string would otherwise be
  // taken for a populated object and assigned to `window.MathJax` as a string.
  const isStoredConfig = Boolean(storedConfig) && typeof storedConfig === 'object' && Boolean(Object.keys(storedConfig).length);

  // Reported, not overridden, in both directions. Either half of the pair is a
  // deliberate act and discarding it silently would be worse than honouring it
  // — but each half alone pairs an author's intent with the plugin's, which is
  // a configuration written for one MathJax version applied to another, and
  // that fails without ever reaching the console.
  if (isStoredConfig && !storedSrc) {
    logging.warn('adapt-mathJax: config.json stores an _inlineConfig with no _src, so the library supplied by this plugin will be loaded under a configuration written for a different version. Set both fields or neither.');
  }
  if (storedSrc && !isStoredConfig) {
    logging.warn('adapt-mathJax: config.json stores an _src with no _inlineConfig, so a library this plugin does not supply will be loaded under this plugin\'s own configuration — including loader paths and a font URL that point into its vendored copy. Set both fields or neither.');
  }

  return {
    src: storedSrc ?? DEFAULT_SRC,
    inlineConfig: isStoredConfig ? storedConfig : DEFAULT_CONFIG,
    isStoredConfig
  };
}

export default class MathJaxLoader {

  /**
   * Sets `window.MathJax` and injects the library. Config and library always
   * travel as a matched pair: a course either supplies both or neither, so no
   * version branch is needed before load.
   *
   * @param {object} [config] The course's `_mathJax` config, if any.
   * @returns {Promise<MathJax2Adapter|MathJax3Adapter>}
   */
  static async load(config) {
    const { src, inlineConfig, isStoredConfig } = resolveLibrary(config);
    const loadTimeout = config?._loadTimeout ?? DEFAULT_LOAD_TIMEOUT;

    // Cloned, never assigned by reference. MathJax writes its entire API onto
    // the object it is handed — `startup`, `loader`, `typesetPromise`,
    // `version`, and back references among them — so assigning the stored
    // object directly would leave `Adapt.config.get('_mathJax')._inlineConfig`
    // holding a circular graph, and the next plugin to serialise config would
    // throw on it. It would also mutate this module's own `DEFAULT_CONFIG`.
    // A JSON round trip is both sufficient and total here: every source is
    // plain JSON, either parsed from `config.json` or declared above.
    window.MathJax = JSON.parse(JSON.stringify(inlineConfig));

    // Only attach the reporting hook to the config the plugin owns. A stored
    // config is honoured as authored; a hook cannot be expressed in JSON, so a
    // course wanting its own has to attach it from its own plugin.
    if (!isStoredConfig) window.MathJax.tex.formatError = onFormatError;

    await loadScript(src);

    const adapter = selectAdapter();

    // Cleared on every path. Left armed, the timer outlives the race it guarded
    // and holds the page alive for the rest of the timeout for nothing.
    let handle;
    try {
      await Promise.race([
        adapter.ready,
        new Promise((resolve, reject) => {
          handle = setTimeout(() => reject(new Error(`adapt-mathJax: MathJax did not become ready within ${loadTimeout}ms`)), loadTimeout);
        })
      ]);
    } finally {
      clearTimeout(handle);
    }

    return adapter;
  }

}
