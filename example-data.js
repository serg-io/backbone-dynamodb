/**
 * This module contains two functions that generate random data for the examples/tests functions in examples.js.
 */
var faker = require( 'faker' ),
	_ = require( 'underscore' ),
	moment = require( 'moment' ),
	request = require( 'request' );

_.mixin( require( 'underscore.deferred' ) );

/**
 * Generates an array of random events. Each event is in the following format:
 *
 *    {
 *       calendarId: 1,
 *       date: new Date(), // A `Date` instance for some time yesterday, today, or tomorrow
 *       title: 'Random title'
 *    }
 */
exports.events = function () {
	var events = [],
		today = moment().startOf( 'day' ),
		tomorrow = moment( today ).add( 1, 'days' ),
		yesterday = moment( today ).subtract( 1, 'days' );

	_.each([ yesterday, today, tomorrow ], function (date) {
		var hour;

		for ( hour = 10; hour < 14; hour++ ) {
			events.push({
				calendarId: faker.random.number() + faker.random.number() + 1,
				date: moment( date ).hour( hour ).toDate(),
				title: faker.lorem.sentence()
			});
		}
	});

	return events;
};

/**
 * Returns a promise that when it's resolved, provides an array of 20 randomly generated contacts.
 * Each contact is in the following format:
 * 
 *    {
 *       firstName: 'Random name',
 *       lastName: 'Random name',
 *       dateOfBirth: new Date(), // A `Date` instance for a random date in the past
 *       isMale: false,
 *       addresses: [], // An array of objects containing: type, line1, line2 (optional), city, state, zip
 *       phones: [], // An array of objects containing: type and number
 *       emails: [], // An array of objects containing: type and address
 *       note: null, // Optional. If present it could be `null` or an object containing: lastUpdatedAt (a `Date` in the past) and note
 *       avatar: new Buffer() // Optional. If present, it would be a Buffer containing the bytes of an actual image
 *    }
 */
exports.contacts = function() {
	var contacts = [],
		promises = [];

	_.times(20, function (i) {
		var deferred,
			contact = {
				firstName: faker.name.firstName(),
				lastName: faker.name.lastName(),
				dateOfBirth: faker.date.past(),
				isMale: faker.random.boolean(),
				addresses:[{
					type: 'home',
					line1: faker.address.streetAddress(),
					city: faker.address.city(),
					state: faker.address.stateAbbr(),
					zip: faker.address.zipCode()
				}],
				phones: [{
					type: 'home',
					number: faker.phone.phoneNumberFormat()
				}],
				emails: [{
					type: 'home',
					address: faker.internet.email()
				}]
			};

		if ( faker.random.boolean() ) {
			contact.addresses[ 0 ].line2 = faker.address.secondaryAddress();
		}

		if ( faker.random.boolean() ) {
			contact.addresses.push({
				type: 'work',
				line1: faker.address.streetAddress(),
				city: faker.address.city(),
				state: faker.address.stateAbbr(),
				zip: faker.address.zipCode()
			});

			if ( faker.random.boolean() ) {
				contact.addresses[ 1 ].line2 = faker.address.secondaryAddress();
			}
		}

		if ( faker.random.boolean() ) {
			contact.phones.push({
				type: 'work',
				number: faker.phone.phoneNumberFormat()
			});
		}

		if ( faker.random.boolean() ) {
			contact.emails.push({
				type: 'work',
				address: faker.internet.email()
			});
		}

		if ( faker.random.boolean() ) {
			contact.note = {
				lastUpdatedAt: faker.date.past(),
				note: faker.lorem.sentences()
			};
		} else if ( faker.random.boolean() ) {
			contact.note = null;
		}

		if ( faker.random.boolean() ) {
			deferred = new _.Deferred();
			promises.push( deferred.promise() );

			/**
			 * Get an image, using a HTTP request, and use the response `body` (an instance of `Buffer`)
			 * as the `avatar` attribute.
			 */
			request({ url: faker.internet.avatar(), encoding: null }, function (error, response, body) {
				if ( !error ) {
					contact.avatar = body;
				}

				deferred.resolve();
			});
		}

		contacts.push( contact );
	});

	if ( promises.length === 0 ) {
		return new _.Deferred().resolve( contacts ).promise();
	} else if ( promises.length === 1 ) {
		return promises[ 0 ].then(function() {
			return contacts;
		});
	} else {
		return _.when( promises ).then(function() {
			return contacts;
		});
	}
};