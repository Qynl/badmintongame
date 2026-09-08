import { test, expect } from '@playwright/test';
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('feather-settings', JSON.stringify({ quality: 'performance' })));
  await page.goto('/');
});
test('mode selection, difficulty and keyboard-accessible dialogs', async ({ page }) => {
  await expect(page.getByRole('heading', { name: /FEEL EVERY/ })).toBeVisible();
  await page.getByRole('button', { name: 'Let’s play', exact: true }).click();
  await page.getByRole('button', { name: /Expert Faster/ }).click();
  await expect(page.getByRole('button', { name: /Expert Faster/ })).toHaveClass(/selected/);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: /Shot training/ }).click();
  await page.getByRole('button', { name: 'Sharpen your game', exact: true }).click();
  await page.getByRole('button', { name: 'Smash', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Smash', exact: true })).toHaveClass(/selected/);
});
test('settings are saved and tools can be toggled', async ({ page }) => {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'balanced', exact: true }).click();
  await page.getByRole('switch', { name: 'Shuttle trail' }).click();
  await expect(page.getByRole('switch', { name: 'Shuttle trail' })).toHaveAttribute('aria-checked', 'false');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('feather-settings')!));
  expect(saved.quality).toBe('balanced'); expect(saved.trajectory).toBe(false);
});
test('first-person session captures the mouse and pauses cleanly', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.getByRole('button', { name: 'Let’s play', exact: true }).click();
  await page.getByRole('button', { name: 'Step onto the court', exact: true }).click();
  await expect.poll(() => page.evaluate(() => Boolean(document.pointerLockElement)), { timeout: 30000 }).toBe(true);
  await page.evaluate(() => document.exitPointerLock());
  await expect(page.getByRole('heading', { name: 'Take a breather.' })).toBeVisible();
  await page.getByRole('button', { name: /Return to the club/ }).click();
  await expect(page.getByRole('heading', { name: /FEEL EVERY/ })).toBeVisible();
  expect(errors).toEqual([]);
});
test('small-screen menus do not overflow horizontally', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.getByRole('button', { name: 'Let’s play', exact: true })).toBeVisible();
});
test('V2 training exposes target progress and a real string-bed display', async ({ page }) => {
  await page.getByRole('button', { name: /Shot training/ }).click();
  await page.getByRole('button', { name: 'Sharpen your game', exact: true }).click();
  await page.getByRole('button', { name: 'Net shot', exact: true }).click();
  await page.getByRole('button', { name: 'Step onto the court', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Net shot training progress' })).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Contact lab' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'No racket contact yet' })).toBeVisible();
  await page.keyboard.press('e');
  await page.evaluate(() => document.exitPointerLock());
  await expect(page.getByText('ON TARGET', { exact: true })).toBeVisible();
  await expect(page.getByText('BEST STREAK', { exact: true })).toBeVisible();
});
test('Assisted is the default and a held mouse button actually returns a shuttle', async ({ page }) => {
  test.setTimeout(180000);
  await page.setViewportSize({ width: 960, height: 640 });
  await page.getByRole('button', { name: /Free practice/ }).click();
  await page.getByRole('button', { name: 'Find your rhythm', exact: true }).click();
  await expect(page.getByRole('button', { name: /Assisted RECOMMENDED/ })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Step onto the court', exact: true }).click();
  await expect.poll(() => page.evaluate(() => Boolean(document.pointerLockElement)), { timeout: 30000 }).toBe(true);
  await page.mouse.down();
  const contacts = page.locator('.metric-row').filter({ hasText: 'Racket contacts' }).locator('strong');
  await expect(contacts).not.toHaveText('0', { timeout: 90000 });
  await page.mouse.up();
  await page.evaluate(() => document.exitPointerLock());
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: /Simulation Exact string-bed/ }).click();
  await expect(page.getByRole('button', { name: /Simulation Exact string-bed/ })).toHaveAttribute('aria-pressed', 'true');
});
