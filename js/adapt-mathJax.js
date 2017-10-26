define([ "core/js/adapt" ], function(Adapt) {

	function setUpMathJax() {
		var config = Adapt.config.get("_mathJax");
		var inlineConfig = config ? config._inlineConfig : {
				"extensions": [ "tex2jax.js" ],
				"jax": [ "input/TeX", "output/HTML-CSS" ]
		};
		var src = config ?
			config._src :
			"//cdnjs.cloudflare.com/ajax/libs/mathjax/2.7.2/MathJax.js";
		var $init = $("<script/>", { src: "assets/mathJaxInit.js" });
		var $config = $("<script/>", { type: "text/x-mathjax-config" });
		var $src = $("<script/>", { src: src });

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
		var Hub = window.MathJax.Hub;

		if ($element) $element = $element[0];

		Hub.Queue([ "Typeset", Hub, $element ]);
	}

	Adapt.once("app:dataReady", setUpMathJax).on({
		"mathJax:processMath": onProcessMath,
		"mathJax:endProcess": onEndProcess,
		"menuView:ready pageView:ready": onViewReady,
		"popup:opened": onPopupOpened
	});

});
