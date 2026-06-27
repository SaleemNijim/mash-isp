import type { PppPlan } from '@/lib/ppp/plans'

export type PppPlanRow = PppPlan

export interface PppBatchRow {
  id: string
  tenant_id: string
  plan_id: string
  batch_number: string
  received_at: string
  notes: string | null
  is_deleted: boolean
  created_at: string
  ppp_plans?: { name: string; speed: string } | { name: string; speed: string }[] | null
}

export interface PppPlanFormState {
  name: string
  speed: string
  price: string
  min_available: string
}

export function emptyPppPlanForm(): PppPlanFormState {
  return { name: '', speed: '', price: '0', min_available: '0' }
}

export function pppPlanFormFromRow(p: PppPlanRow): PppPlanFormState {
  return {
    name: p.name,
    speed: p.speed,
    price: String(p.price),
    min_available: String(p.min_available_usernames ?? 0),
  }
}

export function parsePppPlanForm(form: PppPlanFormState) {
  return {
    name: form.name.trim(),
    speed: form.speed.trim(),
    price: form.price.trim() ? Number(form.price) : 0,
    min_available_usernames: form.min_available.trim() ? Number(form.min_available) : 0,
  }
}

export interface PppBatchSummary {
  batch_id: string
  total: number
  available: number
  plan_name: string
}
