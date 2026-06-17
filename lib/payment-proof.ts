import type { SupabaseClient } from '@supabase/supabase-js'

const BUCKET = 'payment_proofs'

export type ElectronicPaymentMethod = 'reflect' | 'jawwal_pay' | 'bank'

export function isElectronicMethod(method: string): method is ElectronicPaymentMethod {
  return method === 'reflect' || method === 'jawwal_pay' || method === 'bank'
}

export function requiresPaymentProof(method: string): boolean {
  return isElectronicMethod(method)
}

/**
 * يرفع صورة/ملف إشعار الدفع إلى Supabase Storage ويعيد الرابط العام.
 */
export async function uploadPaymentProof(
  supabase: SupabaseClient,
  tenantId: string,
  folder: string,
  file: File,
): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
  const path = `${tenantId}/${folder}/${Date.now()}.${ext}`

  const { error: storageErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { upsert: false, contentType: file.type || undefined })

  if (storageErr) throw storageErr

  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return urlData.publicUrl
}

/**
 * يربط إثباتاً بدفعة PPP بعد renew_subscription.
 */
export async function attachProofToPayment(
  supabase: SupabaseClient,
  tenantId: string,
  paymentId: string,
  proofUrl: string,
  uploadedBy: string,
): Promise<void> {
  const { error } = await supabase.from('payment_proofs').insert({
    tenant_id: tenantId,
    payment_id: paymentId,
    proof_url: proofUrl,
    uploaded_by: uploadedBy,
  })
  if (error) throw error
}

/**
 * يجلب آخر دفعة لاشتراك (بعد التجديد).
 */
export async function fetchLatestSubscriptionPayment(
  supabase: SupabaseClient,
  subscriptionId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('payments')
    .select('id')
    .eq('subscription_id', subscriptionId)
    .eq('is_deleted', false)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  return data?.id ?? null
}
