-- ============================================================================
-- Migration 004: Scanner, QR Scan and Source Type Improvements
-- Adds source_type column to public.transactions and ensures non-negative amount constraint.
-- ============================================================================

-- 1. Ensure source_type column exists on transactions table
ALTER TABLE public.transactions
    ADD COLUMN IF NOT EXISTS source_type TEXT DEFAULT 'MANUAL';

-- 2. Index on source_type for fast filtering
CREATE INDEX IF NOT EXISTS idx_transactions_source_type 
    ON public.transactions(source_type);

-- 3. Adjust amount_paise check constraint to allow zero/non-negative for drafts
DO $$
BEGIN
    ALTER TABLE public.transactions
        DROP CONSTRAINT IF EXISTS transactions_amount_paise_check;
    
    ALTER TABLE public.transactions
        ADD CONSTRAINT transactions_amount_paise_check CHECK (amount_paise >= 0);
EXCEPTION
    WHEN undefined_object THEN NULL;
END $$;

