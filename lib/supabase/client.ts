import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getPublicSupabaseEnv } from '@/lib/supabase/env'

/**
 * Singleton — متصفح فقط.
 *
 * المشكلة التي يحلّها هذا الملف: استدعاء createBrowserClient() في كل
 * مكوّن/hook يُنشئ نسخة GoTrueClient مستقلة بمحرك جلسة (auth state) خاص بها.
 * النتيجة الفعلية المرصودة في هذا المشروع:
 *   - قنوات Realtime تُفتح على عميل لا يحمل آخر JWT مُحدَّث → فشل صامت في
 *     تقييم RLS عند الاتصال بالـ websocket → إشعارات/رسائل لا تصل.
 *   - تضارب بين نسخ متعددة من GoTrueClient عند استرجاع الجلسة
 *     (`auth.getUser()`) في توقيتات مختلفة → سلوك غير متسق في صفحات
 *     تعتمد على المستخدم الحالي (مثل /dashboard).
 *   - تراكم اتصالات websocket غير مُغلَقة عبر عمر التطبيق.
 *
 * الحل: نسخة واحدة فقط تُنشأ عند أول استدعاء وتُعاد لكل استدعاء لاحق
 * (Singleton على مستوى الموديول). كل الكود الحالي الذي يستدعي
 * `createClient()` يستمر بالعمل بدون أي تعديل في موقع الاستدعاء؛
 * التغيير محصور في هذا الملف فقط.
 */
let browserClient: SupabaseClient | undefined

export function createClient(): SupabaseClient {
  if (browserClient) return browserClient

  const env = getPublicSupabaseEnv()
  if (!env) {
    throw new Error(
      'Missing or invalid NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY — restart npm run dev after editing .env.local',
    )
  }

  browserClient = createBrowserClient(env.url, env.anonKey)

  return browserClient
}
