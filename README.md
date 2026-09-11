# MathJax

**MathJax** is an *extension* bundled with the [Adapt framework](https://github.com/adaptlearning/adapt_framework). It typesets LaTeX equations authored inline in course JSON, using a copy of [MathJax](https://www.mathjax.org) shipped inside the plugin.

## Installation

* With [Adapt CLI](https://github.com/adaptlearning/adapt-cli) installed, run `adapt install adapt-mathJax`. Alternatively, download the ZIP and extract into the `src/extensions` directory.
* Run an appropriate Grunt task.
* No configuration is required to get started. The plugin ships **MathJax 4.1.3** in `libraries/`, loads it from the built course rather than a CDN, and scans course content so it loads only where there is maths to typeset.

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
* **Everything is served from the course.** A packaged course typesets with no network connection, and a package opened from disk behaves the same as one served over HTTP.
* The Adapt loading screen is held while MathJax typesets a page, and released once typesetting completes or fails — a course never gets stuck on it.
* Maths inside trickle-revealed blocks, popups, drawers and inline tutor feedback is typeset when it appears, not only on page load.
* A course with no maths anywhere in its content never loads MathJax at all, unless `_forceLoad` is set.

### Attributes

Attribute | Type | Description | Default
--------- | ---- | ----------- | -------
`_isEnabled` | Boolean | Whether this course may load MathJax at all. Set to `false` to prevent it loading under any circumstances | `true`
`_forceLoad` | Boolean | Loads MathJax even where no maths is found in the course content. Only needed where equations are injected at runtime by another plugin, which the content scan cannot see | `false`
`_src` | String | The URL of the MathJax library to load. **Leave empty** to use the copy shipped with the plugin. Set this only to load a different major version, together with a matching `_inlineConfig` | *(empty — use the bundled library)*
`_inlineConfig` | Object | [Configuration](http://docs.mathjax.org/en/latest/options/index.html#configuration) set as `window.MathJax` before the library loads. **Leave empty** to use the plugin's own. Its shape is specific to the MathJax major version named by `_src` and it is passed through verbatim — see [Upgrading to MathJax 4](#upgrading-to-mathjax-4) | *(empty — use the bundled configuration)*
`_loadTimeout` | Number | Milliseconds to wait for MathJax to become ready before giving up and continuing the course without typesetting | `10000`

`_src` and `_inlineConfig` are the only two attributes with no default. That is deliberate — their *absence* is what selects the bundled library and its matching configuration, so neither is pre-filled in the authoring tool and an empty value is read as "use the plugin's own". Setting one without the other logs a warning, because a configuration written for one MathJax version applied to another is how courses break in ways that produce no console error.

#### What the bundled configuration does

The parts that affect authored content:

* **Delimiters.** `\(…\)` inline; `\[…\]` and `$$…$$` display.
* **`noundefined`** renders an unrecognised macro as its own name rather than an error message — the most likely authoring mistake, a command from a package nobody loaded.
* **`noerrors`** degrades a failed expression to its original TeX where it can, but it is a softener rather than a guarantee: a structural error (an unclosed brace, a missing argument) still reaches the page as a message.
* Either way, a failed expression is logged as a warning quoting the offending LaTeX, so unknown bad input surfaces in QA rather than only on screen. Search the course JSON for the quoted expression to find the component it came from.

The rest of it is plumbing — where to find the bundled library's lazily-loaded parts and its webfonts, and switches that turn off MathJax features this plugin does not ship. Those exist to match the contents of `libraries/`, not to be configured, and they are defined once in `js/MathJaxLoader.js` (`DEFAULT_CONFIG`) rather than restated here or in the schemas. `libraries/README.md` explains each one and what breaks without it.

**The plugin never modifies authored content.** It detects and reports parse failures; the fix belongs in the source JSON, not in a runtime rewrite.

### Supported library versions

MathJax 2, 3 and 4 are all supported. The plugin sets `window.MathJax` from `_inlineConfig` before loading the script named by `_src`, then detects which major version loaded by feature detection — never by parsing the URL — and selects the matching adapter.

A course that stores neither value follows the plugin's own bundled pair (MathJax 4). A course that stores its own `_src`/`_inlineConfig` pair is honoured exactly as configured and keeps running whatever version it names — MathJax 2's `Hub.Queue` API is still fully supported for this reason. Loading a v2 build logs a one-time warning naming the upgrade path; it does not block anything.

A course that names its own `_src` is responsible for making that URL resolve offline. The plugin only guarantees the offline behaviour of the library it ships.

## Upgrading to MathJax 4

Most courses need no action — installs from `1.0.0` onward migrate automatically wherever the stored `_src` and `_inlineConfig` are both the plugin's own `0.2.2`-era stock defaults (see [Migration](#migration) below). This section is for a course that stores a **customised** config and wants to move to v4 deliberately.

1. **Run the content-compatibility harness** (`tools/harness.mjs` in this repo) against the course's `components.json` files. It renders every `\(…\)`/`\[…\]` expression through both the old and new library headlessly and flags anything that changes or errors. It needs `mathjax-full@3.2.2` and `@mathjax/src@4`, which are deliberately not dependencies of this plugin: install them in a scratch directory and run it from there.
2. **Fix any flagged expressions** at source. The plugin does not rewrite content, so a malformed expression that rendered under the old config must be corrected in the JSON.
3. **Clear `_src` and `_inlineConfig` together.** Emptying both is the recommended route: the course then follows the plugin's bundled v4 pair and stops pinning a library version. To move to a v4 build of your own instead, set `_src` to it and translate `_inlineConfig` using the table below — and note that the bundled configuration's non-delimiter settings are specific to *this* plugin's `libraries/` folder and should not be copied into a config pointing somewhere else.

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
* **Wide equations scroll, but not by keyboard.** A display equation too wide for its container scrolls horizontally within it rather than widening the page. That scroll region takes no focus, so it cannot be reached by keyboard alone. Also part of [#5](https://github.com/cgkineo/adapt-mathJax/issues/5).

## Migration

`migrations/v1.js` (`0.2.2` → `1.0.0`) removes the stored `_src`/`_inlineConfig` pair **only where both are byte-identical to the `0.2.2` stock defaults** — that course then inherits the plugin's bundled v4 pair rather than staying pinned to the old CDN URL. Where either value differs from stock, neither is touched: a customised config is a deliberate choice and is carried forward exactly as stored, on whatever library version it names.

`_isEnabled` and `_forceLoad` are never written by the migration, in either direction. Neither field existed in `0.2.2`, and their absence already produces the intended behaviour — scan the content, load where there is maths. Writing a value would cache a verdict taken against today's content, which a course edited later would then be stuck with.

----------------------------
<a href="https://community.adaptlearning.org/" target="_blank"><img src="https://github.com/adaptlearning/documentation/blob/master/04_wiki_assets/plug-ins/images/adapt-logo-mrgn-lft.jpg" alt="adapt learning logo" align="right"></a>
**Author / maintainer:** Kineo, originally by Tom Greenfield, with [contributors](https://github.com/cgkineo/adapt-mathJax/graphs/contributors)<br>
**Accessibility support:** none — see [Limitations](#limitations) and [#5](https://github.com/cgkineo/adapt-mathJax/issues/5)<br>
**RTL support:** Untested<br>
**Cross-platform coverage:** Chrome, Firefox; Safari verification outstanding<br>
