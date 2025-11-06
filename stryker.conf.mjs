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
	reporters: ['progress', 'clear-text', 'html'],
	coverageAnalysis: 'perTest',
	ignoreStatic: true,
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
