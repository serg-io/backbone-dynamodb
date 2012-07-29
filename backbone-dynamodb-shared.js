if (typeof define !== 'function') {
	var define = require('amdefine')(module);
}

define(['underscore', 'backbone'], function(_, Backbone) {
	function bindContext(options){
		if (options && options.context) {
			if (_.isFunction(options.error)) options.error = _.bind(options.error, options.context);
			if (_.isFunction(options.success)) options.success = _.bind(options.success, options.context);
		}
		return options;
	}

	Backbone.DynamoDB = {};
	var isISODate = Backbone.DynamoDB.isISODate = /^\d{4}(-\d{2}){2}T\d{2}(:\d{2}){2}\.\d{3}Z$/;

	Backbone.DynamoDB.Model = Backbone.Model.extend({
		save: function(attributes, options) {
			return Backbone.Model.prototype.save.call(this, attributes, bindContext(options));
		},
		destroy: function(options) {
			return Backbone.Model.prototype.destroy.call(this, bindContext(options));
		},
		fetch: function(options) {
			return Backbone.Model.prototype.fetch.call(this, bindContext(options));
		},
		toJSON: function(options) {
			return {
				model: Backbone.Model.prototype.toJSON.call(this, options)
			};
		},
		parse: function(obj) {
			var m = obj.model;
			for (var k in m) if (isISODate.test(m[k])) m[k] = new Date(m[k]);
			return m;
		}
	});

	Backbone.DynamoDB.Collection = Backbone.Collection.extend({
		fetch: function(options) {
			return Backbone.Collection.prototype.fetch.call(this, bindContext(options));
		},
		toJSON: function(options) {
			return {
				collection: Backbone.Collection.prototype.toJSON.call(this, options)
			};
		},
		parse: function(obj) {
			return _.map(obj.collection, function(m) {
				for (var k in m) if (isISODate.test(m[k])) m[k] = new Date(m[k]);
				return m;
			});
		}
	});

	return Backbone;
});