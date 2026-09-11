import Adapt from 'core/js/adapt';
import logging from 'core/js/logging';
import MathJax2Adapter from './adapters/MathJax2Adapter';
import MathJax3Adapter from './adapters/MathJax3Adapter';

/**
 * The rollback lever.
 *
 * Courses migrated by `migrations/v1.js` have no stored `_src` or
 * `_inlineConfig`, so they follow these two constants. Reverting the estate to
 * an earlier library is a change to `DEFAULT_SRC` (and, if the major changes,
 * `DEFAULT_CONFIG`) plus a redeploy — never a per-course data edit.
 *
 * A course that stores its own values made a deliberate choice and is honoured
 * instead; see `js/adapt-mathJax.js`.
 */
export const DEFAULT_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/mathjax/4.1.3/tex-mml-chtml.js';

/**
 * `noerrors` degrades a failed expression to its original TeX; `noundefined`
 * renders an unknown macro as its own name. Both are softeners rather than
 * guarantees — structural errors (an unclosed brace, a missing argument) still
 * reach the page as a message. See `.bench/FINDINGS.md`.
 */
export const DEFAULT_CONFIG = {
  loader: { load: ['[tex]/noerrors', '[tex]/noundefined'] },
  tex: {
    packages: { '[+]': ['noerrors', 'noundefined'] },
    inlineMath: [['\\(', '\\)']],
    displayMath: [['\\[', '\\]'], ['$$', '$$']]
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
 * @param {number} milliseconds
 * @returns {Promise} Rejects once the period has elapsed.
 */
function timeout(milliseconds) {
  return new Promise((resolve, reject) => {
    setTimeout(() => reject(new Error(`adapt-mathJax: MathJax did not become ready within ${milliseconds}ms`)), milliseconds);
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
    const src = config?._src ?? DEFAULT_SRC;
    const isDefaultConfig = !config?._inlineConfig;
    const inlineConfig = config?._inlineConfig ?? DEFAULT_CONFIG;

    window.MathJax = inlineConfig;

    // Only attach the reporting hook to the config the plugin owns. A stored
    // config is passed through verbatim, including any hook it sets itself.
    if (isDefaultConfig) {
      window.MathJax.tex.formatError = onFormatError;
    }

    await loadScript(src);

    const adapter = selectAdapter();
    await Promise.race([adapter.ready, timeout(Adapt.config.get('_mathJax')?._loadTimeout ?? DEFAULT_LOAD_TIMEOUT)]);

    return adapter;
  }

}
