'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { throwIfSupabaseError } from '@/lib/supabase/errors'

export interface Tenant {
  id: string
  name: string
  is_active: boolean
  is_trial: boolean
  trial_ends_at: string | null
  subscription_end: string | null
  plan_id: string | null
  billing_cycle: string | null
}

export function useTenant() {
  const supabase = createClient()

  return useQuery<Tenant | null>({
    queryKey: ['tenant'],
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return null

      // get_my_user_profile() دالة SECURITY DEFINER تتجاوز RLS — القراءة
      // المباشرة من جدول users كانت تفشل بصمت (ترجع undefined) كلما لم
      // تتطابق سياسات RLS مع حالة المستخدم (مثلاً tenant_id = NULL قبل
      // إكمال إعداد الحساب)، وهذا كان يُبقي صفحة /dashboard عالقة في
      // التحميل للأبد لأن tenant?.id لا يصل أبداً.
      const { data: profileRows, error } = await supabase.rpc('get_my_user_profile')
      throwIfSupabaseError(error)

      const profile = Array.isArray(profileRows) ? profileRows[0] : profileRows
      if (!profile?.tenant_id) return null

      const { data: tenant, error: tenantError } = await supabase
        .from('tenants')
        .select('id,name,is_active,is_trial,trial_ends_at,subscription_end,plan_id,billing_cycle')
        .eq('id', profile.tenant_id)
        .single()

      if (tenantError) throw new Error(tenantError.message)
      return tenant ?? null
    },
    staleTime: 5 * 60 * 1000,
  })
}
