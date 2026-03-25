import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

console.log('[Supabase] Initializing with URL:', supabaseUrl?.substring(0, 20) + '...', 'Key present:', !!supabaseAnonKey);

if (!supabaseUrl || !supabaseAnonKey) {
    console.error('[Supabase] CRITICAL: Missing environment variables!', { url: !!supabaseUrl, key: !!supabaseAnonKey });
    // In dev, we non-destructively warn instead of throwing immediately to allow UI to show error state
    if (process.env.NODE_ENV === 'production') {
        throw new Error('Missing Supabase environment variables. Please check your .env.local file.');
    }
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
console.log('[Supabase] Client created successfully');

// Helper function to check connection
export async function checkSupabaseConnection(): Promise<boolean> {
    try {
        const { error } = await supabase.from('_health_check').select('*').limit(1);
        // If there's no error or it's just "table not found", connection is working
        if (!error || error.code === 'PGRST116') {
            return true;
        }
        console.error('Supabase connection check failed:', error);
        return false;
    } catch (err) {
        console.error('Supabase connection error:', err);
        return false;
    }
}
