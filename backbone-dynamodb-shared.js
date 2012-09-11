/**
This module is inteded to contain functionality that can be shared between client and server side

@module DynamoDB
@submodule DynamoDB-Shared
@author Sergio Alcantara
 */

if (typeof require === 'function') {
	var _ = _ || require('underscore');
	var Backbone = Backbone || require('backbone');
}

function bindContext(options){
	if (options && options.context) {
		if (_.isFunction(options.error)) options.error = _.bind(options.error, options.context);
		if (_.isFunction(options.success)) options.success = _.bind(options.success, options.context);
		if (_.isFunction(options.complete)) options.complete = _.bind(options.complete, options.context);
	}
	return options;
}

var isISODate = /^\d{4}(-\d{2}){2}T\d{2}(:\d{2}){2}\.\d{3}Z$/;

Backbone.DynamoDB = {
	isISODate: isISODate,

	/**
	@class Backbone.DynamoDB.Model
	@extends Backbone.Model
	 */
	Model: Backbone.Model.extend({
		/**
		Using the [jQuery.ajax](http://api.jquery.com/jQuery.ajax/#jQuery-ajax-settings) `context` option doesn't work on
		the `success` and `error` callbacks in the original Backbone `save()`, `destroy()`, and `fetch()` methods. This method is overwritten
		to fix that issue.

		@method save
		@param {Object} attributes
		@param {Object} options
		 */
		save: function(attributes, options) {
			return Backbone.Model.prototype.save.call(this, attributes, bindContext(options));
		},
		/**
		Using the [jQuery.ajax](http://api.jquery.com/jQuery.ajax/#jQuery-ajax-settings) `context` option doesn't work on
		the `success` and `error` callbacks in the original Backbone `save()`, `destroy()`, and `fetch()` methods. This method is overwritten
		to fix that issue.

		@method destroy
		@param {Object} options
		 */
		destroy: function(options) {
			return Backbone.Model.prototype.destroy.call(this, bindContext(options));
		},
		/**
		Using the [jQuery.ajax](http://api.jquery.com/jQuery.ajax/#jQuery-ajax-settings) `context` option doesn't work on
		the `success` and `error` callbacks in the original Backbone `save()`, `destroy()`, and `fetch()` methods. This method is overwritten
		to fix that issue.

		@method fetch
		@param {Object} options
		 */
		fetch: function(options) {
			return Backbone.Model.prototype.fetch.call(this, bindContext(options));
		},
		toJSON: function(options) {
			var json = Backbone.Model.prototype.toJSON.call(this, options);

			if (options && !_.isEmpty(options.exclude)) {
				var filtered = {},
					exclude = options.exclude;
				_.isArray(exclude) || (exclude = [exclude]);

				_.each(json, function(value, name) {
					if (_.indexOf(exclude, name) === -1) filtered[name] = value;
				});
				json = filtered;
			} else if (options && !_.isEmpty(options.include)) {
				var filtered = {},
					include = options.include;
				_.isArray(include) || (include = [include]);

				_.each(json, function(value, name) {
					if (_.indexOf(include, name) !== -1) filtered[name] = value;
				});
				json = filtered;
			}

			return {model: json};
		},
		/**
		Iterates through the given attributes looking for `Date` values that have been converted into string, and converts them back to `Date` instances.

		@method parse
		@param {Object} obj
		@return {Object} Parsed attributes
		 */
		parse: function(obj) {
			var m = obj.model;
			for (var k in m) if (isISODate.test(m[k])) m[k] = new Date(m[k]);
			return m;
		}
	}),

	/**
	@class Backbone.DynamoDB.Collection
	@extends Backbone.Collection
	 */
	Collection: Backbone.Collection.extend({
		/**
		Using the [jQuery.ajax](http://api.jquery.com/jQuery.ajax/#jQuery-ajax-settings) `context` option doesn't work on
		the `success` and `error` callbacks in the original Backbone `save()`, `destroy()`, and `fetch()` methods. This method is overwritten
		to fix that issue.

		@method save
		@param {Object} options
		 */
		fetch: function(options) {
			return Backbone.Collection.prototype.fetch.call(this, bindContext(options));
		},
		toJSON: function(options) {
			return {
				collection: Backbone.Collection.prototype.toJSON.call(this, options)
			};
		},
		parse: function(obj) {
			// Backbone passes each object in the collection through model.parse when instantiating the Models
			return obj.collection;
		}
	})
};

if (typeof module !== 'undefined') module.exports = Backbone;