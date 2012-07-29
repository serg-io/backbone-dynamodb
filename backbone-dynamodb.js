var _ = require('underscore'),
	uuid = require('node-uuid'),
	DynDB = require('dyndb'),
	Backbone = require('./backbone-dynamodb-shared');

var dyndb = new DynDB();
Backbone.DynamoDB.setup = dyndb.setup;

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
	else return {S: JSON.stringify(v)};
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
	if (attr.N) return /\./.test(attr.N) ? parseFloat(attr.N) : parseInt(attr.N);

	var v = attr.S;
	if (/^true|false$/.test(v)) return v === 'true';
	else if (/^\d{4}(-\d{2}){2}T\d{2}(:\d{2}){2}\.\d{3}Z$/.test(v)) return new Date(v);
	else if (v.charAt(0) !== '{' && v.charAt(v.length - 1) !== '}' && v !== 'null') return v;
	else return JSON.parse(v);
};

function putItem(model, options) {
	options || (options = {});
	var body = {
		TableName: model._tableName(),
		Item: {}
	};
	var changed = {};
	if (!model.id) {
		changed[_.result(model, 'idAttribute')] = uuid();
		model.set(changed);
	}
	_.each(model.toJSON().model, function(v, key) {
		body.Item[key] = encodeAttribute(v);
	});

	_.extend(body, options.dynamodb);
	dyndb.request('PutItem', body, function(e, jsonResponse, httpResponse) {
		if (e && _.isFunction(options.error)) options.error(model, {code: 'DBError', dbError: e});
		else if (!e && _.isFunction(options.success)) options.success({model: changed});

		if (_.isFunction(options.complete)) options.complete(model);
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
		if (e && _.isFunction(options.error)) options.error(model, {code: 'DBError', dbError: e});
		else if (!e) {
			if (!jsonResponse.Item || _.isEmpty(jsonResponse.Item)) options.error(model, {code: 'NotFound'});
			else {
				var json = {};
				_.each(jsonResponse.Item, function(attr, key) {
					json[key] = decodeAttribute(attr);
				});
				if (_.isFunction(options.success)) options.success({model: json});
				else model.set(json, {silent: true});
			}
		}

		if (_.isFunction(options.complete)) options.complete(model);
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
		if (e && _.isFunction(options.error)) options.error(model, {code: 'DBError', dbError: e});
		else if (!e && _.isFunction(options.success)) options.success(jsonResponse);

		if (_.isFunction(options.complete)) options.complete(model);
	});
}

function fetchCollection(collection, options) {
	var body = _.extend({TableName: collection._tableName()}, options.query || options.scan, options.dynamodb);

	dyndb.request(options.query ? 'Query' : 'Scan', body, function(e, jsonResponse, httpResponse) {
		if (e && _.isFunction(options.error)) options.error(collection, {code: 'DBError', dbError: e});
		else if (!e) {
			var collection = _.map(jsonResponse.Items, function(it) {
				var model = {};
				_.each(it, function(attr, key) {
					model[key] = decodeAttribute(attr);
				});
				return {model: model};
			});

			if (_.isFunction(options.success)) options.success({collection: collection});
			else collection.set(collection, {silent: true});
		}

		if (_.isFunction(options.complete)) options.complete(collection);
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