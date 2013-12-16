/**
backbone-dynamodb 0.3.0 - (c) 2013 Sergio Alcantara
Server side (Node.js) `Backbone.sync()` DynamoDB implementation

@module DynamoDB
@author Sergio Alcantara
 */

var _ = require('underscore'),
	uuid = require('node-uuid'),
	AWS = require('aws-sdk'),
	Backbone = require('./backbone-dynamodb-shared');
_.mixin(require('underscore.deferred'));

var dynamoDB = new AWS.DynamoDB();

/**
 * Adding the aws-sdk to Backbone.AWS
 */
Backbone.AWS = AWS;

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

function wrapComplete(instance, options) {
	var complete = options.complete;
	options.complete = function(resp) {
		if (complete) complete.call(this, instance, resp, options);
	};
}

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
	_.each(model.toJSON(options), function(v, key) {
		body.Item[key] = encodeAttribute(v);
	});

	_.extend(body, options.dynamodb);

	var deferred = new _.Deferred(),
		request = dynamoDB.client.putItem(body);

	request.on('complete', function(resp) {
		var ctx = options.context || model;

		if (resp.error) deferred.rejectWith(ctx, [resp, options]);
		else {
			options.dynamodbResponse = resp;
			deferred.resolveWith(ctx, [changed, options]);
		}
	});
	request.send();

	wrapComplete(model, options);
	deferred.done(options.success).fail(options.error).always(options.complete);

	return deferred.promise(request);
}

function getItem(model, options) {
	options || (options = {});
	var body = {
		TableName: model._tableName(),
		Key: {}
	};
	body.Key[model.idAttribute] = encodeAttribute(model.id);
	if (model.rangeAttribute) body.Key[model.rangeAttribute] = encodeAttribute(model.get(model.rangeAttribute));

	_.extend(body, options.dynamodb);

	var deferred = new _.Deferred(),
		request = dynamoDB.client.getItem(body);

	request.on('complete', function(resp) {
		var ctx = options.context || model;
		if (!resp.error && _.isEmpty(resp.data.Item)) resp.error = {code: 'NotFound'};

		if (resp.error) deferred.rejectWith(ctx, [resp, options]);
		else {
			var attributes = {};
			_.each(resp.data.Item, function(attribute, key) {
				attributes[key] = decodeAttribute(attribute);
			});

			options.dynamodbResponse = resp;
			deferred.resolveWith(ctx, [attributes, options]);
		}
	});
	request.send();

	wrapComplete(model, options);
	deferred.done(options.success).fail(options.error).always(options.complete);

	return deferred.promise(request);
}

function deleteItem(model, options) {
	options || (options = {});
	var body = {
		TableName: model._tableName(),
		Key: {}
	};
	body.Key[model.idAttribute] = encodeAttribute(model.id);
	if (model.rangeAttribute) body.Key[model.rangeAttribute] = encodeAttribute(model.get(model.rangeAttribute));

	_.extend(body, options.dynamodb);

	var deferred = new _.Deferred(),
		request = dynamoDB.client.deleteItem(body);

	request.on('complete', function(resp) {
		var ctx = options.context || model;

		if (resp.error) deferred.rejectWith(ctx, [resp, options]);
		else deferred.resolveWith(ctx, [resp, options]);
	});
	request.send();

	wrapComplete(model, options);
	deferred.done(options.success).fail(options.error).always(options.complete);

	return deferred.promise(request);
}

function fetchCollection(collection, options) {
	var fetchType = options.query ? 'query' : 'scan',
		body = _.extend({TableName: collection._tableName()}, options[fetchType], options.dynamodb);

	var deferred = new _.Deferred(),
		request = dynamoDB.client[fetchType](body);

	request.on('complete', function(resp) {
		var ctx = options.context || collection;

		if (resp.error) deferred.rejectWith(ctx, [resp, options]);
		else {
			var modelsArray = _.map(resp.data.Items, function(item) {
				var attributes = {};
				_.each(item, function(attribute, key) {
					attributes[key] = decodeAttribute(attribute);
				});
				return attributes;
			});

			options.dynamodbResponse = resp;
			deferred.resolveWith(ctx, [modelsArray, options]);
		}
	});
	request.send();

	wrapComplete(collection, options);
	deferred.done(options.success).fail(options.error).always(options.complete);

	return deferred.promise(request);
}

var sharedMethods = {
	_tableName: function() {
		if (this.tableName) return _.result(this, 'tableName');

		var table = _.result(this, this instanceof Backbone.DynamoDB.Model ? 'urlRoot' : 'url');
		if (table.charAt(0) === '/') table = table.substr(1);
		return table.charAt(0).toUpperCase() + table.substr(1);
	},
	sync: function(method, instance, options) {
		if (method === 'create' || method === 'update') {
			return putItem(instance, options);
		} else if (method === 'read') {
			if (instance instanceof Backbone.DynamoDB.Collection) {
				return fetchCollection(instance, options);
			} else {
				return getItem(instance, options);
			}
		}
		return deleteItem(instance, options);
	}
};

Backbone.DynamoDB.Model = Backbone.DynamoDB.Model.extend(sharedMethods);
Backbone.DynamoDB.Collection = Backbone.DynamoDB.Collection.extend(sharedMethods);

module.exports = Backbone;