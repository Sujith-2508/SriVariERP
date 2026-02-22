import { supabase } from './supabase';
import { AgentSalaryData } from '@/types';

// ============================================
// Mapper Function
// ============================================

function mapAgentSalary(data: any): AgentSalaryData {
    return {
        id: data.id,
        agentId: data.agent_id,
        month: data.month,
        year: data.year,
        baseSalary: parseFloat(data.base_salary),
        travelExpense: parseFloat(data.travel_expense) || 0,
        stayExpense: parseFloat(data.stay_expense) || 0,
        foodExpense: parseFloat(data.food_expense) || 0,
        otherExpense: parseFloat(data.other_expense) || 0,
        totalExpense: parseFloat(data.total_expense) || 0,
        netSalary: parseFloat(data.net_salary),
        paymentStatus: data.payment_status,
        paidDate: data.paid_date ? new Date(data.paid_date) : undefined,
        notes: data.notes,
        createdAt: new Date(data.created_at),
        updatedAt: new Date(data.updated_at)
    };
}

// ============================================
// Salary Operations
// ============================================

export async function createSalaryRecord(salary: {
    agentId: string;
    month: number;
    year: number;
    baseSalary: number;
    travelExpense?: number;
    stayExpense?: number;
    foodExpense?: number;
    otherExpense?: number;
    notes?: string;
}): Promise<AgentSalaryData | null> {
    const { data, error } = await supabase
        .from('agent_salaries')
        .insert({
            agent_id: salary.agentId,
            month: salary.month,
            year: salary.year,
            base_salary: salary.baseSalary,
            travel_expense: salary.travelExpense || 0,
            stay_expense: salary.stayExpense || 0,
            food_expense: salary.foodExpense || 0,
            other_expense: salary.otherExpense || 0,
            payment_status: 'PENDING',
            notes: salary.notes
        })
        .select()
        .single();

    if (error) {
        console.error('Error creating salary record:', error);
        return null;
    }

    return data ? mapAgentSalary(data) : null;
}

export async function updateSalaryRecord(
    salaryId: string,
    updates: Partial<AgentSalaryData>
): Promise<AgentSalaryData | null> {
    const { data, error } = await supabase
        .from('agent_salaries')
        .update({
            base_salary: updates.baseSalary,
            travel_expense: updates.travelExpense,
            stay_expense: updates.stayExpense,
            food_expense: updates.foodExpense,
            other_expense: updates.otherExpense,
            notes: updates.notes
        })
        .eq('id', salaryId)
        .select()
        .single();

    if (error) {
        console.error('Error updating salary record:', error);
        return null;
    }

    return data ? mapAgentSalary(data) : null;
}

export async function markSalaryPaid(salaryId: string, paidDate: Date): Promise<boolean> {
    const { error } = await supabase
        .from('agent_salaries')
        .update({
            payment_status: 'PAID',
            paid_date: paidDate.toISOString().split('T')[0]
        })
        .eq('id', salaryId);

    if (error) {
        console.error('Error marking salary as paid:', error);
        return false;
    }

    return true;
}

export async function getSalaryByMonth(month: number, year: number): Promise<AgentSalaryData[]> {
    const { data, error } = await supabase
        .from('agent_salaries')
        .select('*')
        .eq('month', month)
        .eq('year', year)
        .order('created_at', { ascending: false });

    if (error) {
        // Silently handle — table may not exist yet
        console.warn('Salary fetch skipped (table may not exist):', error.message || error.code || '');
        return [];
    }

    return data ? data.map(mapAgentSalary) : [];
}

export async function getSalaryByAgent(agentId: string): Promise<AgentSalaryData[]> {
    const { data, error } = await supabase
        .from('agent_salaries')
        .select('*')
        .eq('agent_id', agentId)
        .order('year', { ascending: false })
        .order('month', { ascending: false });

    if (error) {
        console.error('Error fetching agent salaries:', error);
        return [];
    }

    return data ? data.map(mapAgentSalary) : [];
}

export async function getSalaryRecord(agentId: string, month: number, year: number): Promise<AgentSalaryData | null> {
    const { data, error } = await supabase
        .from('agent_salaries')
        .select('*')
        .eq('agent_id', agentId)
        .eq('month', month)
        .eq('year', year)
        .single();

    if (error) {
        console.error('Error fetching salary record:', error);
        return null;
    }

    return data ? mapAgentSalary(data) : null;
}

export async function deleteSalaryRecord(salaryId: string): Promise<boolean> {
    const { error } = await supabase
        .from('agent_salaries')
        .delete()
        .eq('id', salaryId);

    if (error) {
        console.error('Error deleting salary record:', error);
        return false;
    }

    return true;
}

// ============================================
// Salary Slip Export
// ============================================

export interface SalarySlipData {
    agent: {
        name: string;
        phone: string;
        area?: string;
    };
    salary: AgentSalaryData;
    monthName: string;
}

export function generateSalarySlipData(
    agentName: string,
    agentPhone: string,
    agentArea: string | undefined,
    salary: AgentSalaryData
): SalarySlipData {
    const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ];

    return {
        agent: {
            name: agentName,
            phone: agentPhone,
            area: agentArea
        },
        salary,
        monthName: monthNames[salary.month - 1]
    };
}
