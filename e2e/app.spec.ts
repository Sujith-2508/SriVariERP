import { _electron as electron, test, expect } from '@playwright/test';

test.describe('E2E: Login and Navigation', () => {
    let electronApp: any;
    let window: any;

    test.beforeAll(async () => {
        electronApp = await electron.launch({ args: ['.'] });
        window = await electronApp.firstWindow();
        await window.waitForLoadState('networkidle');
    });

    test.afterAll(async () => {
        await electronApp.close();
    });

    test('should show the login page if not authenticated', async () => {
        // Navigate to the app first (use 127.0.0.1 to avoid ipv6/ipv4 resolution issues in Node/Playwright)
        await window.goto('http://127.0.0.1:3000/');
        await window.waitForLoadState('networkidle');

        // Now clear session to ensure we see login
        await window.evaluate(() => {
            window.sessionStorage.clear();
        });
        await window.reload();
        await window.waitForLoadState('networkidle');

        // Check for Login-specific elements
        await expect(window.locator('h1')).toContainText('Sri Vari Enterprises');
        await expect(window.locator('h2')).toContainText('Welcome Back');
    });

    test('should show error message on invalid login', async () => {
        // We are already on login page from previous test
        await window.fill('input[type="text"]', 'wronguser');
        await window.fill('input[type="password"]', 'wrongpass');
        
        await window.locator('button[type="submit"]').click();
        await expect(window.locator('text=Invalid username or password')).toBeVisible({ timeout: 15000 });
    });

    test('should navigate to dashboard after successful session injection', async () => {
        // Go to login page first to ensure we are on the same origin
        await window.goto('http://127.0.0.1:3000/login');
        await window.waitForLoadState('networkidle');

        // Inject session storage
        await window.evaluate(() => {
            window.sessionStorage.setItem('isAuthenticated', 'true');
            window.sessionStorage.setItem('userId', 'test-user-id');
            window.sessionStorage.setItem('username', 'admin');
        });
        
        // Now navigate to root
        await window.goto('http://127.0.0.1:3000/');
        await window.waitForLoadState('networkidle');

        // Check for indicators of being logged in
        await expect(window.locator('text=Admin Portal')).toBeVisible({ timeout: 20000 });
        console.log('Successfully verified Dashboard navigation via origin-aware injection');
    });
});
