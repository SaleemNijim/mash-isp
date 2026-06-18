-- ============================================================
-- MASH ISP — 016_get_my_sent_messages.sql
-- المرسلة — RPC مسطح (نفس نمط get_my_inbox في 015)
-- ============================================================

CREATE OR REPLACE FUNCTION get_my_sent_messages()
RETURNS TABLE (
  message_id       UUID,
  title            TEXT,
  body             TEXT,
  channel          TEXT,
  priority         TEXT,
  category         TEXT,
  sent_at          TIMESTAMPTZ,
  recipient_count  BIGINT
) AS $$
  SELECT
    im.id,
    im.title,
    im.body,
    im.channel,
    im.priority,
    im.category,
    im.created_at,
    COUNT(mr.id)
  FROM internal_messages im
  LEFT JOIN message_recipients mr ON mr.message_id = im.id
  WHERE im.sender_id = auth.uid()
  GROUP BY im.id
  ORDER BY im.created_at DESC
  LIMIT 50;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION get_my_sent_messages() TO authenticated;
