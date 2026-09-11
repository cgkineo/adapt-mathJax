# Phase 0 findings — `adapt-mathJax` three-version verification

**Run 2026-09-10.** Against the NPL export `lesson-2-the-fundamentals-of-reactivity`
(`src/course/`), which is the only real NPL content available locally.

**The plan this belongs to is [`PLAN.md`](PLAN.md)** in this directory. Several of its
decisions were superseded by the findings below — it is marked up accordingly, but **this
file is authoritative where the two differ.**

Phase 0 of the modernisation plan. Its purpose is to answer two questions before any
code is written:

1. **Does MathJax 2.7.2 still render correctly in a 2026 browser?** **← YES.** Confirmed in
   Firefox and Chrome; Edge skipped as Chromium; only Safari untested.
2. **Do v3/v4 accept NPL's unusual expressions?** **← YES, all of them** — confirmed both
   headlessly and visually.

> **⚠️ The answer to Q2 changed the plan.** Because v4 handles every known expression, the
> plan's two-step shape — modernise on v2 now, upgrade to v4 later as an opt-in — was
> **collapsed into a single step: everything goes to v4.** See
> **[Decision — everything moves to MathJax 4](#decision--everything-moves-to-mathjax-4)**
> below, which supersedes the plan's "Default library: MathJax 2" decision.
>
> Q1's answer is therefore no longer load-bearing for the delivery shape. It still matters:
> it is the evidence that **non-stock courses left on v2 keep working.**

---

## Status

| Item | State |
| :--- | :--- |
| 1. Three-version bench | **Done.** v2 renders correctly in Firefox and Chrome; all four suspect cases pass in all three versions. Edge skipped (Chromium); Safari untested. |
| 2. Content-compatibility harness | **Done, and run.** Detection proven by negative control. |
| 3. Confirm stuck-overlay bug with a build | **Not done** — needs `grunt`, which requires explicit authorization. |
| 4. Correct the site records | **Done.** |

---

## The corpus is confirmed, with three corrections to the plan's own figures

Extracted mechanically from the export rather than by reading:

- **34 expressions — 33 inline, 1 display — across 22 unique forms.** Matches the plan exactly.
- **All four suspect cases are present and are the only ones.** Confirmed by scanning for
  entities, tags and non-ASCII across every expression.
- `config.json._mathJax` is **byte-identical** to the 0.2.2 default, `_src` included.
  Confirms evidence item 1 and item 6 of the plan.

**Corrections.** The plan's command counts are occurrence counts inside compound
expressions, not standalone frequencies. Actual: `\lambda` ×3 (not 8), `\gamma` ×1 (not 4),
`\beta` ×1 (not 3). Nothing downstream depends on these numbers; noted for accuracy.

**Notation coverage confirms the plan's claim.** No `mhchem`, no `physics`, no AsciiMath,
no MathML. `base` + `ams` covers the entire corpus. The heaviest constructs are `\frac`,
`\ln`, and sub/superscripts.

---

## Question 2 — ANSWERED. v3 and v4 accept every NPL expression.

Headless parse of all 22 unique forms through the MathJax **3.2.2** and **4** TeX parsers.

**Result: 22 / 22 parse clean in both. Zero flagged.**

Including all four suspect cases:

| Suspect expression | Why it was suspect | v3 | v4 |
| :--- | :--- | :---: | :---: |
| `\(A = \lambda&nbsp;N\)` | HTML entity inside the delimiters | ok | **ok** |
| `\(T_{1/2}&nbsp;= 4.5 × 10^9\)` | entity + literal U+00D7, not `\times` | ok | **ok** |
| `\(+ \&nbsp;\beta^-\)` | backslash followed by U+00A0 | ok | **ok** |
| `\[<br />\lambda = \frac{\ln2}{T_{1/2}}<br />\]` | `<br />` tags inside the delimiters | ok | **ok** |

**Why this result is trustworthy.** Three deliberate choices:

1. **The harness reproduces the `innerHTML` step.** Authored strings live in JSON and reach
   the DOM as `innerHTML`, so `&nbsp;` is already U+00A0 and `<br />` already an element
   before MathJax sees them. Parsing the raw JSON string would test the wrong input and
   give a falsely clean result.
2. **The package set is modest and matched across both** — `base`, `ams`, `newcommand`,
   `configmacros`, *not* `AllPackages`. NPL loads only `input/TeX` with no extensions; a
   maximal package set would be a more forgiving parser than they actually run.
3. **Detection is proven, not assumed.** `harness/selftest.mjs` plants six errors — undefined
   control sequence, unbalanced brace, missing argument, unloaded `mhchem`, unloaded
   `physics`, unclosed group. **All six are caught.** A harness reporting "all clean" is
   worthless without this control.

**What this does NOT settle.** Parsing is not rendering. Glyph appearance, size relative to
body text, baseline alignment and spacing are only answerable by eye. A clean parse is
necessary, not sufficient — hence the bench.

**Consequence for the plan.** The "content-level TeX incompatibility" risk is **materially
reduced, on this sample**. The plan was right to call it unknown rather than a known failure.
It is not eliminated: one lesson is not the estate, and the harness now exists to run against
the rest.

---

## Question 1 — first result in, and it is positive. Browser sweep still outstanding.

**MathJax 2.7.2 renders correctly on NPL's exact config**, observed 2026-09-10 in the
three-pane bench. Against the 18 baseline forms, v2 output is visually consistent with v3
and v4: variables correctly italic, Greek glyphs correct, inline maths sitting on the body
text baseline at a matching size.

Status bars from that run:

| | time to first typeset | typeset outputs | `<merror>` | window errors |
| :--- | ---: | ---: | ---: | ---: |
| v2 2.7.2 | 946 ms | 49 | 0 | 0 |
| v3 3.2.2 | 389 ms | 98 | 0 | 0 |
| v4 4.1.3 | 1391 ms | 47 | 0 | 0 |

**Zero errors in every version.** The differing output counts are element-counting
artifacts — v2's HTML-CSS and v3/v4's `mjx-container` wrap output differently, and v3's
98 double-counts nested nodes. Not a finding in itself; it is why the guard checks leftover
delimiters rather than trusting a count.

`#MathJax_Message` is **present but not visible** on v2 — worth noting because the plugin's
LESS hides it explicitly, and the bench deliberately does not.

**What this means for the plan.** The central bet — that the plugin blocks NPL, not
MathJax 2 — is confirmed. It is no longer the delivery path (see the Decision below), but it
is what guarantees non-stock courses left on v2 keep working.

### Full-table read, all three versions (2026-09-10)

**No `<merror>` blocks appear anywhere, in any version. That is the expected result and it
is the finding** — an error box would have meant a problem; its absence means there is not
one. `<merror>: 0` and `window errors: 0` in all three panes.

**All four suspect cases render correctly and near-identically in v2, v3 and v4**,
confirming the headless harness visually:

| | Authored | Renders as | v2 | v3 | v4 |
| :--- | :--- | :--- | :---: | :---: | :---: |
| S1 | `\(A = \lambda&nbsp;N\)` | *A = λN* | ok | ok | ok |
| S2 | `\(T_{1/2}&nbsp;= 4.5 × 10^9\)` | *T₁ᐟ₂ = 4.5 × 10⁹* | ok | ok¹ | ok |
| S3 | `\(+ \&nbsp;\beta^-\)` | *+ β⁻* | ok | ok | ok |
| S4 | `\[<br />\lambda = \frac{\ln2}{T_{1/2}}<br />\]` | typeset fraction | ok | ok | ok |

The `&nbsp;` is absorbed as whitespace; the literal U+00D7 renders as a proper multiplication
sign without `\times`; backslash-U+00A0 is treated as a control space exactly as v2 does; and
the `<br />` tags inside the display delimiters do not prevent the fraction typesetting.

**¹ The one observed difference across versions.** In S2, **v3 sets the `×` tighter** than
v2 and v4 — `4.5×10⁹` against `4.5 × 10⁹`. Cosmetic, and **it does not affect v4**, which is
the target. Recorded for completeness, not a risk.

The 18 baseline rows are visually consistent across all three: variables correctly italic,
Greek glyphs correct, sub/superscripts well placed, inline maths on the body baseline at
matching size.

**Timings vary run to run** (v2 543–1119 ms, v3 304–523 ms, v4 1146–1444 ms) — CDN variance,
not a version characteristic. v4 is consistently the slowest to first typeset. Since v4 is
now the target this matters more than it did: it is a real argument for vendoring rather
than CDN-loading, which is already the plan.

### Browser matrix

| Browser | Engine | v2 2.7.2 | v3 3.2.2 | v4 4.1.3 | Verdict |
| :--- | :--- | :---: | :---: | :---: | :--- |
| Firefox | Gecko | pass | pass | pass | All 18 baseline + 4 suspect render correctly |
| Chrome | Blink | pass | pass | pass | Identical to Firefox |
| Edge | Blink | *not run* | | | **Deliberately skipped** — same engine as Chrome |
| Safari | WebKit | *not run* | | | **The one real gap** |

**Chrome and Firefox agree completely** — same glyphs, italics, sub/superscript placement
and baseline in every version, `<merror>: 0` and `window errors: 0` throughout. No
engine-specific regression between Gecko and Blink.

**Edge is a reasoned omission, not an untested gap.** It is Chromium/Blink, so it shares
Chrome's rendering and MathJax code paths. Recorded as skipped-by-judgement.

**Safari/WebKit is the remaining gap** and the only genuinely untested engine — it does not
share a rendering engine with either browser tested. Its risk is low but not zero: WebKit has
historically differed on web-font loading and on MathML, which is v3/v4's output path.

**No Mac is available on this side, so it will be delegated to a reviewer on the Phase 1 PR.**
Self-contained instructions are in [`SAFARI-TEST-REQUEST.md`](SAFARI-TEST-REQUEST.md) —
roughly ten minutes, no build or install, and written to be followed by someone who has not
read this plan. **Do not close Phase 0 until that result is in**, and record it in the browser
matrix above when it arrives.

**The v3 `×` spacing difference reproduces in both engines** (`4.5×10⁹` in v3 against
`4.5 × 10⁹` in v2 and v4), confirming it is a MathJax 3 typesetting choice rather than a
rendering artifact. It does not affect v4.

**Timing spread across runs and browsers:** v2 543–1119 ms, v3 242–523 ms, v4 344–2541 ms.
**v4 is consistently slowest and by far the most variable** — 2541 ms in Chrome against
1146 ms elsewhere. Since Step 1 stays on v2 this changes nothing now, but it is worth
carrying into Step 2: v4's larger bundle costs real time on a cold CDN fetch, which
strengthens the case for vendoring rather than CDN-loading it.

**Note on the three-pane view.** One capture showed raw `\\(A\\)` in the iframe panes while
the standalone files rendered correctly. That was **browser-cached copies of the pre-fix
files**, verified against disk — not a defect. Hard-reload (Ctrl+Shift+R) `bench.html` after
any rebuild; the iframes cache independently of the parent.

---

## Question 1 — the remaining browser sweep

**This is the gating question and it cannot be answered from a terminal.** If v2 renders
correctly in Chrome, Edge, Firefox and Safari, the two-step plan holds. If it has broken
anywhere, v4 becomes forced and content work returns to the critical path.

### Running it

Open `.bench/bench.html` for all three side by side, or each file standalone.
**Standalone in each of the four browsers is the part that matters** — the iframe parent is
for comparing versions, not for the browser sweep.

Each page auto-reports in its status bar: time to first typeset, `<merror>` count, window
errors, and (v2 only) whether `#MathJax_Message` appears. Every expression is rendered
**twice** — alone, and inside its real sentence — because inline baseline and size matching
against body text is what an author notices and cannot be judged from an isolated equation.

`#MathJax_Message` is deliberately **not** hidden in the bench, unlike in the plugin's LESS,
because whether it appears is one of the things to record.

### Bench bug found and fixed on first run (2026-09-10)

The first build of the bench **rendered nothing in any version** while all three status
bars reported success — a false green.

**Cause.** The generator JSON-encoded the authored TeX into an HTML attribute. JSON
escaping doubles backslashes, which is correct for a JavaScript string literal and wrong
for an attribute, where text is taken literally. Every expression reached the DOM as
`\\(A\\)` rather than `\(A\)`. MathJax correctly ignored it — `\\(` is not a delimiter —
so each library loaded, found no maths, completed cleanly and reported zero errors.

**Two fixes.** The attribute is now HTML-escaped rather than JSON-escaped, preserving the
`&nbsp;` and `<br />` the suspect cases depend on. And the status bar now counts actual
typeset output (`mjx-container` for v3/v4, `.MathJax` for v2) and re-scans for leftover raw
delimiters, so it reports **NOTHING TYPESET** or **PARTIAL** instead of a green light.

**Worth noting for the browser sweep:** the original failure mode is precisely what a real
v2 breakage would look like — library loads, reports success, renders nothing. The guard now
distinguishes the two.

### Second bench bug — the guard itself (also fixed)

The rebuilt bench **typeset correctly in all three versions** but every pane reported
`PARTIAL — 7 block(s) still show raw delimiters`. Identical counts across three different
libraries was the tell: a real incompatibility would not affect v2, v3 and v4 equally.

**Cause.** The guard's regex was emitted from a template literal in the generator, and its
backslashes were eaten crossing that boundary — the same escaping-across-a-boundary mistake
as the first bug, one layer further in. It shipped as `/\(|\[/`, matching **any** bare
bracket, so it flagged ordinary prose: *"(symbol α)"*, *"(γ)"*, *"(4.5 × 10⁹ years)"*.
Genuine leftover delimiters: **zero**. The typesetting had been fine.

**Fix.** The pattern is now built at runtime via `String.fromCharCode(92, 92)`, so no
escaping can be lost in transit. A first attempt used a single `92`, which compiles to
`/\[([]/` — an unterminated group that throws and would have killed the whole status bar;
the test caught it before it shipped.

**Verification now checks the emitted file, not the generator source.** Both bugs lived in
the gap between what the generator meant and what it wrote. `verify-emitted.js` extracts
the guard verbatim from `bench-v4.html`, compiles it, and asserts it stays silent after a
simulated successful typeset (0 of 44) and fires when nothing typesets (44 of 44).

### Verified before you start

All four library URLs return 200 as of 2026-09-10, so a blank pane is a real finding rather
than a bad path: v2 2.7.2, v3 3.2.2 `es5/`, v4 4.1.3 (no `es5/`), and v2 2.7.9 — the
fallback if 2.7.2 disappoints.

### Findings table — to complete at the bench

Record per expression, per version: renders at all; glyph appearance; size vs body text;
baseline alignment; horizontal spacing; console errors; time to first typeset and whether
unstyled TeX flashes; whether the v2 status bar appears.

| Expression | v2 Chrome | v2 Edge | v2 Firefox | v2 Safari | v3 | v4 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| *18 baseline forms* | | | | | | |
| `\(A = \lambda&nbsp;N\)` | | | | | parses | parses |
| `\(T_{1/2}&nbsp;= 4.5 × 10^9\)` | | | | | parses | parses |
| `\(+ \&nbsp;\beta^-\)` | | | | | parses | parses |
| `\[<br />\lambda = \frac{\ln2}{T_{1/2}}<br />\]` | | | | | parses | parses |

**The v2 row across those four browsers is the answer to "can Step 1 ship on MathJax 2."**

---

## Item 3 — not done, needs authorization

Confirming the stuck-overlay bug on framework 5.56.2 requires a build. The workspace
`CLAUDE.md` forbids running `grunt` or `npm run` without explicit authorization.

The defect remains **inferred from code, not observed** — the plan is candid about this, and
it is the most visible symptom, so it is worth confirming before Phase 2 fixes it.

---

## Files

| Path | What |
| :--- | :--- |
| `bench.html` | Three-pane parent |
| `bench-v2/3/4.html` | Standalone benches — use these for the browser sweep |
| `harness/harness.mjs` | Content-compatibility harness. `node harness.mjs <course-dir> …` |
| `harness/selftest.mjs` | Negative control proving detection fires |

The harness needs `mathjax-full@3.2.2` and `@mathjax/src@4`. Both were installed **in a
scratch directory, not in the plugin or the framework** — no project dependency was added.

Scaling to the estate is the plan's item 2 proper: point `harness.mjs` at the migration set's
course roots. It already accepts multiple roots and dedupes across them.

---

## Decision — everything moves to MathJax 4

**Taken 2026-09-10 by the PO, on the Phase 0 evidence.** This **supersedes the plan's
"default library: MathJax 2, unchanged"** decision. The two-step delivery shape collapses
into one step.

| | Decision |
| :--- | :--- |
| **Target library** | **MathJax 4.1.3**, vendored, supplied by the plugin — not stored per course. |
| **Error handling** | **`[tex]/noerrors` + `[tex]/noundefined` loaded by default.** |
| **Migration rule** | A course migrates **only when `_src` *and* `_inlineConfig` are both byte-identical to the 0.2.2 stock defaults**. Both fields are then **removed**. |
| **Non-stock courses** | **Untouched.** A stored value that differs from stock is a choice someone made; it is honoured and the course keeps running v2. |
| **Rollback** | **Change one constant in the plugin, redeploy.** Every migrated course follows. No per-course editing, ever. |
| **v2 adapter** | **Retained.** It is what makes rollback a version-string change rather than a code change, and what keeps non-stock courses working. |
| **v3** | **Not a target.** The adapter covers it for free (identical API to v4); nobody is migrated to it. |

### The runtime rule

Applies uniformly to all 639 installs — no special-casing, no per-client branch:

```
_src present  →  honour it, whatever it points at (adapter auto-selected by feature detection)
_src absent   →  use the plugin's built-in default (v4)
```

### The migration rule

```
_src AND _inlineConfig both byte-identical to 0.2.2 stock  →  REMOVE BOTH
anything else                                              →  LEAVE UNTOUCHED
```

**Why both fields are coupled.** Checking them together is what keeps the design coherent.
`_inlineConfig` is v2-shaped (`extensions`, `jax`, `output/HTML-CSS`) and meaningless to v4,
so a course with a *custom* config whose `_src` happened to be stock would otherwise end up
loading **v4 with a hand-written v2 config** — worse than either alternative. Coupling them
makes the principle single and legible: **a course that made a choice is untouched; a course
that never chose follows the plugin.**

**Why removing an exact byte-match is safe.** A course whose values are byte-identical to
stock never expressed a preference — it is the default written out. Plan evidence item 6
established this, and it was re-verified against the NPL export: `_src` is explicitly stored
and is byte-identical to the stock string. This is an equality test against two known
constants — auditable, and directly assertable in `checkContent`.

### Why per-course rollback was rejected

**An earlier draft proposed reverting `_src` per course. It was withdrawn as unworkable.**
NPL's instance is 8.9 GB and every course stores its own `_src`. "Edit two JSON values" is
true for one course; across the estate it is a bulk reverse migration run during an incident.
The PO's constraint is explicit: **a situation requiring manual per-course reversion must be
avoided at all costs.**

Removing the stored values instead means no course pins a version, so one constant in the
plugin governs all of them.

**The trade:** rollback is all-or-nothing; per-course granularity is lost. That is the correct
direction — **one lever that would actually be pulled beats granular levers that would not.**

### What this also fixes

- **Un-pins the estate.** 639 courses currently hard-code an EOL library via a value nobody
  chose deliberately.
- **Kills the protocol-relative `//` bug** (plan evidence item 6) everywhere at once —
  `//cdnjs…` resolves to `file://cdnjs…` when a package is played from disk, silently killing
  all maths.
- **Removes the runtime Cloudflare dependency.** Every course currently loads executable JS
  from a third-party CDN at runtime — an availability risk, and plausibly a security-review
  problem at a national physical laboratory.
- **Opens the route to accessibility (#5)**, via v4's built-in speech and braille.

---

## `noerrors` / `noundefined` — tested, and weaker than advertised

Prompted by [mathjax/MathJax#2832](https://github.com/mathjax/MathJax/issues/2832), where
MathJax's lead maintainer recommends both extensions to degrade broken TeX to readable text.
**That answer is v2-specific** (`noErrors.js`/`noUndefined.js`, issue labelled `v2`); v4 uses
`[tex]/noerrors` and `[tex]/noundefined`. Both confirmed present in v4 and tested directly —
`harness/noerrors-test.mjs`.

**Verdict: load both. They are a clear improvement at no cost — but they are a softener, not
a guarantee, and must not be described as "errors are handled."**

| Broken input | Without | With both extensions |
| :--- | :--- | :--- |
| Undefined macro (`\notARealCommand`) | error message | **renders as source** |
| Undefined mid-expression (`x + \3`) | error message | **renders as source** |
| Unloaded package (`\ce{H2O}`, mhchem) | error message | **renders as source** |
| Missing close brace (`\frac{a}{b`) | error message | **error message remains** |
| Missing argument (`\frac`) | error message | **error message remains** |
| Unclosed group (`{\alpha`) | error message | **error message remains** |

**`noundefined` does what the issue promises.** Undefined macros render as the macro name in
red rather than an error message — covering the most likely authoring mistake, a command from
a package nobody loaded.

**`noerrors` is weaker than the thread implies.** Reading the v4 source
(`NoErrorsConfiguration.js`), it still emits an `merror` node; it fills it with the original
TeX and demotes the message to a `title` tooltip. For **structural** errors the message still
reaches the rendered output. Three of six cases above are unimproved.

**No regression on real content:** all five real NPL expressions, including the four
malformed patterns, still render cleanly with both extensions loaded.

**This is a change from current behaviour, not a restoration.** Plan evidence item 3
established NPL has **no** `noerrors` today — it shipped only with v2 combined config files
and they configure manually. Today a broken expression shows a raw error; with these it
usually shows the source.

---

## Conditions, and the accepted risk

**Required before the estate rollout:**

1. **The Safari result** — [`SAFARI-TEST-REQUEST.md`](SAFARI-TEST-REQUEST.md). Outstanding.
2. **Vendoring proven to work.** Per the plan, offline lazy-load resolution fails **silently**
   if the directory structure or `fontURL` is wrong. The genuinely fiddly part.
3. **A pilot course in production before the rest follow.**

### The accepted risk, stated plainly

**The estate-wide content harness cannot be run** — there is no access to NPL's full course
set. The v4 content evidence is **one lesson: 34 expressions, 22 unique forms, all clean**,
verified headlessly and by eye in two browser engines. It included every known-awkward
pattern, which is the strongest part of the result. **It is not their estate.**

Three things make this an acceptable trade rather than a gamble:

- **The failure mode is bounded.** A bad expression renders as one wrong-looking equation in
  one component — not a broken page, not a broken course, not a build failure.
- **`noundefined` softens the most likely class of failure** — an unloaded package or a typo'd
  macro renders as source rather than an error.
- **Rollback is one constant and one deploy.** If something systemic surfaces, recovery is
  minutes and needs no per-course work.

**If access to more NPL courses ever becomes available, run `harness/harness.mjs` before the
estate rollout.** It takes multiple course roots and runs in minutes.

---

## Consequences for the plan's phases

**Phases 1–3 are unaffected in shape.** Scaffolding, the runtime rewrite and the schemas were
always going to support both adapters. Two additions to Phase 2: the plugin now owns the
**default `_src` and `_inlineConfig` as constants** (the rollback lever), and loads
`[tex]/noerrors` + `[tex]/noundefined` by default.

**Phase 4 (migration) is materially rewritten.** The plan's `v1.js` asserted `_src` and
`_inlineConfig` byte-identical before and after. **That assertion is replaced**, not kept. The
new `checkContent` must assert:

1. Where **both** fields were byte-identical to stock, **both are now absent**.
2. Where **either** differed, **both are byte-identical to before**.
3. **No value was ever modified** — only removed, or left alone.

Assertion 2 carries the safety weight for the 638 untested installs, and must be tested
against a fixture with a deliberately customised `_src`/`_inlineConfig`, not only the stock one.

**This is a real increase in blast radius** — the migration now affects every install, not just
NPL — and the plan's original guarantee is deliberately weakened. The replacement guarantee is
narrower but still strong: **the migration only ever *removes* a known-stock pair, and never
*modifies* a value.**

**The plan already flags escalating Phase 4 from Sonnet 5 to Opus 5 "if the `checkContent`
no-change assertion proves fiddly, since that assertion *is* the safety guarantee." That
condition is now met by construction — plan for Opus 5 on Phase 4.**

**Step 2 is absorbed.** Vendoring, `fontURL` resolution against Grunt's collated layout, and
the config translation all move into the main body of work rather than a later opt-in phase.

---
## Recommendation

**Proceed to Phase 1, on the revised single-step plan.**

Phase 0 did its job: it was scoped to de-risk a v4 upgrade, and the answer came back clean
enough that the upgrade became the plan rather than a later option. Both open questions are
answered, and the one genuinely unverifiable item — the estate-wide content sweep — has a
named mitigation rather than a hope.

**Phase 1 is unblocked.** It is repo scaffolding (`package.json`, `bower.json`, workflows,
deleting `assets/`) and nothing in it depends on the outstanding Safari result or on the
library decision.

**Carry forward into later phases:**

| | |
| :--- | :--- |
| **Phase 2** | Plugin owns default `_src`/`_inlineConfig` as constants — this is the rollback lever. Load `[tex]/noerrors` + `[tex]/noundefined`. |
| **Phase 4** | Rewritten migration rule; **escalate to Opus 5**. |
| **Before rollout** | Safari result; vendoring proven offline; one pilot course in production. |
| **If ever possible** | Run `harness/harness.mjs` across more NPL courses. |
