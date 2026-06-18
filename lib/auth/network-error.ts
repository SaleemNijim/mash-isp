/** أخطاء fetch من المتصفح عند signIn / signUp — ليست أخطاء credentials */
export function isAuthNetworkError(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  const m = err.message.toLowerCase()
  return (
    m.includes('failed to fetch') ||
    m.includes('networkerror') ||
    m.includes('network request failed') ||
    m.includes('load failed')
  )
}

export function authNetworkErrorMessage(): string {
  return (
    'تعذّر الاتصال بخادم المصادقة (Supabase). ' +
    'تحقق من الإنترنت، أعد تشغيل «npm run dev» بعد تعديل .env.local، ' +
    'وتأكد أن مانع الإعلانات لا يحجب supabase.co.'
  )
}

export function missingSupabaseEnvMessage(): string {
  return (
    'إعداد Supabase غير مكتمل في المتصفح (NEXT_PUBLIC_SUPABASE_URL / ANON_KEY). ' +
    'راجع .env.local ثم أعد تشغيل «npm run dev».'
  )
}
