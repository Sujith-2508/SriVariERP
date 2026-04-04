export interface LedgerEntry {
    date: Date;
    createdAt?: Date;
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
 * 3. If same day, order by precise creation time.
 */
export function sortLedgerEntries(entries: LedgerEntry[]): LedgerEntry[] {
    return [...entries].sort((a, b) => {
        // BAL B/F (opening balance) is ALWAYS first
        if (a.reference === 'BAL B/F') return -1;
        if (b.reference === 'BAL B/F') return 1;

        // Use event timestamp first (createdAt when available, else voucher date).
        const eventA = (a.createdAt ? new Date(a.createdAt) : a.date).getTime();
        const eventB = (b.createdAt ? new Date(b.createdAt) : b.date).getTime();
        if (eventA !== eventB) return eventA - eventB;

        const dateDiff = a.date.getTime() - b.date.getTime();
        if (dateDiff !== 0) return dateDiff;

        // Deterministic fallback for exact timestamp ties.
        if (a.reference && b.reference && a.reference !== b.reference) {
            return a.reference.localeCompare(b.reference);
        }
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
