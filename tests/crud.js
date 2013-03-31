/**
 * Use nodeunit to run this test.
 * Before running this test, create a table called 'Books' with 'isbn',
 * which is a number, as the hash key.
 */

var _ = require('underscore'),
	dataset = require('./dataset.js'),
	Backbone = require(__dirname + '/../');

// If AWS environment variables are not set, call the setup method.
// Backbone.DynamoDB.setup('accessKeyID', 'secretAccessKey', 'awsRegion');

var url = '/books';
var Book = Backbone.DynamoDB.Model.extend({
	idAttribute: 'isbn',
	urlRoot: url
});
var Books = Backbone.DynamoDB.Collection.extend({
	url: url,
	model: Book
});

exports.create = function(test) {
	var len = dataset.books.length,
		done = _.after(len, function() { test.done(); });
	test.expect(len);

	for (var i = 0; i < len; i++) {
		new Book(dataset.books[i]).save({}, {
			complete: done,
			success: function(book, response) {
				test.ok(true, book.id + ' - Saved');
			},
			error: function(book, error) {
				test.ok(false, book.id + ' - Error saving book: ' + JSON.stringify(error));
			}
		});
	}
};

exports.read = function(test) {
	var len = dataset.books.length,
		done = _.after(len, function() { test.done(); });
	test.expect(len);

	for (var i = 0; i < len; i++) {
		new Book({isbn: dataset.books[i].isbn}).fetch({
			dynamodb: {
				ConsistentRead: true
			},
			complete: done,
			success: function(book, response) {
				var expected = _.find(dataset.books, function(b) { return b.isbn === book.id; });

				test.ok(_.isEqual(expected, book.attributes), book.id + ' - Not equal.\nExpected:\n' + JSON.stringify(expected) + '\nReceived:\n' + JSON.stringify(book.attributes));
			},
			error: function(book, error) {
				test.ok(false, book.id + ' - Error fetching book: ' + JSON.stringify(error));
			}
		});
	}
};

var books = new Books();
exports.scan = function(test) {
	var expectedColl = _.filter(dataset.books, function(b) {
		return b.genre_s === 'fantasy';
	});
	test.expect(1);

	books.fetch({
		scan: {
			ScanFilter: {
				genre_s: {
					AttributeValueList: [{S: 'fantasy'}],
					ComparisonOperator: 'EQ'
				}
			}
		},
		complete: function(books, response) {
			test.done();
		},
		success: function(books, response) {
			var noMatch = books.any(function(book) {
				var expected = _.find(dataset.books, function(b) { return b.isbn === book.id; });
				return !_.isEqual(expected, book.attributes);
			});

			if (noMatch) test.ok(false, 'At least 1 of the fetched books doesn\'t match the original');
			else test.ok(expectedColl.length === books.length, 'The number of fetched books doesn\'t match the number of expected books');
		},
		error: function(books, error) {
			test.ok(false, 'Error fetching collection:\n' + JSON.stringify(error));
		}
	});
};

exports.update = function(test) {
	var done = _.after(books.length, function() { test.done(); });
	test.expect(books.length);

	books.each(function(book) {
		book.save({
			genre_s: 'fiction'
		}, {
			complete: done,
			success: function(book, response) {
				test.ok(true);
			},
			error: function(book, error) {
				test.ok(false, book.id + ' - Error updating book:\n' + JSON.stringify(error));
			}
		});
	});
};

exports.destroy = function(test) {
	var len = dataset.books.length,
		done = _.after(len, function() { test.done(); });
	test.expect(len);

	for (var i = 0; i < len; i++) {
		new Book({isbn: dataset.books[i].isbn}).destroy({
			complete: done,
			success: function(book, response) {
				test.ok(true);
			},
			error: function(book, error) {
				test.ok(false, book.id + ' - Error deleting book: ' + JSON.stringify(error));
			}
		});
	}
};