import type { SupabaseClient } from '@supabase/supabase-js'

export type BbCredentialInputMode = 'inventory' | 'manual'

export interface ResolveBbCredentialParams {
  mode: BbCredentialInputMode
  credentialId: string | null
  manualUsername: string
  manualPassword: string
  customerId: string
}

export async function resolveBbCredentialId(
  supabase: SupabaseClient,
  params: ResolveBbCredentialParams,
): Promise<string> {
  if (params.mode === 'inventory') {
    if (!params.credentialId) {
      throw new Error('اختر username من المخزون أو أدخله يدوياً')
    }
    return params.credentialId
  }

  const username = params.manualUsername.trim()
  const password = params.manualPassword.trim()

  if (!username || !password) {
    throw new Error('username و password مطلوبان للإدخال اليدوي')
  }

  if (!params.customerId) {
    throw new Error('customer_id required')
  }

  const { data, error } = await supabase.rpc('create_and_reserve_bb_credential', {
    p_username: username,
    p_password: password,
    p_customer_id: params.customerId,
  })

  if (error) throw error
  if (!data) throw new Error('فشل حجز username')

  return data as string
}

export function isRpcMissingError(message: string): boolean {
  return (
    message.includes('Could not find the function') ||
    message.includes('update_subscription_period_with_debt') ||
    message.includes('create_and_reserve_bb_credential')
  )
}

export const RPC_MIGRATION_HINT = 'يجب تطبيق migrations — شغّل: npm run db:push'
