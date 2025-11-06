/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
const config = {
	mutate: [
		'index.ts',
		'lib/**/*.ts',
		'!lib/oauth-success.html',
		'!lib/**/__mocks__/**/*.ts',
		'!dist/**',
	],
	mutator: {
		name: 'typescript',
	},
	plugins: ['@stryker-mutator/vitest-runner'],
	testRunner: 'vitest',
	reporters: ['progress', 'clear-text', 'html'],
	coverageAnalysis: 'perTest',
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
