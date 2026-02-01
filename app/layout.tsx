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
            <body className="bg-slate-50 text-slate-900 antialiased">
                <ClientLayout>{children}</ClientLayout>
            </body>
        </html>
    );
}
