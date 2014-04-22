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
		/**
		 * Uses the [`Backbone.Model.toJSON`](http://documentcloud.github.io/backbone/#Model-toJSON) method
		 * to return a copy of this model's attributes.
		 *
		 * @method toJSON
		 * @param {Object} [options]
		 * @param {Array} [options.pick] If specified, the returned object would contain only attributes listed in this array.
		 *		It uses [`_.pick`](http://documentcloud.github.io/underscore/#pick) to filter the attributes.
		 * @param {Array} [options.omit] If specified, attributes listed in this array will be omitted from the returned object.
		 *		It uses [`_.omit`](http://documentcloud.github.io/underscore/#omit) to omit attributes.
		 * @return {Object} Returns a copy of this model's attributes.
		 */
		toJSON: function(options) {
			var json = Backbone.Model.prototype.toJSON.apply(this, arguments);

			if (options) {
				if (options.pick) json = _.pick(json, options.pick);
				else if (options.omit) json = _.omit(json, options.omit);
			}

			return json;
		},
		/**
		Iterates through the given attributes looking for `Date` values that have been converted into string, and converts them back to `Date` instances.

		@method parse
		@param {Object} obj
		@return {Object} Parsed attributes
		 */
		parse: function(obj) {
			for (var key in obj) if (isISODate.test(obj[key])) obj[key] = new Date(obj[key]);
			return obj;
		},
		isNew: function() {
			var hashKey = _.result(this, 'hashAttribute') || _.result(this, 'idAttribute'),
				rangeKey = _.result(this, 'rangeAttribute'),
				hashValue = this.get(hashKey),
				rangeValue = rangeKey ? this.get(rangeKey) : null;

			return hashValue == null || ( rangeKey && rangeValue == null );
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
		}
	})
};

if (typeof module !== 'undefined') module.exports = Backbone;