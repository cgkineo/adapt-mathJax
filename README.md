# adapt-mathJax

An extension to load [MathJax](https://www.mathjax.org) into Adapt.

## Installation

* In this extension the default configuration for MathJax is as follows:
```json
"_mathJax": {
	"_inlineConfig": {
		"extensions": [
			"tex2jax.js"
		],
		"jax": [
			"input/TeX",
			"output/HTML-CSS"
		]
	},
	"_src": "//cdn.mathjax.org/mathjax/latest/MathJax.js"
}
```
* If this needs to be overridden, add the above to `config.json` and modify where required.
* Copy the extension folder into the src > extensions directory and run an appropriate Grunt task.

### Usage

* With the default configuation, equations are processed in LaTeX format.
* In JSON, surround LaTeX equations with `\\(``\\)` for inline mode or `\\[``\\]` for display mode.
* Example of inline mode:
```
\\(x^n + y^n = z^n\\)
```
* Example of display mode (rendered in a separate block):
```
\\[f(x) = \\frac{1}{1+x}\\]
```
* Remember to escape any backslashes with an additional backslash `\`.
* The Adapt loading screen is shown until MathJax has finished processing.
* MathJax processing messages are styled to mimic the Adapt loading screen.
* MathJax file loading messages are hidden.