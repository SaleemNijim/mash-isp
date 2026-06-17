-- ============================================================
-- MASH ISP — 010_internal_messages.sql
-- نظام رسائل وإشعارات داخلية
-- super_admin ↔ tenant admins | admin ↔ employees | admin → platform
-- ============================================================

-- ============================================================
-- ① الجداول
-- ============================================================

CREATE TABLE internal_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id   UUID NOT NULL REFERENCES users(id),
  tenant_id   UUID REFERENCES tenants(id),
  channel     TEXT NOT NULL CHECK (channel IN (
    'super_to_tenant',
    'super_to_all_tenants',
    'admin_to_employees',
    'admin_to_platform'
  )),
  title       TEXT NOT NULL CHECK (char_length(trim(title)) >= 1),
  body        TEXT NOT NULL CHECK (char_length(trim(body)) >= 1),
  priority    TEXT NOT NULL DEFAULT 'normal'
              CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  category    TEXT NOT NULL DEFAULT 'general'
              CHECK (category IN ('general', 'announcement', 'alert', 'billing', 'operations')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE message_recipients (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id        UUID NOT NULL REFERENCES internal_messages(id) ON DELETE CASCADE,
  recipient_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  read_at           TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (message_id, recipient_user_id)
);

CREATE INDEX idx_message_recipients_user_unread
  ON message_recipients (recipient_user_id)
  WHERE read_at IS NULL;

CREATE INDEX idx_message_recipients_user_created
  ON message_recipients (recipient_user_id, created_at DESC);

CREATE INDEX idx_internal_messages_sender_created
  ON internal_messages (sender_id, created_at DESC);

-- ============================================================
-- ② دالة الإرسال الداخلية
-- ============================================================

CREATE OR REPLACE FUNCTION _dispatch_internal_message(
  p_sender_id       UUID,
  p_tenant_id       UUID,
  p_channel         TEXT,
  p_title           TEXT,
  p_body            TEXT,
  p_priority        TEXT,
  p_category        TEXT,
  p_recipient_ids   UUID[]
) RETURNS UUID AS $$
DECLARE
  v_message_id UUID;
  v_rid        UUID;
BEGIN
  IF p_recipient_ids IS NULL OR array_length(p_recipient_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'no_recipients';
  END IF;

  INSERT INTO internal_messages (
    sender_id, tenant_id, channel, title, body, priority, category
  ) VALUES (
    p_sender_id, p_tenant_id, p_channel,
    trim(p_title), trim(p_body), p_priority, p_category
  )
  RETURNING id INTO v_message_id;

  FOREACH v_rid IN ARRAY p_recipient_ids LOOP
    INSERT INTO message_recipients (message_id, recipient_user_id)
    VALUES (v_message_id, v_rid);
  END LOOP;

  RETURN v_message_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- ③ RPCs — إرسال حسب الدور
-- ============================================================

-- Super Admin → admins شركة واحدة
CREATE OR REPLACE FUNCTION super_admin_send_to_tenant(
  p_tenant_id  UUID,
  p_title      TEXT,
  p_body       TEXT,
  p_priority   TEXT DEFAULT 'normal',
  p_category   TEXT DEFAULT 'general'
) RETURNS UUID AS $$
DECLARE
  v_recipients UUID[];
BEGIN
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT array_agg(u.id) INTO v_recipients
  FROM users u
  WHERE u.tenant_id = p_tenant_id
    AND u.role = 'admin'
    AND u.is_active = true;

  IF v_recipients IS NULL OR array_length(v_recipients, 1) IS NULL THEN
    RAISE EXCEPTION 'no_recipients';
  END IF;

  RETURN _dispatch_internal_message(
    auth.uid(), p_tenant_id, 'super_to_tenant',
    p_title, p_body, p_priority, p_category, v_recipients
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Super Admin → broadcast لعدة شركات أو الكل
CREATE OR REPLACE FUNCTION super_admin_broadcast_to_tenants(
  p_title       TEXT,
  p_body        TEXT,
  p_priority    TEXT DEFAULT 'normal',
  p_category    TEXT DEFAULT 'announcement',
  p_tenant_ids  UUID[] DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_recipients UUID[];
BEGIN
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT array_agg(DISTINCT u.id) INTO v_recipients
  FROM users u
  JOIN tenants t ON t.id = u.tenant_id
  WHERE u.role = 'admin'
    AND u.is_active = true
    AND t.is_active = true
    AND (p_tenant_ids IS NULL OR u.tenant_id = ANY(p_tenant_ids));

  IF v_recipients IS NULL OR array_length(v_recipients, 1) IS NULL THEN
    RAISE EXCEPTION 'no_recipients';
  END IF;

  RETURN _dispatch_internal_message(
    auth.uid(), NULL, 'super_to_all_tenants',
    p_title, p_body, p_priority, p_category, v_recipients
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Admin → كاشير (موظف) واحد أو الكل
CREATE OR REPLACE FUNCTION admin_send_to_employees(
  p_title          TEXT,
  p_body           TEXT,
  p_priority       TEXT DEFAULT 'normal',
  p_category       TEXT DEFAULT 'general',
  p_employee_ids   UUID[] DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_recipients UUID[];
  v_tenant     UUID;
BEGIN
  IF NOT is_tenant_admin() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  v_tenant := get_tenant_id();

  SELECT array_agg(u.id) INTO v_recipients
  FROM users u
  WHERE u.tenant_id = v_tenant
    AND u.role = 'employee'
    AND u.is_active = true
    AND (p_employee_ids IS NULL OR u.id = ANY(p_employee_ids));

  IF v_recipients IS NULL OR array_length(v_recipients, 1) IS NULL THEN
    RAISE EXCEPTION 'no_recipients';
  END IF;

  RETURN _dispatch_internal_message(
    auth.uid(), v_tenant, 'admin_to_employees',
    p_title, p_body, p_priority, p_category, v_recipients
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Admin → Super Admin (المنصة)
CREATE OR REPLACE FUNCTION admin_send_to_platform(
  p_title     TEXT,
  p_body      TEXT,
  p_priority  TEXT DEFAULT 'normal',
  p_category  TEXT DEFAULT 'general'
) RETURNS UUID AS $$
DECLARE
  v_recipients UUID[];
  v_tenant     UUID;
BEGIN
  IF NOT is_tenant_admin() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  v_tenant := get_tenant_id();

  SELECT array_agg(u.id) INTO v_recipients
  FROM users u
  WHERE u.role = 'super_admin'
    AND u.is_active = true;

  IF v_recipients IS NULL OR array_length(v_recipients, 1) IS NULL THEN
    RAISE EXCEPTION 'no_recipients';
  END IF;

  RETURN _dispatch_internal_message(
    auth.uid(), v_tenant, 'admin_to_platform',
    p_title, p_body, p_priority, p_category, v_recipients
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- ④ قراءة / تعليم كمقروء
-- ============================================================

CREATE OR REPLACE FUNCTION mark_message_read(p_recipient_id UUID)
RETURNS void AS $$
  UPDATE message_recipients
  SET read_at = now()
  WHERE id = p_recipient_id
    AND recipient_user_id = auth.uid()
    AND read_at IS NULL;
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION mark_all_messages_read()
RETURNS void AS $$
  UPDATE message_recipients
  SET read_at = now()
  WHERE recipient_user_id = auth.uid()
    AND read_at IS NULL;
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- ⑤ RLS
-- ============================================================

ALTER TABLE internal_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE internal_messages FORCE  ROW LEVEL SECURITY;

ALTER TABLE message_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_recipients FORCE  ROW LEVEL SECURITY;

CREATE POLICY "internal_messages_sender_read" ON internal_messages
  FOR SELECT USING (sender_id = auth.uid());

CREATE POLICY "internal_messages_recipient_read" ON internal_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM message_recipients mr
      WHERE mr.message_id = internal_messages.id
        AND mr.recipient_user_id = auth.uid()
    )
  );

CREATE POLICY "internal_messages_superadmin_read" ON internal_messages
  FOR SELECT USING (is_super_admin());

CREATE POLICY "message_recipients_own_select" ON message_recipients
  FOR SELECT USING (recipient_user_id = auth.uid());

CREATE POLICY "message_recipients_sender_select" ON message_recipients
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM internal_messages m
      WHERE m.id = message_recipients.message_id
        AND m.sender_id = auth.uid()
    )
  );

CREATE POLICY "message_recipients_superadmin_select" ON message_recipients
  FOR SELECT USING (is_super_admin());

CREATE POLICY "message_recipients_mark_read" ON message_recipients
  FOR UPDATE
  USING (recipient_user_id = auth.uid())
  WITH CHECK (recipient_user_id = auth.uid());

-- ============================================================
-- ⑥ Realtime
-- ============================================================

ALTER PUBLICATION supabase_realtime ADD TABLE message_recipients;

-- ============================================================
-- ⑦ Grants
-- ============================================================

GRANT SELECT ON internal_messages TO authenticated;
GRANT SELECT, UPDATE ON message_recipients TO authenticated;

GRANT EXECUTE ON FUNCTION super_admin_send_to_tenant(UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION super_admin_broadcast_to_tenants(TEXT, TEXT, TEXT, TEXT, UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_send_to_employees(TEXT, TEXT, TEXT, TEXT, UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_send_to_platform(TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION mark_message_read(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION mark_all_messages_read() TO authenticated;
