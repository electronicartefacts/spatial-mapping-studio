import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  use: { baseURL: 'http://127.0.0.1:4183' },
  webServer: [
    {
      command:
        'pnpm --filter @electronic-artefacts/spatial-mapping-studio dev --host 127.0.0.1 --port 4183',
      port: 4183,
      reuseExistingServer: true,
    },
    {
      command: 'pnpm --filter @electronic-artefacts/demo-vanilla dev --host 127.0.0.1 --port 4184',
      port: 4184,
      reuseExistingServer: true,
    },
  ],
});
