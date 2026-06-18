-- ============================================================
-- MASH ISP — 015_messages_inbox_tenant_users_rpc.sql
-- RPCs SECURITY DEFINER — تجاوز تعقيد RLS على joins (الوارد + مستخدمو الشركة)
-- ============================================================

-- ① الوارد — join مسطح بدل embed PostgREST (كان message=null → inbox فارغ بصمت)
CREATE OR REPLACE FUNCTION get_my_inbox()
RETURNS TABLE (
  recipient_id  UUID,
  read_at       TIMESTAMPTZ,
  received_at   TIMESTAMPTZ,
  message_id    UUID,
  title         TEXT,
  body          TEXT,
  channel       TEXT,
  priority      TEXT,
  category      TEXT,
  sent_at       TIMESTAMPTZ,
  sender_name   TEXT,
  sender_role   TEXT
) AS $$
  SELECT
    mr.id,
    mr.read_at,
    mr.created_at,
    im.id,
    im.title,
    im.body,
    im.channel,
    im.priority,
    im.category,
    im.created_at,
    u.name,
    u.role
  FROM message_recipients mr
  JOIN internal_messages im ON im.id = mr.message_id
  LEFT JOIN users u ON u.id = im.sender_id
  WHERE mr.recipient_user_id = auth.uid()
  ORDER BY mr.created_at DESC
  LIMIT 100;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION get_my_inbox() TO authenticated;

-- ② معاينة عنوان رسالة جديدة (Realtime toast — بدون embed internal_messages)
CREATE OR REPLACE FUNCTION peek_inbox_message(p_message_id UUID)
RETURNS TABLE (title TEXT, priority TEXT) AS $$
  SELECT im.title, im.priority
  FROM message_recipients mr
  JOIN internal_messages im ON im.id = mr.message_id
  WHERE mr.recipient_user_id = auth.uid()
    AND im.id = p_message_id
  LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION peek_inbox_message(UUID) TO authenticated;

-- ③ مستخدمو الشركة النشطون — admin + employee (مصدر واحد للصلاحيات والرسائل)
CREATE OR REPLACE FUNCTION list_tenant_users()
RETURNS TABLE (
  id         UUID,
  name       TEXT,
  role       TEXT,
  is_active  BOOLEAN
) AS $$
DECLARE
  v_tenant_id UUID;
BEGIN
  v_tenant_id := get_tenant_id();
  IF v_tenant_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT u.id, u.name, u.role, u.is_active
  FROM users u
  WHERE u.tenant_id = v_tenant_id
    AND u.role IN ('admin', 'employee')
    AND u.is_active = true
  ORDER BY u.name;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION list_tenant_users() TO authenticated;
