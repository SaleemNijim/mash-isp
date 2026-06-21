export const LEDGER_KIND_LABELS: Record<string, string> = {
  payment: 'دفعة مشترك',
  distributor_receipt: 'استلام موزع',
  distributor_sale: 'بيع موزع',
  retail_sale: 'بيع تجزئة',
}

export const LEDGER_METHOD_LABELS: Record<string, string> = {
  cash: 'نقدي',
  debt: 'دين',
  bank: 'تحويل بنكي',
  reflect: 'Reflect',
  jawwal_pay: 'Jawwal Pay',
}

export function ledgerEntriesForAccount<T extends { bank_account_id: string | null }>(
  entries: T[],
  accountId: string,
): T[] {
  return entries.filter((e) => e.bank_account_id === accountId)
}
