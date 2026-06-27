-- ============================================================================
-- 066: تتبع من نفّذ عمليات البيع (كاشير / مسؤول)
-- ============================================================================

ALTER TABLE card_distributor_sales
  ADD COLUMN IF NOT EXISTS sold_by UUID REFERENCES users(id);

ALTER TABLE subscription_periods
  ADD COLUMN IF NOT EXISTS recorded_by UUID REFERENCES users(id);

CREATE INDEX IF NOT EXISTS idx_card_distributor_sales_sold_by
  ON card_distributor_sales (tenant_id, sold_by, created_at DESC)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_subscription_periods_recorded_by
  ON subscription_periods (tenant_id, recorded_by, created_at DESC)
  WHERE is_deleted = false;

-- sell_cards — يُسجّل المنفّذ
CREATE OR REPLACE FUNCTION sell_cards(
  p_distributor_id       UUID,
  p_commission_percent   NUMERIC,
  p_payment_method       TEXT,
  p_bank_account_id      UUID,
  p_proof_url            TEXT,
  p_items                JSONB,
  p_nonce                TEXT,
  p_source_account_label TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_tenant_id        UUID;
  v_sale_id          UUID;
  v_distributor_name TEXT;
  v_balance_due      NUMERIC;
  v_item             JSONB;
  v_product_id       UUID;
  v_batch_id         UUID;
  v_paid_qty         INTEGER;
  v_bonus_qty        INTEGER;
  v_total_qty        INTEGER;
  v_line_amount      NUMERIC;
  v_unit_price       NUMERIC;
  v_list_price       NUMERIC;
  v_stock            INTEGER;
  v_total            NUMERIC := 0;
  v_commission       NUMERIC;
BEGIN
  v_tenant_id := get_tenant_id();
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF EXISTS (SELECT 1 FROM sync_nonces WHERE nonce = p_nonce) THEN
    RAISE EXCEPTION 'Duplicate nonce — 409 Conflict'
      USING ERRCODE = '23505';
  END IF;

  IF p_payment_method NOT IN ('cash','debt','reflect','jawwal_pay','bank') THEN
    RAISE EXCEPTION 'Invalid payment_method';
  END IF;

  IF p_payment_method IN ('reflect','jawwal_pay','bank') THEN
    IF p_bank_account_id IS NULL THEN
      RAISE EXCEPTION 'bank_account_id required for bank transfer';
    END IF;
  END IF;

  v_commission := GREATEST(COALESCE(p_commission_percent, 0), 0);
  IF v_commission > 100 THEN
    RAISE EXCEPTION 'commission_percent cannot exceed 100';
  END IF;

  SELECT name, balance_due
  INTO v_distributor_name, v_balance_due
  FROM distributors
  WHERE id = p_distributor_id
    AND tenant_id = v_tenant_id
    AND is_deleted = false;

  IF v_distributor_name IS NULL THEN
    RAISE EXCEPTION 'Distributor not found';
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'At least one item is required';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::UUID;
    v_unit_price := (v_item->>'unit_price')::NUMERIC;

    IF v_unit_price IS NULL OR v_unit_price <= 0 THEN
      RAISE EXCEPTION 'Invalid unit_price';
    END IF;

    IF (v_item->>'line_amount') IS NOT NULL AND (v_item->>'line_amount') <> '' THEN
      v_line_amount := (v_item->>'line_amount')::NUMERIC;
      IF v_line_amount IS NULL OR v_line_amount <= 0 THEN
        RAISE EXCEPTION 'Invalid line_amount';
      END IF;
      v_paid_qty := FLOOR(v_line_amount / v_unit_price)::INTEGER;
    ELSIF (v_item->>'quantity') IS NOT NULL AND (v_item->>'quantity') <> '' THEN
      v_paid_qty := (v_item->>'quantity')::INTEGER;
      v_line_amount := v_paid_qty * v_unit_price;
    ELSE
      RAISE EXCEPTION 'line_amount or quantity required';
    END IF;

    IF v_paid_qty IS NULL OR v_paid_qty <= 0 THEN
      RAISE EXCEPTION 'line_amount too small for unit_price';
    END IF;

    v_bonus_qty := FLOOR((v_paid_qty * v_commission) / 100)::INTEGER;
    v_total_qty := v_paid_qty + v_bonus_qty;

    SELECT quantity_in_stock INTO v_stock
    FROM card_products
    WHERE id = v_product_id
      AND tenant_id = v_tenant_id
      AND is_deleted = false;

    IF v_stock IS NULL THEN
      RAISE EXCEPTION 'Product not found';
    END IF;

    IF v_total_qty > v_stock THEN
      RAISE EXCEPTION 'Insufficient stock for product %', v_product_id;
    END IF;

    v_total := v_total + v_line_amount;
  END LOOP;

  INSERT INTO card_distributor_sales (
    tenant_id, distributor_id, distributor_name, total_amount,
    commission_percent, previous_balance, bank_account_id,
    payment_method, proof_url, source_account_label, sold_by
  ) VALUES (
    v_tenant_id, p_distributor_id, v_distributor_name, v_total,
    v_commission, v_balance_due, p_bank_account_id,
    p_payment_method, p_proof_url, NULLIF(trim(p_source_account_label), ''),
    auth.uid()
  ) RETURNING id INTO v_sale_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::UUID;
    v_unit_price := (v_item->>'unit_price')::NUMERIC;
    v_batch_id   := NULLIF(v_item->>'batch_id', '')::UUID;

    IF (v_item->>'line_amount') IS NOT NULL AND (v_item->>'line_amount') <> '' THEN
      v_line_amount := (v_item->>'line_amount')::NUMERIC;
      v_paid_qty := FLOOR(v_line_amount / v_unit_price)::INTEGER;
    ELSE
      v_paid_qty := (v_item->>'quantity')::INTEGER;
      v_line_amount := v_paid_qty * v_unit_price;
    END IF;

    v_bonus_qty := FLOOR((v_paid_qty * v_commission) / 100)::INTEGER;
    v_total_qty := v_paid_qty + v_bonus_qty;

    SELECT COALESCE(sale_price, v_unit_price) INTO v_list_price
    FROM card_products
    WHERE id = v_product_id AND tenant_id = v_tenant_id;

    v_batch_id := deduct_batch_stock_fifo(
      v_tenant_id, v_product_id, v_total_qty, v_batch_id
    );

    INSERT INTO card_sale_items (
      tenant_id, sale_id, product_id, quantity,
      paid_quantity, bonus_quantity,
      unit_price, list_price, batch_id
    ) VALUES (
      v_tenant_id, v_sale_id, v_product_id, v_total_qty,
      v_paid_qty, v_bonus_qty,
      v_unit_price, v_list_price, v_batch_id
    );

    UPDATE card_products
    SET quantity_in_stock = quantity_in_stock - v_total_qty
    WHERE id = v_product_id AND tenant_id = v_tenant_id;
  END LOOP;

  IF p_payment_method = 'debt' THEN
    UPDATE distributors
    SET balance_due = balance_due + v_total
    WHERE id = p_distributor_id AND tenant_id = v_tenant_id;
  ELSIF p_bank_account_id IS NOT NULL
    AND p_payment_method IN ('reflect','jawwal_pay','bank') THEN
    UPDATE company_bank_accounts
    SET current_total = COALESCE(current_total, 0) + v_total
    WHERE id = p_bank_account_id AND tenant_id = v_tenant_id;
  END IF;

  INSERT INTO sync_nonces (tenant_id, nonce) VALUES (v_tenant_id, p_nonce);

  RETURN v_sale_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- create_subscription_with_period — يُسجّل المنفّذ
CREATE OR REPLACE FUNCTION create_subscription_with_period(
  p_customer_id           UUID,
  p_speed                 TEXT,
  p_price                 NUMERIC,
  p_start_date            DATE,
  p_end_date              DATE,
  p_mac_address           TEXT DEFAULT NULL,
  p_notes                 TEXT DEFAULT NULL,
  p_amount_due            NUMERIC DEFAULT NULL,
  p_cash_amount           NUMERIC DEFAULT 0,
  p_app_amount            NUMERIC DEFAULT 0,
  p_discount_amount       NUMERIC DEFAULT 0,
  p_balance_remaining     NUMERIC DEFAULT 0,
  p_paid_at               TIMESTAMPTZ DEFAULT NULL,
  p_credential_id         UUID DEFAULT NULL,
  p_bank_account_id       UUID DEFAULT NULL,
  p_source_account_label  TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_tenant_id       UUID;
  v_subscription_id UUID;
  v_period_id       UUID;
  v_payment_id      UUID;
  v_due             NUMERIC;
  v_cash            NUMERIC;
  v_app             NUMERIC;
  v_paid_total      NUMERIC;
  v_method          TEXT;
  v_paid_at         TIMESTAMPTZ;
  v_debt            NUMERIC;
  v_username        TEXT;
  v_pre_reserved    BOOLEAN := false;
BEGIN
  v_tenant_id := get_tenant_id();
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_customer_id IS NULL OR p_start_date IS NULL OR p_end_date IS NULL THEN
    RAISE EXCEPTION 'Missing required fields';
  END IF;

  IF p_credential_id IS NULL THEN
    RAISE EXCEPTION 'credential_id required — اختر username BB غير مستخدم';
  END IF;

  v_due := COALESCE(p_amount_due, p_price, 0);
  v_cash := COALESCE(p_cash_amount, 0);
  v_app := COALESCE(p_app_amount, 0);
  v_paid_total := v_cash + v_app;
  v_paid_at := COALESCE(p_paid_at, now());

  IF v_cash < 0 OR v_app < 0 OR COALESCE(p_discount_amount, 0) < 0 OR COALESCE(p_balance_remaining, 0) < 0 THEN
    RAISE EXCEPTION 'Payment values cannot be negative';
  END IF;

  IF v_app > 0 AND p_bank_account_id IS NULL THEN
    RAISE EXCEPTION 'bank_account_id required for app payment';
  END IF;

  IF v_app > 0 AND NOT EXISTS (
    SELECT 1 FROM company_bank_accounts a
    WHERE a.id = p_bank_account_id
      AND a.tenant_id = v_tenant_id
      AND a.is_deleted = false
  ) THEN
    RAISE EXCEPTION 'bank account not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM customers c
    WHERE c.id = p_customer_id
      AND c.tenant_id = v_tenant_id
      AND c.is_deleted = false
  ) THEN
    RAISE EXCEPTION 'Customer not found';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM customer_credential_usage ccu
    WHERE ccu.credential_id = p_credential_id
      AND ccu.customer_id = p_customer_id
      AND ccu.tenant_id = v_tenant_id
      AND ccu.is_deleted = false
  ) INTO v_pre_reserved;

  SELECT ic.username INTO v_username
  FROM internet_credentials ic
  WHERE ic.id = p_credential_id
    AND ic.tenant_id = v_tenant_id
    AND ic.type = 'bb'
    AND ic.is_deleted = false
    AND (ic.is_used = false OR v_pre_reserved);

  IF v_username IS NULL THEN
    RAISE EXCEPTION 'Credential not found or already used';
  END IF;

  INSERT INTO subscriptions (
    tenant_id, customer_id, type, speed, price,
    start_date, end_date, status
  ) VALUES (
    v_tenant_id, p_customer_id, 'bb', p_speed, p_price,
    p_start_date, p_end_date, 'active'
  ) RETURNING id INTO v_subscription_id;

  UPDATE internet_credentials
  SET is_used = true
  WHERE id = p_credential_id AND tenant_id = v_tenant_id;

  IF NOT v_pre_reserved THEN
    INSERT INTO customer_credential_usage (
      tenant_id, customer_id, credential_id
    ) VALUES (
      v_tenant_id, p_customer_id, p_credential_id
    );
  END IF;

  IF v_paid_total > 0 THEN
    v_method := CASE WHEN v_app > 0 THEN 'bank' ELSE 'cash' END;

    INSERT INTO payments (
      tenant_id, customer_id, subscription_id,
      amount, method, bank_account_id, source_account_label, paid_at, notes
    ) VALUES (
      v_tenant_id, p_customer_id, v_subscription_id,
      v_paid_total,
      v_method,
      CASE WHEN v_app > 0 THEN p_bank_account_id ELSE NULL END,
      CASE WHEN v_app > 0 THEN NULLIF(trim(p_source_account_label), '') ELSE NULL END,
      v_paid_at,
      p_notes
    ) RETURNING id INTO v_payment_id;

    IF v_app > 0 THEN
      UPDATE company_bank_accounts
      SET current_total = COALESCE(current_total, 0) + v_app
      WHERE id = p_bank_account_id AND tenant_id = v_tenant_id;
    END IF;
  END IF;

  INSERT INTO subscription_periods (
    tenant_id, customer_id, subscription_id, credential_id, username,
    period_month, period_start, speed, mac_address, price,
    billing_label, amount_due, cash_amount, app_amount,
    discount_amount, balance_remaining, paid_at, payment_id, notes, recorded_by
  ) VALUES (
    v_tenant_id, p_customer_id, v_subscription_id, p_credential_id, v_username,
    EXTRACT(MONTH FROM p_start_date)::INTEGER,
    p_start_date, p_speed, NULLIF(trim(p_mac_address), ''), p_price,
    'شهري', v_due,
    v_cash, v_app,
    COALESCE(p_discount_amount, 0), COALESCE(p_balance_remaining, 0),
    CASE WHEN v_paid_total > 0 THEN v_paid_at ELSE NULL END,
    v_payment_id,
    p_notes,
    auth.uid()
  ) RETURNING id INTO v_period_id;

  v_debt := calc_subscription_debt_amount(
    v_due, v_cash, v_app, p_discount_amount,
    p_balance_remaining, CASE WHEN v_paid_total > 0 THEN v_paid_at ELSE NULL END,
    v_method, v_paid_total
  );

  PERFORM upsert_subscription_period_debt(
    v_tenant_id, p_customer_id, v_period_id, v_debt,
    'اشتراك PPP — باقٍ غير مسدد'
  );

  RETURN v_subscription_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- renew_subscription — يُسجّل المنفّذ
CREATE OR REPLACE FUNCTION renew_subscription(
  p_subscription_id   UUID,
  p_credential_id     UUID,
  p_amount            NUMERIC,
  p_method            TEXT,
  p_bank_account_id   UUID,
  p_nonce             TEXT,
  p_mac_address       TEXT DEFAULT NULL,
  p_cash_amount       NUMERIC DEFAULT NULL,
  p_app_amount        NUMERIC DEFAULT NULL,
  p_discount_amount   NUMERIC DEFAULT 0,
  p_balance_remaining NUMERIC DEFAULT 0,
  p_notes             TEXT DEFAULT NULL,
  p_source_account_label TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_tenant_id      UUID;
  v_customer_id    UUID;
  v_speed          TEXT;
  v_price          NUMERIC;
  v_old_end        DATE;
  v_period_start   DATE;
  v_username       TEXT;
  v_payment_id     UUID;
  v_period_id      UUID;
  v_cash           NUMERIC;
  v_app            NUMERIC;
  v_discount       NUMERIC;
  v_balance        NUMERIC;
  v_received       NUMERIC;
  v_payment_method TEXT;
BEGIN
  IF get_tenant_id() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF EXISTS (SELECT 1 FROM sync_nonces WHERE nonce = p_nonce) THEN
    RAISE EXCEPTION 'Duplicate nonce — 409 Conflict'
      USING ERRCODE = '23505';
  END IF;

  SELECT s.tenant_id, s.customer_id, s.speed, s.price, s.end_date
  INTO v_tenant_id, v_customer_id, v_speed, v_price, v_old_end
  FROM subscriptions s
  WHERE s.id = p_subscription_id
    AND s.tenant_id = get_tenant_id()
    AND s.is_deleted = false;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Subscription not found';
  END IF;

  IF p_credential_id IS NULL THEN
    RAISE EXCEPTION 'credential_id required for BB renewal';
  END IF;

  IF p_amount IS NULL OR p_amount < 0 THEN
    RAISE EXCEPTION 'amount_due must be valid';
  END IF;

  v_period_start := COALESCE(v_old_end, CURRENT_DATE);
  v_cash := COALESCE(p_cash_amount, CASE WHEN p_method = 'cash' THEN p_amount ELSE 0 END, 0);
  v_app := COALESCE(p_app_amount, CASE WHEN p_method IN ('reflect','jawwal_pay','bank') THEN p_amount ELSE 0 END, 0);
  v_discount := COALESCE(p_discount_amount, 0);

  IF v_cash < 0 OR v_app < 0 OR v_discount < 0 THEN
    RAISE EXCEPTION 'payment amounts must be non-negative';
  END IF;

  IF v_cash + v_app + v_discount > p_amount THEN
    RAISE EXCEPTION 'payment exceeds amount due';
  END IF;

  v_balance := GREATEST(p_amount - v_cash - v_app - v_discount, 0);
  v_received := v_cash + v_app;
  v_payment_method := CASE
    WHEN v_app > 0 THEN 'bank'
    WHEN v_cash > 0 THEN 'cash'
    ELSE p_method
  END;

  IF v_app > 0 AND p_bank_account_id IS NULL THEN
    RAISE EXCEPTION 'bank_account_id required for app amount';
  END IF;

  UPDATE subscriptions
  SET end_date = end_date + INTERVAL '1 month'
  WHERE id = p_subscription_id;

  SELECT username INTO v_username
  FROM internet_credentials
  WHERE id = p_credential_id
    AND tenant_id = v_tenant_id
    AND type = 'bb'
    AND is_deleted = false;

  IF v_username IS NULL THEN
    RAISE EXCEPTION 'Credential not found';
  END IF;

  UPDATE internet_credentials
  SET is_used = true
  WHERE id = p_credential_id AND tenant_id = v_tenant_id;

  INSERT INTO customer_credential_usage (
    tenant_id, customer_id, credential_id
  ) VALUES (
    v_tenant_id, v_customer_id, p_credential_id
  );

  IF v_received > 0 THEN
    INSERT INTO payments (
      tenant_id, customer_id, subscription_id,
      amount, method, bank_account_id, source_account_label, paid_at, notes
    ) VALUES (
      v_tenant_id, v_customer_id, p_subscription_id,
      v_received, v_payment_method, p_bank_account_id,
      NULLIF(trim(p_source_account_label), ''), now(), p_notes
    ) RETURNING id INTO v_payment_id;
  END IF;

  IF v_app > 0 AND p_bank_account_id IS NOT NULL THEN
    UPDATE company_bank_accounts
    SET current_total = COALESCE(current_total, 0) + v_app
    WHERE id = p_bank_account_id AND tenant_id = v_tenant_id;
  END IF;

  INSERT INTO subscription_periods (
    tenant_id, customer_id, subscription_id, credential_id, username,
    period_month, period_start, speed, mac_address, price, billing_label,
    amount_due, cash_amount, app_amount, discount_amount, balance_remaining,
    paid_at, payment_id, notes, recorded_by
  ) VALUES (
    v_tenant_id, v_customer_id, p_subscription_id, p_credential_id, v_username,
    EXTRACT(MONTH FROM v_period_start)::INTEGER,
    v_period_start, v_speed, NULLIF(trim(p_mac_address), ''), v_price, 'شهري',
    p_amount, v_cash, v_app, v_discount, v_balance,
    CASE WHEN v_received > 0 THEN now() ELSE NULL END, v_payment_id, p_notes,
    auth.uid()
  ) RETURNING id INTO v_period_id;

  PERFORM upsert_subscription_period_debt(
    v_tenant_id, v_customer_id, v_period_id, v_balance,
    CASE
      WHEN p_method = 'debt' THEN 'تجديد PPP — دفع آجل (دين)'
      ELSE 'تجديد PPP — باقٍ غير مسدد'
    END
  );

  INSERT INTO sync_nonces (tenant_id, nonce)
  VALUES (v_tenant_id, p_nonce);

  RETURN v_period_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION sell_cards(UUID, NUMERIC, TEXT, UUID, TEXT, JSONB, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sell_cards(UUID, NUMERIC, TEXT, UUID, TEXT, JSONB, TEXT, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION create_subscription_with_period(
  UUID, TEXT, NUMERIC, DATE, DATE, TEXT, TEXT,
  NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TIMESTAMPTZ, UUID, UUID, TEXT
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_subscription_with_period(
  UUID, TEXT, NUMERIC, DATE, DATE, TEXT, TEXT,
  NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TIMESTAMPTZ, UUID, UUID, TEXT
) TO authenticated;

REVOKE ALL ON FUNCTION renew_subscription(UUID, UUID, NUMERIC, TEXT, UUID, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION renew_subscription(UUID, UUID, NUMERIC, TEXT, UUID, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
