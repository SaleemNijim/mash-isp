-- يسمح لكل مستخدم بقراءة صفه الخاص (مهم عند تسجيل الدخول وإكمال الإعداد)
CREATE POLICY "users_read_self" ON users
  FOR SELECT USING (id = auth.uid());
