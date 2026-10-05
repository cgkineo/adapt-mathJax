import { describe, whereFromPlugin, whereContent, mutateContent, checkContent, updatePlugin, getConfig, testStopWhere, testSuccessWhere } from 'adapt-migrations';
import _ from 'lodash';

/**
 * The 0.2.2 stock defaults, verbatim from that version's `example.json`.
 *
 * Note the protocol-relative `//` prefix — it is NOT `https://`. Copying the v4
 * default's `https://` in here would match no course at all, silently migrating
 * nothing while every test still passed.
 */
const STOCK_SRC = '//cdnjs.cloudflare.com/ajax/libs/mathjax/2.7.2/MathJax.js';
const STOCK_INLINE_CONFIG = { extensions: ['tex2jax.js'], jax: ['input/TeX', 'output/HTML-CSS'] };

/**
 * FINDINGS.md specifies a "byte-identical" comparison against stock. The runner
 * hands over parsed objects rather than file text, so a literal byte comparison
 * is not available; this is implemented as structural equality via `_.isEqual`,
 * which is what "byte-identical" means once the JSON has been parsed. It is
 * key-order-insensitive (irrelevant to JSON semantics), correctly array-order-
 * sensitive, and type-strict. Approved by the PO.
 *
 * `_.has`/`=== undefined` throughout rather than truthiness: `{}` is truthy but
 * `''` is not, and an empty `_inlineConfig: {}` must classify as non-stock.
 *
 * @param {object} mathJaxConfig
 * @returns {boolean}
 */
function isStockPair(mathJaxConfig) {
  if (!_.has(mathJaxConfig, '_src') || !_.has(mathJaxConfig, '_inlineConfig')) return false;
  return mathJaxConfig._src === STOCK_SRC && _.isEqual(mathJaxConfig._inlineConfig, STOCK_INLINE_CONFIG);
}

/**
 * The stock constants, pinned against a real 0.2.2 course.
 *
 * No behavioural fixture can catch a wrong `STOCK_SRC`: if the constant stops
 * matching, `isStockPair` simply returns false, the migration correctly leaves
 * that course alone, and `checkContent`'s non-stock branch passes. "Removed as
 * stock" and "preserved as custom" are both internally consistent outcomes, so
 * the suite stays green while the migration silently becomes a no-op across the
 * whole estate.
 *
 * This asserts the constants themselves against the values a real NPL course
 * stores — in particular the protocol-relative `//` prefix, which is what an
 * author or the AAT actually wrote. Mutation-tested: flipping it to `https://`
 * fails here and nowhere else.
 */
(function assertStockConstantsMatchRealCourse() {
  const realStoredConfig = {
    _inlineConfig: { extensions: ['tex2jax.js'], jax: ['input/TeX', 'output/HTML-CSS'] },
    _src: '//cdnjs.cloudflare.com/ajax/libs/mathjax/2.7.2/MathJax.js'
  };
  if (!isStockPair(realStoredConfig)) throw new Error('adapt-mathJax - STOCK_SRC/STOCK_INLINE_CONFIG no longer match a real 0.2.2 course; the migration would silently do nothing');
})();

describe('adapt-mathJax - v0.2.2 to v1.0.0', async () => {
  let mathJaxConfig, wasStockPair, srcBefore, inlineConfigBefore, isEnabledBefore, forceLoadBefore;

  whereFromPlugin('adapt-mathJax - from <v1.0.0', { name: 'adapt-mathJax', version: '<1.0.0' });

  whereContent('adapt-mathJax - where _mathJax is configured', async () => {
    mathJaxConfig = getConfig()?._mathJax;
    if (!mathJaxConfig) return false;
    wasStockPair = isStockPair(mathJaxConfig);
    srcBefore = mathJaxConfig._src;
    // Deep-cloned: without this, `_.unset` below mutates the very object the
    // check later compares against and assertion 2 passes vacuously.
    inlineConfigBefore = _.cloneDeep(mathJaxConfig._inlineConfig);
    isEnabledBefore = mathJaxConfig._isEnabled;
    forceLoadBefore = mathJaxConfig._forceLoad;
    return true;
  });

  /**
   * Remove the stored `_src`/`_inlineConfig` pair only where both are stock, so
   * the course inherits the plugin's v4 defaults and no longer pins a library
   * version. Where either differs, someone made a deliberate choice: both are
   * left exactly as they are and the course keeps running MathJax 2.
   *
   * The two are coupled because a custom v2-shaped `_inlineConfig` left beside
   * a removed `_src` would load v4 with a hand-written v2 config — worse than
   * either alternative.
   */
  mutateContent('adapt-mathJax - remove _mathJax._src where the stock pair is stored', async () => {
    if (wasStockPair) _.unset(mathJaxConfig, '_src');
    return true;
  });

  checkContent('adapt-mathJax - check _mathJax._src removed or preserved exactly', async () => {
    if (wasStockPair) {
      // `!_.has` rather than `=== undefined`, to distinguish removal from a stored `undefined`.
      if (_.has(mathJaxConfig, '_src')) throw new Error('adapt-mathJax - _src not removed where the stock pair was stored');
      return true;
    }
    // Tolerates a field legitimately absent both before and after: a course with
    // only one of the two fields is not a stock pair, and must not be required
    // to have the other.
    if (!_.isEqual(mathJaxConfig._src, srcBefore)) throw new Error('adapt-mathJax - _src modified on a course that did not store the stock pair');
    if (_.has(mathJaxConfig, '_src') !== (srcBefore !== undefined)) throw new Error('adapt-mathJax - _src added or removed on a course that did not store the stock pair');
    return true;
  });

  mutateContent('adapt-mathJax - remove _mathJax._inlineConfig where the stock pair is stored', async () => {
    if (wasStockPair) _.unset(mathJaxConfig, '_inlineConfig');
    return true;
  });

  checkContent('adapt-mathJax - check _mathJax._inlineConfig removed or preserved exactly', async () => {
    if (wasStockPair) {
      if (_.has(mathJaxConfig, '_inlineConfig')) throw new Error('adapt-mathJax - _inlineConfig not removed where the stock pair was stored');
      return true;
    }
    if (!_.isEqual(mathJaxConfig._inlineConfig, inlineConfigBefore)) throw new Error('adapt-mathJax - _inlineConfig modified on a course that did not store the stock pair');
    if (_.has(mathJaxConfig, '_inlineConfig') !== (inlineConfigBefore !== undefined)) throw new Error('adapt-mathJax - _inlineConfig added or removed on a course that did not store the stock pair');
    return true;
  });

  /**
   * `_isEnabled` is deliberately never written — neither backfilled nor removed.
   *
   * 0.2.2 had no such field, so in practice no course reaching this migration
   * stores one; the check is a guard against a later edit quietly adding a
   * backfill, not a case seen in the estate.
   *
   * Backfilling it would be wrong in both directions. `shouldLoad` reads an
   * absent `_isEnabled` as enabled and then scans the course content for maths
   * on every load, so writing `true` caches what the runtime computes for free,
   * and writing `false` freezes a verdict taken against today's content — a
   * course later given an equation would keep the stored `false` and silently
   * stop rendering maths.
   *
   * Leaving it absent also keeps the estate honest about what we cannot verify.
   * The detector was only ever validated against one NPL lesson, so stamping a
   * value into ~639 unseen courses would assert confidence we do not have.
   * Absent, a missed notation is recoverable on the next load; stored, it is
   * permanent and needs a hand edit to fix.
   *
   * `_forceLoad` — the flag that skips the scan outright — is new in 1.0.0 and
   * is likewise never written. Absent, it is falsy, which is the scan, which is
   * the behaviour every migrated course should get.
   *
   * A course that already stores either value made a choice, and it is honoured
   * exactly as-is.
   */
  checkContent('adapt-mathJax - check _mathJax._isEnabled and _mathJax._forceLoad are untouched', async () => {
    if (!_.isEqual(mathJaxConfig._isEnabled, isEnabledBefore)) throw new Error('adapt-mathJax - _isEnabled must never be modified by this migration');
    if (_.has(mathJaxConfig, '_isEnabled') !== (isEnabledBefore !== undefined)) throw new Error('adapt-mathJax - _isEnabled must never be added or removed by this migration');
    if (!_.isEqual(mathJaxConfig._forceLoad, forceLoadBefore)) throw new Error('adapt-mathJax - _forceLoad must never be modified by this migration');
    if (_.has(mathJaxConfig, '_forceLoad') !== (forceLoadBefore !== undefined)) throw new Error('adapt-mathJax - _forceLoad must never be added or removed by this migration');
    return true;
  });

  checkContent('adapt-mathJax - check _mathJax is not created on a course that lacked it', async content => {
    const untouchedItem = content.find(item => !item._mathJax);
    if (untouchedItem?._mathJax) throw new Error('adapt-mathJax - _mathJax should not be created on an item that did not already have it');
    return true;
  });

  updatePlugin('adapt-mathJax - update to v1.0.0', { name: 'adapt-mathJax', version: '1.0.0', framework: '>=5.46.4' });

  // Every fixture's content array must lead with the config object: `getConfig`
  // in adapt-migrations dereferences `__path__` unguarded, and `TaskTest` never
  // injects it, so any item reached before the config match throws.

  testSuccessWhere('stock pair with no _isEnabled stored - both removed, _isEnabled stays absent', {
    fromPlugins: [{ name: 'adapt-mathJax', version: '0.2.2' }],
    content: [
      { _type: 'config', _mathJax: { _src: '//cdnjs.cloudflare.com/ajax/libs/mathjax/2.7.2/MathJax.js', _inlineConfig: { extensions: ['tex2jax.js'], jax: ['input/TeX', 'output/HTML-CSS'] } } },
      { _type: 'course' },
      { _id: 'c-100', _component: 'text', body: 'Activity is \\(A = \\lambda N\\) becquerels.' }
    ]
  });

  testSuccessWhere('stock pair in a course with no maths at all - still removed, _isEnabled stays absent', {
    fromPlugins: [{ name: 'adapt-mathJax', version: '0.2.2' }],
    content: [
      { _type: 'config', _mathJax: { _src: '//cdnjs.cloudflare.com/ajax/libs/mathjax/2.7.2/MathJax.js', _inlineConfig: { extensions: ['tex2jax.js'], jax: ['input/TeX', 'output/HTML-CSS'] } } },
      { _type: 'course' },
      { _id: 'c-100', _component: 'text', body: 'No maths here. Costs (in GBP) are listed [above].' }
    ]
  });

  testSuccessWhere('custom _src and custom _inlineConfig - neither touched', {
    fromPlugins: [{ name: 'adapt-mathJax', version: '0.2.2' }],
    content: [
      { _type: 'config', _mathJax: { _src: '//cdnjs.cloudflare.com/ajax/libs/mathjax/2.7.9/MathJax.js', _inlineConfig: { extensions: ['tex2jax.js', 'mhchem.js'], jax: ['input/TeX', 'output/SVG'] } } },
      { _type: 'course' },
      { _id: 'c-100', _component: 'text', body: 'Decay is \\(N_t = N_0e^{-\\lambda t}\\).' }
    ]
  });

  testSuccessWhere('custom _src with stock _inlineConfig - neither touched', {
    fromPlugins: [{ name: 'adapt-mathJax', version: '0.2.2' }],
    content: [
      { _type: 'config', _mathJax: { _src: 'libraries/mathjax/MathJax.js', _inlineConfig: { extensions: ['tex2jax.js'], jax: ['input/TeX', 'output/HTML-CSS'] } } },
      { _type: 'course' },
      { _id: 'c-100', _component: 'text', body: 'Decay constant \\(\\lambda\\).' }
    ]
  });

  testSuccessWhere('stock _src with custom _inlineConfig - neither touched', {
    fromPlugins: [{ name: 'adapt-mathJax', version: '0.2.2' }],
    content: [
      { _type: 'config', _mathJax: { _src: '//cdnjs.cloudflare.com/ajax/libs/mathjax/2.7.2/MathJax.js', _inlineConfig: { extensions: ['tex2jax.js'], jax: ['input/TeX', 'output/HTML-CSS'], TeX: { Macros: { RR: '{\\bf R}' } } } } },
      { _type: 'course' },
      { _id: 'c-100', _component: 'text', body: 'Uses \\(\\RR\\) throughout.' }
    ]
  });

  testSuccessWhere('stock _src only, no _inlineConfig stored - not a stock pair, untouched', {
    fromPlugins: [{ name: 'adapt-mathJax', version: '0.2.2' }],
    content: [
      { _type: 'config', _mathJax: { _src: '//cdnjs.cloudflare.com/ajax/libs/mathjax/2.7.2/MathJax.js' } },
      { _type: 'course' },
      { _id: 'c-100', _component: 'text', body: 'Decay constant \\(\\lambda\\).' }
    ]
  });

  testSuccessWhere('empty _inlineConfig is non-stock - neither touched', {
    fromPlugins: [{ name: 'adapt-mathJax', version: '0.2.2' }],
    content: [
      { _type: 'config', _mathJax: { _src: '//cdnjs.cloudflare.com/ajax/libs/mathjax/2.7.2/MathJax.js', _inlineConfig: {} } },
      { _type: 'course' },
      { _id: 'c-100', _component: 'text', body: 'Decay constant \\(\\lambda\\).' }
    ]
  });

  testSuccessWhere('_isEnabled false is preserved while the stock pair is removed', {
    fromPlugins: [{ name: 'adapt-mathJax', version: '0.2.2' }],
    content: [
      { _type: 'config', _mathJax: { _isEnabled: false, _src: '//cdnjs.cloudflare.com/ajax/libs/mathjax/2.7.2/MathJax.js', _inlineConfig: { extensions: ['tex2jax.js'], jax: ['input/TeX', 'output/HTML-CSS'] } } },
      { _type: 'course' },
      { _id: 'c-100', _component: 'text', body: 'Decay is \\(N_t = N_0e^{-\\lambda t}\\).' }
    ]
  });

  testSuccessWhere('_isEnabled true is preserved while the stock pair is removed', {
    fromPlugins: [{ name: 'adapt-mathJax', version: '0.2.2' }],
    content: [
      { _type: 'config', _mathJax: { _isEnabled: true, _src: '//cdnjs.cloudflare.com/ajax/libs/mathjax/2.7.2/MathJax.js', _inlineConfig: { extensions: ['tex2jax.js'], jax: ['input/TeX', 'output/HTML-CSS'] } } },
      { _type: 'course' },
      { _id: 'c-100', _component: 'text', body: 'No maths in this course at all.' }
    ]
  });

  /**
   * The real NPL stored block, verbatim — authored key order (`_inlineConfig`
   * before `_src`) reversed from the schema's, which is what `_.isEqual`'s
   * key-order insensitivity is for.
   */
  testSuccessWhere('real NPL config migrates - both fields removed', {
    fromPlugins: [{ name: 'adapt-mathJax', version: '0.2.2' }],
    content: [
      { _type: 'config', _mathJax: { _inlineConfig: { extensions: ['tex2jax.js'], jax: ['input/TeX', 'output/HTML-CSS'] }, _src: '//cdnjs.cloudflare.com/ajax/libs/mathjax/2.7.2/MathJax.js' } },
      { _type: 'course' },
      { _id: 'c-100', _component: 'text', body: 'uranium-238 \\(T_{1/2}&nbsp;= 4.5 × 10^9\\) years' }
    ]
  });

  testStopWhere('no _mathJax', {
    fromPlugins: [{ name: 'adapt-mathJax', version: '0.2.2' }],
    content: [
      { _type: 'config' },
      { _type: 'course' }
    ]
  });

  testStopWhere('incorrect version', {
    fromPlugins: [{ name: 'adapt-mathJax', version: '1.0.0' }]
  });
});
