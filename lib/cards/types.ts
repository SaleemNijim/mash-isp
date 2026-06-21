export interface CardProductRow {
  id: string
  tenant_id: string
  name: string
  denomination: number | null
  cost_price: number | null
  sale_price: number | null
  quantity_in_stock: number
  min_quantity: number
  card_type?: string | null
  attributes?: Record<string, unknown> | null
  is_deleted: boolean
  created_at: string
}

export interface CardBatchRow {
  id: string
  tenant_id: string
  batch_number: string | null
  supplier: string | null
  received_at: string | null
  notes: string | null
  is_deleted: boolean
  created_at: string
}

export interface CategoryFormState {
  name: string
  sale_price: string
  min_quantity: string
  attributeRows: { key: string; value: string }[]
}

export function emptyCategoryForm(): CategoryFormState {
  return {
    name: '',
    sale_price: '',
    min_quantity: '0',
    attributeRows: [],
  }
}

export function attributesFromRows(
  rows: { key: string; value: string }[],
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const row of rows) {
    const k = row.key.trim()
    const v = row.value.trim()
    if (k && v) out[k] = v
  }
  return out
}

export function rowsFromAttributes(
  attrs: Record<string, unknown> | null | undefined,
): { key: string; value: string }[] {
  if (!attrs || typeof attrs !== 'object') return []
  return Object.entries(attrs).map(([key, value]) => ({
    key,
    value: String(value ?? ''),
  }))
}

export function parseCategoryForm(form: CategoryFormState) {
  return {
    name: form.name.trim(),
    sale_price: form.sale_price.trim() ? Number(form.sale_price) : null,
    min_quantity: form.min_quantity.trim() ? Number(form.min_quantity) : 0,
    attributes: attributesFromRows(form.attributeRows),
  }
}

export function categoryFormFromProduct(p: CardProductRow): CategoryFormState {
  return {
    name: p.name,
    sale_price: p.sale_price != null ? String(p.sale_price) : '',
    min_quantity: String(p.min_quantity ?? 0),
    attributeRows: rowsFromAttributes(p.attributes),
  }
}
