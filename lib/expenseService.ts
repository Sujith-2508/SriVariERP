import { supabase } from './supabase';
import { CompanyExpense } from '@/types';

// ============================================
// localStorage → Supabase One-Time Migration
// ============================================
const LEGACY_KEY = 'sve_company_expenses';
const MIGRATED_KEY = 'sve_company_expenses_migrated';

async function migrateFromLocalStorage(): Promise<void> {
    if (typeof window === 'undefined') return;
    if (localStorage.getItem(MIGRATED_KEY)) return; // Already migrated

    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) {
        localStorage.setItem(MIGRATED_KEY, 'true');
        return; // Nothing to migrate
    }

    try {
        const items: CompanyExpense[] = JSON.parse(raw);
        if (!items || items.length === 0) {
            localStorage.setItem(MIGRATED_KEY, 'true');
            return;
        }

        const rows = items.map((e) => {
            const d = new Date(e.date);
            return {
                id: e.id,
                expense_type: e.expenseType,
                custom_name: e.customName || null,
                amount: e.amount,
                date: d.toISOString().split('T')[0],
                month: d.getMonth() + 1,
                year: d.getFullYear(),
                notes: e.notes || null,
            };
        });

        const { error } = await supabase.from('company_expenses').upsert(rows, { onConflict: 'id' });
        if (!error) {
            localStorage.setItem(MIGRATED_KEY, 'true');
            console.log(`[expenseService] Migrated ${rows.length} expense(s) from localStorage to Supabase.`);
        } else {
            console.warn('[expenseService] Migration partially failed:', error.message);
        }
    } catch (err) {
        console.warn('[expenseService] Could not parse legacy expenses:', err);
        localStorage.setItem(MIGRATED_KEY, 'true');
    }
}

// ============================================
// Mapper
// ============================================
function mapExpense(data: any): CompanyExpense {
    return {
        id: data.id,
        expenseType: data.expense_type as CompanyExpense['expenseType'],
        customName: data.custom_name || undefined,
        amount: parseFloat(data.amount),
        date: new Date(data.date),
        month: data.month,
        year: data.year,
        notes: data.notes || undefined,
        createdAt: new Date(data.created_at),
        updatedAt: new Date(data.updated_at),
    };
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
    await migrateFromLocalStorage();
    const d = new Date(expense.date);

    const { data, error } = await supabase
        .from('company_expenses')
        .insert({
            expense_type: expense.expenseType,
            custom_name: expense.customName || null,
            amount: expense.amount,
            date: d.toISOString().split('T')[0],
            month: d.getMonth() + 1,
            year: d.getFullYear(),
            notes: expense.notes || null,
        })
        .select()
        .single();

    if (error) {
        console.error('Error creating company expense:', error);
        return null;
    }

    return data ? mapExpense(data) : null;
}

export async function updateCompanyExpense(
    expenseId: string,
    updates: Partial<CompanyExpense>
): Promise<CompanyExpense | null> {
    await migrateFromLocalStorage();
    const updatePayload: any = {};

    if (updates.expenseType !== undefined) updatePayload.expense_type = updates.expenseType;
    if (updates.customName !== undefined) updatePayload.custom_name = updates.customName;
    if (updates.amount !== undefined) updatePayload.amount = updates.amount;
    if (updates.notes !== undefined) updatePayload.notes = updates.notes;
    if (updates.date !== undefined) {
        const d = new Date(updates.date);
        updatePayload.date = d.toISOString().split('T')[0];
        updatePayload.month = d.getMonth() + 1;
        updatePayload.year = d.getFullYear();
    }
    updatePayload.updated_at = new Date().toISOString();

    const { data, error } = await supabase
        .from('company_expenses')
        .update(updatePayload)
        .eq('id', expenseId)
        .select()
        .single();

    if (error) {
        console.error('Error updating company expense:', error);
        return null;
    }

    return data ? mapExpense(data) : null;
}

export async function deleteCompanyExpense(expenseId: string): Promise<boolean> {
    await migrateFromLocalStorage();

    const { error } = await supabase.from('company_expenses').delete().eq('id', expenseId);

    if (error) {
        console.error('Error deleting company expense:', error);
        return false;
    }

    return true;
}

export async function getExpensesByMonth(month: number, year: number): Promise<CompanyExpense[]> {
    await migrateFromLocalStorage();

    const { data, error } = await supabase
        .from('company_expenses')
        .select('*')
        .eq('month', month)
        .eq('year', year)
        .order('date', { ascending: false });

    if (error) {
        console.warn('Error fetching expenses by month:', error.message);
        return [];
    }

    return data ? data.map(mapExpense) : [];
}

export async function getExpensesByRange(startDate: Date, endDate: Date): Promise<CompanyExpense[]> {
    await migrateFromLocalStorage();

    const start = startDate.toISOString().split('T')[0];
    const end = endDate.toISOString().split('T')[0];

    const { data, error } = await supabase
        .from('company_expenses')
        .select('*')
        .gte('date', start)
        .lte('date', end)
        .order('date', { ascending: false });

    if (error) {
        console.warn('Error fetching expenses by range:', error.message);
        return [];
    }

    return data ? data.map(mapExpense) : [];
}

export async function getAllExpenses(): Promise<CompanyExpense[]> {
    await migrateFromLocalStorage();

    const { data, error } = await supabase
        .from('company_expenses')
        .select('*')
        .order('date', { ascending: false });

    if (error) {
        console.warn('Error fetching all expenses:', error.message);
        return [];
    }

    return data ? data.map(mapExpense) : [];
}

export async function getExpensesByYear(year: number): Promise<CompanyExpense[]> {
    await migrateFromLocalStorage();

    const { data, error } = await supabase
        .from('company_expenses')
        .select('*')
        .eq('year', year)
        .order('date', { ascending: false });

    if (error) {
        console.warn('Error fetching expenses by year:', error.message);
        return [];
    }

    return data ? data.map(mapExpense) : [];
}
