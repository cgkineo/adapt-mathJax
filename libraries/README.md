# Vendored libraries

## mathjax/4

**[MathJax 4.1.3](https://github.com/mathjax/MathJax-src)** — Apache-2.0, `LICENSE` included alongside the bundle.

Unmodified. Files are copied verbatim from two npm packages at the same version:

| Vendored path | Source |
| :--- | :--- |
| `mathjax/4/tex-mml-chtml.js` | `@mathjax/mathjax-tex-font@4.1.3` → `tex-mml-chtml-mathjax-tex.js` (**not** `@mathjax/src`'s bundle of the same name — see below) |
| `mathjax/4/input/tex/extensions/noerrors.js` | `@mathjax/src@4.1.3` → `bundle/input/tex/extensions/noerrors.js` |
| `mathjax/4/input/tex/extensions/noundefined.js` | `@mathjax/src@4.1.3` → `bundle/input/tex/extensions/noundefined.js` |
| `mathjax/4/chtml/woff2/` | `@mathjax/mathjax-tex-font@4.1.3` → `chtml/woff2/` |

### The font trap — read before swapping the bundle

`tex-mml-chtml.js` here is the **combined** build from the font package, which has the TeX font baked in. It is deliberately *not* `@mathjax/src`'s stock `bundle/tex-mml-chtml.js`.

MathJax 4's default font is **newcm**, not the TeX font. The stock bundle therefore generates `@font-face` rules for `mjx-ncm-*.woff2`, while the font package supplies `mjx-tex-*.woff2`. Point `chtml.fontURL` at the vendored directory with the stock bundle and **every font request 404s** — and the page still renders, in the browser's fallback font, with nothing logged. That is the failure this arrangement avoids; it was hit and fixed during Phase 6.

Using the combined bundle also means `loader.paths.fonts` never has to be redirected away from its `cdn.jsdelivr.net` default, because no separate font module is ever fetched.

### Why the `mathjax/4/` subfolder is mandatory

`grunt/config/copy.js` collates `extensions/*/libraries/**` from every installed plugin into a single flat `build/libraries/`, preserving only the path *after* the `libraries/` segment. Vendoring at the top level would drop MathJax's files in among every other plugin's. The subfolder keeps them namespaced, and keeps MathJax's own internal structure intact so its lazy `loader.load` resolution still works.

The version is in the path (`4/`) so a second major version could be vendored alongside without a collision.

### Why only a subset is vendored

`@mathjax/src` unpacks to ~34MB and the font package to ~9MB; almost all of that is ES/CJS source, TypeScript definitions and component build machinery that a built course never loads. The vendored subset is ~1.4MB:

- **`tex-mml-chtml.js`** — the prebuilt bundle with the TeX font included (see the font trap above).
- **`input/tex/extensions/`** — only `noerrors` and `noundefined`, the two extensions this plugin's default `_inlineConfig` lazily loads. Any *other* TeX extension a course configures is **not** vendored and will 404 offline; add it here if a course needs one.
- **`chtml/woff2/`** — the CHTML webfont data. The SVG output renderer's assets are not vendored, because the default config uses CHTML.

Speech-rule-engine (`bundle/sre/`, ~4.6MB) is deliberately **not** vendored — MathJax 4's accessibility features are not yet wired into this plugin. See [#5](https://github.com/cgkineo/adapt-mathJax/issues/5); vendoring `sre/` is part of that work, not this.

### The speech trap — why `attachSpeech` is disabled

MathJax 4 enables `enableSpeech`, `enableBraille` and `enableEnrichment` **by default**. With SRE unvendored, the speech render action queues one promise per expression into `MathDocument._actionPromises` that never settles. `renderPromise` awaits `Promise.all` of them, so **the typeset never resolves even though the equations are visibly rendered** — the plugin's `wait` is never released and the loading screen stays up forever, with no console error because nothing rejected.

Setting the three flags to `false` in `options` is **not sufficient**: `MenuHandler` recomputes `enableSpeech`/`enableBraille` from its own saved settings after the document is constructed, turning them back on. The effective fix is `options.renderActions.attachSpeech = []`, which removes the action entirely. Both are set in `js/MathJaxLoader.js`.

**Accessibility consequence, stated plainly:** equations currently carry no speech text, so a screen reader gets the raw glyph structure rather than a readable expression. This is a regression against MathJax 4's CDN defaults, accepted because the alternative is a course that never finishes loading. Restoring it means vendoring `sre/` **and** its mathmaps, then re-enabling the action — that is the substance of #5.

### Two settings that must stay in step with this folder

Both are derived from `LIBRARY_PATH` in `js/MathJaxLoader.js` (`DEFAULT_CONFIG`):

- `loader.paths.mathjax` → `libraries/mathjax/4` — **no trailing slash.** MathJax resolves a prefixed name by bare concatenation (`paths[prefix] + name.substring(…)`), so a slash here yields `libraries/mathjax/4//input/…`.
- `chtml.fontURL` → `libraries/mathjax/4/chtml/woff2`

MathJax resolves lazy loads and webfonts relative to the bundle's own URL, which does not match the collated build layout. **Left unset or wrong, both fail silently** — equations still typeset, in a fallback font, with nothing logged. Verify by building a course, disconnecting from the network, and confirming both that maths renders and that no request to `cdnjs.cloudflare.com` appears in the network panel.

#### These are not mirrored into the schemas, deliberately

`schema/config.schema.json` and `properties.schema` declare **no `default`** for `_src` or `_inlineConfig`, and must not gain one. Three reasons, in order of how much they cost when ignored:

1. **A schema default is a write.** The authoring tool applies defaults on content creation, so a default here stamps today's `libraries/mathjax/4` paths into every new course and freezes them there. The next major-version bump moves the folder and those courses keep pointing at one that no longer exists.
2. **It is the same value in three files, and they drift.** They did: the schemas carried `libraries/mathjax/4/` with a trailing slash while the code carried it without, and the schema copy of `options` put `enableSpeech`/`enableBraille`/`enableEnrichment` *beside* `options` rather than inside it and omitted `renderActions.attachSpeech` entirely — i.e. the schema default was precisely the never-finishes-loading configuration described above.
3. **No author can answer these questions.** Every setting in `DEFAULT_CONFIG` exists to switch off a part of MathJax 4 that this plugin does not vendor. They track the contents of this folder, not an authoring intent.

Absence is the signal: a course that stores neither field gets the vendored pair. `MathJaxLoader.resolveLibrary` treats an empty string and an empty object as absent for the same reason, since a blank form in the authoring tool stores `''` and `{}`.

### Updating

1. `npm pack @mathjax/src@<version>` and `npm pack @mathjax/mathjax-tex-font@<version>` — keep both at the **same** version.
2. Extract and copy the four paths in the table above into `mathjax/<major>/`, taking the main bundle from the **font** package, not from `@mathjax/src`.
3. If the major version changed, update `LIBRARY_PATH` in `js/MathJaxLoader.js`. That is the only place it appears — the schemas carry no copy of it, and adding one would re-open the drift described above.
4. Re-verify offline: `npx cypress run --spec "src/extensions/adapt-mathJax/test/e2e/offline.cy.js"` against a build, which asserts every `@font-face` resolves locally and that nothing leaves the origin.
