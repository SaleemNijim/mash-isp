/** قراءة متغيرات Supabase العامة مع trim — يمنع أخطاء fetch من مسافات/أسطر زائدة في .env */
export function getPublicSupabaseEnv(): { url: string; anonKey: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()

  if (!url || !anonKey) return null
  if (!url.startsWith('https://')) return null

  return { url, anonKey }
}
