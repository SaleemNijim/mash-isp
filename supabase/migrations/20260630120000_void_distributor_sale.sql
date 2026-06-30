-- ============================================================
-- void_distributor_sale: إلغاء بيع موزع (استرجاع مخزون + عكس رصيد/بنك)
-- ============================================================
-- يُستخدم من زر التعديل في سجل المبيعات لتصحيح بيع موزع خاطئ:
-- يسترجع المخزون لكل صنف، ويعكس رصيد الموزع المستحق (دين) أو الحساب
-- البنكي، ثم يحذف البيع وبنوده حذفاً ناعماً. بعدها يعيد المستخدم الإدخال
-- صحيحاً عبر «بيع لموزع».

CREATE OR REPLACE FUNCTION void_distributor_sale(
  p_sale_id UUID,
  p_nonce   TEXT DEFAULT NULL
) RETURNS VOID AS $$
DECLARE
  v_tenant_id UUID;
  v_sale      RECORD;
  v_item      RECORD;
BEGIN
  v_tenant_id := get_tenant_id();
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_nonce IS NOT NULL AND EXISTS (SELECT 1 FROM sync_nonces WHERE nonce = p_nonce) THEN
    RAISE EXCEPTION 'Duplicate nonce — 409 Conflict'
      USING ERRCODE = '23505';
  END IF;

  SELECT id, distributor_id, payment_method, bank_account_id, total_amount
  INTO v_sale
  FROM card_distributor_sales
  WHERE id = p_sale_id
    AND tenant_id = v_tenant_id
    AND is_deleted = false;

  IF v_sale.id IS NULL THEN
    RAISE EXCEPTION 'Sale not found';
  END IF;

  FOR v_item IN
    SELECT product_id, quantity, batch_id
    FROM card_sale_items
    WHERE sale_id = p_sale_id
      AND tenant_id = v_tenant_id
      AND is_deleted = false
  LOOP
    PERFORM restore_retail_sale_stock(
      v_tenant_id, v_item.product_id, v_item.quantity, v_item.batch_id
    );
  END LOOP;

  IF v_sale.payment_method = 'debt' AND v_sale.distributor_id IS NOT NULL THEN
    UPDATE distributors
    SET balance_due = GREATEST(0, COALESCE(balance_due, 0) - COALESCE(v_sale.total_amount, 0))
    WHERE id = v_sale.distributor_id AND tenant_id = v_tenant_id;
  ELSIF v_sale.bank_account_id IS NOT NULL
    AND v_sale.payment_method IN ('reflect','jawwal_pay','bank') THEN
    UPDATE company_bank_accounts
    SET current_total = GREATEST(0, COALESCE(current_total, 0) - COALESCE(v_sale.total_amount, 0))
    WHERE id = v_sale.bank_account_id AND tenant_id = v_tenant_id;
  END IF;

  UPDATE card_sale_items
  SET is_deleted = true
  WHERE sale_id = p_sale_id AND tenant_id = v_tenant_id;

  UPDATE card_distributor_sales
  SET is_deleted = true
  WHERE id = p_sale_id AND tenant_id = v_tenant_id;

  IF p_nonce IS NOT NULL THEN
    INSERT INTO sync_nonces (tenant_id, nonce) VALUES (v_tenant_id, p_nonce);
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION void_distributor_sale(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION void_distributor_sale(UUID, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
