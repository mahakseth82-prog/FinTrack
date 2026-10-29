-- ============================================================================
-- FinTrack — 001_initial_schema.sql
-- AI-Powered Voice Expense Tracker & Digital Udhaar Ledger
-- Golden Rules:
--   1. All monetary amounts are stored as BIGINT in integer PAISE (₹1 = 100 paise)
--   2. Strict workspace isolation: PERSONAL vs BUSINESS modes
--   3. AI never writes directly to final tables; all AI outputs land in ingestion_drafts
--   4. Row Level Security (RLS) enabled on every single table
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- ENUMS
-- ============================================================================
DO $$ BEGIN
    CREATE TYPE workspace_mode AS ENUM ('PERSONAL', 'BUSINESS');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE app_language AS ENUM ('HINGLISH', 'HINDI', 'ENGLISH');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE contact_kind AS ENUM ('CUSTOMER', 'SUPPLIER', 'FRIEND', 'FAMILY', 'MERCHANT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE transaction_kind AS ENUM ('EXPENSE', 'INCOME');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE payment_channel AS ENUM ('UPI', 'CASH', 'CARD', 'BANK_TRANSFER', 'OTHER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE obligation_direction AS ENUM ('RECEIVABLE', 'PAYABLE');
    -- RECEIVABLE = You Will Get (Lena Hai / Udhaar Diya)
    -- PAYABLE    = You Will Give / You Owe (Dena Hai / Udhaar Liya)
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE obligation_status AS ENUM ('OPEN', 'PARTIALLY_PAID', 'SETTLED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE ledger_entry_kind AS ENUM ('PRINCIPAL_GAVE', 'PRINCIPAL_GOT', 'REPAYMENT_IN', 'REPAYMENT_OUT', 'ADJUSTMENT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE draft_source AS ENUM ('VOICE', 'BILL_OCR', 'UPI_NOTIFICATION', 'MANUAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE draft_intent AS ENUM ('EXPENSE', 'INCOME', 'UDHAAR_GAVE', 'UDHAAR_GOT', 'UDHAAR_REPAYMENT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE draft_status AS ENUM ('NEEDS_CLARIFICATION', 'PENDING_CONFIRMATION', 'CONFIRMED', 'DISMISSED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE reminder_channel AS ENUM ('WHATSAPP', 'SMS', 'LOCAL_NOTIFICATION');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE reminder_status AS ENUM ('SCHEDULED', 'SENT', 'DISMISSED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- 1. users_profile
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.users_profile (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL DEFAULT 'FinTrack User',
    phone_number TEXT,
    preferred_language app_language NOT NULL DEFAULT 'HINGLISH',
    active_mode workspace_mode NOT NULL DEFAULT 'PERSONAL',
    upi_listener_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 2. workspaces (Separates PERSONAL and BUSINESS ledgers completely)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.workspaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users_profile(id) ON DELETE CASCADE,
    mode workspace_mode NOT NULL,
    display_name TEXT NOT NULL,
    theme_primary_hex TEXT NOT NULL DEFAULT '#6F4E37', -- Coffee Brown for Personal, #3E2723 for Business
    currency_code TEXT NOT NULL DEFAULT 'INR',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, mode)
);

-- ============================================================================
-- 3. contacts (Customers, Suppliers, Friends)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users_profile(id) ON DELETE CASCADE,
    display_name TEXT NOT NULL,
    phone_number TEXT,
    kind contact_kind NOT NULL DEFAULT 'CUSTOMER',
    -- Positive net_balance_paise = You Will Get (Lena Hai)
    -- Negative net_balance_paise = You Will Give (Dena Hai)
    net_balance_paise BIGINT NOT NULL DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contacts_workspace ON public.contacts(workspace_id);

-- ============================================================================
-- 4. categories (Expense & Income Categories with Warm Cream/Brown Tags)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users_profile(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    kind transaction_kind NOT NULL DEFAULT 'EXPENSE',
    icon_name TEXT NOT NULL DEFAULT 'receipt-outline',
    color_hex TEXT NOT NULL DEFAULT '#6F4E37',
    is_system BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (workspace_id, name, kind)
);

-- ============================================================================
-- 5. transactions (Confirmed Expenses & Income in Integer Paise)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users_profile(id) ON DELETE CASCADE,
    category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
    contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
    kind transaction_kind NOT NULL,
    amount_paise BIGINT NOT NULL CHECK (amount_paise > 0),
    payment_via payment_channel NOT NULL DEFAULT 'UPI',
    merchant_or_payee TEXT,
    description TEXT,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    source_draft_id UUID,
    upi_reference_id TEXT,
    receipt_image_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transactions_workspace_date ON public.transactions(workspace_id, occurred_at DESC);

-- ============================================================================
-- 6. udhaar_obligations (Parent Udhaar Record: Principal, Paid, Remaining, Due Date)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.udhaar_obligations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users_profile(id) ON DELETE CASCADE,
    contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
    direction obligation_direction NOT NULL, -- RECEIVABLE (Lena Hai) or PAYABLE (Dena Hai)
    principal_paise BIGINT NOT NULL CHECK (principal_paise > 0),
    repaid_paise BIGINT NOT NULL DEFAULT 0 CHECK (repaid_paise >= 0),
    remaining_paise BIGINT NOT NULL CHECK (remaining_paise >= 0),
    status obligation_status NOT NULL DEFAULT 'OPEN',
    due_date DATE,
    title_or_note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_obligation_paise_balance CHECK (repaid_paise + remaining_paise = principal_paise)
);

CREATE INDEX IF NOT EXISTS idx_obligations_workspace_status ON public.udhaar_obligations(workspace_id, status, due_date);
CREATE INDEX IF NOT EXISTS idx_obligations_contact ON public.udhaar_obligations(contact_id);

-- ============================================================================
-- 7. udhaar_ledger_entries (Every Chat Bubble / Partial Repayment Installment)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.udhaar_ledger_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    obligation_id UUID NOT NULL REFERENCES public.udhaar_obligations(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users_profile(id) ON DELETE CASCADE,
    contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
    entry_kind ledger_entry_kind NOT NULL,
    amount_paise BIGINT NOT NULL CHECK (amount_paise > 0),
    running_remaining_paise BIGINT NOT NULL CHECK (running_remaining_paise >= 0),
    payment_via payment_channel NOT NULL DEFAULT 'CASH',
    note TEXT,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    source_draft_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ledger_entries_contact_date ON public.udhaar_ledger_entries(contact_id, occurred_at ASC);

-- ============================================================================
-- 8. ingestion_drafts (Staging Table for AI Voice, Bill OCR, UPI Notifications)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.ingestion_drafts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users_profile(id) ON DELETE CASCADE,
    source draft_source NOT NULL,
    intent draft_intent NOT NULL DEFAULT 'EXPENSE',
    status draft_status NOT NULL DEFAULT 'PENDING_CONFIRMATION',
    raw_input_text TEXT,
    extracted_amount_paise BIGINT CHECK (extracted_amount_paise IS NULL OR extracted_amount_paise > 0),
    extracted_contact_name TEXT,
    matched_contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
    extracted_category_name TEXT,
    extracted_due_date DATE,
    payment_via payment_channel DEFAULT 'UPI',
    upi_reference_id TEXT,
    dedupe_fingerprint TEXT, -- Prevents duplicate GPay + Bank SMS/Notification drafts
    ambiguity_question TEXT, -- Populated if AI needs follow-up clarification from user
    ai_confidence NUMERIC(4,3) DEFAULT 0.900,
    structured_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ingestion_drafts_dedupe
    ON public.ingestion_drafts(workspace_id, dedupe_fingerprint)
    WHERE dedupe_fingerprint IS NOT NULL AND status != 'DISMISSED';

-- ============================================================================
-- 9. budgets (Monthly Category Limits in Paise for Personal Mode)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.budgets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users_profile(id) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
    month_year TEXT NOT NULL, -- Format: 'YYYY-MM', e.g., '2026-10'
    limit_paise BIGINT NOT NULL CHECK (limit_paise > 0),
    alert_threshold_percent INTEGER NOT NULL DEFAULT 80 CHECK (alert_threshold_percent BETWEEN 1 AND 100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (workspace_id, category_id, month_year)
);

-- ============================================================================
-- 10. reminders (24-Hour Due Date Alerts & Polite WhatsApp Message Logs)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.reminders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users_profile(id) ON DELETE CASCADE,
    obligation_id UUID NOT NULL REFERENCES public.udhaar_obligations(id) ON DELETE CASCADE,
    contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
    channel reminder_channel NOT NULL DEFAULT 'WHATSAPP',
    status reminder_status NOT NULL DEFAULT 'SCHEDULED',
    scheduled_for TIMESTAMPTZ NOT NULL,
    message_language app_language NOT NULL DEFAULT 'HINGLISH',
    composed_message TEXT NOT NULL,
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 11. audit_logs (Immutable Trail of Confirmations, Edits, and Settlements)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID REFERENCES public.workspaces(id) ON DELETE SET NULL,
    user_id UUID NOT NULL REFERENCES public.users_profile(id) ON DELETE CASCADE,
    entity_table TEXT NOT NULL,
    entity_id UUID NOT NULL,
    action TEXT NOT NULL, -- e.g., 'DRAFT_CONFIRMED', 'PARTIAL_REPAYMENT', 'OBLIGATION_SETTLED'
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES — Strict User Isolation on All 11 Tables
-- ============================================================================
ALTER TABLE public.users_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.udhaar_obligations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.udhaar_ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ingestion_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- users_profile policy
CREATE POLICY "Users manage own profile"
    ON public.users_profile FOR ALL
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- Generic user_id ownership policies for the remaining 10 tables
CREATE POLICY "Users manage own workspaces"
    ON public.workspaces FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users manage own contacts"
    ON public.contacts FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users manage own categories"
    ON public.categories FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users manage own transactions"
    ON public.transactions FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users manage own udhaar_obligations"
    ON public.udhaar_obligations FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users manage own udhaar_ledger_entries"
    ON public.udhaar_ledger_entries FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users manage own ingestion_drafts"
    ON public.ingestion_drafts FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users manage own budgets"
    ON public.budgets FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users manage own reminders"
    ON public.reminders FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users manage own audit_logs"
    ON public.audit_logs FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- AUTOMATIC SIGNUP PROVISIONING TRIGGER
-- Creates Personal (#6F4E37 Coffee Brown) & Business (#3E2723 Mahogany Brown)
-- Workspaces + Default Categories on New User Registration
-- ============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_fintrack_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_personal_ws UUID;
    v_business_ws UUID;
BEGIN
    INSERT INTO public.users_profile (id, full_name, preferred_language, active_mode)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', 'FinTrack User'),
        'HINGLISH',
        'PERSONAL'
    );

    -- Create PERSONAL Workspace (Warm Coffee Brown #6F4E37)
    INSERT INTO public.workspaces (user_id, mode, display_name, theme_primary_hex)
    VALUES (NEW.id, 'PERSONAL', 'Ghar Ka Khata (Personal)', '#6F4E37')
    RETURNING id INTO v_personal_ws;

    -- Create BUSINESS Workspace (Deep Mahogany Brown #3E2723)
    INSERT INTO public.workspaces (user_id, mode, display_name, theme_primary_hex)
    VALUES (NEW.id, 'BUSINESS', 'Vyapaar Khata (Business)', '#3E2723')
    RETURNING id INTO v_business_ws;

    -- Default Personal Categories
    INSERT INTO public.categories (workspace_id, user_id, name, kind, icon_name, color_hex, is_system)
    VALUES
        (v_personal_ws, NEW.id, 'Grocery & Rashan', 'EXPENSE', 'basket-outline', '#6F4E37', TRUE),
        (v_personal_ws, NEW.id, 'Chai & Dining', 'EXPENSE', 'cafe-outline', '#C88A4B', TRUE),
        (v_personal_ws, NEW.id, 'Petrol & Travel', 'EXPENSE', 'car-outline', '#8D5B4C', TRUE),
        (v_personal_ws, NEW.id, 'Bills & Recharge', 'EXPENSE', 'flash-outline', '#9C6B30', TRUE),
        (v_personal_ws, NEW.id, 'Salary & Income', 'INCOME', 'wallet-outline', '#3B7A57', TRUE);

    -- Default Business Categories
    INSERT INTO public.categories (workspace_id, user_id, name, kind, icon_name, color_hex, is_system)
    VALUES
        (v_business_ws, NEW.id, 'Dukaan Stock / Maal', 'EXPENSE', 'cube-outline', '#3E2723', TRUE),
        (v_business_ws, NEW.id, 'Transport & Bhada', 'EXPENSE', 'bus-outline', '#7A5230', TRUE),
        (v_business_ws, NEW.id, 'Counter Bikri (Sales)', 'INCOME', 'cash-outline', '#3B7A57', TRUE);

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_fintrack_user();

-- ============================================================================
-- TABLE PERMISSION GRANTS FOR SUPABASE API ROLES (anon, authenticated, service_role)
-- Fixes "permission denied for table workspaces" on custom SQL migrations
-- ============================================================================
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;

