/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
const config = {
	mutate: [
		'index.ts',
		'lib/**/*.ts',
		'!lib/oauth-success.html',
		'!lib/**/__mocks__/**/*.ts',
		'!dist/**',
	],
	// Stryker v7+: no mutator name needed; TS supported out of the box
	mutator: {},
	plugins: ['@stryker-mutator/vitest-runner'],
	testRunner: 'vitest',
	reporters: ['clear-text', 'json', 'html'],
	coverageAnalysis: 'perTest',
	ignoreStatic: true,
	logLevel: 'warn',
	clearTextReporter: { allowColor: false, logTests: false, reportTests: false, reportMutants: false, reportScoreTable: true, skipFull: true },
	htmlReporter: { fileName: 'coverage/stryker.html' },
	jsonReporter: { fileName: 'coverage/stryker.json' },
	timeoutMS: 60000,
	thresholds: {
		break: 60,
		high: 80,
		low: 70,
	},
	vitest: {
		configFile: 'vitest.config.ts',
	},
};

export default config;
