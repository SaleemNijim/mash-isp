import type { PostgrestError } from '@supabase/supabase-js'

/** يحوّل PostgrestError إلى Error حقيقي — يمنع overlay [object Object] في Next.js */
export function throwIfSupabaseError(error: PostgrestError | null): asserts error is null {
  if (error) throw new Error(error.message)
}
