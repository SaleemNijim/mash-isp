/** قيمة محدّد طريقة الدفع: نقدي | دين | حساب بنكي مسجّل */
export type PaymentMethodValue = 'cash' | 'debt' | `bank:${string}`

export interface ParsedPaymentMethod {
  kind: 'cash' | 'debt' | 'bank'
  bankAccountId: string | null
}

export function parsePaymentMethodValue(value: PaymentMethodValue): ParsedPaymentMethod {
  if (value === 'cash') return { kind: 'cash', bankAccountId: null }
  if (value === 'debt') return { kind: 'debt', bankAccountId: null }
  if (value.startsWith('bank:')) {
    return { kind: 'bank', bankAccountId: value.slice(5) }
  }
  return { kind: 'cash', bankAccountId: null }
}

export function isBankPayment(value: PaymentMethodValue): boolean {
  return value.startsWith('bank:')
}

/** طريقة التخزين في DB — التحويلات عبر الحسابات المسجّلة تُسجَّل كـ bank */
export function toDbPaymentMethod(value: PaymentMethodValue): 'cash' | 'debt' | 'bank' {
  const parsed = parsePaymentMethodValue(value)
  if (parsed.kind === 'bank') return 'bank'
  return parsed.kind
}

export function validatePaymentForm(input: {
  method: PaymentMethodValue
  sourceAccountLabel: string
  attachProof: boolean
  proofFile: File | null
  requireSourceForBank?: boolean
}): string | null {
  const parsed = parsePaymentMethodValue(input.method)

  if (parsed.kind === 'bank' && !parsed.bankAccountId) {
    return 'اختر حساباً بنكياً'
  }

  if (
    parsed.kind === 'bank' &&
    input.requireSourceForBank !== false &&
    !input.sourceAccountLabel.trim()
  ) {
    return 'أدخل الحساب الذي صدرت منه الحوالة'
  }

  if (input.attachProof && !input.proofFile) {
    return 'اختر ملف الإشعار أو ألغِ خيار الإرفاق'
  }

  return null
}
