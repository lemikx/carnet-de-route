import { existsSync } from 'node:fs';
import { defineConfig } from '@playwright/test';

// Navigateur préinstallé dans certains environnements ; sinon celui de Playwright (npx playwright install chromium).
const localChromium = process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:4173/carnet-de-route/',
    launchOptions: existsSync(localChromium) ? { executablePath: localChromium } : {},
  },
  webServer: {
    command: 'VITE_DATA=memory VITE_FX=fake npx vite build && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173/carnet-de-route/',
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
