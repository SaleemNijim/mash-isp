-- ============================================================================
-- 014: تشفير كلمات مرور internet_credentials عبر Supabase Vault
-- ============================================================================
-- المشكلة: عمود password في internet_credentials كان TEXT عادي — كلمات
-- مرور بيانات اعتماد إنترنت العملاء تُخزَّن نص صريح في قاعدة بيانات SaaS
-- متعددة المستأجرين. أي تسريب نسخة احتياطية (backup dump)، أو وصول مباشر
-- لقاعدة البيانات (service role مسروق، إلخ) يُعرّض كل كلمات المرور فوراً.
--
-- لماذا Vault وليس pgsodium المباشر أو تشفير تطبيقي (lib/db/crypto.ts):
--   - lib/db/crypto.ts صُمم لتشفير مؤقت في الذاكرة على المتصفح فقط
--     (in-memory)، وليس كحل تشفير-عند-السكون. غير مناسب هنا أصلاً.
--   - pgsodium المباشر (Server Key Management / TCE) غير موصى به رسمياً
--     من Supabase بسبب تعقيد إدارة المفاتيح وخطر سوء التهيئة.
--   - Vault مفعّل افتراضياً على كل مشروع Supabase، يدير مفتاح التشفير
--     خارج قاعدة البيانات تماماً (لا يُمكن استخراجه حتى مع تسريب كامل
--     لقاعدة البيانات)، ويوفر فك تشفير قابل للاستدعاء — وهو مطلوب هنا
--     فعلياً لأن الواجهة (PasswordCell في CredentialRow.tsx) تحتاج زر
--     "إظهار" يسترجع كلمة المرور الفعلية لمستخدم بصلاحية view_full_password.
-- ============================================================================

-- 1) عمود جديد يخزّن فقط UUID السر داخل vault.secrets — لا نص صريح أبداً
ALTER TABLE internet_credentials
  ADD COLUMN password_secret_id UUID REFERENCES vault.secrets(id);

-- 2) ترحيل أي كلمات مرور موجودة فعلياً إلى Vault قبل حذف العمود القديم
DO $$
DECLARE
  r RECORD;
  v_secret_id UUID;
BEGIN
  FOR r IN
    SELECT id, password FROM internet_credentials
    WHERE password IS NOT NULL AND password <> ''
  LOOP
    v_secret_id := vault.create_secret(r.password);
    UPDATE internet_credentials
      SET password_secret_id = v_secret_id
      WHERE id = r.id;
  END LOOP;
END $$;

-- 3) إزالة العمود القديم (نص صريح) نهائياً بعد الترحيل
ALTER TABLE internet_credentials DROP COLUMN password;

-- ────────────────────────────────────────────────────────────────────────────
-- 4) دوال RPC محصورة بالصلاحية — لا وصول مباشر لـ vault.secrets من العميل
-- ────────────────────────────────────────────────────────────────────────────

-- إنشاء/تحديث كلمة مرور بيانات اعتماد (يُستدعى عند الإضافة)
CREATE OR REPLACE FUNCTION set_credential_password(
  p_credential_id UUID,
  p_password       TEXT
) RETURNS VOID AS $$
DECLARE
  v_tenant_id UUID;
  v_secret_id UUID;
BEGIN
  SELECT tenant_id INTO v_tenant_id
    FROM internet_credentials WHERE id = p_credential_id;

  IF v_tenant_id IS NULL OR v_tenant_id <> get_tenant_id() THEN
    RAISE EXCEPTION 'credential not found or access denied';
  END IF;

  v_secret_id := vault.create_secret(p_password);

  UPDATE internet_credentials
    SET password_secret_id = v_secret_id
    WHERE id = p_credential_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- استرجاع كلمة المرور الفعلية — محصور بصلاحية view_full_password فقط
CREATE OR REPLACE FUNCTION reveal_credential_password(p_credential_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_tenant_id UUID;
  v_secret_id UUID;
  v_plain     TEXT;
BEGIN
  IF NOT has_permission(auth.uid(), 'view_full_password') THEN
    RAISE EXCEPTION 'insufficient permission';
  END IF;

  SELECT tenant_id, password_secret_id INTO v_tenant_id, v_secret_id
    FROM internet_credentials WHERE id = p_credential_id;

  IF v_tenant_id IS NULL OR v_tenant_id <> get_tenant_id() THEN
    RAISE EXCEPTION 'credential not found or access denied';
  END IF;

  IF v_secret_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT decrypted_secret INTO v_plain
    FROM vault.decrypted_secrets WHERE id = v_secret_id;

  RETURN v_plain;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION set_credential_password(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION reveal_credential_password(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION set_credential_password(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION reveal_credential_password(UUID) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 5) إدراج دفعي لاستيراد Excel (components/excel/ExcelImportEngine.ts)
-- ────────────────────────────────────────────────────────────────────────────
-- يستقبل مصفوفة JSON بنفس شكل validRows في ExcelImportEngine، ويتولى تشفير
-- كل كلمة مرور في Vault أثناء الإدراج — استدعاء RPC واحد للدفعة كاملة بدل
-- استدعاء منفصل لكل صف، حفاظاً على الأداء مع ملفات استيراد كبيرة.
CREATE OR REPLACE FUNCTION bulk_insert_credentials(p_rows JSONB)
RETURNS INTEGER AS $$
DECLARE
  v_tenant_id  UUID := get_tenant_id();
  r            JSONB;
  v_secret_id  UUID;
  v_count      INTEGER := 0;
BEGIN
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'no tenant context';
  END IF;

  FOR r IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    v_secret_id := NULL;
    IF (r->>'password') IS NOT NULL AND (r->>'password') <> '' THEN
      v_secret_id := vault.create_secret(r->>'password');
    END IF;

    INSERT INTO internet_credentials (
      tenant_id, username, password_secret_id, type, is_used, is_deleted
    ) VALUES (
      v_tenant_id,
      r->>'username',
      v_secret_id,
      COALESCE(r->>'type', 'bb'),
      COALESCE((r->>'is_used')::boolean, false),
      false
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION bulk_insert_credentials(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bulk_insert_credentials(JSONB) TO authenticated;
