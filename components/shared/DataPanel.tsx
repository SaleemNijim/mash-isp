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
        'rounded-2xl border border-[#D1E8E2] bg-card shadow-[0_2px_12px_rgba(15,110,86,0.06)] overflow-hidden',
        !noPadding && 'p-0',
        className,
      )}
    >
      {children}
    </div>
  )
}
