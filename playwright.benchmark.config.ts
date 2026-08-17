import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/benchmark',
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:4185' },
  webServer: {
    command:
      process.env.BENCHMARK_SERVER === 'dev'
        ? 'pnpm --filter @electronic-artefacts/spatial-mapping-studio dev --host 127.0.0.1 --port 4185'
        : 'pnpm --filter @electronic-artefacts/spatial-mapping-studio build && pnpm --filter @electronic-artefacts/spatial-mapping-studio exec vite preview --host 127.0.0.1 --port 4185',
    port: 4185,
    reuseExistingServer: true,
  },
});
