import logging from 'core/js/logging';

/**
 * Adapter for MathJax 2.x, which typesets through the synchronous `Hub.Queue`
 * API rather than returning promises.
 *
 * Only reached when a course stores a non-stock `_src` pointing at a v2 build.
 * Courses whose config was byte-identical to the 0.2.2 stock defaults had those
 * values removed by `migrations/v1.js` and use the plugin's v4 default instead.
 */
export default class MathJax2Adapter {

  constructor() {
    logging.warn('adapt-mathJax: this course is configured to load MathJax 2, which reached end of life. Remove `_src` and `_inlineConfig` from config.json to use the version supplied by the plugin.');
  }

  get version() {
    return 2;
  }

  /**
   * `Hub.Queue` does not process its queue until MathJax startup has completed,
   * so queueing a resolver is itself the readiness signal — no separate
   * startup hook is needed.
   *
   * @returns {Promise}
   */
  get ready() {
    return new Promise(resolve => window.MathJax.Hub.Queue(resolve));
  }

  /**
   * @param {Array<HTMLElement>} elements
   * @returns {Promise}
   */
  typeset(elements) {
    return new Promise(resolve => {
      const Hub = window.MathJax.Hub;
      elements.forEach(element => Hub.Queue(['Typeset', Hub, element]));
      Hub.Queue(resolve);
    });
  }

}
