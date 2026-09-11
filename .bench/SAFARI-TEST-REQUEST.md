# Safari test request — `adapt-mathJax` rendering bench

**What we need:** someone with a Mac to open three HTML files in **Safari** and report what
they see. About 10 minutes. No build, no install, no Node, no local server.

**Why it matters:** we are modernising `adapt-mathJax`, and the plan depends on MathJax 2.7.2
still rendering correctly in current browsers. We have confirmed that in Firefox (Gecko) and
Chrome (Blink). **Safari/WebKit is the only engine we cannot test** — nobody on the team has
a Mac. WebKit has historically differed on web-font loading and on MathML, which is what the
newer MathJax versions output, so it is worth one real look.

If Safari is fine, a significant piece of client work is unblocked. If it is not, we need to
know before we choose which MathJax version to ship.

---

## What to do

1. Check out this branch and open these three files in Safari, **each in its own tab**:

   ```
   src/extensions/adapt-mathJax/.bench/bench-v2.html
   src/extensions/adapt-mathJax/.bench/bench-v3.html
   src/extensions/adapt-mathJax/.bench/bench-v4.html
   ```

   Double-click them in Finder, or `open -a Safari <file>`. They load MathJax from a public
   CDN, so **you need to be online**, but nothing else.

   Do **not** use `bench.html` (the three-pane view) — its iframes cache aggressively and have
   already produced one false alarm. The three standalone files are the test.

2. On each page, look at the **status bar under the heading**.

3. Scroll through the table and look at the maths.

4. Report back using the template at the bottom.

---

## What a PASS looks like

**Status bar: grey/green, and it should say `<merror>: 0` and `window errors: 0`.**

```
typeset complete (Hub.Queue — v2 adapter path) — 593ms to first typeset |
typeset outputs: 49 (from 44 blocks) | <merror>: 0 | window errors: 0 |
#MathJax_Message present: yes, visible now: no
```

**The table:** every row shows properly typeset maths — italic variables (*A*, *N*, *t*),
Greek letters (λ, α, γ, β), subscripts and superscripts sitting correctly (*T₁ᐟ₂*, *N₀*,
*β⁻*), and one fraction near the bottom.

Two columns show each expression twice — **Alone** and **In its real sentence**. The second
is the important one: inline maths should sit on the same baseline as the surrounding text
and be about the same size, not floating high, sinking low, or looking oversized.

## What a FAIL looks like

**A pink/red status bar.** It will say one of:

- `NOTHING TYPESET` — the library loaded but rendered nothing
- `PARTIAL — N block(s) still show raw delimiters`
- a non-zero `<merror>` or `window errors` count

**Or, visibly in the table:**

- Raw LaTeX on screen — literal `\(A\)` or `\lambda` instead of *A* or λ
- Red or boxed error text where an equation should be
- Maths visibly misaligned with the sentence, or wildly the wrong size
- Missing/blank glyphs, tofu boxes (□), or a wrong-looking font

**Please screenshot anything that looks wrong**, including the status bar.

---

## The rows that matter most

The **four amber rows at the bottom**, labelled S1–S4. These are real expressions from a live
client course that contain slightly malformed LaTeX which older MathJax tolerates. They are
the whole reason for the exercise. They should render as:

| Row | Should render as |
| :--- | :--- |
| **S1** | *A* = λ*N* |
| **S2** | *T*₁ᐟ₂ = 4.5 × 10⁹ |
| **S3** | + β⁻ |
| **S4** | a proper stacked fraction: λ = ln2 over *T*₁ᐟ₂ |

If any of these shows an error box or raw LaTeX **in Safari but the baseline rows above are
fine**, that is exactly the finding we are looking for — please flag it clearly.

---

## Things that are NOT bugs

So you do not waste time reporting them — all three are known and expected:

- **`typeset outputs` differs between the three pages** (49 / 98 / 47). The versions wrap
  their output differently and the count double-counts nested elements. Only `<merror>` and
  `window errors` matter.
- **Timing varies a lot**, especially on v4 (up to ~2.5s). That is CDN fetch time.
- **v3 sets `×` tighter than v2 and v4** in row S2 — `4.5×10⁹` rather than `4.5 × 10⁹`.
  Already known, cosmetic, does not affect the version we care about.

---

## Report template

Please paste this back into the PR, once per file:

```
Safari version:            (Safari ▸ About Safari)
macOS version:
---
bench-v2.html  (MathJax 2.7.2)  — the one that matters most
  Status bar colour:       grey/green  |  pink/red
  Status bar text:         (paste the whole line)
  Baseline rows 1–18:      all render correctly?   yes / no — which ones not
  Suspect rows S1–S4:      all render correctly?   yes / no — which ones not
  Inline maths baseline:   sits correctly on the text baseline?   yes / no
  Anything else odd:

bench-v3.html  (MathJax 3.2.2)
  ...same...

bench-v4.html  (MathJax 4.1.3)
  ...same...
```

**If everything passes, "all three pass, nothing odd" plus the Safari version is enough.**

---

## Context, if you want it

Full findings, including the Firefox and Chrome results this is completing, are in
[`FINDINGS.md`](FINDINGS.md) in this directory.

The short version: a client's courses depend on this plugin, it has not been touched since
2019, and we are modernising it without changing how anything renders. This bench is how we
prove the "without changing how anything renders" half.
