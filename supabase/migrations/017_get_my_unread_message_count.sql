-- ============================================================
-- MASH ISP — 017_get_my_unread_message_count.sql
-- عداد غير المقروء — RPC (نفس نمط get_my_inbox)
-- ============================================================

CREATE OR REPLACE FUNCTION get_my_unread_message_count()
RETURNS INTEGER AS $$
  SELECT COUNT(*)::INTEGER
  FROM message_recipients
  WHERE recipient_user_id = auth.uid()
    AND read_at IS NULL;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION get_my_unread_message_count() TO authenticated;
