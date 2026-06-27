import type { RecordDeleteMode } from '@/components/shared/RecordDeleteOptionsModal'
import type { SupabaseClient } from '@supabase/supabase-js'

export function mapRecordDeleteError(message: string): string {
  if (message.includes('insufficient permission')) {
    return 'ليس لديك صلاحية الحذف'
  }
  if (message.includes('distributor_has_balance')) {
    return 'لا يمكن الإخفاء — الموزع عليه رصيد مستحق. سدّد الرصيد أولاً أو اختر الحذف النهائي مع البيانات.'
  }
  if (message.includes('record not found')) {
    return 'السجل غير موجود أو لا يمكن الوصول إليه'
  }
  if (
    message.includes('foreign key') ||
    message.includes('violates') ||
    message.includes('23503')
  ) {
    return 'لا يمكن الحذف — توجد سجلات مرتبطة'
  }
  return message
}

export async function deleteRecordWithMode(options: {
  table: 'customers' | 'distributors'
  id: string
  mode: RecordDeleteMode
  supabase?: SupabaseClient
}): Promise<void> {
  const { table, id, mode, supabase } = options

  if (mode === 'keep_data') {
    const res = await fetch('/api/delete/soft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ table, id }),
    })
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    if (!res.ok) {
      throw new Error(mapRecordDeleteError(body.error ?? 'delete_failed'))
    }
    return
  }

  if (!supabase) {
    throw new Error('delete_failed')
  }

  const { error } = await supabase.rpc('hard_delete_record', {
    p_table: table,
    p_id: id,
  })
  if (error) {
    throw new Error(mapRecordDeleteError(error.message))
  }
}
