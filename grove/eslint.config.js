import tsParser from "@typescript-eslint/parser";
import classNamePlugin from "./eslint/classname-plugin.js";

export default [
  {
    ignores: ["dist/**", "node_modules/**", "src-tauri/**"],
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    plugins: {
      "grove-classname": classNamePlugin,
    },
    rules: {
      "grove-classname/require-cn-for-classname": "error",
      "grove-classname/prefer-object-syntax-in-cn": "error",
    },
  },
];
