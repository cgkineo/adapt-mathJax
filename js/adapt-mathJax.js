define([ "coreJS/adapt" ], function(Adapt) {

	function setUpMathJax() {
		var config = Adapt.config.get("_mathJax");
		var inlineConfig = config ? config._inlineConfig : {
				"extensions": [ "tex2jax.js" ],
				"jax": [ "input/TeX", "output/HTML-CSS" ]
		};
		var src = config ? config._src : "//cdn.mathjax.org/mathjax/latest/MathJax.js";
		var $init = $("<script/>").attr("src", "assets/mathJaxInit.js");
		var $config = $("<script/>").attr("type", "text/x-mathjax-config");
		var $src = $("<script/>").attr("src", src);

		$config[0].text = "MathJax.Hub.Config(" + JSON.stringify(inlineConfig) + ");";
		$("head").append($init, $config, $src);
	}

	function onProcessMath() {
		$(".loading").show();
	}

	function onEndProcess() {
		Adapt.trigger("device:resize");
		$(".loading").hide();
	}

	function onViewReady(view) {
		var Hub = window.MathJax.Hub;

		$(".loading").show();

		if (Hub) Hub.Queue([ "Typeset", Hub, view.el ]);
	}

	function onPopupOpened($element) {
		if ($element) $element = $element[0];

		MathJax.Hub.Queue([ "Typeset", MathJax.Hub, $element ]);
	}

	Adapt.once("app:dataReady", setUpMathJax).on({
		"mathJax:processMath": onProcessMath,
		"mathJax:endProcess": onEndProcess,
		"menuView:ready": onViewReady,
		"pageView:ready": onViewReady,
		"popup:opened": onPopupOpened
	});

});