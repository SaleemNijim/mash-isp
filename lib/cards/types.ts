export interface CardProductRow {
  id: string
  tenant_id: string
  name: string
  denomination: number | null
  cost_price: number | null
  sale_price: number | null
  distributor_price: number | null
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
  distributor_price: string
  min_quantity: string
  attributeRows: { key: string; value: string }[]
}

export function emptyCategoryForm(): CategoryFormState {
  return {
    name: '',
    sale_price: '',
    distributor_price: '',
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
    distributor_price: form.distributor_price.trim()
      ? Number(form.distributor_price)
      : null,
    min_quantity: form.min_quantity.trim() ? Number(form.min_quantity) : 0,
    attributes: attributesFromRows(form.attributeRows),
  }
}

export function categoryFormFromProduct(p: CardProductRow): CategoryFormState {
  return {
    name: p.name,
    sale_price: p.sale_price != null ? String(p.sale_price) : '',
    distributor_price:
      p.distributor_price != null ? String(p.distributor_price) : '',
    min_quantity: String(p.min_quantity ?? 0),
    attributeRows: rowsFromAttributes(p.attributes),
  }
}

/** سعر البطاقة للموزع — يُ fallback إلى سعر التجزئة إن لم يُحدَّد */
export function distributorUnitPrice(product: {
  distributor_price?: number | null
  sale_price?: number | null
}): number | null {
  if (product.distributor_price != null) return product.distributor_price
  if (product.sale_price != null) return product.sale_price
  return null
}
