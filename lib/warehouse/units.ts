export type WarehouseUnit = 'piece' | 'meter'

export const WAREHOUSE_UNIT_LABELS: Record<WarehouseUnit, string> = {
  piece: 'قطعة',
  meter: 'متر',
}

export function formatWarehouseQuantity(
  value: number | null | undefined,
  unit: WarehouseUnit,
): string {
  const n = Number(value ?? 0)
  if (unit === 'meter') {
    return n.toLocaleString('ar-EG', { maximumFractionDigits: 3 })
  }
  return n.toLocaleString('ar-EG', { maximumFractionDigits: 0 })
}

export function quantityStep(unit: WarehouseUnit): string {
  return unit === 'meter' ? '0.001' : '1'
}

export function isValidQuantityInput(value: number, unit: WarehouseUnit): boolean {
  if (!Number.isFinite(value) || value <= 0) return false
  if (unit === 'piece') return Number.isInteger(value)
  return true
}

export function isRpcMissingWarehouse(message: string): boolean {
  return (
    message.includes('Could not find the function') ||
    message.includes('create_warehouse_item')
  )
}

export const WAREHOUSE_RPC_HINT = 'يجب تطبيق migrations — شغّل: npm run db:push'
