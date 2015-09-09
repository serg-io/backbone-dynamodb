/**
 * backbone-dynamodb - (c) 2015 Sergio Alcantara
 * Uses Amazon DynamoDB to store Backbone models.
 * 
 * @author Sergio Alcantara
 */

var clone = require( 'clone' ),
	AWS = require( 'aws-sdk' ),
	_ = require( 'underscore' ),
	DOC = require( 'dynamodb-doc' ),
	Backbone = require( 'backbone' );

_.mixin( require( 'underscore.deferred' ) );

/**
 * Convenience factory function for the DynamoDB client.
 * The first time this function is executed, it instantiates and returns
 * a DynamoDB client. Subsequent calls return the same instance of the
 * DynamoDB client.
 *
 * @return {DOC.DynamoDB} An instance of the DOC.DynamoDB client.
 */
var dynamo = (function() {
	var client;

	return function() {
		return client || ( client = new DOC.DynamoDB() );
	};
})();

/**
 * Convenience method to determine if an object is a Promise.
 *
 * @param {Object} promise
 * @return {Boolean} Returns true if the first argument is a Promise or false otherwise.
 */
function isPromise(promise) {
	return _.has( promise, 'promise' ) && _.isFunction( promise.promise );
}

/**
 * Wraps the complete callback function inside another function to ensure it is executed with the right arguments.
 *
 * @param {Backbone.DynamoDB.Model} instance
 * @param {Object} options
 */
function wrapComplete(instance, options) {
	var complete = options.complete;

	options.complete = function(response) {
		if ( _.isFunction( complete ) ) {
			complete.call( this, instance, response, options );
		}
	};
}

/**
 * Sends a request to store a Backbone.DynamoDB.Model in a DynamoDB table using a PutItem request.
 * 
 * @param {Backbone.DynamoDB.Model} model The model to store in DynamoDB.
 * @param {Object} options The options object.
 */
function putItem(model, options) {
	options || ( options = {} );
	if ( options.serializeDates !== false ) {
		// If serializeDates is NOT `false`, use `true` by default.
		options.serializeDates = true;
	}

	var newKey, // If the model `isNew`, a new key is generated.
		request,
		hashName, // Name of the hash attribute.
		rangeName, // Name of the range attribute.
		keyPromise,
		deferred = new _.Deferred(),
		/**
		 * Container object to store the attributes that are changed as part of saving the model.
		 */
		changed = {},
		/**
		 * Parameters to use in the DynamoDB PutItem request
		 */
		params = {
			/**
			 * Convert the model into an object.
			 * If `options.serializeDates` is `true`, `Date` values are converted into strings.
			 */
			Item: model.toJSON( options ),
			TableName: model._tableName()
		};

	if ( model.isNew() ) { // If the model is new, a new key attribute(s) must be generated
		hashName = _.result( model, 'hashAttribute' ) || _.result( model, 'idAttribute' );
		rangeName = _.result( model, 'rangeAttribute' );

		/**
		 * Convenience method to set the `newKey` attribute(s), once it's generated.
		 */
		function setNewKey(_newKey) {
			if ( rangeName ) {
				/**
				 * If the model has a range attribute, _newKey must be an object that contains
				 * the hash and range attributes.
				 */
				_.extend( changed, _newKey );
			} else {
				/**
				 * If the model doesn't have a range attribute, _newKey must be the value of the hash attribute.
				 */
				changed[ hashName ] = _newKey;
			}

			// Add the new key attribute(s) to the Item to be sent to DynamoDB
			_.extend( params.Item, options.serializeDates === true ? serializeAllDates( model, _.clone( changed ) ) : changed );
		}

		// Generate new key attribute(s)
		newKey = model.newKey( options );

		if ( isPromise( newKey ) ) {
			/**
			 * If `newKey` is a promise, wait until it's resolved to execute `setNewKey`
			 * and assign the resulting promise to `keyPromise`.
			 */
			keyPromise = newKey.then( setNewKey );
		} else {
			// If `newKey` is NOT a promise, call `setNewKey` right away.
			setNewKey( newKey );
		}
	}

	wrapComplete( model, options );
	_.extend( params, options.dynamodb );

	request = dynamo().putItem( params );

	request.on('complete', function (response) {
		var ctx = options.context || model;

		if ( response.error ) {
			deferred.rejectWith( ctx, [ response, options ] );
		} else {
			/**
			 * Backbone's "internal" success callback takes the changed attributes as the first argument.
			 * Make the entire AWS `response` available as `options.awsResponse`.
			 */
			options.awsResponse = response;
			deferred.resolveWith( ctx, [ changed, options ] );
		}
	});

	if ( !keyPromise ) {
		// If there's no `keyPromise`, send the request right away.
		request.send();
	} else {
		// If there's a `keyPromise`, wait until it is "done" before sending the request.
		keyPromise.done(function () {
			request.send();
		}).fail(function () {
			var ctx = options.context || model;
			deferred.rejectWith( ctx, arguments );
		});
	}

	deferred.done( options.success ).fail( options.error ).always( options.complete );

	return deferred.promise( request );
}

/**
 * Deletes a Backbone.DynamoDB.Model from a DynamoDB table using a DeleteItem request.
 * 
 * @param {Backbone.DynamoDB.Model} model The model to delete from DynamoDB.
 * @param {Object} options The options object.
 */
function deleteItem(model, options) {
	var request,
		deferred = new _.Deferred(),
		params = {
			Key: key.call( model ),
			TableName: model._tableName()
		};

	options || ( options = {} );
	wrapComplete( model, options );
	_.extend( params, options.dynamodb );

	if ( options.serializeDates !== false ) {
		// If the hash and/or range attributes are `Date` instance they must be serialized before sending the request.
		serializeAllDates( model, params.Key );
	}

	request = dynamo().deleteItem( params );

	request.on('complete', function (response) {
		var ctx = options.context || model;

		if ( response.error ) {
			deferred.rejectWith( ctx, [ response, options ] );
		} else {
			deferred.resolveWith( ctx, [ response, options ] );
		}
	});
	request.send();

	deferred.done( options.success ).fail( options.error ).always( options.complete );

	return deferred.promise( request );
}

/**
 * Retrieves a Backbone.DynamoDB.Model from a DynamoDB table using a GetItem request.
 * 
 * @param {Backbone.DynamoDB.Model} model The model to retrieve from DynamoDB.
 * @param {Object} options The options object.
 */
function getItem(model, options) {
	var request,
		deferred = new _.Deferred(),
		params = {
			Key: key.call( model ),
			TableName: model._tableName()
		};

	options || ( options = {} );
	wrapComplete( model, options );
	_.extend( params, options.dynamodb );

	if ( options.serializeDates !== false ) {
		// If the hash and/or range attributes are `Date` instance they must be serialized before sending the request.
		serializeAllDates( model, params.Key );
	}

	request = dynamo().getItem( params );

	request.on('complete', function (response) {
		var ctx = options.context || model;

		if ( !response.error && _.isEmpty( response.data.Item ) ) {
			// If the returned Item is empty, set a NotFound error.
			response.error = { code: 'NotFound' };
		}

		if ( response.error ) {
			deferred.rejectWith( ctx, [ response, options ] );
		} else {
			/**
			 * Backbone's "internal" success callback takes the model's attribute as the first argument.
			 * Make the entire AWS `response` available as `options.awsResponse`.
			 * `Date` attributes are deserialized here.
			 */
			options.awsResponse = response;
			deserializeAllDates( model, response.data.Item );
			deferred.resolveWith( ctx, [ response.data.Item, options ] );
		}
	});
	request.send();

	deferred.done( options.success ).fail( options.error ).always( options.complete );

	return deferred.promise( request );
}

/**
 * Retrieves a collection of Backbone.DynamoDB.Models from a DynamoDB table using a Query or Scan request.
 * 
 * @param {Backbone.DynamoDB.Collection} collection The collection instance.
 * @param {Object} options The options object.
 */
function fetchCollection(collection, options) {
	options || ( options = {} );

	var request,
		deferred = new _.Deferred(),
		// Determine the type of request: Query or Scan. Default is Scan.
		fetchType = options.query ? 'query' : 'scan',
		params = { TableName: collection._tableName() };

	wrapComplete( collection, options );
	_.extend( params, options[ fetchType ], options.dynamodb );

	// Create the Query or Scan request
	request = dynamo()[ fetchType ]( params );

	request.on('complete', function (response) {
		var dummyModel,
			ctx = options.context || collection;

		if ( response.error ) {
			deferred.rejectWith( ctx, [ response, options ] );
		} else {
			/**
			 * Backbone's "internal" success callback takes an array of models/objects as the first argument.
			 * Make the entire AWS `response` available as `options.awsResponse`.
			 * `Date` attributes are deserialized here.
			 */
			options.awsResponse = response;
			dummyModel = new collection.model();
			_.each(response.data.Items, function (item) {
				deserializeAllDates( dummyModel, item );
			});
			deferred.resolveWith( ctx, [ response.data.Items, options ] );
		}
	});
	request.send();

	deferred.done( options.success ).fail( options.error ).always( options.complete );

	return deferred.promise( request );
}

/**
 * Sync function for all Backbone requests: save, destroy, and fetch.
 */
function sync(method, instance, options) {
	if ( method === 'delete' ) {
		return deleteItem( instance, options );
	} else if ( method === 'create' || method === 'update' ) {
		return putItem( instance, options );
	} // `method` equals 'read' below this point

	if ( instance instanceof Backbone.DynamoDB.Collection ) {
		return fetchCollection( instance, options );
	}

	return getItem( instance, options );
}

/**
 * Convenience method to get the key attribute(s) (hash and/or range) of a model.
 * To call this method use: key.call( model )
 */
function key() {
	var hashName = _.result( this, 'hashAttribute' ) || _.result( this, 'idAttribute' ),
		rangeNake = _.result( this, 'rangeAttribute' );

	return this.pick( hashName, rangeNake );
}

/**
 * Determines if a value is an instance of Backbone.Model or Backbone.Collection.
 */
function isBackboneInstance(value) {
	return value instanceof Backbone.Model || value instanceof Backbone.Collection;
}

function isScalar(value) {
	var t = typeof value;
	// TODO: Add a check like the following one when adding support for browsers
	// (value instanceof(Uint8Array) && AWS.util.isBrowser())
	return t === 'number' || t === 'string' || t === 'boolean' || value === null || value instanceof Buffer;
}

function isRecursive(value) {
	return Array.isArray( value ) || typeof value === 'object';
}

/**
 * Recursively serializes all `Date` values in an object.
 *
 * @param {Backbone.DynamoDB.Model} model 
 * @param {Object} json
 */
function serializeAllDates(model, json) {
	_.each(json, function (value, name) {
		if ( _.isDate( value ) ) {
			json[ name ] = model.serializeDate( name, value );
		} else if ( !isScalar( value ) && !isBackboneInstance( value ) && isRecursive( value ) ) {
			serializeAllDates( model, value );
		}
	});

	return json;
}

/**
 * Recursively deserializes all date values in an object.
 *
 * @param {Backbone.DynamoDB.Model} model 
 * @param {Object} json
 */
function deserializeAllDates(model, json) {
	_.each(json, function (value, name) {
		if ( !_.isDate( value ) && !isBackboneInstance( value ) ) {
			if ( _.isString( value ) && model.isSerializedDate( name, value ) ) {
				json[ name ] = model.deserializeDate( name, value );
			} else if ( !isScalar( value ) && isRecursive( value ) ) {
				deserializeAllDates( model, value );
			}
		}
	});

	return json;
}

/**
 * Determines the name of the table for the Model or Collection instance.
 * It returns the instance's `tableName` property, if it has one. Otherwise,
 * it determines the name using the `urlRoot` property, if it's a Model, or the
 * `url` property if it's a Collection.
 */
function _tableName() {
	if ( this.tableName ) {
		return _.result( this, 'tableName' );
	}

	var urlAttributeName = this instanceof Backbone.DynamoDB.Model ? 'urlRoot' : 'url',
		table = _.result( this, urlAttributeName ).replace( /^\//, '' );

	return table.charAt( 0 ).toUpperCase() + table.substr( 1 );
}

/**
 * Make the following properties available through `Backbone.DynamoDB`:
 * 
 *    * config: Same as the `AWS.config` instance.
 *    * BinToStr: Convenience function to convert binary data into a string.
 *    * StrToBin: Convenience function to convert a string into binary data.
 */
Backbone.DynamoDB = {
	config: AWS.config,
	BinToStr: function() {
		var dyn = dynamo();
		return dyn.BinToStr.apply( dyn, arguments );
	},
	StrToBin: function() {
		var dyn = dynamo();
		return dyn.StrToBin.apply( dyn, arguments );
	}
};

Backbone.DynamoDB.Model = Backbone.Model.extend({
	sync: sync,
	_tableName: _tableName,
	/**
	 * Overwrite the constructor to deserialize all date values before the attributes are set.
	 */
	constructor: function (attributes, options) {
		deserializeAllDates( this, attributes );
		Backbone.Model.call( this, attributes, options );
	},
	/**
	 * Helps you define a type for a given attribute. This helps you have nested Models/Collections.
	 * It forces the specified attribute to be an instance of the specified `Constructor`.
	 * Sets a listener to check if the attribute is an instance of `Constructor` whenever the attribute is changed.
	 * If it's not an instance of `Constructor`, it instantiates the `Constructor` (passing the current attribute's value)
	 * and sets that instance as the value of such attribute.
	 *
	 * @param {String} name Name of the attribute.
	 * @param {Function} Constructor 
	 */
	setAttributeType: function (name, Constructor) {
		function changeCallback(model, value, options) {
			if ( value && !( value instanceof Constructor ) ) {
				this.set( name, new Constructor( value ), options );
			}
		}

		changeCallback.call( this, this, this.get( name ) );
		this.on( 'change:' + name, changeCallback, this );
	},
	/**
	 * Overwrite this method to dynamically generate key attribute(s). When a model is saved,
	 * this method is called if the model is new (if it doesn't have a hash and/or range key).
	 *
	 * @param {Object} options The options used in `save` are used as the first argument here.
	 * @return {AnyValue|Object|Promise<AnyValue>|Promise<Object>} If this method is overwritten,
	 *    it can return any of the following options:
	 *       * AnyValue. If the model doesn't use a range attribute, and the hash attribute can be
	 *           generated synchronously, this function can return any value. However, its type must
	 *           match the type of the primary hash key attribute defined in DynamoDB. For instance:
	 *           If the table uses a Number as the primary hash key, this function must return an
	 *           integer or a float number.
	 *       * Object. If the model uses a range attribute, and the key (hash and range attributes)
	 *           can be generated synchronously, this function can return an object containing the
	 *           hash and range attributes. The type of both attributes must match the DynamoDB table definition.
	 *       * Promise<AnyValue>. If the model doesn't use a range attribute, and the hash attribute
	 *           CAN'T be generated synchronously, this function can return a jQuery-style Promise,
	 *           that when resolved it provides AnyValue to the `done` callback. This has only been
	 *           tested with promises provided by [underscore.deferred](https://www.npmjs.com/package/underscore.deferred).
	 *       * Promise<Object>. If the model uses a range attribute, and the key (hash and range attributes)
	 *           CAN'T be generated synchronously, this function can return a jQuery-style Promise,
	 *           that when resolved it provides an Object to the `done` callback. This has only been
	 *           tested with promises provided by [underscore.deferred](https://www.npmjs.com/package/underscore.deferred).
	 */
	newKey: function (options) {},
	/**
	 * Determines if the model is new.
	 */
	isNew: function() {
		var hashKey = _.result( this, 'hashAttribute' ) || _.result( this, 'idAttribute' ),
			rangeKey = _.result( this, 'rangeAttribute' ),
			hashValue = this.get( hashKey ),
			rangeValue = rangeKey ? this.get( rangeKey ) : null;

		return hashValue == null || ( rangeKey && rangeValue == null );
	},
	/**
	 * Similar to Backbone's original `toJSON` method but performs the following additional tasks:
	 *
	 *    * "Picks" or "omits" attributes if the attributes `pick` or `omit` are present in `options`.
	 *    * Serializes all `Date` attributes into strings if `options.serializeDates` is `true`.
	 *    * Attributes that are Models or Collections are converted into objects and arrays respectively.
	 *
	 * Important: When saving a model, using `model.save( attributes, options )`, `toJSON` is called, with the same
	 * `options`, to convert the model into an object before saving it. Therefore you can "pick" or "omit"
	 * the attributes to be saved to DynamoDB. For instance, `user.save( null, { omit: 'password' } )` would save
	 * all attributes present in the `user` model except for the "password" attribute.
	 *
	 * @method toJSON
	 * @param {Object} [options]
	 * @param {String|Array} [options.pick] If specified, the returned object would contain only attributes listed in this array.
	 *		It uses [`_.pick`](http://documentcloud.github.io/underscore/#pick) to filter the attributes.
	 * @param {String|Array} [options.omit] If specified, attributes listed in this array will be omitted from the returned object.
	 *		It uses [`_.omit`](http://documentcloud.github.io/underscore/#omit) to omit attributes.
	 * @param {Boolean} [options.serializeDates] If it's `true`, it converts all `Date` instances to strings.
	 * @return {Object} Returns a copy of this model's attributes.
	 */
	toJSON: function (options) {
		var args = _.toArray( arguments ),
			/**
			 * `clone`, which is the [npm library](https://www.npmjs.com/package/clone), should not be confused with
			 * `_.clone`, which doesn't support deep cloning of objects and arrays.
			 */
			json = clone( this.attributes );

		if ( options ) {
			if ( options.pick ) {
				json = _.pick( json, options.pick );
			} else if ( options.omit ) {
				json = _.omit( json, options.omit );
			}

			if ( options.serializeDates === true ) {
				serializeAllDates( this, json );
			}
		}

		_.each(json, function (value, key) {
			// Convert nested Models and Collections to objects
			if ( isBackboneInstance( value ) ) {
				json[ key ] = value.toJSON.apply( value, args );
			}
		});

		return json;
	},
	/**
	 * Converts a `Date` instance into string.
	 *
	 * This method is called once for each `Date` instance in the model's attributes,
	 * prior to saving the model to DynamoDB.
	 * The default behaviour is to call the date's `toISOString` method.
	 * Overwrite this method to customize how `Date` instances are serialized according to your needs,
	 * you might also need to overwrite `deserializeDate`, `isSerializedDate`, and/or `serializedDateExp`.
	 *
	 * The serialization process is recursive, therefore this method is also called for nested `Date` instances.
	 *
	 * @param {String} name The name of the `Date` attribute.
	 * @param {Date} value The `Date` instance to convert to a string.
	 * @param {String} The serialized date.
	 */
	serializeDate: function (name, value) {
		return value.toISOString();
	},
	/**
	 * Converts a string representation of a date into an instance of `Date`.
	 *
	 * When a model is fetched from DynamoDB, this method is called once for each date attribute
	 * in the model's attributes to convert dates from their string representations into instances of `Date`.
	 * The default behaviour is to instantiate a `Date` using the provided string value.
	 * Overwrite this method to customize how date strings are deserialized according to your needs,
	 * you might also need to overwrite `serializeDate`, `isSerializedDate`, and/or `serializedDateExp`.
	 *
	 * The deserialization process is recursive, therefore this method is also called for nested date values.
	 *
	 * @param {String} name The name of the `Date` attribute.
	 * @param {String} value The date, as string, to convert into an instance of `Date`.
	 * @param {Date} An instance of `Date`.
	 */
	deserializeDate: function (name, value) {
		return new Date( value );
	},
	/**
	 * Determines if a string value is a serialized date.
	 *
	 * When a model is fetched from DynamoDB, this method is used to determine if any of the attributes are
	 * serialized dates. The default behaviour is to return `true` if the given string `value` is in an
	 * ISO8601 format, which is what the `Date.toISOString` method uses. Overwrite this method to customize how
	 * date strings are deserialized according to your needs, you might also need to overwrite `serializeDate`,
	 * `deserializeDate`, and/or `serializedDateExp`.
	 *
	 * @param {String} name The name of the attribute.
	 * @param {String} value The string value to check if it's a serialized date.
	 * @param {Boolean}
	 */
	isSerializedDate: function (name, value) {
		var exp = _.result( this, 'serializedDateExp' );
		return exp.test( value );
	},
	/**
	 * A regular expression that matches the ISO8601 date format.
	 * This is used internally by the `isSerializedDate` method.
	 */
	serializedDateExp: /^\d{4}(-\d{2}){2}T\d{2}(:\d{2}){2}\.\d{3}Z$/,
	/**
	 * Generates conditions for Query or Scan requests.
	 * It uses [dynamodb-doc Condition](https://github.com/awslabs/dynamodb-document-js-sdk#condition-object)
	 * to generate the conditions.
	 * If `val1` or `val2` are instances of `Date`, they're serialized before creating the condition.
	 *
	 * @param {String} name Attribute name.
	 * @param {String} operator
	 * @param val1
	 * @param val2
	 * @return A "dynamo-doc" Condition instance.
	 */
	condition: function (name, operator, val1, val2) {
		var args = _.toArray( arguments );
		if ( _.isDate( args[ 2 ] ) ) {
			args[ 2 ] = this.serializeDate( name, args[ 2 ] );
		}
		if ( _.isDate( args[ 3 ] ) ) {
			args[ 3 ] = this.serializeDate( name, args[ 3 ] );
		}

		return dynamo().Condition.apply( null, args );
	}
});

Backbone.DynamoDB.Collection = Backbone.Collection.extend({
	sync: sync,
	_tableName: _tableName,
	model: Backbone.DynamoDB.Model,
	/**
	 * Sends a "Query" request to DynamoDB to "fetch" a collection.
	 *
	 * @param {Object} dynamoDbParams DynamoDB [query](http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/DynamoDB.html#query-property) parameters.
	 * @param {Object} options Additional `fetch` options.
	 */
	query: function (dynamoDbParams, options) {
		var _options = { query: dynamoDbParams };
		_.extend( _options, options );
		return this.fetch( _options );
	},
	/**
	 * Sends a "Scan" request to DynamoDB to "fetch" a collection.
	 *
	 * @param {Object} dynamoDbParams DynamoDB [scan](http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/DynamoDB.html#scan-property) parameters.
	 * @param {Object} options Additional `fetch` options.
	 */
	scan: function (dynamoDbParams, options) {
		var _options = { scan: dynamoDbParams };
		_.extend( _options, options );
		return this.fetch( _options );
	}
});

module.exports = Backbone;