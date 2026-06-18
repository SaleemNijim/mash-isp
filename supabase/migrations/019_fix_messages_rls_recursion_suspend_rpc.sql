-- ============================================================
-- MASH ISP — 019_fix_messages_rls_recursion_suspend_rpc.sql
-- إصلاح: infinite recursion بين internal_messages ↔ message_recipients
-- + RPC تعليق كاشير (بدون UPDATE مباشر على users من العميل)
-- ============================================================

-- ── دوال مساعدة SECURITY DEFINER — تكسر حلقة RLS ──

CREATE OR REPLACE FUNCTION is_message_recipient(p_message_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM message_recipients
    WHERE message_id = p_message_id
      AND recipient_user_id = auth.uid()
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION is_message_sender_of(p_message_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM internal_messages
    WHERE id = p_message_id AND sender_id = auth.uid()
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION user_is_my_message_sender(p_user_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM internal_messages im
    JOIN message_recipients mr ON mr.message_id = im.id
    WHERE im.sender_id = p_user_id
      AND mr.recipient_user_id = auth.uid()
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

DROP POLICY IF EXISTS "internal_messages_recipient_read" ON internal_messages;
CREATE POLICY "internal_messages_recipient_read" ON internal_messages
  FOR SELECT USING (is_message_recipient(id));

DROP POLICY IF EXISTS "message_recipients_sender_select" ON message_recipients;
CREATE POLICY "message_recipients_sender_select" ON message_recipients
  FOR SELECT USING (is_message_sender_of(message_id));

DROP POLICY IF EXISTS "users_message_sender_read" ON users;
CREATE POLICY "users_message_sender_read" ON users
  FOR SELECT USING (user_is_my_message_sender(id));

-- ── تعليق كاشير ──

CREATE OR REPLACE FUNCTION suspend_tenant_employee(p_user_id UUID)
RETURNS VOID AS $$
DECLARE
  v_tenant_id UUID;
BEGIN
  IF NOT is_tenant_admin() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  v_tenant_id := get_tenant_id();
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'no_tenant_context';
  END IF;

  UPDATE users
  SET is_active = false,
      force_logout_at = now()
  WHERE id = p_user_id
    AND tenant_id = v_tenant_id
    AND role = 'employee'
    AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'employee_not_found';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION suspend_tenant_employee(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION suspend_tenant_employee(UUID) TO authenticated;
