import type { SupabaseClient } from '@supabase/supabase-js'

const BUCKET = 'tenant_logos'

export function formatProfileError(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) {
    const msg = String((err as { message: string }).message)
    if (msg.includes('admin_only')) return 'هذه العملية للمسؤول فقط'
    if (msg.includes('row-level security') || msg.includes('permission denied'))
      return 'صلاحيات رفع الشعار غير كافية — أعد المحاولة بعد تحديث الصفحة'
    if (msg.includes('mime type') || msg.includes('Invalid file'))
      return 'صيغة الصورة غير مدعومة — استخدم PNG أو JPG أو WebP'
    return msg
  }
  return 'فشل الحفظ'
}

export async function uploadTenantLogo(
  supabase: SupabaseClient,
  tenantId: string,
  file: File,
): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'png'
  const path = `${tenantId}/logo.${ext}`
  const contentType =
    file.type === 'image/jpg' ? 'image/jpeg' : file.type || undefined

  const { error: storageErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { upsert: true, contentType })

  if (storageErr) throw storageErr

  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return `${urlData.publicUrl}?v=${Date.now()}`
}

export type TenantProfilePatch = {
  name?: string
  phone?: string | null
  logo_url?: string | null
}

export async function saveTenantProfile(
  supabase: SupabaseClient,
  params: TenantProfilePatch,
): Promise<void> {
  const rpcArgs: Record<string, string | null> = {}

  if (params.name !== undefined) rpcArgs.p_name = params.name
  if (params.phone !== undefined) rpcArgs.p_phone = params.phone
  if (params.logo_url !== undefined) rpcArgs.p_logo_url = params.logo_url

  const { error } = await supabase.rpc('update_tenant_profile', rpcArgs)
  if (error) throw new Error(formatProfileError(error))
}

export async function saveMyUserName(
  supabase: SupabaseClient,
  name: string,
): Promise<void> {
  const { error } = await supabase.rpc('update_my_user_name', { p_name: name })
  if (error) throw new Error(formatProfileError(error))
}
