/*
 *  backbone-dynamodb 0.0.2
 *  (c) 2012 Sergio Alcantara
 */

var _ = require('underscore'),
	uuid = require('node-uuid'),
	DynDB = require('dyndb'),
	Backbone = require('./backbone-dynamodb-shared');

var dyndb = new DynDB();
Backbone.DynamoDB.setup = dyndb.setup;

function isJSONString(str) {
	// TODO: Improve to make sure that it is a valid JSON string (use RegExp?)
	var f = str.charAt(0), l = str.charAt(str.length - 1);
	return (f === '{' && l === '}') || (f === '[' && l === ']') || str === 'null';
}

var encodeAttribute = exports.encodeAttribute = function(v) {
	if (_.isArray(v)) {
		var type = 'N', set = _.map(v, function(i) {
			var j = encodeAttribute(i);
			if (j.S) type = 'S';
			return j.N || j.S;
		});
		return type === 'N' ? {NS: set} : {SS: set};
	} else if (_.isNumber(v)) return {N: '' + v};
	else if (_.isBoolean(v)) return {S: v.toString()};
	else if (_.isDate(v)) return {S: v.toISOString()};
	else if (_.isString(v)) return {S: v};
	return {S: JSON.stringify(v)};
};

var decodeAttribute = exports.decodeAttribute = function(attr) {
	if (attr.NS || attr.SS) {
		var type = attr.NS ? 'N' : 'S';
		return _.map(attr[type + 'S'], function(v) {
			var _attr = {};
			_attr[type] = v;
			return decodeAttribute(_attr);
		});
	}
	if (attr.N) return attr.N.indexOf('.') !== -1 ? parseFloat(attr.N) : parseInt(attr.N);

	var v = attr.S;
	if (/^true|false$/.test(v)) return v === 'true';
	else if (/^\d{4}(-\d{2}){2}T\d{2}(:\d{2}){2}\.\d{3}Z$/.test(v)) return new Date(v);
	else if (!isJSONString(v)) return v;
	return JSON.parse(v);
};

function putItem(model, options) {
	options || (options = {});
	var body = {
		TableName: model._tableName(),
		Item: {}
	};
	var changed = {};
	if (!model.id) {
		var idAttr = _.result(model, 'idAttribute');
		body.Item[idAttr] = encodeAttribute(changed[idAttr] = uuid());
	}
	_.each(model.toJSON().model, function(v, key) {
		body.Item[key] = encodeAttribute(v);
	});

	_.extend(body, options.dynamodb);
	dyndb.request('PutItem', body, function(e, jsonResponse, httpResponse) {
		if (e) options.error(model, {code: 'DBError', dbError: e});
		else options.success({model: changed, dynamodb: jsonResponse});

		if (_.isFunction(options.complete)) options.complete(model, {dynamodb: jsonResponse});
	});
}

function getItem(model, options) {
	options || (options = {});
	var body = {
		TableName: model._tableName(),
		Key: {
			HashKeyElement: encodeAttribute(model.id)
		}
	};
	if (model.rangeAttribute) body.Key.RangeKeyElement = encodeAttribute(model.get(model.rangeAttribute));

	_.extend(body, options.dynamodb);
	dyndb.request('GetItem', body, function(e, jsonResponse, httpResponse) {
		if (e) options.error(model, {code: 'DBError', dbError: e});
		else {
			if (!jsonResponse.Item || _.isEmpty(jsonResponse.Item)) options.error(model, {code: 'NotFound'});
			else {
				var json = {};
				_.each(jsonResponse.Item, function(attr, key) {
					json[key] = decodeAttribute(attr);
				});

				options.success({model: json, dynamodb: jsonResponse});
			}
		}

		if (_.isFunction(options.complete)) options.complete(model, {dynamodb: jsonResponse});
	});
}

function deleteItem(model, options) {
	options || (options = {});
	var body = {
		TableName: model._tableName(),
		Key: {
			HashKeyElement: encodeAttribute(model.id)
		}
	};
	if (model.rangeAttribute) body.Key.RangeKeyElement = encodeAttribute(model.get(model.rangeAttribute));

	_.extend(body, options.dynamodb);
	dyndb.request('DeleteItem', body, function(e, jsonResponse, httpResponse) {
		if (e) options.error(model, {code: 'DBError', dbError: e});
		else options.success({dynamodb: jsonResponse});

		if (_.isFunction(options.complete)) options.complete(model, {dynamodb: jsonResponse});
	});
}

function fetchCollection(collection, options) {
	var body = _.extend({TableName: collection._tableName()}, options.query || options.scan, options.dynamodb);

	dyndb.request(options.query ? 'Query' : 'Scan', body, function(e, jsonResponse, httpResponse) {
		if (e) options.error(collection, {code: 'DBError', dbError: e});
		else {
			options.success({
				collection: _.map(jsonResponse.Items, function(it) {
					var model = {};
					_.each(it, function(attr, key) {
						model[key] = decodeAttribute(attr);
					});
					return {model: model};
				}),
				dynamodb: jsonResponse
			});
		}

		if (_.isFunction(options.complete)) options.complete(collection, {dynamodb: jsonResponse});
	});
}

Backbone.sync = function(method, instance, options) {
	if (method === 'create' || method === 'update') {
		putItem(instance, options);
	} else if (method === 'read') {
		if (instance instanceof Backbone.DynamoDB.Collection) fetchCollection(instance, options);
		else getItem(instance, options);
	} else {
		deleteItem(instance, options);
	}
};

var sharedMethods = {
	_tableName: function() {
		if (this.tableName) return _.result(this, 'tableName');

		var table = _.result(this, this instanceof Backbone.DynamoDB.Model ? 'urlRoot' : 'url');
		if (table.charAt(0) === '/') table = table.substr(1);
		return table.charAt(0).toUpperCase() + table.substr(1);
	}
};

Backbone.DynamoDB.Model = Backbone.DynamoDB.Model.extend(sharedMethods);
Backbone.DynamoDB.Collection = Backbone.DynamoDB.Collection.extend(sharedMethods);

module.exports = Backbone;