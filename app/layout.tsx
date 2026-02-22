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
                {/* CSP specifically for Electron + Supabase + Next.js */}
                {/* - default-src 'self': Only allow resources from the app itself */}
                {/* - script-src 'self' 'unsafe-inline' 'unsafe-eval': Required for Next.js dev mode (HMR) */}
                {/* - connect-src 'self' ...: Allow connections to Supabase API and WebSocket */}
                {/* - style-src 'self' 'unsafe-inline': Required for Tailwind/Next.js styles */}
                {/* - img-src 'self' blob: data:: Allow images */}
                <meta
                    httpEquiv="Content-Security-Policy"
                    content="default-src 'self' http://localhost:3000; script-src 'self' 'unsafe-inline' 'unsafe-eval' http://localhost:3000; connect-src 'self' http://localhost:3000 ws://localhost:3000 https://qimbzfensppfzgokrkuz.supabase.co wss://qimbzfensppfzgokrkuz.supabase.co https://*.tile.openstreetmap.org https://docs.google.com https://sheets.googleapis.com https://oauth2.googleapis.com https://www.googleapis.com https://*.googleapis.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' blob: data: https://*.tile.openstreetmap.org https://unpkg.com https://raw.githubusercontent.com https://cdnjs.cloudflare.com;"
                />
                <title>Sri Vari Enterprises - Billing ERP</title>
            </head>
            <body className="bg-slate-50 text-slate-900 antialiased">
                <ClientLayout>{children}</ClientLayout>
            </body>
        </html>
    );
}
