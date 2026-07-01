export function mapAuthErrorMessage(message: string): string {
  const lower = message.toLowerCase()

  if (message === 'Invalid login credentials') {
    return 'البريد الإلكتروني أو كلمة المرور غير صحيحة'
  }
  if (message === 'Email not confirmed') {
    return 'يجب تأكيد البريد الإلكتروني أولاً'
  }
  if (lower.includes('token has expired') || lower.includes('otp has expired')) {
    return 'انتهت صلاحية رمز التأكيد — اطلب رمزاً جديداً'
  }
  if (
    lower.includes('invalid otp') ||
    lower.includes('token is invalid') ||
    lower.includes('invalid token')
  ) {
    return 'رمز التأكيد غير صحيح'
  }
  if (lower.includes('already registered') || lower.includes('already been registered')) {
    return 'البريد الإلكتروني مستخدم مسبقاً، جرّب تسجيل الدخول'
  }
  if (lower.includes('rate limit') || lower.includes('too many requests')) {
    return 'محاولات كثيرة — انتظر قليلاً ثم حاول مجدداً'
  }
  if (
    lower.includes('error sending confirmation') ||
    lower.includes('error sending magic link') ||
    lower.includes('error sending recovery')
  ) {
    return (
      'تعذّر إرسال بريد التأكيد من الخادم. ' +
      'انتظر قليلاً ثم أعد المحاولة، أو استخدم «إعادة إرسال الرمز» من صفحة التأكيد. ' +
      'إذا استمر الخطأ فغالباً إعداد البريد (SMTP) في Supabase يحتاج مراجعة.'
    )
  }
  if (lower.includes('redirect') && lower.includes('not allowed')) {
    return (
      'رابط إعادة التوجيه غير مسموح — تأكد من إضافة ' +
      '/auth/callback إلى Redirect URLs في Supabase (Authentication → URL Configuration).'
    )
  }

  return message
}
