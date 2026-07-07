export const LEDGER_KIND_LABELS: Record<string, string> = {
  payment: 'دفعة مشترك',
  distributor_receipt: 'استلام موزع',
  distributor_sale: 'بيع موزع',
  retail_sale: 'بيع تجزئة',
  expense: 'مصروف',
}

export const LEDGER_METHOD_LABELS: Record<string, string> = {
  cash: 'نقدي',
  debt: 'دين',
  bank: 'تحويل بنكي',
  reflect: 'Reflect',
  jawwal_pay: 'Jawwal Pay',
}

export const LEDGER_DIRECTION_LABELS: Record<string, string> = {
  in: 'وارد',
  out: 'صادر',
}

export function ledgerEntriesForAccount<T extends { bank_account_id: string | null }>(
  entries: T[],
  accountId: string,
): T[] {
  return entries.filter((e) => e.bank_account_id === accountId)
}

export function ledgerSignedAmount(amount: number, direction: 'in' | 'out'): number {
  return direction === 'out' ? -Math.abs(amount) : Math.abs(amount)
}
