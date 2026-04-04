import { describe, it, expect } from 'vitest';
import { sortLedgerEntries, calculateRunningBalances, LedgerEntry } from '@/lib/ledgerUtils';

describe('Ledger Utilities', () => {
    describe('sortLedgerEntries', () => {
        it('should always place BAL B/F (Opening Balance) at the top', () => {
            const date1 = new Date('2024-03-01');
            const date2 = new Date('2024-03-02');
            const date3 = new Date('2024-03-03');
            
            const entries: LedgerEntry[] = [
                { date: date2, reference: 'INV-001', type: 'Invoice', debit: 100, credit: 0, balance: 0 },
                { date: date1, reference: 'BAL B/F', type: 'Opening Balance', debit: 500, credit: 0, balance: 0 },
                { date: date3, reference: 'PAY-001', type: 'Payment', debit: 0, credit: 100, balance: 0 },
            ];
            
            const sorted = sortLedgerEntries(entries);
            expect(sorted[0].reference).toBe('BAL B/F');
        });

        it('should sort non-BAL B/F entries chronologically', () => {
            const date1 = new Date('2024-03-01');
            const date2 = new Date('2024-03-02');
            const date3 = new Date('2024-03-03');
            
            const entries: LedgerEntry[] = [
                { date: date3, reference: 'INV-003', type: 'Invoice', debit: 100, credit: 0, balance: 0 },
                { date: date1, reference: 'INV-001', type: 'Invoice', debit: 100, credit: 0, balance: 0 },
                { date: date2, reference: 'INV-002', type: 'Invoice', debit: 100, credit: 0, balance: 0 },
            ];
            
            const sorted = sortLedgerEntries(entries);
            expect(sorted[0].reference).toBe('INV-001');
            expect(sorted[1].reference).toBe('INV-002');
            expect(sorted[2].reference).toBe('INV-003');
        });

        it('should place Invoices before Payments on the same day', () => {
            const date = new Date('2024-03-10');
            
            const entries: LedgerEntry[] = [
                { date: date, reference: 'PAY-001', type: 'Payment', debit: 0, credit: 500, balance: 0 },
                { date: date, reference: 'INV-001', type: 'Invoice', debit: 1000, credit: 0, balance: 0 },
            ];
            
            const sorted = sortLedgerEntries(entries);
            expect(sorted[0].type).toBe('Invoice');
            expect(sorted[1].type).toBe('Payment');
        });
    });

    describe('calculateRunningBalances', () => {
        it('should correctly calculate cumulative balances', () => {
            const entries: LedgerEntry[] = [
                { date: new Date(), reference: 'BAL B/F', type: 'Opening Balance', debit: 1000, credit: 0, balance: 0 },
                { date: new Date(), reference: 'INV-001', type: 'Invoice', debit: 500, credit: 0, balance: 0 },
                { date: new Date(), reference: 'PAY-001', type: 'Payment', debit: 0, credit: 700, balance: 0 },
            ];
            
            const result = calculateRunningBalances(entries);
            expect(result[0].balance).toBe(1000);
            expect(result[1].balance).toBe(1500);
            expect(result[2].balance).toBe(800);
        });
    });
});
