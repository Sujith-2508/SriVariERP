-- Migration: Add phone_number to users table for password recovery
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_number TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS recovery_email TEXT;

-- Update RLS (if needed, though policy 'Allow all access to users' is currently set to true)
