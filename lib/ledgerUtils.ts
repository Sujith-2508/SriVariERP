export interface LedgerEntry {
    date: Date;
    reference: string;
    type: string;
    debit: number;
    credit: number;
    balance: number;
    originalTransaction?: any;
}

/**
 * Sorts ledger entries based on specific business rules:
 * 1. BAL B/F (Opening Balance) always at the top.
 * 2. Chronological order by date.
 * 3. Invoices before payments if on the same day.
 */
export function sortLedgerEntries(entries: LedgerEntry[]): LedgerEntry[] {
    return [...entries].sort((a, b) => {
        // BAL B/F (opening balance) is ALWAYS first
        if (a.reference === 'BAL B/F') return -1;
        if (b.reference === 'BAL B/F') return 1;

        // All other entries: strict chronological order
        const diff = a.date.getTime() - b.date.getTime();
        if (diff !== 0) return diff;

        // Same date: invoices before payments (logical ordering)
        if (a.type === 'Invoice' && b.type === 'Payment') return -1;
        if (a.type === 'Payment' && b.type === 'Invoice') return 1;
        return 0;
    });
}

/**
 * Calculates running balances for sorted ledger entries.
 */
export function calculateRunningBalances(entries: LedgerEntry[]): LedgerEntry[] {
    let runningBalance = 0;
    return entries.map((entry, idx) => {
        if (idx === 0) {
            runningBalance = entry.debit - entry.credit;
        } else {
            runningBalance += entry.debit - entry.credit;
        }
        return { ...entry, balance: runningBalance };
    });
}
