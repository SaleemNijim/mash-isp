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
  label?: string
}

export function PaymentProofUpload({
  file,
  onChange,
  disabled,
  required,
  label = 'إشعار الدفع (صورة)',
}: PaymentProofUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <div className="space-y-2">
      <Label>
        {label}
        {required && <span className="text-destructive mr-1">*</span>}
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
        <Button
          type="button"
          variant="outline"
          className="w-full gap-2 h-auto py-4 border-dashed"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
        >
          <Upload size={18} />
          ارفع لقطة شاشة إشعار التطبيق (Reflect / Jawwal Pay / بنك)
        </Button>
      ) : (
        <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2">
          <ImageIcon size={18} className="text-primary shrink-0" />
          <span className="text-sm truncate flex-1">{file.name}</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
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
      <p className="text-xs text-muted-foreground">
        مطلوب عند الدفع عبر تطبيق — JPG أو PNG أو PDF
      </p>
    </div>
  )
}
