import Adapt from 'core/js/adapt';
import data from 'core/js/data';
import logging from 'core/js/logging';
import wait from 'core/js/wait';
import MathJaxLoader from './MathJaxLoader';

/**
 * Matches the TeX delimiters MathJax is configured to recognise.
 *
 * Tested against JSON-serialised course data, where an authored `\(` appears as
 * the two characters `\\` followed by `(` — hence the doubled escapes.
 */
const MATH_DELIMITERS = /\\\\\(|\\\\\[|\$\$/;

/** Coalescing window for ungated typeset requests. */
const FLUSH_DELAY = 50;

/**
 * Ceiling on a single typeset pass. Generous — this is a stuck-course guard,
 * not a performance budget; a slow but working typeset must never trip it.
 */
const TYPESET_TIMEOUT = 15000;

class MathJax extends Backbone.Controller {

  initialize() {
    this._adapter = null;
    this._loading = null;
    this._pending = new Set();
    this._flushHandle = null;
    this.listenToOnce(Adapt, 'app:dataReady', this.onDataReady);
  }

  get config() {
    return Adapt.config.get('_mathJax');
  }

  /**
   * The plugin is installed in every course but used in few, so decide whether
   * to load the library at all.
   *
   * The scan runs over the loaded course JSON rather than the DOM, which is
   * what makes it safe: all content is present and nothing has rendered yet.
   * `_isEnabled: true` forces a load, covering content injected at runtime by
   * another plugin, which no static scan can see.
   *
   * @returns {boolean}
   */
  get shouldLoad() {
    const config = this.config;
    if (config?._isEnabled === false) return false;
    if (config?._isEnabled === true) return true;
    return MATH_DELIMITERS.test(JSON.stringify(data.toJSON()));
  }

  onDataReady() {
    if (!this.shouldLoad) return;

    // Deliberately not awaited and not wrapped in `wait` here: `app:dataReady`
    // is itself followed by `await wait.queue()`, so holding the wait at this
    // point would block app start on a CDN round trip. Each content object
    // gates on the same promise at `preReady` instead, where the loading
    // screen is already up.
    this._loading = MathJaxLoader.load(this.config)
      .then(adapter => (this._adapter = adapter))
      .catch(error => {
        logging.error(error);
        this._adapter = null;
      });

    this.listenTo(Adapt, {
      'pageView:preReady menuView:preReady': this.onContentObjectPreReady,
      'blockView:postRender componentView:postRender': this.onViewPostRender,
      'popup:opened': this.onPopupOpened,
      'drawer:openedCustomView': this.onDrawerOpened,
      'tutor:opened': this.onTutorOpened
    });
  }

  /**
   * Holds the loading screen until the content object has been typeset, so
   * learners never see raw LaTeX resolve into equations.
   *
   * `contentObjectView.isReady` fires `preReady` and then awaits
   * `wait.queue()`, so a synchronous `wait.begin()` here is honoured. The wait
   * is released in every path, including failure — a dead CDN must degrade to
   * un-typeset maths, never a stuck overlay.
   *
   * @param {ContentObjectView} view
   */
  async onContentObjectPreReady(view) {
    wait.begin();
    try {
      await this.typeset([view.el]);
    } catch (error) {
      logging.error('adapt-mathJax: typeset failed', error);
    } finally {
      wait.end();
    }
  }

  /**
   * Trickle-revealed blocks and any other dynamically rendered view. Ungated —
   * the loading screen is down by this point.
   *
   * `postRender` rather than `view:childAdded`: `adaptView.addChildView` fires
   * `childAdded` from inside `addChildren`'s loop, so the debounce could elapse
   * while Adapt was still appending siblings. MathJax then walked a subtree
   * that was being mutated underneath it and threw from inside its own render
   * promise — out of band, where no `catch` here can reach it. `postRender`
   * fires once the view and its children are in place.
   *
   * @param {AdaptView} view
   */
  onViewPostRender(view) {
    this.queueTypeset(view.el);
  }

  /**
   * `popup:opened` also covers notify, whose view calls `a11y.popupOpened()`
   * with a better-scoped element than a `notify:opened` handler would receive.
   *
   * Listening is safe: the deprecation in `core/js/a11y/popup.js` fires only
   * when `ignoreInternalTrigger` is falsy, and core passes `true`. It
   * deprecates *triggering* the event, not observing it.
   *
   * @param {jQuery} $element
   */
  onPopupOpened($element) {
    this.queueTypeset($element?.[0]);
  }

  onDrawerOpened() {
    this.queueTypeset($('.js-drawer-holder')[0]);
  }

  /**
   * Inline tutor feedback. The first argument is the *parent* view, not the
   * tutor view. The notify variant's feedback is not inside the parent's
   * element, but `popup:opened` already covers that case.
   *
   * @param {AdaptView} parentView
   */
  onTutorOpened(parentView) {
    this.queueTypeset(parentView?.el);
  }

  /**
   * Collects elements into a set and flushes them as one scoped pass, rather
   * than re-typesetting the whole document per event. Several blocks revealed
   * in the same tick cost one typeset.
   *
   * @param {HTMLElement} [element]
   */
  queueTypeset(element) {
    if (!element) return;
    this._pending.add(element);
    if (this._flushHandle) return;
    this._flushHandle = setTimeout(() => {
      this._flushHandle = null;
      const elements = [...this._pending];
      this._pending.clear();
      this.typeset(elements).catch(error => logging.error('adapt-mathJax: typeset failed', error));
    }, FLUSH_DELAY);
  }

  /**
   * Typesets the given elements, discarding any that have since been removed
   * from the document — a trickle block can be revealed and destroyed inside
   * one flush window.
   *
   * Awaits the library first, so a popup opened before MathJax has loaded
   * typesets once it arrives instead of throwing. This was the cause of the
   * unguarded `window.MathJax.Hub` TypeError in 0.2.2.
   *
   * @param {Array<HTMLElement>} elements
   * @returns {Promise}
   */
  async typeset(elements) {
    await this._loading;
    if (!this._adapter) return;
    const attached = elements.filter(element => element?.isConnected);
    // Drop any element contained by another in the same pass. A block and the
    // components inside it both fire `postRender`, so a flush routinely holds
    // both; MathJax then typesets the parent, rewriting its text nodes, and
    // reaches the child holding an offset into a node that no longer matches —
    // `IndexSizeError: Failed to execute 'splitText'`. Typesetting the
    // outermost element alone covers every descendant anyway.
    const outermost = attached.filter(element =>
      !attached.some(other => other !== element && other.contains(element))
    );
    if (!outermost.length) return;

    // Bounded, because a typeset that never settles would otherwise hold the
    // loading screen forever. MathJax serialises every typeset through one
    // internal promise chain (`MathDocument.whenReady`) and waits indefinitely
    // on a lazily-loaded file that never arrives — offline, a missing component
    // hangs with no error rather than rejecting. That is a stuck course, so it
    // is treated as a failure: the caller logs, releases the `wait`, and the
    // page continues with that pass un-typeset.
    await Promise.race([
      this._adapter.typeset(outermost),
      new Promise((resolve, reject) => setTimeout(
        () => reject(new Error(`adapt-mathJax: typeset did not complete within ${TYPESET_TIMEOUT}ms`)),
        TYPESET_TIMEOUT
      ))
    ]);

    // Typesetting changes element dimensions, so dependent components need to
    // recalculate. Isolated from the typeset above: this dispatches synchronously
    // into every listener in the course, and a component that throws while
    // handling it would otherwise surface as 'adapt-mathJax: typeset failed',
    // sending whoever reads the log to the wrong plugin. The typeset itself has
    // already succeeded by this point.
    try {
      Adapt.trigger('device:resize');
    } catch (error) {
      logging.warn('adapt-mathJax: a device:resize listener threw after typesetting', error);
    }
  }

}

export default new MathJax();
