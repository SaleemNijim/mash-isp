-- ============================================================================
-- تصحيح السجلات التاريخية لتجديدات PPP بعد إصلاح منطق التحصيل
-- ============================================================================
-- Idempotent: يمكن تشغيله أكثر من مرة بدون تغيير إضافي بعد أول إصلاح.

UPDATE subscription_periods sp
SET balance_remaining = c.corrected_balance
FROM (
  SELECT
    id,
    GREATEST(
      COALESCE(amount_due, 0)
        - COALESCE(cash_amount, 0)
        - COALESCE(app_amount, 0)
        - COALESCE(discount_amount, 0),
      0
    ) AS corrected_balance
  FROM subscription_periods
  WHERE is_deleted = false
) c
WHERE sp.id = c.id
  AND COALESCE(sp.balance_remaining, 0) <> c.corrected_balance;

UPDATE payments p
SET amount = c.received_amount
FROM (
  SELECT
    payment_id,
    COALESCE(cash_amount, 0) + COALESCE(app_amount, 0) AS received_amount
  FROM subscription_periods
  WHERE is_deleted = false
    AND payment_id IS NOT NULL
) c
WHERE p.id = c.payment_id
  AND COALESCE(p.amount, 0) <> c.received_amount;

UPDATE debts d
SET
  original_amount = c.corrected_balance,
  remaining_amount = c.corrected_balance,
  status = CASE WHEN c.corrected_balance > 0 THEN 'active' ELSE 'paid' END
FROM (
  SELECT
    id,
    GREATEST(
      COALESCE(amount_due, 0)
        - COALESCE(cash_amount, 0)
        - COALESCE(app_amount, 0)
        - COALESCE(discount_amount, 0),
      0
    ) AS corrected_balance
  FROM subscription_periods
  WHERE is_deleted = false
) c
WHERE d.subscription_period_id = c.id
  AND d.is_deleted = false
  AND (
    COALESCE(d.original_amount, 0) <> c.corrected_balance
    OR COALESCE(d.remaining_amount, 0) <> c.corrected_balance
    OR (c.corrected_balance > 0 AND d.status <> 'active')
    OR (c.corrected_balance = 0 AND d.status IN ('active', 'temporary'))
  );

INSERT INTO debts (
  tenant_id,
  customer_id,
  original_amount,
  remaining_amount,
  reason,
  status,
  subscription_period_id
)
SELECT
  sp.tenant_id,
  sp.customer_id,
  GREATEST(
    COALESCE(sp.amount_due, 0)
      - COALESCE(sp.cash_amount, 0)
      - COALESCE(sp.app_amount, 0)
      - COALESCE(sp.discount_amount, 0),
    0
  ) AS corrected_balance,
  GREATEST(
    COALESCE(sp.amount_due, 0)
      - COALESCE(sp.cash_amount, 0)
      - COALESCE(sp.app_amount, 0)
      - COALESCE(sp.discount_amount, 0),
    0
  ) AS corrected_balance,
  'تجديد PPP — باقٍ غير مسدد',
  'active',
  sp.id
FROM subscription_periods sp
WHERE sp.is_deleted = false
  AND GREATEST(
    COALESCE(sp.amount_due, 0)
      - COALESCE(sp.cash_amount, 0)
      - COALESCE(sp.app_amount, 0)
      - COALESCE(sp.discount_amount, 0),
    0
  ) > 0
  AND NOT EXISTS (
    SELECT 1
    FROM debts d
    WHERE d.subscription_period_id = sp.id
      AND d.is_deleted = false
  );
