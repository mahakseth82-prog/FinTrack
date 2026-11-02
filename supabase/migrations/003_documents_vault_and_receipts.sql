-- ============================================================================
-- Migration 003: Digital Document Vault & Receipt Linkage
-- Creates documents_vault table, adds UNSPECIFIED payment mode, and configures
-- receipt image linkage on transactions.
-- ============================================================================

-- 1. Add 'UNSPECIFIED' to payment_channel enum if not already present
DO $$
BEGIN
    ALTER TYPE payment_channel ADD VALUE IF NOT EXISTS 'UNSPECIFIED';
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- 2. Ensure transactions table has receipt_image_path and receipt_image_url
ALTER TABLE public.transactions
    ADD COLUMN IF NOT EXISTS receipt_image_path TEXT,
    ADD COLUMN IF NOT EXISTS receipt_image_url TEXT;

-- 3. Create documents_vault table
CREATE TABLE IF NOT EXISTS public.documents_vault (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users_profile(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    doc_type TEXT NOT NULL CHECK (doc_type IN ('BILL', 'INVOICE', 'INSURANCE', 'WARRANTY', 'RC_BOOK', 'OTHER')),
    file_url TEXT NOT NULL,
    file_path TEXT,
    expiry_date DATE,
    linked_transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_documents_vault_user_ws ON public.documents_vault(user_id, workspace_id);
CREATE INDEX IF NOT EXISTS idx_documents_vault_type ON public.documents_vault(doc_type);
CREATE INDEX IF NOT EXISTS idx_documents_vault_tx ON public.documents_vault(linked_transaction_id);

-- 4. Enable Row Level Security (RLS) on documents_vault
ALTER TABLE public.documents_vault ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'documents_vault' AND policyname = 'Users can manage their own documents in vault'
    ) THEN
        CREATE POLICY "Users can manage their own documents in vault"
            ON public.documents_vault
            FOR ALL
            USING (auth.uid() = user_id)
            WITH CHECK (auth.uid() = user_id);
    END IF;
END $$;

-- 5. Storage bucket setup for documents-vault
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents-vault', 'documents-vault', false)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'objects' AND policyname = 'Users can upload to documents-vault'
    ) THEN
        CREATE POLICY "Users can upload to documents-vault"
            ON storage.objects FOR INSERT
            WITH CHECK (bucket_id = 'documents-vault' AND auth.uid()::text = (storage.foldername(name))[1]);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'objects' AND policyname = 'Users can view their own documents-vault objects'
    ) THEN
        CREATE POLICY "Users can view their own documents-vault objects"
            ON storage.objects FOR SELECT
            USING (bucket_id = 'documents-vault' AND auth.uid()::text = (storage.foldername(name))[1]);
    END IF;
END $$;

