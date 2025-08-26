import { test, expect } from '@playwright/test';

// Tiny always-green to prove pipeline runs and produces a report
test('pipeline sanity', async () => {
  expect(1).toBe(1);
});

// Base URL load check (uses APP_URL if provided)
test('loads base URL', async ({ page, baseURL }) => {
  const url = baseURL || 'https://example.com';
  await page.goto(url);
  await expect(page).toHaveURL(/https?:\/\//);
});
