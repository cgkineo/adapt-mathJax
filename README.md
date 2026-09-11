# MathJax

**MathJax** is an *extension* bundled with the [Adapt framework](https://github.com/adaptlearning/adapt_framework). It CDN-loads [MathJax](https://www.mathjax.org) and typesets LaTeX equations authored inline in course JSON.

## Installation

* With [Adapt CLI](https://github.com/adaptlearning/adapt-cli) installed, run `adapt install adapt-mathJax`. Alternatively, download the ZIP and extract into the `src/extensions` directory.
* Run an appropriate Grunt task.
* No configuration is required to get started — the plugin loads **MathJax 4.1.3** from cdnjs by default, scanning course content for maths and loading only where needed.

### Usage

* Surround LaTeX equations with `\(` and `\)` for inline mode, or `\[` and `\]` for display mode.
* Example of inline mode:
```
\(x^n + y^n = z^n\)
```
* Example of display mode (rendered in a separate block):
```
\[f(x) = \frac{1}{1+x}\]
```
* When directly editing in the authoring tool, backslashes do *not* have to be escaped with an additional backslash. The above inline-mode example would therefore be entered as `\(x^n + y^n = z^n\)`.
* The Adapt loading screen is held while MathJax typesets a page, and released once typesetting completes or fails — a course never gets stuck on it.
* Maths inside trickle-revealed blocks, popups, drawers and inline tutor feedback is typeset when it appears, not only on page load.
* A course with no maths anywhere in its content never loads MathJax at all, unless `_isEnabled` forces it.

### Attributes

Attribute | Type | Description | Default
--------- | ---- | ----------- | -------
`_isEnabled` | Boolean | Forces MathJax to load even if no maths is detected, or set to `false` to prevent it loading under any circumstances. Leave unset to load automatically only when maths is detected | *(unset — auto-detect)*
`_src` | String | The URL of the MathJax library to load. Only change this to load a different major version, together with a matching `_inlineConfig` | `"https://cdnjs.cloudflare.com/ajax/libs/mathjax/4.1.3/tex-mml-chtml.js"`
`_inlineConfig` | Object | [Configuration](http://docs.mathjax.org/en/latest/options/index.html#configuration) set as `window.MathJax` before the library loads. The shape of this object is specific to the MathJax major version named by `_src` and is passed through verbatim — see [Upgrading to MathJax 4](#upgrading-to-mathjax-4) below | see [Default config](#default-config)
`_loadTimeout` | Number | Milliseconds to wait for MathJax to become ready before giving up and continuing the course without typesetting | `10000`

#### Default config

```json
{
  "loader": { "load": ["[tex]/noerrors", "[tex]/noundefined"] },
  "tex": {
    "packages": { "[+]": ["noerrors", "noundefined"] },
    "inlineMath": [["\\(", "\\)"]],
    "displayMath": [["\\[", "\\]"], ["$$", "$$"]]
  },
  "startup": { "typeset": false }
}
```

`noundefined` renders an unrecognised macro as its own name instead of an error message — the most likely authoring mistake, a command from a package nobody loaded. `noerrors` degrades a failed expression to its original TeX where it can, but it is a softener rather than a guarantee: a structural error (an unclosed brace, a missing argument) still reaches the page as a message. Either way, a failed expression is also logged as a warning naming the component, so unknown bad input surfaces in QA rather than only on screen.

**The plugin never modifies authored content.** It detects and reports parse failures; the fix belongs in the source JSON, not in a runtime rewrite.

### Supported library versions

MathJax 2, 3 and 4 are all supported. The plugin sets `window.MathJax` from `_inlineConfig` before loading the script named by `_src`, then detects which major version loaded by feature detection — never by parsing the URL — and selects the matching adapter. `_src` and `_inlineConfig` always travel together: change one, change the other to match.

A course that stores neither value follows the plugin's own default (MathJax 4, above). A course that stores its own `_src`/`_inlineConfig` pair is honoured exactly as configured and keeps running whatever version it names — MathJax 2's `Hub.Queue` API is still fully supported for this reason. Loading a v2 build logs a one-time warning naming the upgrade path; it does not block anything.

## Upgrading to MathJax 4

Most courses need no action — installs from `1.0.0` onward migrate automatically wherever the stored `_src` and `_inlineConfig` are both the plugin's own `0.2.2`-era stock defaults (see [Migration](#migration) below). This section is for a course that stores a **customised** config and wants to move to v4 deliberately.

1. **Run the content-compatibility harness** (`.bench/harness/harness.mjs` in this repo) against the course's `components.json` files. It renders every `\(…\)`/`\[…\]` expression through both the old and new library headlessly and flags anything that changes or errors.
2. **Fix any flagged expressions** at source. The plugin does not rewrite content, so a malformed expression that rendered under the old config must be corrected in the JSON.
3. **Change `_src` and `_inlineConfig` together.** Remove both from `config.json` to fall back to the plugin's built-in v4 default, or set `_src` to a v4 build and translate `_inlineConfig` using the table below.

### v2 → v4 config translation

| MathJax 2 | MathJax 4 | Note |
| :--- | :--- | :--- |
| `extensions: ["tex2jax.js"]` | *(implicit)* | v3/v4 recognise `\(…\)`/`\[…\]` without an extension list |
| `jax: ["input/TeX", …]` | *(implicit)* | Bundle choice — `tex-mml-chtml.js` already implies TeX input |
| `jax: […, "output/HTML-CSS"]` | `chtml` output | The default output renderer in the `tex-mml-chtml` bundle |
| `TeX.Macros` | `tex.macros` | Same shape, new location |
| `messageStyle` / `showProcessingMessages` | *removed* | v3/v4 have no processing-message UI |
| `showMathMenu` | `options.enableMenu` | Renamed |

## Limitations

* **Equations carry no screen-reader text.** MathJax 4 ships speech and braille generation and enables it by default, but it depends on the speech-rule engine, which this plugin does not vendor — with it enabled and the engine absent, typesetting never completes and the course hangs on the loading screen. The speech render action is therefore switched off. A screen reader gets the equation's glyph structure rather than a readable expression, which is a regression against MathJax's own defaults and is accepted only because the alternative is a course that never loads. Closing this means vendoring the engine and its mathmaps and re-enabling the action — tracked as [#5](https://github.com/cgkineo/adapt-mathJax/issues/5), and see `libraries/README.md` for the mechanism.

## Migration

`migrations/v1.js` (`0.2.2` → `1.0.0`) adds `_isEnabled: true` where absent, and removes the stored `_src`/`_inlineConfig` pair **only where both are byte-identical to the `0.2.2` stock defaults** — that course then inherits the plugin's v4 default rather than staying pinned to the old CDN URL. Where either value differs from stock, neither is touched: a customised config is a deliberate choice and is carried forward exactly as stored, on whatever library version it names.

----------------------------
<a href="https://community.adaptlearning.org/" target="_blank"><img src="https://github.com/adaptlearning/documentation/blob/master/04_wiki_assets/plug-ins/images/adapt-logo-mrgn-lft.jpg" alt="adapt learning logo" align="right"></a>
**Author / maintainer:** Kineo, originally by Tom Greenfield, with [contributors](https://github.com/cgkineo/adapt-mathJax/graphs/contributors)<br>
**Accessibility support:** none — see [Limitations](#limitations) and [#5](https://github.com/cgkineo/adapt-mathJax/issues/5)<br>
**RTL support:** Untested<br>
**Cross-platform coverage:** Chrome, Firefox; Safari verification outstanding — see `.bench/SAFARI-TEST-REQUEST.md`<br>
