# Modernise `adapt-mathJax`

> **Working copy, kept with the code.** Tracked as
> [cgkineo/adapt-mathJax#9](https://github.com/cgkineo/adapt-mathJax/issues/9).
>
> | | |
> | :--- | :--- |
> | **This file** | The plan. Sections marked ⚠️ were superseded by Phase 0 — read those notes, not the struck-through text. |
> | [`FINDINGS.md`](FINDINGS.md) | **Phase 0 results and the decisions that changed this plan.** Read alongside. |
> | [`SAFARI-TEST-REQUEST.md`](SAFARI-TEST-REQUEST.md) | Self-contained test instructions for a reviewer with a Mac. |
> | [`bench-v2/3/4.html`](bench-v2.html) | The rendering bench. Open standalone, not via `bench.html`. |
> | [`harness/`](harness/) | Content-compatibility harness, its negative control, and the `noerrors` test. |

## Context

`cgkineo/adapt-mathJax` is a 15-commit, 2019-vintage extension (v0.2.2, last commit 2019-02-11) that renders LaTeX maths in Adapt courses. It is 89 lines of AMD that CDN-loads **MathJax 2.7.2** and typesets via the MathJax 2 `Hub.Queue` API.

It matters commercially out of all proportion to its size:

- **NPL (`npl.kineoadapt.com`) depends on it.** Per the 2026-08-27 AAT migrations call it is "their sole reason for sticking with Adapt over the last few years."
- It is the **single named cost exception** in the AAT migration programme — upgraded at Kineo's cost because Kineo wrote it ([PROJECT-TRACKER.md:594](../../../../../PROJECT-TRACKER.md)).
- It **hard-blocks** `legacy-aat-migration-prep-and-execution`. NPL cannot migrate until it is carried forward.
- It is **installed in 639 courses** — an installation count, not a usage count.

Tracked as [cgkineo/adapt-mathJax#9](https://github.com/cgkineo/adapt-mathJax/issues/9). Work happens on the local checkout at `Adapt Product/adapt-framework/src/extensions/adapt-mathJax/`, already on branch `issue/9`.

**Governing constraint, set by the PO: existing client builds must not break.**

---

## The organising insight

**What blocks NPL's migration is the plugin, not MathJax 2.**

| Defect | Cause | Location |
|---|---|---|
| `assets/mathJaxInit.js` calls `require("core/js/adapt")`. Assets are copied verbatim to `build/assets/` and never bundled; core v6 has no RequireJS global. So `mathJax:processMath`/`mathJax:endProcess` never fire. | plugin | `assets/mathJaxInit.js:3` |
| **The loading overlay reappears after every page and never hides.** `onViewReady` fires on `pageView:ready` — *after* `router.hideLoading()` — and calls `$('.loading').show()`. Only `mathJax:endProcess` hides it. | plugin | `js/adapt-mathJax.js:60` |
| `device:resize` never fires after typesetting; layout is not recalculated. | plugin | same root cause |
| **Trickle-revealed blocks show raw LaTeX.** Only `menuView:ready`/`pageView:ready` are handled. | plugin | `js/adapt-mathJax.js:85` |
| `onPopupOpened` reads `window.MathJax.Hub` unguarded → TypeError if a popup opens first. | plugin | `js/adapt-mathJax.js:75` |
| `Adapt.wait`'s getter body is empty, so the feature-detect takes the dead `plugin:beginWait` branch. | plugin | `core/js/adapt.js:282` |

**Every defect is 2019 plugin code meeting a 2026 framework. None is MathJax's fault.** A modernised ESM plugin driving MathJax 2 via `Hub.Queue` works fine.

This makes the whole job separable into two independent steps, and that separation is the plan:

| | **Step 1 — now** | **Step 2 — when the client chooses** |
|---|---|---|
| Plugin | Modernised: ESM, schemas, packaging, event coverage, `wait` integration | unchanged |
| Library | MathJax 2, CDN, exactly as today | MathJax 4, vendored, offline-capable |
| Config | Untouched | Translated |
| Content | Untouched | The malformed ~15% fixed, harness-guided |
| Unblocks NPL | **Yes** | — |
| Risk | Near zero — nothing about rendering changes | Bounded, and scheduled by the client |

### NPL is on framework 4.5.0

The defects above appear **on migration to core v6**, not today. It also imposes a **hard sequencing constraint**: raising the framework bound from `>=1.1.2` to `>=5.46.4` means the modernised plugin cannot be installed on framework 4.5.0. Framework upgrade and plugin upgrade land together.

### Prior art

**[oscarsiles/adapt-mathJax](https://github.com/oscarsiles/adapt-mathJax) v0.5.6** is 19 commits ahead and did the MathJax 3 rewrite (2020–2022). *Not* KingsOnline (still 2.7.5) and not Simon Date, as the 2026-09-02 call assumed. Useful reference for `blockView:postRender` (trickle) and `tutor:opened`. Still AMD / CDN / no schemas, and it "fixed" the loading screen by commenting it out. **Reference, not a drop-in.**

---

## Evidence

**1. Config is stock — confirmed twice.** From a real NPL AAT export (`lesson-2-the-fundamentals-of-reactivity`), `config.json._mathJax` is byte-identical to the 0.2.2 default, `_src` included:

```json
{ "extensions": ["tex2jax.js"], "jax": ["input/TeX", "output/HTML-CSS"] }
```

**2. Content is core TeX only.** 33 inline `\(…\)`, 1 display `\[…\]` in one lesson. Commands: `\lambda` ×8, `\gamma` ×4, `\beta` ×3, `\alpha` ×2, `\frac`, `\ln`, plus sub/superscripts (`T_{1/2}`, `N_t = N_0e^{-\lambda t}`, `\beta^-`, `P_\gamma`, `w_R`, `w_T`). Radioactive decay physics. **No `mhchem`, no `physics`, no AsciiMath, no MathML.** Also 19 `<sup>` tags (`<sup>238</sup>U`) — some notation bypasses MathJax entirely.

**3. 15% of expressions are malformed TeX that MathJax 2 tolerates.** This is why Step 2 must be opt-in:

```
\(A = \lambda&nbsp;N\)                          HTML entity inside math
\(T_{1/2}&nbsp;= 4.5 × 10^9\)                   entity + literal U+00D7, not \times
\(+ \&nbsp;\beta^-\)                            backslash followed by U+00A0
\[<br />\lambda = \frac{\ln2}{T_{1/2}}<br />\]  <br /> tags INSIDE the delimiters
```

**These expressions currently parse *successfully*.** Verified against the MathJax docs: `noerrors` must be explicitly loaded in v3+, and in v2 it shipped only with *combined configuration files*. NPL specifies `extensions`/`jax` manually with no `?config=`, so **they do not have `noerrors` either** — nothing is suppressing errors today, and their courses render. MathJax 2 is genuinely accepting this input.

**The open question is therefore whether v4's rewritten TeX parser rejects input that v2 accepted — which is unknown.** MathJax 3+ has good Unicode handling, so a literal `×` may be fine and U+00A0 is plausibly treated as whitespace. If something *does* fail, v3/v4's default is an inline `<merror>` element carrying the error message. These four patterns are unusual enough to be worth testing; there is no evidence yet that they break.

**A stock config does not imply safe content**, and this is unresolved rather than benign — which is why Step 2 is opt-in and gated on the harness rather than run automatically.

**4. No customised config is *believed* to exist, but this has not been audited** and a full survey is impractical. Treat as a working assumption the tooling verifies per course.

**5. The plugin is installed in every course** whether or not it contains maths.

**6. `_src` is explicitly stored in every course** as `//cdnjs.cloudflare.com/ajax/libs/mathjax/2.7.2/MathJax.js` — the stock default string, entered rather than inherited. Four consequences:

- **The migration logic is unaffected** — "leave `_src` untouched" matches whether the value was typed or defaulted.
- **Step 2 is a bulk data change, not a switch.** The URL lives in every course's `config.json`, so upgrading means editing all of them. Must go through the `adapt-migrations` runner rather than by hand.
- **Every course carries a live runtime dependency on Cloudflare.** An outage, a network policy, or a client CSP takes down every equation in every course simultaneously. For a national physical laboratory, third-party CDN-served executable JS may also fail a security review. This is the strongest argument for eventually vendoring, independent of the version question.
- **The protocol-relative `//` prefix is a latent bug** — it resolves to `file://cdnjs…` when a package is played from disk, so maths silently vanishes there. Pre-existing.

**7. cdnjs availability verified (2026-09-10).** The complete 2.7.2 tree returns 200 — `MathJax.js`, `jax/input/TeX/config.js`, `extensions/tex2jax.js`, and the HTML-CSS webfonts. **2.7.9** (final v2 release) is also present with an identical path structure, making a within-major bump a pure string swap that preserves the config shape and picks up four years of fixes. Worth offering as an opt-in intermediate step — but not automatic, since any library change can shift rendering.

---

## Decisions

> **⚠️ SUPERSEDED IN PART — 2026-09-10, after Phase 0.** Phase 0 found that MathJax 4 accepts
> every NPL expression, including all four malformed patterns, and that v2/v4 render
> equivalently. The two-step shape below was therefore **collapsed into one step: everything
> moves to v4.** The rows marked ~~struck~~ no longer hold. Full rationale and the new
> migration rule are in
> `adapt-framework/src/extensions/adapt-mathJax/.bench/FINDINGS.md`.

| Decision | Choice |
|---|---|
| Delivery shape | ~~Two steps~~ → **One step.** The plugin is modernised *and* moved to v4 together. |
| Default library | ~~MathJax 2, CDN, unchanged~~ → **MathJax 4.1.3, vendored**, supplied by the plugin rather than stored per course. |
| Migration rule | **New.** Remove `_src` + `_inlineConfig` only where **both** are byte-identical to 0.2.2 stock. Anything customised is untouched and stays on v2. |
| Rollback | **New.** One constant in the plugin, one redeploy. Per-course reversion was rejected as unworkable across an 8.9 GB estate. |
| Error handling | **New.** `[tex]/noerrors` + `[tex]/noundefined` loaded by default. Covers undefined macros; does *not* cover structural errors. |
| Versions supported | **2, 3 and 4** from day one. Two adapters (3 and 4 share one). |
| Step 2 target | MathJax 4.1.3 + `@mathjax/mathjax-tex-font`, vendored. |
| Notation coverage | Full library on the Step 2 path — costs little over minimal, since bundle + fonts dominate. |
| Vendoring | **Part of Step 2, not the default.** MathJax 2.7.9 unpacks to 62MB across 3,147 files; vendoring it is impractical. Offline support therefore arrives with the v4 upgrade. |
| Migration | Minimal and universal — cannot alter rendering. |
| Accessibility (#5) | Deferred. Note v4 has built-in speech/braille, which is an argument for taking Step 2 eventually. |

---

## Design

### Version handling

**One loader, two adapters, version confirmed by feature detection after load.**

MathJax 2, 3 and 4 all accept `window.MathJax = {…}` set before the script loads. The mechanism is identical; only the config's *shape* differs. `_inlineConfig` is opaque and passed through verbatim, so the loader never parses it.

```js
// Pre-load — no branch. Config and library always travel as a matched pair.
const config = Adapt.config.get('_mathJax');
window.MathJax = config?._inlineConfig ?? DEFAULT_CONFIG;
window.__loadScript(config?._src ?? DEFAULT_SRC, onScriptLoaded);

// Post-load — the version is now a fact, not an inference.
function selectAdapter() {
  const MJ = window.MathJax;
  if (typeof MJ?.typesetPromise === 'function') return new MathJax3Adapter(); // v3 + v4
  if (MJ?.Hub) return new MathJax2Adapter();
  throw new Error('adapt-mathJax: no recognised MathJax API after load');
}
```

Adapter interface `{ ready: Promise<void>, typeset(els): Promise<void> }`, so the controller never branches:

```js
// MathJax3Adapter — v3 and v4, identical API
get ready() { return window.MathJax.startup.promise; }
typeset(els) { return window.MathJax.typesetPromise(els); }

// MathJax2Adapter — Hub.Queue does not process until startup completes,
// so queueing a resolver IS the readiness signal.
get ready() { return new Promise(r => window.MathJax.Hub.Queue(r)); }
typeset(els) {
  return new Promise(resolve => {
    const Hub = window.MathJax.Hub;
    els.forEach(el => Hub.Queue(['Typeset', Hub, el]));
    Hub.Queue(resolve);
  });
}
```

That `Hub.Queue(resolve)` pattern **removes the entire reason `assets/mathJaxInit.js` exists** — no `AuthorInit`, no `Message.Set` monkey-patch, no `MessageHook`, no unbundled asset calling `require()`. The broken file is deleted, not ported.

A one-time `logging.warn` fires when the v2 adapter is selected, naming the upgrade path. Visible, not blocking.

### Resilience to unknown bad input

The Phase 0 harness covers courses we can inspect. It cannot cover courses we have no access to, or **content authored after migration** — the `&nbsp;`-in-math habit will keep producing more. Relevant only on the Step 2 path.

**The plugin does not modify content.** An earlier draft proposed normalising malformed input before typesetting; that is out of scope and the wrong shape. A rendering plugin silently rewriting authored JSON hides authoring errors, makes what renders diverge from what is stored, and fixes the symptom in the wrong place. **Detect and report; the content gets fixed at source.**

Two measures, both configuration rather than content change:

1. **Degrade to source text rather than an error message.** Optionally load **`[tex]/noerrors`** so a failed expression renders as its original TeX. Note this is a *change from current behaviour*, not a restoration of it — NPL has no `noerrors` today, because it shipped only with v2 combined config files and they configure manually. Offer it; do not assume it.
2. **Make failures observable.** Hook `tex.formatError` → `logging.warn` with the expression and its component `_id`. Unknown unknowns become reported knowns — surfacing in QA, bug reports and authoring review, continuously rather than only at migration. This is the layer that still works for content written next year.

### Lazy loading

The plugin ships in every course but is used in few. At `app:dataReady` all course JSON is loaded, so scan it for `\(`, `\[`, `$$`. **No match → never load MathJax, never call `wait.begin()`.** Any match → load normally. `_isEnabled: true` force-loads, covering content injected at runtime by another plugin. Scanning JSON rather than DOM is what makes this safe — it is complete before rendering.

### Loading screen

[contentObjectView.js:69-72](../../../../../adapt-framework/src/core/js/views/contentObjectView.js) fires `preReady`, then `await wait.queue()`, then `router.hideLoading()`:

```js
import wait from 'core/js/wait';
wait.begin();
try { await this.typeset([view.el]); }
catch (err) { logging.error('adapt-mathJax: typeset failed', err); }
finally { wait.end(); }   // ALWAYS released
```

Fixes the stuck-overlay bug at the cause, rather than by deleting the integration as the fork did.

### Event coverage

| Event | Source | Handling |
|---|---|---|
| `pageView:preReady menuView:preReady` | `contentObjectView.js:70` | Gated typeset (holds loading screen) |
| `view:childAdded` | `adaptView.js:243` (parent, child) | Trickle-revealed and dynamic blocks. Ungated. |
| `popup:opened` | `a11y/popup.js:107` (`$popupElement`) | **Listening is safe** — the deprecation at `popup.js:68-80` only fires when `ignoreInternalTrigger` is falsy, and core's `opened()` passes `true`. It deprecates *triggering*. |
| `drawer:openedCustomView` | `drawerView.js:290` | Drawer content |
| `tutor:opened` | `adapt-contrib-tutor/js/TutorView.js:79` | Args are `(parentView, modelJSON)` — the **parent**, not the tutor view. Inline variant only. |

- **`notify:opened` is redundant** — `notifyPopupView.js:271` calls `a11y.popupOpened(this.$('.notify__popup'))`, so `popup:opened` already fires with a better-scoped element.
- **The fork's `tutor:opened` fix is wrong** — it treats arg 1 as the tutor view. For the notify variant the feedback DOM is not inside `parentView.el`; `popup:opened` covers that.

Elements accumulate into a `Set`, flushed by a ~50ms debounce into one scoped typeset pass — not the whole-document re-typeset the fork does.

### Bounded loader

`Promise.race([libraryReady, timeout(_loadTimeout ?? 10000)])`. On rejection: `logging.error`, release the wait, course continues un-typeset. A dead CDN degrades; it does not hang.

### Config surface

| Setting | Type | Default | Note |
|---|---|---|---|
| `_isEnabled` | boolean | `true` | Force-load override; also allows opting out |
| `_inlineConfig` | object (`CodeEditor`/json) | **unchanged v2 default** | Passed verbatim |
| `_src` | string | **unchanged 2.7.2 URL** | The Step 2 opt-in is changing this |

Not decomposing `_inlineConfig` into typed AAT fields: MathJax's config differs entirely between majors, so a typed schema could only describe one of them. The blob is the only shape that can serve both.

---

## Running this plan across sessions

Each phase is self-contained and can be started in a fresh chat. To pick one up cold:

1. Read this plan file in full — it is the single source of truth for the design.
2. Read the files named in that phase's **Read first** line.
3. Check the phase's **Depends on** line; do not start if its predecessor has not landed.
4. Work to the **Done when** criteria, then stop and report.

**Constraints that apply in every session** (from the workspace `CLAUDE.md`): always show a diff before applying an edit; **never run `grunt`, `npm run` or any build command without explicit authorization**; never commit or SVN-commit without explicit authorization.

| Phase | Model | Why |
|---|---|---|
| 0 — Verify | **Opus 5** | Interpreting rendering differences across three library versions is judgement work, and the conclusion gates everything else. Getting a false "it's fine" here is the most expensive possible error. |
| 1 — Scaffolding | **Sonnet 5** | Mechanical: copy a known house pattern from named reference files. Well-specified, low ambiguity. |
| 2 — Runtime rewrite | **Opus 5** | The hard phase. Async ordering, promise-based readiness, the `wait` gate, event coalescing, adapter selection. Subtle failure modes that tests will not obviously catch. |
| 3 — Schemas | **Sonnet 5** | Translation into a documented shape with a reference file to copy. |
| 4 — Migration | **Sonnet 5** | Pattern-following against `adapt-scrollPrompt/migrations/v1.js` — but escalate to Opus 5 if the `checkContent` no-change assertion proves fiddly, since that assertion *is* the safety guarantee. |
| 5 — Docs & write-backs | **Sonnet 5** | Writing to a specified outline. |
| Step 2 | **Opus 5** | Vendoring, `fontURL` resolution against Grunt's collated layout, and content triage. Fiddly and failure-prone. |

---

## Phases

### Phase 0 — Verify (before code) ✅ COMPLETE (2026-09-10, bar two items)

> **Outcome:** v2 renders correctly (Firefox + Chrome); v4 accepts every NPL expression.
> **This result changed the plan** — see the superseded Decisions above.
> Outstanding: Safari (delegated to the Phase 1 PR) and item 3 (needs build authorization).
> Artifacts: `.bench/FINDINGS.md`, `.bench/bench-v*.html`, `.bench/harness/`.

**Model:** Opus 5 · **Depends on:** nothing · **Read first:** this plan; the NPL export at `C:\Users\Joe.Replin.KINEO-35470\OneDrive - Mind Tools\Desktop\lesson-2-the-fundamentals-of-reactivity-export\src\course\`

**Done when:** the three-version findings table exists and is shared; the v2-in-current-browsers question is answered yes or no; the site records are corrected.

**1. The three-version comparison bench.** *This is the gating task — it answers both open questions at once:* whether MathJax 2.7.2 still renders correctly in a 2026 browser (which the whole two-step approach depends on), and whether v3/v4 accept NPL's unusual expressions.

**Build:** three standalone HTML files — `bench-v2.html`, `bench-v3.html`, `bench-v4.html`. They must be separate files, not one page: all three versions claim `window.MathJax` and cannot coexist. Open them side by side in three windows, or embed as three iframes in a parent page for aligned scrolling.

Each file loads its library from cdnjs and contains the **same corpus, in the same order**:

| Version | `_src` | Config to set on `window.MathJax` |
|---|---|---|
| v2 | `https://cdnjs.cloudflare.com/ajax/libs/mathjax/2.7.2/MathJax.js` | **NPL's exact config**: `{"extensions":["tex2jax.js"],"jax":["input/TeX","output/HTML-CSS"]}` |
| v3 | `https://cdnjs.cloudflare.com/ajax/libs/mathjax/3.2.2/es5/tex-mml-chtml.js` | `{}` — v3 defaults already include `\(…\)` and `\[…\]` |
| v4 | `https://cdnjs.cloudflare.com/ajax/libs/mathjax/4.1.3/tex-mml-chtml.js` | `{}` — note the path has **no `es5/`** in v4 |

**Corpus — the real expressions from the NPL export**, not invented cases. Group them:

*Baseline (should be identical everywhere):* `\(A\)`, `\(\lambda\)`, `\(N\)`, `\(\alpha\)`, `\(\gamma\)`, `\(t\)`, `\(R\)`, `\(T_{1/2}\)`, `\(N_t\)`, `\(N_0\)`, `\(P_\gamma\)`, `\(w_R\)`, `\(w_T\)`, `\(\beta^-\)`, `\(N_t = N_0e^{-\lambda t}\)`, `\(A_t = A_0e^{-\lambda t}\)`, `\(\beta^- \ \gamma\)`, `\(+ \ \alpha\)`

*The four suspect cases — the whole point of the exercise:*
```
\(A = \lambda&nbsp;N\)
\(T_{1/2}&nbsp;= 4.5 × 10^9\)
\(+ \&nbsp;\beta^-\)
\[<br />\lambda = \frac{\ln2}{T_{1/2}}<br />\]
```

**Render each expression twice:** once alone, and once inside its real sentence — e.g. *"For example, uranium-238 (`\(T_{1/2}&nbsp;= 4.5 × 10^9\)` years) decays by alpha…"*. Inline baseline alignment and font-size matching against body text is what an author actually notices, and it cannot be judged from an isolated equation.

**What to record, per expression, per version:**

1. Does it render at all, or produce an `<merror>` / error text?
2. Glyph appearance — font, weight, italic correctness on variables
3. Size relative to surrounding body text
4. **Baseline alignment** within the sentence
5. Horizontal spacing, especially around the `&nbsp;` cases
6. Any console errors or warnings
7. Time to first typeset, and whether unstyled TeX flashes before rendering
8. Whether MathJax 2's `#MathJax_Message` status bar appears

**Also run each file in Chrome, Edge, Firefox and Safari.** The v2 result across those four browsers is the answer to "can Step 1 ship on MathJax 2." If v2 renders correctly in all four, the two-step plan holds. If it has broken anywhere, v4 becomes forced and the content work returns to the critical path.

**Deliverable:** a short findings table — expression × version × verdict — plus screenshots of any difference. That table is what Step 2 gets scheduled against.

**2. Scale it into the content-compatibility harness.** Only once the bench shows what to look for. A Node script that walks every `components.json` in the migration set, extracts each `\(…\)` / `\[…\]`, renders through MathJax 2.7.2 and 4.1.3 headlessly (`mathjax-full` exposes a Node API), and diffs — flagging anything that changes or errors. This is what turns an impossible manual audit into a minutes-long run, and it is the tool that makes Step 2 schedulable. Not needed for Step 1.

**3. Confirm the stuck-overlay bug with a build** on framework 5.56.2. Inferred from code, not observed, and it is the most visible symptom.

**4. Correct the site records.** [npl.md](../../../../../adapt-roadmap/issues/sites/npl.md) lists NPL's plugins as "Quicknav" only, with no mention of MathJax; [unsupported-plugin-client-comms.md](../../../../../adapt-roadmap/issues/unsupported-plugin-client-comms.md) still says the exception "has never been named" despite the 2026-08-27 transcript naming it.

*Deferred to Step 2:* measuring the vendored footprint, and the minimum woff subset.

### Phase 1 — Repo scaffolding

**Model:** Sonnet 5 · **Depends on:** ~~Phase 0 answering yes on v2-in-browsers~~ — **satisfied; Phase 1 is unblocked** · **Read first:** `src/extensions/adapt-scrollPrompt/{package.json,bower.json,.github/**}`, `src/extensions/adapt-contrib-trickle/package.json`, the plugin's current `bower.json`

**Done when:** `package.json` + `bower.json` exist and agree; `.github/` workflows are in place; `.bowerrc` and `assets/` are deleted; `v0.2.2` is tagged on master. No JS has been touched yet.

Copy the house pattern from [adapt-scrollPrompt](../../../../../adapt-framework/src/extensions/adapt-scrollPrompt/).

- **`package.json`** — house fields, `"private": true`, semantic-release devDependencies, `"scripts": {"postversion": "cp package.json bower.json"}`, inline `"release"` block (eslint preset). Add `semantic-release-replace-plugin` for migration version stamping — copy [adapt-contrib-trickle](../../../../../adapt-framework/src/extensions/adapt-contrib-trickle/package.json).
- **`bower.json`** — a copy of `package.json` via `postversion`. `Plugin.js:86-90` reads only `bower.json`, so it stays build-authoritative.
- **`framework`** — `">=5.46.4"`.
- **Versioning** — tag current master `v0.2.2` so semantic-release has a baseline, then publish `1.0.0`.
- **`.github/`** — scrollPrompt's `releases.yml`, `addtomainproject.yml`, `claude.yml`, plus templates.
- **Hygiene** — delete `.bowerrc` (dead registry), delete `assets/`, add `.gitignore`. Keep GPL-3.0 `LICENSE`; scrollPrompt's is empty, do not copy it.

### Phase 2 — Runtime rewrite

**Model:** Opus 5 · **Depends on:** Phase 1 · **Read first:** the **Design** section of this plan (it contains the adapter and loader sketches); the plugin's current `js/adapt-mathJax.js` and `assets/mathJaxInit.js`; `src/core/js/wait.js`; `src/core/js/views/contentObjectView.js` (lines 39–90); `src/core/js/views/adaptView.js` (lines 60–250); `src/core/js/logging.js`; `src/extensions/adapt-scrollPrompt/js/adapt-scrollPrompt.js` for the controller shape

**Done when:** all four JS modules exist in ESM; `assets/` is gone; the plugin builds; the loading overlay, trickle-block, and popup-TypeError defects are fixed; both adapters are selected correctly against real v2 and v4 URLs.

`js/adapt-mathJax.js` (controller), `js/MathJaxLoader.js`, `js/adapters/MathJax2Adapter.js`, `js/adapters/MathJax3Adapter.js`. AMD → ESM. Delete `assets/mathJaxInit.js`.

`less/mathJax.less` — **keep** `#MathJax_Message { display: none; }`, since v2 is the default path. Add `mjx-container` rules for the Step 2 path: font-size inheritance, `overflow-x: auto` on display equations, RTL.

### Phase 3 — Schemas

**Model:** Sonnet 5 · **Depends on:** Phase 2 (the config surface must be settled) · **Read first:** `src/extensions/adapt-visua11y/schema/config.schema.json`, the plugin's current `properties.schema`, `grunt/helpers/plugins/Plugin.js` lines 77–90

**Done when:** `schema/config.schema.json` exists in the 2020-12 `$patch` shape, `properties.schema` is updated to match, and both describe the same three settings.

- **`schema/config.schema.json`** — new. 2020-12 `$patch` shape, `"$anchor": "mathJax-config"`, `"source": {"$ref": "config"}`. Model on [visua11y/schema/config.schema.json](../../../../../adapt-framework/src/extensions/adapt-visua11y/schema/config.schema.json). `$schema` is **draft 2020-12** — #9's "v7" is wrong. `_backupSchemas` and `_unsupported` do not exist in this repo.
- **`properties.schema`** — **retained** and updated. `Plugin.js:77-82` globs `properties.schema` and `schema/*.schema` — not `*.schema.json`. The `schema-defaults` task reads only `properties.schema`.

### Phase 4 — Migration

**Model:** **Opus 5** — the plan's escalation condition is now met by construction; the migration rule changed after Phase 0 · **Depends on:** Phase 3 · **Read first:** `src/extensions/adapt-scrollPrompt/migrations/v1.js`, `src/extensions/adapt-contrib-trickle/migrations/v7.js`, the NPL `config.json` for a real fixture

**Done when:** `migrations/v1.js` exists; its tests pass; and it is demonstrably incapable of altering `_inlineConfig` or `_src`.

One migration, `migrations/v1.js`, `0.2.2 → 1.0.0`. Mirror [adapt-scrollPrompt/migrations/v1.js](../../../../../adapt-framework/src/extensions/adapt-scrollPrompt/migrations/v1.js).

> **⚠️ REWRITTEN after Phase 0.** The original spec below made the migration *incapable* of
> touching `_src`/`_inlineConfig`. That is no longer the design — the migration is now what
> moves courses to v4. The replacement rule is in `.bench/FINDINGS.md`; summary here.

- `whereFromPlugin`: `{ name: 'adapt-mathJax', version: '<1.0.0' }`
- `mutateContent`:
  - add `_isEnabled: true` where absent;
  - **where `_src` AND `_inlineConfig` are BOTH byte-identical to the 0.2.2 stock defaults, REMOVE BOTH** — the course then inherits the plugin's v4 default;
  - **where either differs, change nothing.** A stored value that is not stock is a deliberate choice and is honoured.
- `checkContent`: assert (1) both-stock pairs are now absent; (2) every non-stock value is byte-identical to before; (3) **no value was ever *modified*** — only removed or left alone. Assertion (2) is what protects the 638 untested installs and must be tested against a deliberately-customised fixture, not only the stock one.
- `updatePlugin`: `{ name: 'adapt-mathJax', version: '1.0.0', framework: '>=5.46.4' }`

**Blast radius note.** This migration can now change rendering, which the original design
forbade. That is deliberate and was signed off, but it means Phase 4 carries the project's
main risk — hence Opus 5.

### Phase 5 — Docs

**Model:** Sonnet 5 · **Depends on:** Phases 2–4 (the settings and migration must be final) · **Read first:** `src/extensions/adapt-contrib-trickle/README.md` for format, the plugin's current `README.md`, and issues [#9](https://github.com/cgkineo/adapt-mathJax/issues/9), [#10](https://github.com/cgkineo/adapt-mathJax/issues/10), [#5](https://github.com/cgkineo/adapt-mathJax/issues/5) via `gh issue view`

**Done when:** README rewritten; #9 corrected; #10 reopened; #5 re-scoped; ROADMAP.md synced.

**README** — trickle's fuller format, plus a `## Upgrading to MathJax 4` section documenting the opt-in path: change `_src` and `_inlineConfig`, run the content harness, fix flagged expressions. Include the v2→v4 translation table (`extensions` → implicit; `jax` → bundle choice; `tex2jax` → `tex`; `TeX.Macros` → `tex.macros`; `HTML-CSS` → `chtml`; `messageStyle`/`showProcessingMessages` → removed; `showMathMenu` → `options.enableMenu`). With a11y deferred, `**Accessibility support:**` must state the position honestly.

**Issue write-backs:**
- **#9** — corrections: the fork is **oscarsiles**, not KingsOnline/Simon Date; schema draft is **2020-12**, not v7; **"no data migration" is conditional**. Record the two-step decision and why v4 is opt-in (content, not config).
- **#10** — **reopen.** A migration is now in scope, as its own body predicted.
- **#5** — keep open as the deferred a11y follow-up; note v4's built-in speech is the route, which is an argument for eventually taking Step 2.
- **ROADMAP.md** — both anchors resolve to #9; sync via `/commit-adapt-roadmap`.

### Phase 6 — Vendoring & rollout (was "Step 2", now part of the main body of work)

> **⚠️ NO LONGER OPTIONAL OR CLIENT-SCHEDULED.** Phase 0 collapsed the two-step plan into one,
> so this is a normal phase of the delivery rather than a later opt-in. Its **technical
> content below is unchanged and still correct** — vendoring, `fontURL` against Grunt's
> collated layout, the pilot-first rollout order. What changed is *when* it happens and that
> nobody has to choose to take it.
>
> Two items below are now redundant: the config-translation migration is Phase 4's job, and
> "run the harness against their courses" **cannot be done** — no access to the estate. See
> the accepted risk in `.bench/FINDINGS.md`.

**Model:** Opus 5 · **Depends on:** Step 1 shipped, and the Phase 0 harness run against the client's estate · **Read first:** this plan's **Notation coverage** and **Resilience** sections; `grunt/config/copy.js` lines 183–210; `grunt/config/javascript.js` lines 30–45; `src/components/adapt-contrib-media/libraries/README.md`

**Done when:** MathJax 4 is vendored and renders offline including a lazily-loaded component; the config-translation migration passes; flagged content is fixed; one pilot course is verified before the estate follows.

**Recommended order — the client never sees a red box in production:**

1. Run the content harness against their courses. It needs no upgrade to run.
2. Fix the flagged expressions in source.
3. Only then change `_src` and `_inlineConfig`.

`_mathJax` lives in each course's own `config.json`, so this is **per-course**: they can pilot on a single module and roll forward at their own pace rather than migrating the estate at once.


Vendor MathJax 4.1.3 + `@mathjax/mathjax-tex-font` into `libraries/mathjax/4/…` — **a subfolder is mandatory**, since `grunt/config/copy.js:194-208` collates all `extensions/*/libraries/**/*` into one flat `build/libraries/`. Preserve MathJax's directory structure so lazy `loader.load` resolution works; anything omitted fails **silently** offline. Set `chtml.fontURL` and `loader.font` explicitly — v4 resolves fonts relative to the bundle, which will not match the collated layout. Add `libraries/README.md` per [adapt-contrib-media's model](../../../../../adapt-framework/src/components/adapt-contrib-media/libraries/README.md). Ship a config-translation migration, and fix the content the harness flagged.

---

## Verification

No `grunt`/`npm` commands without explicit authorization.

1. **The no-change test — the important one for Step 1.** Take a real NPL course, install the modernised plugin, run the migration, build, and compare against the same course on 0.2.2. The standard is **identical for content that renders correctly today, improved for content the plugin currently breaks** — not a strict pixel diff, because Step 1 deliberately fixes the stuck overlay, the raw-LaTeX trickle blocks and the popup TypeError. Enumerate the expected improvements up front; anything *else* that differs is a bug.
2. **Regression fixture** seeded from the real export, including all four fragile patterns verbatim: `\(A = \lambda&nbsp;N\)`, `\(T_{1/2}&nbsp;= 4.5 × 10^9\)`, `\(+ \&nbsp;\beta^-\)`, `\[<br />\lambda = \frac{\ln2}{T_{1/2}}<br />\]`.
3. **Fixed defects.** Loading overlay hides correctly (including on SCORM reload); trickle-revealed blocks typeset; a popup opening before MathJax loads does not throw; no deprecation warnings.
4. **Adapter selection.** Point `_src` at a real v2, v3 and v4 build with matching configs; confirm the right adapter is chosen and the v2 deprecation warning fires once.
5. **Lazy loading.** A course with no maths must not fetch MathJax at all and must not call `wait.begin()`.
6. **Failure paths.** `_src` → 404: logs, releases the wait, does not hang. On the v4 path: an unparseable expression emits a `logging.warn` naming the component `_id`, and — if `noerrors` is enabled — renders as source text rather than an `<merror>` message.
7. **Dynamic content.** Trickle-reveal a block with an equation; confirm it typesets on `view:childAdded` without a full-document re-typeset.
8. **Migration suite.** `testSuccessWhere` / `testStopWhere`, plus an assertion that `_inlineConfig` and `_src` are untouched.
9. **AAT.** Install into a real instance and confirm `schema/config.schema.json` renders. Cannot be verified locally.

---

## Risks and unknowns

| Risk | Mitigation |
|---|---|
| **MathJax 2.7.2 may already be broken in current browsers.** Gates the entire two-step approach. | Phase 0 item 1. **Blocking.** Fallback is 2.7.9, then forced v4. |
| **Content-level TeX incompatibility — unverified.** 15% of sampled expressions contain non-TeX input (`&nbsp;`, `\`+U+00A0, literal `×`, `<br />` inside delimiters). MathJax 2 parses them successfully today; whether v4's rewritten parser does is **unknown**, not established. | Removed from the critical path entirely by making v4 opt-in. The harness resolves the question before Step 2 is scheduled — do not treat it as a known failure until it is measured. |
| **Step 2 may never happen**, leaving NPL on an EOL library indefinitely. | Accepted consequence of prioritising safety. Deprecation warning keeps it visible; #5 (a11y) is the standing argument for eventually taking it. |
| **Offline support does not arrive until Step 2**, since vendoring MathJax 2 is impractical (62MB, 3,147 files). | Acceptable unless a client has a hard air-gap requirement today — worth confirming none does. |
| **Single point of failure: every course loads MathJax from cdnjs at runtime.** An outage, network policy or CSP fails every equation in every course at once. May also not survive a security review at a national laboratory. | Pre-existing, not introduced here. The strongest standing argument for Step 2's vendoring, independent of the version upgrade. |
| **Step 2 is an estate-wide data edit**, because `_src` is written into every course's `config.json` rather than inherited. | Route it through the `adapt-migrations` runner, never by hand. Per-course granularity means it can still be piloted on one module first. |
| **Two supported library paths mean permanent dual testing.** | Bounded: both adapters are ~15 lines. The alternative was breaking courses. |
| **"All configs are stock" is assumed, not audited.** | Two independent samples confirm it. The migration touches neither `_inlineConfig` nor `_src`, so a custom config is carried through untouched rather than mangled — this design is safe even if the assumption is wrong. |
| **Framework and plugin upgrades cannot be staged separately** for a client on 4.5.0. | Sequencing constraint, not mitigable. Make explicit in NPL's migration plan. |
| **Visua11y skips MathJax output** in colour substitution — it parses stylesheets once ([adapt-visua11y.js:460](../../../../../adapt-framework/src/extensions/adapt-visua11y/js/adapt-visua11y.js)) while MathJax injects its stylesheet later. Invert/contrast/profile *do* reach it. | Low severity; test in Phase 2, do not block. |
| AAT schema consumption unverifiable locally. | Verification step 9. |
