import { _electron as electron, test, expect, ElectronApplication, Page } from '@playwright/test';

const validUsername = process.env.E2E_ADMIN_USERNAME || 'ADMIN';
const validPassword = process.env.E2E_ADMIN_PASSWORD || 'Admin@123';
const shouldValidateRealLogin = process.env.E2E_VALIDATE_REAL_LOGIN === 'true';

test.describe('E2E: Login and Navigation', () => {
    let electronApp: ElectronApplication | undefined;
    let appWindow: Page | undefined;

    test.beforeAll(async () => {
        try {
            electronApp = await electron.launch({
                args: ['.', '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
                env: {
                    ...process.env,
                    ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
                    ELECTRON_DISABLE_SANDBOX: 'true',
                },
            });

            appWindow = await electronApp.firstWindow();
            await appWindow.waitForLoadState('domcontentloaded');
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
        test.skip(!appWindow, 'Electron window was not initialized');

        await appWindow!.goto('http://127.0.0.1:3000/');
        await appWindow!.waitForLoadState('domcontentloaded');

        await appWindow!.evaluate(() => {
            window.sessionStorage.clear();
        });

        await appWindow!.reload();
        await appWindow!.waitForLoadState('domcontentloaded');

        await expect(appWindow!.locator('h1')).toContainText('Sri Vari Enterprises');
        await expect(appWindow!.locator('h2')).toContainText('Welcome Back');
    });

    test('should show error message on invalid login', async () => {
        test.skip(!appWindow, 'Electron window was not initialized');

        await appWindow!.goto('http://127.0.0.1:3000/login');
        await appWindow!.waitForLoadState('domcontentloaded');

        await appWindow!.fill('input[type="text"]', 'wronguser');
        await appWindow!.fill('input[type="password"]', 'wrongpass');
        await appWindow!.locator('button[type="submit"]').click();

        await expect(appWindow!.locator('text=Invalid username or password')).toBeVisible({ timeout: 15000 });
    });

    test('should navigate to dashboard after successful session injection', async () => {
        test.skip(!appWindow, 'Electron window was not initialized');

        await appWindow!.goto('http://127.0.0.1:3000/login');
        await appWindow!.waitForLoadState('domcontentloaded');

        await appWindow!.evaluate(() => {
            window.sessionStorage.setItem('isAuthenticated', 'true');
            window.sessionStorage.setItem('userId', 'test-user-id');
            window.sessionStorage.setItem('username', 'admin');
        });

        await appWindow!.goto('http://127.0.0.1:3000/');
        await appWindow!.waitForLoadState('domcontentloaded');

        await expect(appWindow!.locator('text=Admin Portal')).toBeVisible({ timeout: 20000 });
    });

    test('should login with real configured credentials (optional)', async () => {
        test.skip(!appWindow, 'Electron window was not initialized');
        test.skip(!shouldValidateRealLogin, 'Set E2E_VALIDATE_REAL_LOGIN=true to run real credential validation');

        await appWindow!.goto('http://127.0.0.1:3000/login');
        await appWindow!.waitForLoadState('domcontentloaded');

        await appWindow!.fill('input[type="text"]', validUsername);
        await appWindow!.fill('input[type="password"]', validPassword);
        await appWindow!.locator('button[type="submit"]').click();

        await appWindow!.waitForLoadState('domcontentloaded');

        await expect(appWindow!.locator('text=Invalid username or password')).toHaveCount(0, { timeout: 20000 });
        await expect(appWindow!.locator('text=Admin Portal')).toBeVisible({ timeout: 20000 });
        await expect(appWindow!).not.toHaveURL(/\/login\/?$/);
    });
});
