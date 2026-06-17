-- يسمح للمستلم برؤية اسم مُرسِل الرسالة (مثلاً super_admin خارج tenant)
CREATE POLICY "users_message_sender_read" ON users
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM internal_messages im
      JOIN message_recipients mr ON mr.message_id = im.id
      WHERE im.sender_id = users.id
        AND mr.recipient_user_id = auth.uid()
    )
  );
