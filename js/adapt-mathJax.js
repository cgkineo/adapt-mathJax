/*
* MathJax
* License - https://github.com/adaptlearning/adapt_framework/blob/master/LICENSE
* Maintainers - Tom Greenfield
*/

define(function(require) {

	var Adapt = require("coreJS/adapt");

	function addScript() {
		var config = Adapt.config.get("_mathJax");
		var script = "<script type='text/x-mathjax-config'>";
		var hideLoadingDiv = "MathJax.Hub.Queue(function() {\n" +
			"	$('.loading').hide();\n" +
			"});\n";
		var hideLoadingMessages = "MathJax.Message.File = function(file) {\n" +
			"	var root = MathJax.Ajax.config.root;\n" +
			"	var rootLength = root.length;\n" +
			"	if (file.substr(0, rootLength) === root) {\n" +
			"		file = '[MathJax]' + file.substr(rootLength)\n" +
			"	}\n" +
			"	return this.Set('Loading ' + file, null, 0);\n" +
			"},\n";
		var inlineConfig = config && config._inlineConfig ? config._inlineConfig :
			{ "extensions": ["tex2jax.js"], "jax": ["input/TeX", "output/HTML-CSS"] };
		var src = config && config._src ? config._src :
			"//cdn.mathjax.org/mathjax/latest/MathJax.js";

		script += hideLoadingDiv + hideLoadingMessages + "MathJax.Hub.Config(" +
			JSON.stringify(inlineConfig, null, "\t") + ");</script>" +
			"<script type='text/javascript' src='" + src + "'></script>";

		$("head").append(script);
	}

	Adapt.on("app:dataReady", function() { addScript(); })
		.on("menuView:ready pageView:ready", function(view) {
			$(".loading").show();

			if (window.MathJax) {
				MathJax.Hub.Queue(["Typeset", MathJax.Hub, view.el], function() {
					$(".loading").hide();
				});
			}
		})
		.on("popup:opened", function($el) {
			_.defer(function() {
				MathJax.Hub.Queue(["Typeset", MathJax.Hub, $el ? $el[0] : undefined]);
			});
		});

});