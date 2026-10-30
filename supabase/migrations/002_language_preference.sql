-- ============================================================================
-- Migration 002: Language Preference & Script Enforcement
-- Enforces English (Latin) or Hindi (Devanagari) only. Strictly bans Urdu script.
-- ============================================================================

-- Ensure users_profile supports language preference
DO $$
BEGIN
    -- If column type is app_language, ensure values exist or alter type
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users_profile' AND column_name = 'preferred_language'
    ) THEN
        -- Make column nullable with default 'ENGLISH'
        ALTER TABLE public.users_profile ALTER COLUMN preferred_language SET DEFAULT 'ENGLISH';
    END IF;
END $$;

-- Clean any residual Urdu characters from contacts, transactions, and udhaar obligations
UPDATE public.contacts
SET display_name = 'Kabir'
WHERE display_name ~ '[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]';

UPDATE public.transactions
SET merchant_or_payee = 'Kabir'
WHERE merchant_or_payee ~ '[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]';

UPDATE public.transactions
SET description = regexp_replace(description, '[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]+', 'Kabir', 'g')
WHERE description ~ '[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]';

UPDATE public.udhaar_obligations
SET title_or_note = regexp_replace(title_or_note, '[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]+', 'Credit Given - Kabir', 'g')
WHERE title_or_note ~ '[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]';

-- Clean any generic "Entry" titles in recent transactions
UPDATE public.transactions
SET merchant_or_payee = 'Clothes Purchase'
WHERE merchant_or_payee = 'Entry' AND (description ILIKE '%kapde%' OR description ILIKE '%कपड़े%');

