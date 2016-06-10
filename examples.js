/**
 * These are just a few basic examples of how to use backbone-dynamodb.
 * These examples are written as nodeunit tests. To run this script use:
 * 
 *    nodeunit examples.js
 * 
 * 
 * IMPORTANT: Before running these examples, create the following DynamoDB table in your account.
 * 
 *      Table Name      Primary hash key      Primary range key
 *     AtomicCounters      id (string)
 *       Contacts          id (number)
 *       MyEvents      calendarId (number)      date (string)
 */

var _ = require( 'underscore' ),
	moment = require( 'moment' ),
	data = require( './example-data' ),
	Backbone = require( './backbone-dynamodb' ),
	atomicCounter = require( 'dynamodb-atomic-counter' );

_.mixin( require( 'underscore.deferred' ) );

/**
 * backbone-dynamodb uses AWS-SDK. Visit the following page for details on how to configure AWS-SDK:
 *    http://docs.aws.amazon.com/AWSJavaScriptSDK/guide/node-configuring.html
 *
 * You can also manually configure it using the `config` object.
 */
Backbone.DynamoDB.config.update({ region: 'us-east-1' });


var CONTACTS_DATA,
	EVENTS_DATA = data.events();


var Contact = Backbone.DynamoDB.Model.extend({
	// No need to overwrite idAttribute or hashAttribute. Use the default: 'id'.
	/**
	 * The name of the table is automatically determined based on the urlRoot property.
	 * In this case, the name of the table would be "Contacts".
	 */
	urlRoot: '/contacts',
	/**
	 * Use [dynamodb-atomic-counter](https://www.npmjs.com/package/dynamodb-atomic-counter)
	 * to generate auto-incremented IDs.
	 */
	newKey: function(options) {
		return atomicCounter.increment( this._tableName() );
	}
});
var Contacts = Backbone.DynamoDB.Collection.extend({
	/**
	 * The name of the table is automatically determined based on the url property.
	 * In this case, the name of the table would be "Contacts".
	 */
	url: '/contacts',
	model: Contact
});

var Event = Backbone.DynamoDB.Model.extend({
	/**
	 * The name of the primary hash key attribute.
	 * If a model has a range attribute, make sure to use `hashAttribute` instead of `idAttribute`.
	 */
	hashAttribute: 'calendarId',
	/**
	 * The name of the primary range key attribute.
	 */
	rangeAttribute: 'date',
	/**
	 * Using `tableName`, instead of `urlRoot`, to specify the "exact" name of the table
	 */
	tableName: 'MyEvents',
	initialize: function (attributes, options) {
		/**
		 * Use the helper method `setAttributeType` to ensure that the `attachments` attribute
		 * is an instance of `Backbone.DynamoDB.Collection`.
		 */
		this.setAttributeType( 'attachments', Backbone.DynamoDB.Collection );
	}
});
var Events = Backbone.DynamoDB.Collection.extend({
	model: Event,
	/**
	 * Using `tableName`, instead of `urlRoot`, to specify the "exact" name of the table
	 */
	tableName: 'MyEvents'
});


exports[ 'Auto-increment IDs using dynamodb-atomic-counter.' ] = function (test) {
	var count = 19,
		/**
		 * Wrap `test.done` inside another function so that it only gets called "after"
		 * all contacts have been saved.
		 */
		done = _.after( count, function() { test.done(); } );

	test.expect( count );

	// Generate random contacts data
	data.contacts().done(function (DATA) {
		CONTACTS_DATA = DATA; // An array of randonmly generated contacts

		/**
		 * Save only the first 19 contacts in DATA.
		 * The last contact in the array is left unsaved for the next test/example.
		 */
		_.chain( DATA ).first( count ).each(function (attributes) {
			var contact = new Contact( attributes );

			/**
			 * Save the contact to DynamoDB.
			 * Since it's a new contact (doesn't have an id), newKey is called right before
			 * saving it, which uses dynamodb-atomic-counter to generate an auto-incremented ID.
			 */
			contact.save().done(function (changedAttributes, options) {
				// changedAttributes would be something like: { id: 1 }
				test.ok( true );
			}).fail(function (response, options) {
				test.ok( false, 'Failed to save model to DynamoDB: ' + JSON.stringify( response.error ) + '.' );
			}).always( done );
		});
	});
};

var lastContactId;

exports[ 'Manually assigning an ID.' ] = function (test) {
	var attributes = _.last( CONTACTS_DATA ),
		contact = new Contact( attributes );

	test.expect( 1 );

	/**
	 * Use the existing `newKey` method to generate an ID.
	 * The id attribute can be set manually in any other way, it doesn't necessarily have to be this way.
	 */
	contact.newKey().then(function (contactId) {
		// Set the id attribute and `save` it
		return contact.save({ id: contactId }); // Returns a promise
	}).done(function (changedAttributes, options) {
		// No id attribute was generated during the saving process so changedAttributes would be an empty object {}
		test.ok( true );
		lastContactId = contact.id;
	}).fail(function (response, options) {
		test.ok( false, 'An error has occurred: ' + JSON.stringify( response.error ) + '.' );
	}).always(function () {
		test.done();
	});
};

exports[ 'Saving models with a number as hash key and a date as range key.' ] = function (test) {
	var events = new Events( EVENTS_DATA ),
		done = _.after( events.length, function() { test.done(); } );

	test.expect( events.length );

	events.each(function (event) {
		event.save().done(function (changedAttributes, options) {
			test.ok( true );
		}).fail(function (response, options) {
			test.ok( false, 'Failed to save model to DynamoDB: ' + JSON.stringify( response.error ) + '.' );
		}).always( done );
	});
};

exports[ 'Fetch a single model using ConsistentRead.' ] = function (test) {
	var contact = new Contact({ id: lastContactId }),
		/**
		 * Use ConsistentRead.
		 * All attributes inside `options.dynamodb` are added to the actual DynamoDB request parameters.
		 */
		options = {
			dynamodb: {
				ConsistentRead: true
			}
		};

	test.expect( 1 );

	contact.fetch( options ).done(function (dynamoDbItem, options) {
		var actualAvatar = contact.get( 'avatar' ),
			actualAttributes = contact.omit( 'id', 'avatar' ),
			expected = _.last( CONTACTS_DATA ),
			expectedAttributes = _.omit( expected, 'avatar' ),
			/**
			 * Check if all the attributes (except 'id' and 'avatar') are equal.
			 */
			equalAttributes = _.isEqual( expectedAttributes, actualAttributes ),
			/**
			 * If there's an avatar (instance of Buffer), check that they're equal.
			 */
			equalAvatars = expected.avatar ? expected.avatar.equals( actualAvatar ) : !contact.has( 'avatar' );

		test.ok( equalAttributes && equalAvatars, 'The received attributes don\'t match the expected attributes.' );
	}).fail(function (response, options) {
		test.ok( false, 'Failed to fetch model: ' + JSON.stringify( response.error ) + '.' );
	}).always(function () {
		test.done();
	});
};

exports[ 'Query using KeyConditions.' ] = function (test) {
	var dummyEvent = new Event(),
		pastEvents = new Events(),
		/**
		 * Query for all "past" events in calendar number 1
		 */
		dynamoDbParams = {
			/**
			 * KeyConditions can be a single condition object, for instance the following
			 * would query all events with a calendarId of 1:
			 *    KeyConditions: dummyEvent.condition( 'calendarId', 'EQ', 1 )
			 *
			 * KeyConditions can also be an array of conditions, as shown here.
			 */
			KeyConditions: [
				dummyEvent.condition( 'calendarId', 'EQ', 1 ),
				dummyEvent.condition( 'date', 'LT', new Date() )
			],
			ConsistentRead: true // optional
		};

	test.expect( 1 );

	pastEvents.query( dynamoDbParams ).done(function (dynamoDbItems, options) {
		var now = moment(),
			expected = _.filter(EVENTS_DATA, function (event) {
				return event.calendarId === 1 && now.isAfter( event.date );
			});

		test.equal( expected.length, pastEvents.length, 'Wrong number of models. Expected: ' + expected.length + '. Actual: ' + pastEvents.length + '.' );
	}).fail(function (response, options) {
		test.ok( false, 'An error occurred during the Query request: ' + JSON.stringify( response.error ) + '.' );
	}).always(function () {
		test.done();
	});
};

exports[ 'Query using KeyConditionExpression.' ] = function (test) {
	var dummyEvent = new Event(),
		futureEvents = new Events(),
		/**
		 * Query for all future events in calendar number 2
		 *
		 * All ExpressionAttributeValues, with the exception of `Date` values, are automatically converted.
		 * For instance, { ':id': 2 } becomes { ':id': { N: '2' } }
		 *
		 * Date values must be manually serialized as shown here.
		 */
		dynamoDbParams = {
			KeyConditionExpression: 'calendarId = :id AND #d > :now',
			ExpressionAttributeNames: {
				'#d': 'date'
			},
			ExpressionAttributeValues: {
				':id': 2,
				':now': dummyEvent.serializeDate( 'date', new Date() )
			},
			ConsistentRead: true // optional
		};

	test.expect( 1 );

	futureEvents.query( dynamoDbParams ).done(function (dynamoDbItems, options) {
		var now = moment(),
			expected = _.filter(EVENTS_DATA, function (event) {
				return event.calendarId === 2 && now.isBefore( event.date );
			});

		test.equal( expected.length, futureEvents.length, 'Wrong number of models. Expected: ' + expected.length + '. Actual: ' + futureEvents.length + '.' );
	}).fail(function (response, options) {
		test.ok( false, 'An error occurred during the Query request: ' + JSON.stringify( response.error ) + '.' );
	}).always(function () {
		test.done();
	});
};

exports[ 'Query using queryWhere.' ] = function (test) {
	var futureEvents = new Events(),
		monday = moment().startOf( 'week' ).add( 1, 'days' ).toDate(),
		sunday = moment().endOf( 'week' ).add( 1, 'days' ).toDate(),
		filter = {
			calendarId: 2,
			'date BETWEEN': [ monday, sunday ]
		};

	test.expect( 1 );

	futureEvents.queryWhere( filter ).done(function (dynamoDbItems, options) {
		var expected = _.filter(EVENTS_DATA, function (event) {
			return event.calendarId === 2 && moment( event.date ).isBetween( monday, sunday );
		});

		test.equal( expected.length, futureEvents.length, 'Wrong number of models. Expected: ' + expected.length + '. Actual: ' + futureEvents.length + '.' );
	}).fail(function (response, options) {
		test.ok( false, 'An error occurred during the Query request: ' + JSON.stringify( response.error ) + '.' );
	}).always(function () {
		test.done();
	});
};

exports[ 'Scan using ScanFilter.' ] = function (test) {
	var contacts = new Contacts(),
		dummyContact = new Contact(),
		/**
		 * Scan for all contacts where `isMale` equals `false`.
		 * ScanFilter can be a single condition, as shown here, or an array of conditions.
		 */
		dynamoDbParams = {
			ScanFilter: dummyContact.condition( 'isMale', 'EQ', false )
		};

	test.expect( 1 );

	contacts.scan( dynamoDbParams ).done(function (dynamoDbItems, options) {
		var expected = _.where( CONTACTS_DATA, { isMale: false } );

		test.equal( expected.length, contacts.length, 'Wrong number of models. Expected: ' + expected.length + '. Actual: ' + contacts.length + '.' );
	}).fail(function (response, options) {
		test.ok( false, 'An error occurred during the Scan request: ' + JSON.stringify( response.error ) + '.' );
	}).always(function () {
		test.done();
	});
};

exports[ 'Query using scanWhere.' ] = function (test) {
	var contacts = new Contacts(),
		filter = {
			isMale: false
		};

	test.expect( 1 );

	contacts.scanWhere( filter ).done(function (dynamoDbItems, options) {
		var expected = _.where( CONTACTS_DATA, { isMale: false } );

		test.equal( expected.length, contacts.length, 'Wrong number of models. Expected: ' + expected.length + '. Actual: ' + contacts.length + '.' );
	}).fail(function (response, options) {
		test.ok( false, 'An error occurred during the Scan request: ' + JSON.stringify( response.error ) + '.' );
	}).always(function () {
		test.done();
	});
};

exports[ 'Scan using FilterExpression.' ] = function (test) {
	var contacts = new Contacts(),
		/**
		 * Scan for all contacts where `isMale` equals `true`
		 * Note that { ':val': true } is automatically converted to { ':val': { BOOL: 'true' } }.
		 * Any `Date` values must be manually serialized.
		 */
		dynamoDbParams = {
			FilterExpression: 'isMale = :val',
			ExpressionAttributeValues: { ':val': true }
		};

	test.expect( 1 );

	contacts.scan( dynamoDbParams ).done(function (dynamoDbItems, options) {
		var expected = _.where( CONTACTS_DATA, { isMale: true } );

		test.equal( expected.length, contacts.length, 'Wrong number of models. Expected: ' + expected.length + '. Actual: ' + contacts.length + '.' );
	}).fail(function (response, options) {
		test.ok( false, 'An error occurred during the Scan request: ' + JSON.stringify( response.error ) + '.' );
	}).always(function () {
		test.done();
	});
};

exports[ 'Delete a single model.' ] = function (test) {
	var contact = new Contact({ id: lastContactId });

	test.expect( 1 );

	contact.destroy().done(function (response, options) {
		test.ok( true );
	}).fail(function (response, options) {
		test.ok( false, 'Failed to delete model: ' + JSON.stringify( response.error ) + '.' );
	}).always(function () {
		test.done();
	});
};

var _key;

exports[ 'Saving a model with a nested collection.' ] = function (test) {
	var eventAttributes = _.last( EVENTS_DATA ),
		/**
		 * Use the avatar in CONTACTS_DATA to generate an array of objects with two attributes:
		 *    fileName (string)
		 *    data (Buffer)
		 */
		attachmentsArray = _.chain( CONTACTS_DATA ).pluck( 'avatar' ).compact().first( 3 ).map(function (buffer) {
			return {
				fileName: 'image.jpg',
				data: buffer
			};
		}).value(),
		attachments = new Backbone.DynamoDB.Collection( attachmentsArray ),
		/**
		 * evant contains the attributes: calendarId, date, title, and attachments (a Collection)
		 */
		event = new Event( _.extend( eventAttributes, { attachments: attachments } ) );

	test.expect( 1 );

	// Save the key attributes for the next example/test
	_key = event.pick( 'calendarId', 'date' );

	event.save().done(function (changedAttributes, options) {
		test.ok( true );
	}).fail(function (response, options) {
		test.ok( false, 'Failed to save model to DynamoDB: ' + JSON.stringify( response.error ) + '.' );
	}).always(function () {
		test.done();
	});
};

exports[ 'Fetching a model with a nested collection.' ] = function (test) {
	// Use the _key from the previous example/test to fetch the model
	var event = new Event( _key );

	test.expect( 1 );

	event.fetch({
		dynamodb: {
			ConsistentRead: true
		}
	}).done(function (dynamoDbItem, options) {
		var attachments = event.get( 'attachments' );

		// Check that the attachments attributes is an instance of Backbone.DynamoDB.Collection
		test.ok( attachments instanceof Backbone.DynamoDB.Collection, 'The "attachments" attribute is not the expected type.' );
	}).fail(function (response, options) {
		test.ok( false, 'Error occurred when fetching model: ' + JSON.stringify( response.error ) + '.' );
	}).always(function () {
		test.done();
	});
};