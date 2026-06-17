-- ============================================================
-- MASH ISP — 007_admin_user_rls.sql
-- P7A — admin يدير مستخدمي شركته وصلاحيات الموظفين
-- ============================================================

-- دالة مساعدة: admin نشط في tenant الحالي (SECURITY DEFINER لتجنب تكرار RLS)
CREATE OR REPLACE FUNCTION is_tenant_admin() RETURNS BOOLEAN AS $$
  SELECT EXISTS(
    SELECT 1 FROM users
    WHERE id = auth.uid()
      AND role = 'admin'
      AND is_active = true
      AND tenant_id IS NOT NULL
  )
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ============================================================
-- ① users_admin_manage
-- admin نشط يضيف/يعدّل/يعلّق مستخدمي شركته فقط
-- لا يمكن إنشاء أو ترقية إلى super_admin
-- ============================================================

CREATE POLICY "users_admin_manage" ON users
  FOR ALL
  USING (
    is_tenant_admin()
    AND tenant_id = get_tenant_id()
    AND role IN ('employee', 'admin')
  )
  WITH CHECK (
    is_tenant_admin()
    AND tenant_id = get_tenant_id()
    AND role IN ('employee', 'admin')
  );

-- ============================================================
-- ② user_permissions_admin_manage
-- admin يدير صلاحيات employee في نفس tenant فقط
-- ============================================================

CREATE POLICY "user_permissions_admin_manage" ON user_permissions
  FOR ALL
  USING (
    is_tenant_admin()
    AND EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = user_permissions.user_id
        AND u.tenant_id = get_tenant_id()
        AND u.role = 'employee'
    )
  )
  WITH CHECK (
    is_tenant_admin()
    AND EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = user_permissions.user_id
        AND u.tenant_id = get_tenant_id()
        AND u.role = 'employee'
    )
  );
