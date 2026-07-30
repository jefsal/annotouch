import eslint from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "playwright-report/**",
      "test-results/**",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.{js,ts,tsx}"],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    files: [
      "tests/**/*.{js,ts,tsx}",
      "playwright.config.js",
      "vite.config.ts",
    ],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  }
);
