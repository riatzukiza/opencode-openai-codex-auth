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
      // Node.js runtime globals (OAuth/auth flows, browser utilities)
      globals: {
        process: "readonly",
        Buffer: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly",
        fetch: "readonly",
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

      // Cognitive complexity: warn early via cyclomatic complexity, error at 30+ cognitive
      complexity: ["warn", 20],
      "sonarjs/cognitive-complexity": ["error", 30],

      // Function and file size limits (line counts ignore blank lines and comments)
      "max-lines-per-function": ["warn", { max: 80, skipBlankLines: true, skipComments: true }],
      "max-lines": ["warn", { max: 500, skipBlankLines: true, skipComments: true }],

      // Rely on TypeScript for undefined/global checks
      "no-undef": "off",

      // Allow empty catch blocks (we often intentionally swallow errors)
      "no-empty": ["error", { allowEmptyCatch: true }],

      // Light functional-programming leaning: avoid mutation and prefer expressions
      "no-param-reassign": ["warn", { props: true }],
      "prefer-const": "warn",
      "no-else-return": "warn",
      "arrow-body-style": ["warn", "as-needed"],

      // Keep these relaxed for now; you can tighten later
      "@typescript-eslint/explicit-module-boundary-types": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
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
