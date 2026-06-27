'use client'

import { useEffect, useId, useRef } from 'react'
import { cn } from '@/lib/utils'

interface DeviceTypePickerProps {
  value: string
  options: string[]
  onChange: (value: string) => void
  onCommit?: () => void
  onCancel?: () => void
  disabled?: boolean
  placeholder?: string
  className?: string
  autoFocus?: boolean
}

/** حقل نوع الجهاز مع اقتراحات من الأنواع الموجودة */
export function DeviceTypePicker({
  value,
  options,
  onChange,
  onCommit,
  onCancel,
  disabled = false,
  placeholder = 'Router / AP / DD-WRT…',
  className,
  autoFocus = false,
}: DeviceTypePickerProps) {
  const listId = useId()
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus()
  }, [autoFocus])

  return (
    <>
      <input
        ref={inputRef}
        list={listId}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => onCommit?.()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            onCommit?.()
          }
          if (e.key === 'Escape') {
            e.preventDefault()
            onCancel?.()
          }
        }}
        className={cn(
          'w-full min-w-0 rounded border border-input bg-background px-2 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring',
          className,
        )}
      />
      <datalist id={listId}>
        {options.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
    </>
  )
}
