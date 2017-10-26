window.MathJax = {
	AuthorInit: function() {
		var Adapt = require("core/js/adapt");
		var messageSet = MathJax.Message.Set;

		MathJax.Message.Set = function(text, n, clearDelay) {
			if (text[0] === "ProcessMath") Adapt.trigger("mathJax:processMath");

			return messageSet.apply(this, arguments);
		};

		MathJax.Hub.Register.MessageHook("End Process", function() {
			Adapt.trigger("mathJax:endProcess");
		});
	}
};
