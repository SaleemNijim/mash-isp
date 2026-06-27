'use client'

import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'

interface EditableSpreadsheetCellProps {
  value: string
  editing: boolean
  onStartEdit: () => void
  onChange: (value: string) => void
  onCommit: () => void
  onCancel: () => void
  dir?: 'rtl' | 'ltr'
  mono?: boolean
  align?: 'center' | 'start'
  disabled?: boolean
}

export function EditableSpreadsheetCell({
  value,
  editing,
  onStartEdit,
  onChange,
  onCommit,
  onCancel,
  dir = 'rtl',
  mono = false,
  align = 'start',
  disabled = false,
}: EditableSpreadsheetCellProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const centered = align === 'center'

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  const fieldClass = cn(
    'w-full min-w-0 rounded border border-primary bg-background px-2 py-1.5 text-xs outline-none ring-1 ring-primary/30',
    mono && 'font-mono tabular-nums tracking-wide',
    centered ? 'text-center' : 'text-right',
    mono && 'dir-ltr',
  )

  const displayClass = cn(
    'w-full truncate rounded px-1.5 py-1 hover:bg-muted/60 disabled:cursor-default disabled:hover:bg-transparent',
    centered ? 'text-center' : 'text-right',
    mono && 'font-mono text-xs tabular-nums tracking-wide dir-ltr',
    !value && 'text-muted-foreground',
  )

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onCommit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            onCommit()
          }
          if (e.key === 'Escape') {
            e.preventDefault()
            onCancel()
          }
        }}
        dir={dir}
        className={fieldClass}
      />
    )
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onStartEdit}
      className={displayClass}
    >
      {value || '—'}
    </button>
  )
}
