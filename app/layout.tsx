import type { Metadata } from 'next';
import './globals.css';
import { ClientLayout } from '@/components/ClientLayout';

export const metadata: Metadata = {
    title: 'Sri Vari Enterprises - Billing ERP',
    description: 'Billing and Collections Management System',
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en">
            <head>
                {/* CSP is handled by Electron's session.webRequest in main.js */}
                {/* Do NOT add a CSP meta tag here — it gets baked into the static
                    HTML and would block scripts in the packaged app where
                    localhost:3000 doesn't exist */}
                <title>Sri Vari Enterprises - Billing ERP</title>
            </head>
            <body className="bg-slate-50 text-slate-900 antialiased">
                <ClientLayout>{children}</ClientLayout>
            </body>
        </html>
    );
}
