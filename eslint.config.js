import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

export default [
  { ignores: ['**/dist/**', '**/node_modules/**', 'coverage/**'] },
  {
    files: ['apps/**/*.ts', 'apps/**/*.js', 'packages/**/*.ts'],
    languageOptions: {
      globals: {
        Blob: 'readonly',
        CustomEvent: 'readonly',
        File: 'readonly',
        HTMLElement: 'readonly',
        PointerEvent: 'readonly',
        ResizeObserver: 'readonly',
        URL: 'readonly',
        cancelAnimationFrame: 'readonly',
        customElements: 'readonly',
        devicePixelRatio: 'readonly',
        document: 'readonly',
        fetch: 'readonly',
        localStorage: 'readonly',
        navigator: 'readonly',
        requestAnimationFrame: 'readonly',
        setTimeout: 'readonly',
      },
    },
  },
  {
    files: ['scripts/**/*.mjs', '*.config.ts'],
    languageOptions: { globals: { Buffer: 'readonly', process: 'readonly' } },
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
];
