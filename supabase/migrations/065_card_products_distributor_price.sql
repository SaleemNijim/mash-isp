-- ============================================================================
-- 065: سعر الموزع لمنتجات البطاقات
-- ============================================================================
-- sale_price = سعر التجزئة (القائمة)
-- distributor_price = سعر البطاقة للموزع (يُستخدم في sell_cards)

ALTER TABLE card_products
  ADD COLUMN IF NOT EXISTS distributor_price NUMERIC(10,2);

COMMENT ON COLUMN card_products.distributor_price IS
  'سعر البطاقة للموزع — يُعبَّأ تلقائياً في بيع الموزع؛ sale_price يبقى لسعر التجزئة';

NOTIFY pgrst, 'reload schema';
