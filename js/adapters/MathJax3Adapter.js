/**
 * Adapter for MathJax 3.x and 4.x, which share an identical promise-based API.
 *
 * v4 is the version the plugin supplies by default. v3 is not a migration
 * target, but costs nothing to support because the API is the same.
 */
export default class MathJax3Adapter {

  get version() {
    return (window.MathJax.version ?? '').startsWith('4') ? 4 : 3;
  }

  /**
   * @returns {Promise}
   */
  get ready() {
    return window.MathJax.startup.promise;
  }

  /**
   * `typesetPromise` serialises internally, so concurrent calls queue rather
   * than interleave.
   *
   * `typesetClear()` first, because MathJax keeps a list of every expression it
   * has ever typeset and re-walks all of them on each pass. Adapt destroys and
   * rebuilds the DOM on every page navigation, so that list accumulates nodes
   * which no longer exist, and the next typeset throws
   * `Cannot read properties of null (reading 'removeChild')` — killing every
   * subsequent typeset, including trickle-revealed blocks and popups.
   *
   * Clearing discards only MathJax's internal bookkeeping; already-rendered
   * output stays on screen untouched. Observed against real v4.1.3 in Chrome,
   * where a course had 64 remembered expressions of which 7 were orphaned.
   *
   * @param {Array<HTMLElement>} elements
   * @returns {Promise}
   */
  typeset(elements) {
    window.MathJax.typesetClear();
    return window.MathJax.typesetPromise(elements);
  }

}
