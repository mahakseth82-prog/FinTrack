-- ============================================================================
-- FinTrack — /supabase/seed.sql
-- Permissions Fix + Realistic Indian Passbook & Udhaar Test Data (in Paise)
--
-- HOW TO USE (1-Click Setup in Supabase):
--   1. Copy this entire file (`Ctrl + A`, `Ctrl + C`).
--   2. Open Supabase Dashboard -> SQL Editor -> New Query.
--   3. Paste and click "Run".
-- ============================================================================

-- Step 1: Ensure API Roles Have Full Table Permissions (Fixes 42501 Permission Denied)
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;

-- Step 2: Seed Passbook Transactions, Budgets & Udhaar Khata for Latest Signed-Up User(s)
DO $$
DECLARE
    r_user RECORD;
    v_user_id UUID;
    v_personal_ws UUID;
    v_business_ws UUID;
    v_cat_grocery UUID;
    v_cat_petrol UUID;
    v_cat_chai UUID;
    v_cat_salary UUID;
    v_cat_stock UUID;
    v_cat_sales UUID;
    v_contact_ravi UUID;
    v_contact_suresh UUID;
    v_contact_gupta UUID;
    v_contact_rohan UUID;
    v_ob_ravi UUID;
    v_ob_suresh UUID;
    v_ob_gupta UUID;
    v_ob_rohan UUID;
    v_existing_tx_count INT;
BEGIN
    FOR r_user IN (SELECT id FROM public.users_profile ORDER BY created_at DESC) LOOP
        v_user_id := r_user.id;

        SELECT id INTO v_personal_ws FROM public.workspaces WHERE user_id = v_user_id AND mode = 'PERSONAL' LIMIT 1;
        SELECT id INTO v_business_ws FROM public.workspaces WHERE user_id = v_user_id AND mode = 'BUSINESS' LIMIT 1;

        -- Skip if already seeded for this user
        SELECT COUNT(*) INTO v_existing_tx_count FROM public.transactions WHERE workspace_id = v_personal_ws;
        IF v_existing_tx_count > 0 THEN
            RAISE NOTICE 'User % already has transactions. Skipping duplicate seed.', v_user_id;
            CONTINUE;
        END IF;

        -- Fetch default categories created by signup trigger
        SELECT id INTO v_cat_grocery FROM public.categories WHERE workspace_id = v_personal_ws AND name = 'Grocery & Rashan' LIMIT 1;
        SELECT id INTO v_cat_petrol  FROM public.categories WHERE workspace_id = v_personal_ws AND name = 'Petrol & Travel' LIMIT 1;
        SELECT id INTO v_cat_chai    FROM public.categories WHERE workspace_id = v_personal_ws AND name = 'Chai & Dining' LIMIT 1;
        SELECT id INTO v_cat_salary  FROM public.categories WHERE workspace_id = v_personal_ws AND name = 'Salary & Income' LIMIT 1;
        SELECT id INTO v_cat_stock   FROM public.categories WHERE workspace_id = v_business_ws AND name = 'Dukaan Stock / Maal' LIMIT 1;
        SELECT id INTO v_cat_sales   FROM public.categories WHERE workspace_id = v_business_ws AND name = 'Counter Bikri (Sales)' LIMIT 1;

        -- ====================================================================
        -- 1. Seed Personal Transactions (in integer Paise: ₹1 = 100 paise)
        -- ====================================================================
        INSERT INTO public.transactions (workspace_id, user_id, category_id, kind, amount_paise, payment_via, merchant_or_payee, description, occurred_at)
        VALUES
            (v_personal_ws, v_user_id, v_cat_salary,  'INCOME',  6800000, 'BANK_TRANSFER', 'TechCorp India Pvt Ltd', 'Monthly Salary Credit', NOW() - INTERVAL '10 days'),
            (v_personal_ws, v_user_id, v_cat_grocery, 'EXPENSE',  345000, 'UPI',           'DMart Supermarket',      'Monthly Aata, Dal & Oil', NOW() - INTERVAL '3 days'),
            (v_personal_ws, v_user_id, v_cat_petrol,  'EXPENSE',  210000, 'UPI',           'IndianOil Fuel Station', 'Car & Scooter Fuel', NOW() - INTERVAL '2 days'),
            (v_personal_ws, v_user_id, v_cat_grocery, 'EXPENSE',   75000, 'UPI',           'Mother Dairy Booth',     'Milk, Paneer & Curd', NOW() - INTERVAL '1 hour'),
            (v_personal_ws, v_user_id, v_cat_chai,    'EXPENSE',   64000, 'UPI',           'Haldiram & Chaayos',     'Evening Chai & Samosa', NOW() - INTERVAL '30 minutes');

        -- ====================================================================
        -- 2. Seed Personal Monthly Budgets (in Paise)
        -- ====================================================================
        INSERT INTO public.budgets (workspace_id, user_id, category_id, month_year, limit_paise, alert_threshold_percent)
        VALUES
            (v_personal_ws, v_user_id, v_cat_grocery, TO_CHAR(NOW(), 'YYYY-MM'), 500000, 80), -- ₹5,000 limit (₹4,200 spent = 84%)
            (v_personal_ws, v_user_id, v_cat_petrol,  TO_CHAR(NOW(), 'YYYY-MM'), 400000, 80), -- ₹4,000 limit
            (v_personal_ws, v_user_id, v_cat_chai,    TO_CHAR(NOW(), 'YYYY-MM'), 250000, 80)  -- ₹2,500 limit
        ON CONFLICT (workspace_id, category_id, month_year) DO NOTHING;

        -- ====================================================================
        -- 3. Seed Business Contacts, Obligations & Partial Repayment Entries
        -- ====================================================================
        -- Contact 1: Ravi Sharma (Customer - Owes ₹1,000 remaining out of ₹2,000)
        INSERT INTO public.contacts (workspace_id, user_id, display_name, phone_number, kind, net_balance_paise, notes)
        VALUES (v_business_ws, v_user_id, 'Ravi Sharma (Kirana Buyer)', '+919876543210', 'CUSTOMER', 100000, 'Regular wholesale customer')
        RETURNING id INTO v_contact_ravi;

        INSERT INTO public.udhaar_obligations (workspace_id, user_id, contact_id, direction, principal_paise, repaid_paise, remaining_paise, status, due_date, title_or_note)
        VALUES (v_business_ws, v_user_id, v_contact_ravi, 'RECEIVABLE', 200000, 100000, 100000, 'PARTIALLY_PAID', CURRENT_DATE + 1, '2 Peti Fortune Oil & Almonds')
        RETURNING id INTO v_ob_ravi;

        INSERT INTO public.udhaar_ledger_entries (obligation_id, workspace_id, user_id, contact_id, entry_kind, amount_paise, running_remaining_paise, payment_via, note, occurred_at)
        VALUES
            (v_ob_ravi, v_business_ws, v_user_id, v_contact_ravi, 'PRINCIPAL_GAVE', 200000, 200000, 'CASH', 'Udhaar Diya — 2 Peti Fortune Oil & Almonds', NOW() - INTERVAL '5 days'),
            (v_ob_ravi, v_business_ws, v_user_id, v_contact_ravi, 'REPAYMENT_IN',   100000, 100000, 'UPI',  'Wapas Mila via GPay (Partial Payment)', NOW() - INTERVAL '2 days');

        -- Contact 2: Suresh Catering (Customer - Overdue ₹4,000 remaining out of ₹5,500)
        INSERT INTO public.contacts (workspace_id, user_id, display_name, phone_number, kind, net_balance_paise, notes)
        VALUES (v_business_ws, v_user_id, 'Suresh Catering & Tent', '+919811122233', 'CUSTOMER', 400000, 'Wedding order client')
        RETURNING id INTO v_contact_suresh;

        INSERT INTO public.udhaar_obligations (workspace_id, user_id, contact_id, direction, principal_paise, repaid_paise, remaining_paise, status, due_date, title_or_note)
        VALUES (v_business_ws, v_user_id, v_contact_suresh, 'RECEIVABLE', 550000, 150000, 400000, 'PARTIALLY_PAID', CURRENT_DATE - 3, '50kg Basmati Rice & Ghee Tin')
        RETURNING id INTO v_ob_suresh;

        INSERT INTO public.udhaar_ledger_entries (obligation_id, workspace_id, user_id, contact_id, entry_kind, amount_paise, running_remaining_paise, payment_via, note, occurred_at)
        VALUES
            (v_ob_suresh, v_business_ws, v_user_id, v_contact_suresh, 'PRINCIPAL_GAVE', 550000, 550000, 'CASH', 'Udhaar Diya — 50kg Basmati Rice & Ghee Tin', NOW() - INTERVAL '9 days'),
            (v_ob_suresh, v_business_ws, v_user_id, v_contact_suresh, 'REPAYMENT_IN',   150000, 400000, 'CASH', 'Cash Advance Wapas Mila', NOW() - INTERVAL '6 days');

        -- Contact 3: Gupta Traders (Supplier - We owe ₹3,000 remaining out of ₹8,000)
        INSERT INTO public.contacts (workspace_id, user_id, display_name, phone_number, kind, net_balance_paise, notes)
        VALUES (v_business_ws, v_user_id, 'Gupta Traders (Wholesale Supplier)', '+919922334455', 'SUPPLIER', -300000, 'Atta & Maida Supplier')
        RETURNING id INTO v_contact_gupta;

        INSERT INTO public.udhaar_obligations (workspace_id, user_id, contact_id, direction, principal_paise, repaid_paise, remaining_paise, status, due_date, title_or_note)
        VALUES (v_business_ws, v_user_id, v_contact_gupta, 'PAYABLE', 800000, 500000, 300000, 'PARTIALLY_PAID', CURRENT_DATE + 7, '15 Bori Chakki Atta Bill #412')
        RETURNING id INTO v_ob_gupta;

        INSERT INTO public.udhaar_ledger_entries (obligation_id, workspace_id, user_id, contact_id, entry_kind, amount_paise, running_remaining_paise, payment_via, note, occurred_at)
        VALUES
            (v_ob_gupta, v_business_ws, v_user_id, v_contact_gupta, 'PRINCIPAL_GOT', 800000, 800000, 'BANK_TRANSFER', 'Maal Udhaar Liya — 15 Bori Chakki Atta', NOW() - INTERVAL '8 days'),
            (v_ob_gupta, v_business_ws, v_user_id, v_contact_gupta, 'REPAYMENT_OUT', 500000, 300000, 'UPI',           'Partial Payment Sent via PhonePe', NOW() - INTERVAL '3 days');

        -- Contact 4: Rohan (Personal Friend Udhaar - Owes ₹1,500)
        INSERT INTO public.contacts (workspace_id, user_id, display_name, phone_number, kind, net_balance_paise, notes)
        VALUES (v_personal_ws, v_user_id, 'Rohan (College Friend)', '+919711223344', 'FRIEND', 150000, 'Movie & dinner split')
        RETURNING id INTO v_contact_rohan;

        INSERT INTO public.udhaar_obligations (workspace_id, user_id, contact_id, direction, principal_paise, repaid_paise, remaining_paise, status, due_date, title_or_note)
        VALUES (v_personal_ws, v_user_id, v_contact_rohan, 'RECEIVABLE', 150000, 0, 150000, 'OPEN', CURRENT_DATE + 4, 'Movie Tickets & Dinner Split')
        RETURNING id INTO v_ob_rohan;

        INSERT INTO public.udhaar_ledger_entries (obligation_id, workspace_id, user_id, contact_id, entry_kind, amount_paise, running_remaining_paise, payment_via, note, occurred_at)
        VALUES
            (v_ob_rohan, v_personal_ws, v_user_id, v_contact_rohan, 'PRINCIPAL_GAVE', 150000, 150000, 'UPI', 'Paid for Rohan Movie & Dinner Split', NOW() - INTERVAL '2 days');

        RAISE NOTICE 'FinTrack seed.sql completed successfully for user %', v_user_id;
    END LOOP;
END;
$$;
