import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

const config = [
  ...nextCoreWebVitals,
  ...nextTypeScript,
  {
    ignores: [
      ".next/**",
      ".superpowers/**",
      "android/**",
      "coverage/**",
      "electron/**",
      "ios/**",
      "mobile-shell/**",
      "node_modules/**",
      "public/**",
      "release/**",
      "test-results/**",
    ],
  },
  {
    rules: {
      "react-hooks/set-state-in-effect": "off",
    },
  },
  {
    files: ["src/features/player/use-audio-playback.ts"],
    rules: {
      "react-hooks/immutability": "off",
      "react-hooks/rules-of-hooks": "off",
    },
  },
  {
    files: ["src/features/dictionary/wordnet-dictionary.ts"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  {
    files: ["scripts/**/*.{cjs,js}", "tests/electron/nia-browser-workflow-smoke.cjs", "tests/migrations/**/*.ts"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
];

export default config;
