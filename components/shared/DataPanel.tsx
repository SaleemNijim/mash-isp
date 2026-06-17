import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface DataPanelProps {
  children: ReactNode
  className?: string
  noPadding?: boolean
}

/** لوحة بيانات بأسلوب Supabase — حدود خفيفة وخلفية card */
export function DataPanel({ children, className, noPadding }: DataPanelProps) {
  return (
    <div
      className={cn(
        'rounded-lg border border-border bg-card shadow-sm overflow-hidden',
        !noPadding && 'p-0',
        className,
      )}
    >
      {children}
    </div>
  )
}
