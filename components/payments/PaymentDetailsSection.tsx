'use client'

import { PaymentProofUpload } from '@/components/shared/PaymentProofUpload'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { isBankPayment, type PaymentMethodValue } from '@/lib/payments/payment-selection'

interface PaymentDetailsSectionProps {
  method: PaymentMethodValue
  sourceAccountLabel: string
  onSourceAccountLabelChange: (value: string) => void
  attachProof: boolean
  onAttachProofChange: (value: boolean) => void
  proofFile: File | null
  onProofFileChange: (file: File | null) => void
  disabled?: boolean
}

/** حقول التحويل البنكي: الحساب الصادر + إرفاق إشعار اختياري */
export function PaymentDetailsSection({
  method,
  sourceAccountLabel,
  onSourceAccountLabelChange,
  attachProof,
  onAttachProofChange,
  proofFile,
  onProofFileChange,
  disabled,
}: PaymentDetailsSectionProps) {
  if (!isBankPayment(method)) return null

  return (
    <div className="space-y-4 rounded-xl border border-dashed border-border bg-muted/20 p-4">
      <div className="space-y-1.5">
        <Label htmlFor="payment-source-account">الحساب الصادر منه الحوالة</Label>
        <Input
          id="payment-source-account"
          value={sourceAccountLabel}
          onChange={(e) => onSourceAccountLabelChange(e.target.value)}
          placeholder="مثال: Reflect — محمد أحمد / Jawwal Pay"
          disabled={disabled}
          dir="rtl"
        />
        <p className="text-xs text-muted-foreground">
          الحساب أو التطبيق الذي أُرسلت منه الأموال إلى حساب الشركة
        </p>
      </div>

      <label className="flex items-center gap-2 cursor-pointer text-sm select-none">
        <input
          type="checkbox"
          checked={attachProof}
          onChange={(e) => {
            onAttachProofChange(e.target.checked)
            if (!e.target.checked) onProofFileChange(null)
          }}
          disabled={disabled}
          className="rounded border-input size-4 accent-primary"
        />
        <span>إرفاق إشعار دفع (اختياري)</span>
      </label>

      {attachProof && (
        <PaymentProofUpload
          file={proofFile}
          onChange={onProofFileChange}
          disabled={disabled}
          optional
        />
      )}
    </div>
  )
}
