import { _electron as electron, test, expect, ElectronApplication, Page } from '@playwright/test';

test.describe('E2E: Login and Navigation', () => {
    let electronApp: ElectronApplication | undefined;
    let window: Page | undefined;

    test.beforeAll(async () => {
        try {
            electronApp = await electron.launch({
                args: ['.'],
                env: {
                    ...process.env,
                    ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
                },
            });

            window = await electronApp.firstWindow();
            await window.waitForLoadState('networkidle');
        } catch (err) {
            // Keep the primary launch error visible while avoiding secondary afterAll crashes.
            console.error('[E2E] Electron launch failed:', err);
            throw err;
        }
    });

    test.afterAll(async () => {
        if (electronApp) {
            await electronApp.close();
        }
    });

    test('should show the login page if not authenticated', async () => {
        test.skip(!window, 'Electron window was not initialized');

        await window!.goto('http://127.0.0.1:3000/');
        await window!.waitForLoadState('networkidle');

        await window!.evaluate(() => {
            window.sessionStorage.clear();
        });

        await window!.reload();
        await window!.waitForLoadState('networkidle');

        await expect(window!.locator('h1')).toContainText('Sri Vari Enterprises');
        await expect(window!.locator('h2')).toContainText('Welcome Back');
    });

    test('should show error message on invalid login', async () => {
        test.skip(!window, 'Electron window was not initialized');

        await window!.fill('input[type="text"]', 'wronguser');
        await window!.fill('input[type="password"]', 'wrongpass');
        await window!.locator('button[type="submit"]').click();

        await expect(window!.locator('text=Invalid username or password')).toBeVisible({ timeout: 15000 });
    });

    test('should navigate to dashboard after successful session injection', async () => {
        test.skip(!window, 'Electron window was not initialized');

        await window!.goto('http://127.0.0.1:3000/login');
        await window!.waitForLoadState('networkidle');

        await window!.evaluate(() => {
            window.sessionStorage.setItem('isAuthenticated', 'true');
            window.sessionStorage.setItem('userId', 'test-user-id');
            window.sessionStorage.setItem('username', 'admin');
        });

        await window!.goto('http://127.0.0.1:3000/');
        await window!.waitForLoadState('networkidle');

        await expect(window!.locator('text=Admin Portal')).toBeVisible({ timeout: 20000 });
    });
});
