import { test, expect } from '@playwright/test';

test.describe('JobVoice Prep smoke (no logout)', () => {
  test('20 mixed navigations without logout + resume view/replace', async ({ page, context }) => {
    // Go to app
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // ---- Login (tweak selectors if your placeholders are different) ----
    await page.getByPlaceholder(/email/i).fill(process.env.TEST_EMAIL!);
    await page.getByPlaceholder(/password/i).fill(process.env.TEST_PASSWORD!);
    await page.getByRole('button', { name: /sign in/i }).click();

    // Dashboard visible
    await expect(page.getByText(/dashboard/i)).toBeVisible();

    // Open first application card (adjust text if needed)
    await page.getByRole('link', { name: /application/i }).first().click();
    await expect(page.getByText(/application detail/i)).toBeVisible();

    // Try to view resume PDF (popup or inline)
    const [popup] = await Promise.all([
      context.waitForEvent('page').catch(() => null),
      page.getByRole('button', { name: /view (pdf|file)/i }).click(),
    ]);
    if (popup) {
      await popup.waitForLoadState('domcontentloaded');
      expect(popup.url().toLowerCase()).not.toContain('login');
      await popup.close();
    } else {
      // If inline viewer
      await expect(page.locator('iframe')).toBeVisible();
    }

    // Replace resume -> Step 1
    await page.getByRole('button', { name: /replace/i }).click();
    await expect(page.getByText(/step\s*1/i)).toBeVisible();
    expect(page.url().toLowerCase()).not.toContain('login');

    // 20 mixed navs across pages/tabs should never cause a logout
    for (let i = 0; i < 20; i++) {
      // Back to dashboard
      const dashLink = page.getByRole('link', { name: /dashboard/i }).first();
      if (await dashLink.isVisible()) await dashLink.click();
      else await page.goto('/', { waitUntil: 'domcontentloaded' });
      await expect(page.getByText(/dashboard/i)).toBeVisible();

      // Open app again
      await page.getByRole('link', { name: /application/i }).first().click();
      await expect(page.getByText(/application detail/i)).toBeVisible();

      // Click a few tabs that previously caused logouts
      for (const tab of [/upload pdf/i, /upload image/i, /type details/i]) {
        const t = page.getByRole('button', { name: tab }).first();
        if (await t.isVisible()) await t.click();
      }

      // Sanity: not redirected to login
      expect(page.url().toLowerCase()).not.toContain('login');
    }
  });
});
