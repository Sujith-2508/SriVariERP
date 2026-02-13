-- Diagnostic script to verify users table and authentication setup
-- Run this in Supabase SQL Editor to diagnose login issues

-- 1. Check if users table exists
SELECT EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'users'
) AS users_table_exists;

-- 2. If table exists, check for users
SELECT 
    id, 
    username, 
    full_name, 
    is_active, 
    last_login, 
    created_at
FROM users
ORDER BY created_at DESC;

-- 3. Check RLS policies on users table
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE tablename = 'users';

-- 4. Verify the default admin user exists
SELECT 
    CASE 
        WHEN EXISTS (SELECT 1 FROM users WHERE username = 'SVadmin' AND is_active = true)
        THEN 'Default admin user exists and is active'
        ELSE 'Default admin user NOT FOUND or inactive'
    END AS admin_status;
