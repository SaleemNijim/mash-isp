'use client'

import { useRef } from 'react'
import { Upload, X, ImageIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

interface PaymentProofUploadProps {
  file: File | null
  onChange: (file: File | null) => void
  disabled?: boolean
  required?: boolean
  /** عند true لا يُعرض نجمة إلزامية والنص يوضّح أن الإرفاق اختياري */
  optional?: boolean
  label?: string
}

export function PaymentProofUpload({
  file,
  onChange,
  disabled,
  required,
  optional,
  label = 'إشعار الدفع',
}: PaymentProofUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const showRequired = required && !optional

  return (
    <div className="space-y-2">
      <Label>
        {label}
        {showRequired && <span className="text-destructive mr-1">*</span>}
      </Label>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,.pdf"
        className="hidden"
        disabled={disabled}
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
      />
      {!file ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-background px-4 py-6 text-center transition-colors hover:border-primary/40 hover:bg-muted/30 disabled:opacity-50"
        >
          <Upload size={22} className="text-muted-foreground" />
          <span className="text-sm font-medium">اضغط لرفع صورة أو PDF</span>
          <span className="text-xs text-muted-foreground">JPG · PNG · PDF</span>
        </button>
      ) : (
        <div className="flex items-center gap-3 rounded-xl border border-border bg-background px-3 py-2.5">
          <ImageIcon size={18} className="text-primary shrink-0" />
          <span className="text-sm truncate flex-1">{file.name}</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 shrink-0"
            disabled={disabled}
            onClick={() => {
              onChange(null)
              if (inputRef.current) inputRef.current.value = ''
            }}
          >
            <X size={14} />
          </Button>
        </div>
      )}
      {!optional && (
        <p className="text-xs text-muted-foreground">مطلوب عند الدفع عبر التطبيق أو البنك</p>
      )}
    </div>
  )
}
