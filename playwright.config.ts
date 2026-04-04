import { defineConfig } from '@playwright/test';

const e2eSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://example.supabase.co';
const e2eSupabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'e2e-anon-key';
const e2eServerCommand = process.env.CI
  ? 'npm run build && npm run start -- --hostname 127.0.0.1 --port 3000'
  : 'npm run dev -- --hostname 127.0.0.1 --port 3000';

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: {
    timeout: 15_000,
  },
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  use: {
    trace: 'on-first-retry',
  },
  webServer: {
    command: e2eServerCommand,
    url: 'http://127.0.0.1:3000',
    timeout: process.env.CI ? 300_000 : 180_000,
    reuseExistingServer: !process.env.CI,
    env: {
      ...process.env,
      NEXT_PUBLIC_SUPABASE_URL: e2eSupabaseUrl,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: e2eSupabaseAnonKey,
    },
  },
});
