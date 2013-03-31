backbone-dynamodb
=================

Server side Backbone.js sync implementation for DynamoDB.

Installation
------------

Execute the following command at the root of your project:

	npm install backbone-dynamodb

AWS Credentials
---------------

You can set the AWS credentials and region using any of the following methods:

1.	Manually:
	
		Backbone.DynamoDB.setup('accessKeyID', 'secretAccessKey', 'awsRegion');

2.	Setting the following environment variables. There's no need to call the `setup()` method, it would get those
	values automatically:
	* `AWS_ACCESS_KEY_ID`
	* `AWS_SECRET_ACCESS_KEY`
	* `AWS_REGION`

3.	Using an IAM Role. To use IAM Role credentials just [assign a role to the EC2](http://docs.amazonwebservices.com/AWSEC2/latest/UserGuide/UsingIAM.html#UsingIAMrolesWithAmazonEC2Instances) instance when you launch it.
	backbone-dynamodb will automatically get the credentials from the [EC2 metadata service](http://docs.amazonwebservices.com/AWSEC2/latest/UserGuide/AESDG-chapter-instancedata.html).
	There's no need to call the `setup()` method, it would get those values automatically, however, if you don't want
	to use the default AWS region (`us-east-1`), you can call the `setup()` method to specify the region you want to use,
	just set the first two arguments to `null`:

		Backbone.DynamoDB.setup(null, null, 'us-west-1');



`Backbone.DynamoDB.Model`
-------------------------

### The `id` attribute

If the a `model` is new (`isNew()`), meaning that an `id` has not been assigned, an UUID string value is generated and set as the `id` when calling the `save()` method.

### `extend(options)`

* `idAttribute`: Specifies the name of the attribute that is the `HashKeyElement`. The default value is `id`.
* `rangeAttribute`: Specifies the name of the attribute that is the `RangeKeyElement`. Only needed if the table has a `RangeKeyElement`.
* `tableName`: The name of the table to use.
* `urlRoot`: If no `tableName` is given, the value of `urlRoot` is used to determine the name of the table. First, the `'/'` at the beginning, if any, is removed, then the first character is switched to upper case. For instance: if `urlRoot` is `'/users'`, the table name is `'Users'`

`Backbone.DynamoDB.Collection`
-------------------------

### `extend(options)`

* `tableName`: The name of the table to use.
* `url`: If no `tableName` is given, the value of `url` is used to determine the name of the table. First, the `'/'` at the beginning, if any, is removed, then the first character is switched to upper case. For instance: if `url` is `'/users'`, the table name is `'Users'`

### `fetch(options)`

When fetching a collection you can use a DynamoDB [Query](http://docs.amazonwebservices.com/amazondynamodb/latest/developerguide/API_Query.html) or [Scan](http://docs.amazonwebservices.com/amazondynamodb/latest/developerguide/API_Scan.html) operation. To use a Query operation set the body of the DynamoDB request in `options.query`. To use a Scan operation set the body of the DynamoDB request in `options.scan`. You don't need to set the `TableName` in either one, it is automatically added to the request body.


`save`, `destroy`, `fetch`, and their callbacks
-----------------------------------------------

The following applies to both `Backbone.DynamoDB.Model` and `Backbone.DynamoDB.Collection`

### `options.dynamodb`

When calling `save(attributes, options)`, `destroy(options)`, or `fetch(options)` the DynamoDB request body is automatically generated. You can extend the request body using the `options.dynamodb`. For instance, you can set the DynamoDB `ConsistentRead` option:

	model.fetch({
		dynamodb: {
			ConsistentRead: true
		}
		// Other options here
	});

### DynamoDB Response

The DynamoDB response is provided to the `success(model, response)`, `error(model, response)`, and `complete(model, response)` callbacks in `response.dynamodb`.

### `options.context`

Similar to the `context` setting in [jQuery.ajax](http://api.jquery.com/jQuery.ajax/#jQuery-ajax-settings), setting the `options.context` when calling `save(attributes, options)`, `destroy(options)`, or `fetch(options)`, will make all callback functions to be called within the given context. In other words, the value of `this`, within the callbacks, will be the given `options.context`.

#### `complete(model, response)`

The `options.complete` callback, if specified, is called after either `options.success` or `options.error` has been called.

Examples
--------

	var Backbone = require('backbone-dynamodb');
	var fs = require('fs');

	var Book = Backbone.DynamoDB.Model.extend({
		idAttribute: 'isbn', // The HashKeyElement
		urlRoot: '/books' // Table name: 'Books'
	});
	var Books = Backbone.DynamoDB.Collection.extend({
		model: Book,
		url: '/books'
	});

	var Comment = Backbone.DynamoDB.Model.extend({
		idAttribute: 'isbn', // The HashKeyElement
		rangeAttribute: 'date', // The RangeKeyElement
		tableName: 'BookComments', // Table name: 'BookComments'
		urlRoot: '/bookcomments'
	});
	var Comments = Backbone.DynamoDB.Collection.extend({
		model: Comment,
		tableName: 'BookComments', // Table name: 'BookComments'
		url: '/bookcomments'
	});

	var book1 = new Book({
		isbn: 9780641723445,
		category: ['book','hardcover'],
		title: 'The Lightning Thief',
		author: 'Rick Riordan',
		genre: 'fantasy',
		inStock: true,
		price: 12.50,
		pages: 384,
		publishedDate: new Date(2012, 0, 1) // Date instances are converted into ISO8601 date strings
	});
	book1.save({}, {
		// The original DynamoDB response is available in response.dynamodb
		success: function(book, response) {
			// response.dynamodb would be something like: {ConsumedCapacityUnits: 1}
		},
		error: function(book, response) {},
		complete: function(book, response) {}
	});

	var book2 = new Book({isbn: 9781857995879});
	book2.fetch({
		dynamodb: {
			ConsistentRead: true
		},
		success: function(book, response) {
			// Do something here
		},
		error: function(book, response) {
			// response = {code: 'NotFound'} if the book was not found
		}
	});

	var lastYearBooks = new Books();
	// fetch all books published in 2011
	lastYearBooks.fetch({
		scan: { // Use a DynamoDB 'Scan' operation
			// No need to specify TableName
			ScanFilter: {
				publishedDate: {
					AttributeValueList: [
						{S: new Date(2011, 0, 1)},
						{S: new Date(2011, 11, 31)}
					],
					ComparisonOperator: 'BETWEEN'
				}
			},
			Limit: 100
		},
		success: function(books, response) {},
		error: function(books, response) {}
	});

	var comments = new Comments();
	// Fetch all comments posted after January 31th for the book with ISBN: 9781857995879
	comments.fetch({
		query: { // Use a DynamoDB 'Query' operation
			// No need to specify TableName
			HashKeyValue: {N: '9781857995879'},
			RangeKeyCondition: {
				AttributeValueList: [{S: new Date(2012, 0, 31)}],
				ComparisonOperator: 'GT'
			},
			ConsistentRead: true
		},
		success: function(comments, response) {},
		error: function(comments, response) {}
	});


	// Use a `Buffer` instance to store binary data
	fs.readFile(__dirname + '/cover.png', function(error, data) { // data is an instance of `Buffer`
		new Book({
			isbn: 9781933988177,
			cat: ['book','paperback'],
			name: 'Lucene in Action, Second Edition',
			author: 'Michael McCandless',
			sequence_i: 1,
			genre_s: 'IT',
			inStock: true,
			price: 30.50,
			pages_i: 475,
			published_date: new Date(2012, 0, 4),
			coverImage: data
		}).save({}, {
			success: function(book, response) {},
			error: function(book, response) {},
			complete: function(book, response) {}
		});
		// Note: Binary sets are also supported. Just set an attribute's value to an array of `Buffer` instances.
	});