/**
 * Use nodeunit to run this test.
 * Before running this test, create a table called 'Books' with 'isbn',
 * which is a number, as the hash key.
 */

var fs = require('fs'),
	_ = require('underscore'),
	dataset = require('./dataset.js'),
	Backbone = require(__dirname + '/../');

var Book = Backbone.DynamoDB.Model.extend({
	idAttribute: 'isbn',
	urlRoot: '/books'
});

function isDataEqual(actual, expected) {
	if (actual.length !== expected.length) return false;
	for (var i = 0; i < actual.length; i++) if (actual[i] !== expected[i]) return i;
	return true;
}

var original = null;

exports.write = function(test) {
	fs.readFile(__dirname + '/100x100.png', function(error, data) {
		test.expect(1);

		original = data;

		new Book(dataset.books[0]).save({
			coverImage: data
		}, {
			complete: function(book, response) {
				test.done();
			},
			success: function(book, response) {
				test.ok(true, book.id + ' - Saved');
			},
			error: function(book, response) {
				test.ok(false, book.id + ' - Error saving book: ' + JSON.stringify(response.error));
			}
		});
	});
};

exports.read = function(test) {
	test.expect(1);

	new Book({isbn: dataset.books[0].isbn}).fetch({
		dynamodb: {ConsistentRead: true},
		success: function(book, response) {
			var actual = book.get('coverImage');
			var equal = isDataEqual(actual, original);

			if (_.isNumber(equal)) test.ok(false, 'The bytes at index ' + equal + ' are not equal.');
			else test.ok(equal, 'The data is not equal.');
		},
		error: function(book, response) {
			test.ok(false, 'Error fetching book: ' + JSON.stringify(response.error));
		},
		complete: function(book, response) {
			test.done();
		}
	});
};

var originals = [];
exports.writeSet = function(test) {
	test.expect(1);
	var fileCount = 3;
	var filesRead = _.after(fileCount, function() {
		new Book(dataset.books[1]).save({
			images: originals
		}, {
			complete: function(book, response) {
				test.done();
			},
			success: function(book, response) {
				test.ok(true, book.id + ' - Saved');
			},
			error: function(book, response) {
				test.ok(false, book.id + ' - Error saving book: ' + JSON.stringify(response.error));
			}
		});
	});
	for (var i = 1; i <= fileCount; i++) {
		fs.readFile(__dirname + '/' + i + '.png', function(error, data) {
			originals.push(data);
			filesRead();
		});
	}
};

exports.readSet = function(test) {
	test.expect(originals.length);

	new Book({isbn: dataset.books[1].isbn}).fetch({
		dynamodb: {ConsistentRead: true},
		success: function(book, response) {
			var actualImages = book.get('images');

			for (var i = 0; i < actualImages.length; i++) {
				var ok = false;
				for (var j = 0; j < originals.length; j++) {
					if (isDataEqual(actualImages[i], originals[j]) === true) {
						ok = true;
						break;
					}
				}
				test.ok(ok, 'Not equal.');
			}
		},
		error: function(book, response) {
			test.ok(false, 'Error fetching book: ' + JSON.stringify(response.error));
		},
		complete: function(book, response) {
			test.done();
		}
	});
};


exports.destroy = function(test) {
	var count = 2;
	test.expect(count);
	var done = _.after(count, function() { test.done(); });

	for (var i = 0; i < count; i++) {
		new Book({isbn: dataset.books[i].isbn}).destroy({
			complete: done,
			success: function(book, response) {
				test.ok(true, 'Deleted');
			},
			error: function(book, response) {
				test.ok(false, 'Error deleting book: ' + JSON.stringify(response.error));
			}
		});
	}
};