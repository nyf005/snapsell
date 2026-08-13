import { FlatCompat } from "@eslint/eslintrc";
import { defineConfig, globalIgnores } from "eslint/config";

const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

export default defineConfig([
  ...compat.config({ extends: ["next/core-web-vitals", "next/typescript"] }),
  {
    /**
     * Baseline du dépôt existant. Ces règles seront réactivées progressivement,
     * fichier par fichier, sans transformer l'activation d'ESLint en refonte.
     */
    rules: {
      "@next/next/no-img-element": "off",
      "@typescript-eslint/no-empty-object-type": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "import/no-anonymous-default-export": "off",
      "react/no-unescaped-entities": "off",
    },
  },
  globalIgnores([
    ".next/**",
    "next-env.d.ts",
    "generated/**",
    "coverage/**",
    "_bmad/**",
    "_bmad-output/**",
    ".claude/**",
  ]),
]);
