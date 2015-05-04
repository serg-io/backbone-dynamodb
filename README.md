backbone-dynamodb
=================

This library allows you to store Backbone models in Amazon DynamoDB. It uses
[dynamodb-doc](https://www.npmjs.com/package/dynamodb-doc) to provide support for all the data types
available in DynamoDB, including support for full [JSON documents](https://aws.amazon.com/blogs/aws/dynamodb-update-json-and-more/).
These are the data types supported by this library:

* Number
* String
* Boolean
* Null
* Binary data (instances of [`Buffer`](https://nodejs.org/api/buffer.html))
* Objects (including nested objects)
* Arrays (including arrays of objects)
* Models (stored as objects)
* Collections (stored as arrays)
* `Date` instances (stored as strings)


Installation
------------
Execute the following command at the root of your project:

	npm install backbone-dynamodb


AWS-SDK Configuration
---------------------
backbone-dynamodb uses the AWS-SDK. Visit [this page](http://docs.aws.amazon.com/AWSJavaScriptSDK/guide/node-configuring.html)
for details on how to configure the AWS-SDK. You can also manually configure it using the `config`
object. For instance:

	Backbone.DynamoDB.config.update({ region: 'us-east-1' });


-------------------


`Backbone.DynamoDB.Model`
-------------------------
Backbone.DynamoDB.Model is a subclass of Backbone's Model. The following properties and methods can
be overwritten according to your needs:

#### `idAttribute` ####

Specifies the name of the primary hash key attribute in DynamoDB. The default value is `id`.

#### `hashAttribute` ####

Specifies the name of the primary hash key attribute in DynamoDB. Use `hashAttribute` instead of
`idAttribute` if the model contains a primary **range** key attribute.

#### `rangeAttribute` ####

Specifies the name of the primary range key attribute in DynamoDB.

#### `tableName` ####

The exact name of the DynamoDB table to use.

#### `urlRoot` ####

If no `tableName` is given, the value of `urlRoot` is used to determine the name of the table.
First, the `'/'` at the beginning, if there is on, is removed, then the first character is switched
to upper case. For instance: if `urlRoot` is `'/users'`, the table name would be `'Users'`

#### `newKey( options )` ####

Overwrite this method to dynamically generate key attribute(s). When a model is saved, this method
is called if the model is new (if it doesn't have a hash and/or range key). The same `options` object
used when calling `save( options )` is passed to this method. This method must return one of the
following options:

* Any value. If the model doesn't use a range attribute, and the hash attribute can be generated
  synchronously, this function can return any value. However, its type must match the type of the
  primary hash key attribute defined in DynamoDB. For instance: If the table uses a Number as the
  primary hash key, this function must return an integer or a float number.
* Object. If the model uses a range attribute, and the key (hash and range attributes) can be
  generated synchronously, this function can return an object containing the hash and/or range
  attributes. The type of both attributes must match the DynamoDB table definition.
* Promise (Any value). If the model doesn't use a range attribute, and the hash attribute **can't**
  be generated synchronously, this function can return a jQuery-style Promise, that when resolved it
  provides a value to the `done` callback. This has only been tested with promises provided by
  [underscore.deferred](https://www.npmjs.com/package/underscore.deferred).
* Promise (Object). If the model uses a range attribute, and the key (hash and range attributes)
  **can't** be generated synchronously, this function can return a jQuery-style Promise, that when
  resolved it provides an Object to the `done` callback. This has only been tested with promises
  provided by [underscore.deferred](https://www.npmjs.com/package/underscore.deferred).

#### `toJSON( options )` ####

Similar to Backbone's original `toJSON` method but performs the following additional tasks:

* "Picks" or "omits" attributes if the attributes `pick` or `omit` are present in `options`.
* Serializes all `Date` attributes into strings if `options.serializeDates` is `true`.
* Converts attributes that are Models or Collections into objects and arrays respectively.

When saving a model, using `model.save( attributes, options )`, `toJSON` is called, with the same
`options`, to convert the model into an object before saving it. Therefore you can "pick" or "omit"
the attributes to be saved to DynamoDB. For instance, `user.save( null, { omit: 'password' } )`
would save all attributes present in the `user` model except for the "password" attribute.

#### `serializeDate( name, date )` ####

Converts a `Date` instance into string.

This method is called once for each `Date` instance in the model's attributes, prior to saving the
model to DynamoDB. The default behaviour is to call the date's `toISOString` method. Overwrite this
method to customize how `Date` instances are serialized according to your needs, you might also need
to overwrite `deserializeDate`, `isSerializedDate`, and/or `serializedDateExp`.

The serialization process is recursive, therefore this method is also called for nested `Date` instances.

#### `deserializeDate( name, string )` ####

Converts a string representation of a date into an instance of `Date`.

When a model is fetched from DynamoDB, this method is called once for each date attribute in the
model's attributes to convert dates from their string representations into instances of `Date`.
The default behaviour is to instantiate a `Date` using the provided string value. Overwrite this
method to customize how date strings are deserialized according to your needs, you might also need
to overwrite `serializeDate`, `isSerializedDate`, and/or `serializedDateExp`.

The deserialization process is recursive, therefore this method is also called for nested date values.

#### `isSerializedDate( name, string )` ####

Determines if a string value is a serialized date.

When a model is fetched from DynamoDB, this method is used to determine if any of the attributes are
serialized dates. The default behaviour is to return `true` if the given string `value` is in an
ISO8601 format, which is what the `Date.toISOString` method uses. Overwrite this method to customize how
date strings are deserialized according to your needs, you might also need to overwrite `serializeDate`,
`deserializeDate`, and/or `serializedDateExp`.

#### `condition( name, operator, val1, val2 )` ####

Generates conditions for Query or Scan requests.

It uses [dynamodb-doc Condition](https://github.com/awslabs/dynamodb-document-js-sdk#condition-object)
to generate the conditions. If `val1` or `val2` are instances of `Date`, they're serialized before
creating the condition.

#### `setAttributeType( name, Constructor )` ####

Helps you define a type for a given attribute. This helps you have nested Models/Collections. It
forces the specified attribute to be an instance of the specified `Constructor`. Sets a listener to
check if the attribute is an instance of `Constructor` whenever the attribute is changed. If it's
not an instance of `Constructor`, it instantiates the `Constructor` (passing the current attribute's
value) and sets that instance as the value of such attribute.


-------------------


`Backbone.DynamoDB.Collection`
------------------------------
`Backbone.DynamoDB.Collection` is a subclass of Backbone's Collection. The following properties and
methods can be overwritten according to your needs:

#### `tableName` ####

The exact name of the DynamoDB table to use.

#### `url` ####

If no `tableName` is given, the value of `url` is used to determine the name of the table.
First, the `'/'` at the beginning, if there is on, is removed, then the first character is
switched to upper case. For instance: if `url` is `'/users'`, the table name would be `'Users'`


#### `query( dynamoDbParams, options )` ####

Sends a "Query" request to DynamoDB to "fetch" a collection. The first argument are the parameters to
use in the [query](http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/DynamoDB.html#query-property)
request. The second argument are the options passed to the `fetch` method internally.

#### `scan( dynamoDbParams, options )` ####

Sends a "Scan" request to DynamoDB to "fetch" a collection. The first argument are the parameters to
use in the [scan](http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/DynamoDB.html#scan-property)
request. The second argument are the options passed to the `fetch` method internally.


-------------------


`model.save( attributes, options )`, `model.destroy( options )`, `model.fetch( options )`, and `collection.fetch( options )`
----------------------------------------------------------------------------------------------------------------------------

Similar to Backbone's original behaviour for these methods, backbone-dynamodb supports:

* `success` and `error` callbacks passed in the options argument.
* A `complete` callback that is executed after `success` or `error` callbacks have been executed.
* Returns an [AWS Request](http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/Request.html) with
  a jQuery-style promise interface applied to it.
  * The callbacks attached to the promise don't receive the first argument as their callback
    counterparts in the `options` object. For instance, the `options.success` callback passed to
    `model.fetch` receives `(model, dynamoDbItem, options)` as arguments, but the `done` callback
    that are attached to the returned promise only receive `(dynamoDbItem, options)` as arguments.

#### `options.context` ####

Similar to the `context` setting in [jQuery.ajax](http://api.jquery.com/jQuery.ajax/#jQuery-ajax-settings),
setting the `options.context` when calling `save( attributes, options )`, `destroy( options )`, or
`fetch( options )`, will make all callback functions to be called within the given context. In other
words, the value of `this`, within all callbacks, will be the given `options.context`.

#### `options.complete( modelOrCollection, response )` ####

Similar to the `complete` setting in [jQuery.ajax](http://api.jquery.com/jQuery.ajax/#jQuery-ajax-settings),
the `options.complete` callback, if specified, is called after either `options.success` or `options.error`
have been called.

#### `options.dynamodb` ####

When calling `save( attributes, options )`, `destroy( options )`, or `fetch( options )` the DynamoDB
request body is automatically generated. You can extend the request body using the `options.dynamodb`.
For instance, you can set the DynamoDB `ConsistentRead` option:

	model.fetch({
		dynamodb: {
			ConsistentRead: true
		}
		// Other options here
	});

#### AWS Response ####

The actual [AWS response](http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/Response.html) object
is provided to the all callbacks as `options.awsResponse`.


-------------------


Examples
--------

Several examples on how to use backbone-dynamodb can be found in the examples.js file