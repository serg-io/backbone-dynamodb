module.exports = function( grunt ) {
	var pkg = grunt.file.readJSON( 'package.json' );

	/**
	 * Make the "jshint-force" and "jscs-force" options `true` by default, to force JSHint and JSCS
	 * to report errors but NOT fail the task. This makes it possible for the "grunt dev" task to
	 * continue running if there are errors. To set this option to false use a command line flag.
	 * For instance:
	 *
	 *    grunt jshint --no-jshint-force
	 *    grunt jscs --no-jscs-force
	 */
	if ( grunt.option( 'jshint-force' ) !== false ) {
		grunt.option( 'jshint-force', true );
	}
	if ( grunt.option( 'jscs-force' ) !== false ) {
		grunt.option( 'jscs-force', true );
	}

	grunt.initConfig({
		pkg: pkg,
		jscs: {
			options: {
				/**
				 * We use the Idiomatic preset of JSCS. All JSCS options are stored in the .jscsrc
				 * file. All available options can be found [here](http://jscs.info/rules).
				 */
				config: '.jscsrc',
				/**
				 * Force JSCS to report errors but not fail the task. This is `true` by default
				 * unless the command line flag `--no-jscs-force` is present.
				 */
				force: grunt.option( 'jscs-force' )
			},
			all: '*.js'
		},
		jshint: {
			options: {
				/**
				 * All JSHint options are stored in the .jshintrc file. A list of all available
				 * options can be found [here](http://jshint.com/docs/options/).
				 */
				jshintrc: true,
				/**
				 * Force JSHint to report errors but not fail the task. This is `true` by default
				 * unless the command line flag `--no-jshint-force` is present.
				 */
				force: grunt.option( 'jshint-force' )
			},
			all: '*.js'
		},
		watch: {
			js: {
				files: '*.js',
				tasks: [ 'jshint', 'jscs' ]
			}
		}
	});

	require( 'load-grunt-tasks' )( grunt );

	/**
	 * The `grunt dev` task will watch for changes to all Javascript files and report any errors or
	 * warnings.
	 */
	grunt.registerTask( 'dev', [ 'jshint', 'jscs', 'watch' ]);
};