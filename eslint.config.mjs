import js from "@eslint/js";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import sonarjs from "eslint-plugin-sonarjs";

/** @type {import("eslint").Linter.FlatConfig[]} */
export default [
	// Global ignores (replacement for .eslintignore in flat config)
	{
		ignores: [
			"dist/**",
			"node_modules/**",
			"coverage/**",
			".serena/**",
			".stryker-tmp/**",
			"assets/**",
			"docs/**",
			"spec/**",
		],
	},
	{
		files: ["**/*.ts"],
		languageOptions: {
			parser: tsParser,
			sourceType: "module",
			// No project-based type info for now; keeps linting fast and simple
			parserOptions: {
				ecmaVersion: 2022,
			},
		},
		plugins: {
			"@typescript-eslint": tseslint,
			sonarjs,
		},
		rules: {
			// Base JS recommended rules
			...js.configs.recommended.rules,

			// TypeScript recommended rules
			...tseslint.configs.recommended.rules,

			// SonarJS recommended rules (includes cognitive complexity infra)
			...sonarjs.configs.recommended.rules,

			// Sonar-style cognitive complexity; adjust threshold as needed
			"sonarjs/cognitive-complexity": ["warn", 20],

			// Keep these relaxed for now; you can tighten later
			"@typescript-eslint/explicit-module-boundary-types": "off",
			"@typescript-eslint/no-explicit-any": "off",
		},
	},
	{
		files: ["test/**/*.ts"],
		languageOptions: {
			globals: {
				describe: "readonly",
				it: "readonly",
				test: "readonly",
				expect: "readonly",
				beforeAll: "readonly",
				afterAll: "readonly",
				beforeEach: "readonly",
				afterEach: "readonly",
				vi: "readonly",
			},
		},
	},
];
