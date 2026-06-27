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

  return message
}
