/**
backbone-dynamodb 0.1.0 - (c) 2012 Sergio Alcantara
Server side (Node.js) `Backbone.sync()` DynamoDB implementation

@module DynamoDB
@author Sergio Alcantara
 */

var _ = require('underscore'),
	uuid = require('node-uuid'),
	DynDB = require('dyndb'),
	Backbone = require('./backbone-dynamodb-shared');

var dyndb = new DynDB();

/**
Sets the access keys and region to use for every request. If no arguments are passed,
it gets the keys and region from the following environment variables:

1. `AWS_ACCESS_KEY_ID`
2. `AWS_SECRET_ACCESS_KEY`
3. `AWS_REGION`

@method setup
@return {DynDB} The underlying DynDB instance
 */
Backbone.DynamoDB.setup = dyndb.setup;

function isJSONString(str) {
	// TODO: Improve to make sure that it is a valid JSON string (use RegExp?)
	var f = str.charAt(0), l = str.charAt(str.length - 1);
	return (f === '{' && l === '}') || (f === '[' && l === ']') || str === 'null';
}

var encodeAttribute = exports.encodeAttribute = function(v) {
	if (_.isArray(v)) {
		var value = {}, type = null, set = _.map(v, function(i) {
			var j = encodeAttribute(i);
			if (!type) type = _.keys(j)[0];
			return j.N || j.B || j.S;
		});
		value[type + 'S'] = set;
		return value;
	} else if (_.isNumber(v)) return {N: '' + v};
	else if (_.isBoolean(v)) return {S: v.toString()};
	else if (_.isDate(v)) return {S: v.toISOString()};
	else if (_.isString(v)) return {S: v};
	else if (Buffer.isBuffer(v)) return {B: v.toString('base64')};
	return {S: JSON.stringify(v)};
};

var decodeAttribute = exports.decodeAttribute = function(attr) {
	var type = _.keys(attr)[0];
	if (type.length === 2) { // if type = NS|BS|SS
		var t = type.charAt(0); // t = N|B|S
		return _.map(attr[type], function(v) {
			var _attr = {};
			_attr[t] = v;
			return decodeAttribute(_attr);
		});
	}
	if (attr.N) return attr.N.indexOf('.') !== -1 ? parseFloat(attr.N) : parseInt(attr.N);
	if (attr.B) return new Buffer(attr.B, 'base64');

	var v = attr.S;
	if (/^true|false$/.test(v)) return v === 'true';
	else if (Backbone.DynamoDB.isISODate.test(v)) return new Date(v);
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
	if (model.isNew()) {
		var idAttr = _.result(model, 'idAttribute');
		body.Item[idAttr] = encodeAttribute(changed[idAttr] = uuid());
	}
	_.each(model.attributes, function(v, key) {
		body.Item[key] = encodeAttribute(v);
	});

	_.extend(body, options.dynamodb);
	dyndb.request('PutItem', body, function(e, json) {
		if (e) options.error(model, {code: 'DBError', dbError: e});
		else options.success({model: changed, dynamodb: json});

		if (_.isFunction(options.complete)) options.complete(model, {dynamodb: json});
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
	dyndb.request('GetItem', body, function(e, json) {
		if (e) options.error(model, {code: 'DBError', dbError: e});
		else {
			if (!json.Item || _.isEmpty(json.Item)) options.error(model, {code: 'NotFound'});
			else {
				var attrs = {};
				_.each(json.Item, function(attr, key) {
					attrs[key] = decodeAttribute(attr);
				});

				options.success({model: attrs, dynamodb: json});
			}
		}

		if (_.isFunction(options.complete)) options.complete(model, {dynamodb: json});
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
	dyndb.request('DeleteItem', body, function(e, json) {
		if (e) options.error(model, {code: 'DBError', dbError: e});
		else options.success({dynamodb: json});

		if (_.isFunction(options.complete)) options.complete(model, {dynamodb: json});
	});
}

function fetchCollection(collection, options) {
	var body = _.extend({TableName: collection._tableName()}, options.query || options.scan, options.dynamodb);

	dyndb.request(options.query ? 'Query' : 'Scan', body, function(e, json) {
		if (e) options.error(collection, {code: 'DBError', dbError: e});
		else {
			options.success({
				collection: _.map(json.Items, function(it) {
					var model = {};
					_.each(it, function(attr, key) {
						model[key] = decodeAttribute(attr);
					});
					return {model: model};
				}),
				dynamodb: json
			});
		}

		if (_.isFunction(options.complete)) options.complete(collection, {dynamodb: json});
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
