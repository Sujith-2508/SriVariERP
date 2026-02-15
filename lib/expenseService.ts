import { CompanyExpense } from '@/types';

// ============================================
// LocalStorage Configuration & Helpers
// ============================================

const KEY = 'sve_company_expenses';

function getLocalData<T>(key: string): T[] {
    if (typeof window === 'undefined') return [];
    try {
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : [];
    } catch (e) {
        console.error('Error reading from localStorage:', e);
        return [];
    }
}

function saveLocalData<T>(key: string, data: T[]) {
    if (typeof window === 'undefined') return;
    localStorage.setItem(key, JSON.stringify(data));
}

// ============================================
// Expense Operations
// ============================================

export async function createCompanyExpense(expense: {
    expenseType: 'GODOWN_RENT' | 'ELECTRICITY_BILL' | 'OFFICE_RENT' | 'OTHER';
    customName?: string;
    amount: number;
    date: Date;
    notes?: string;
}): Promise<CompanyExpense | null> {
    const expenses = getLocalData<CompanyExpense>(KEY);
    const date = new Date(expense.date);

    const newExpense: CompanyExpense = {
        id: crypto.randomUUID(),
        expenseType: expense.expenseType,
        customName: expense.customName,
        amount: expense.amount,
        date: date,
        month: date.getMonth() + 1,
        year: date.getFullYear(),
        notes: expense.notes,
        createdAt: new Date(),
        updatedAt: new Date()
    };

    saveLocalData(KEY, [newExpense, ...expenses]);
    return newExpense;
}

export async function updateCompanyExpense(
    expenseId: string,
    updates: Partial<CompanyExpense>
): Promise<CompanyExpense | null> {
    const expenses = getLocalData<CompanyExpense>(KEY);
    const index = expenses.findIndex(e => e.id === expenseId);

    if (index === -1) return null;

    const current = expenses[index];
    const updatedDate = updates.date ? new Date(updates.date) : new Date(current.date);

    const updatedExpense: CompanyExpense = {
        ...current,
        ...updates,
        date: updatedDate,
        month: updatedDate.getMonth() + 1,
        year: updatedDate.getFullYear(),
        updatedAt: new Date()
    };

    expenses[index] = updatedExpense;
    saveLocalData(KEY, expenses);
    return updatedExpense;
}

export async function deleteCompanyExpense(expenseId: string): Promise<boolean> {
    const expenses = getLocalData<CompanyExpense>(KEY);
    const filtered = expenses.filter(e => e.id !== expenseId);

    if (filtered.length === expenses.length) return false;

    saveLocalData(KEY, filtered);
    return true;
}

export async function getExpensesByMonth(month: number, year: number): Promise<CompanyExpense[]> {
    const expenses = getLocalData<CompanyExpense>(KEY);

    return expenses
        .filter(e => {
            const d = new Date(e.date);
            return (d.getMonth() + 1) === month && d.getFullYear() === year;
        })
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}
