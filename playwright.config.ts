import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:4173/carnet-de-route/',
    launchOptions: { executablePath: process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium' },
  },
  webServer: {
    command: 'VITE_DATA=memory npx vite build && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173/carnet-de-route/',
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
