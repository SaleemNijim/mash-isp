'use client'

import { useState } from 'react'
import { CreditCard, Calendar, CalendarDays, RefreshCw, Truck } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { PermissionGuard } from '@/components/permissions/PermissionGuard'

export type SaleOperationType =
  | 'daily'
  | 'monthly'
  | 'distributor'
  | 'renewal'

interface NewSaleModalProps {
  open: boolean
  onClose: () => void
  onSelect: (type: SaleOperationType) => void
}

const SALE_OPTIONS: {
  type: SaleOperationType
  label: string
  description: string
  icon: typeof CreditCard
  permission?: string
}[] = [
  {
    type: 'daily',
    label: 'بطاقات يومية',
    description: 'بيع بطاقة إنترنت يومية للمشترك',
    icon: CalendarDays,
    permission: 'sell_cards',
  },
  {
    type: 'monthly',
    label: 'بطاقات شهرية',
    description: 'بيع بطاقة إنترنت شهرية',
    icon: Calendar,
    permission: 'sell_cards',
  },
  {
    type: 'distributor',
    label: 'بيع للموزع',
    description: 'بيع دفعة بطاقات لموزع',
    icon: Truck,
    permission: 'sell_cards',
  },
  {
    type: 'renewal',
    label: 'تجديد اشتراك PPP',
    description: 'تجديد BB أو WE للمشترك',
    icon: RefreshCw,
    permission: 'renew_subscriptions',
  },
]

export function NewSaleModal({ open, onClose, onSelect }: NewSaleModalProps) {
  const [hovered, setHovered] = useState<SaleOperationType | null>(null)

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent dir="rtl" className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard size={20} className="text-primary" />
            إضافة عملية بيع
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-2">
          {SALE_OPTIONS.map((opt) => {
            const Icon = opt.icon
            const content = (
              <button
                key={opt.type}
                type="button"
                onClick={() => {
                  onSelect(opt.type)
                  onClose()
                }}
                onMouseEnter={() => setHovered(opt.type)}
                onMouseLeave={() => setHovered(null)}
                className={[
                  'flex w-full items-start gap-3 rounded-lg border p-4 text-right transition-all',
                  hovered === opt.type
                    ? 'border-primary bg-primary/5 shadow-sm'
                    : 'border-border bg-card hover:border-primary/40',
                ].join(' ')}
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <Icon size={20} />
                </div>
                <div>
                  <p className="font-medium text-foreground">{opt.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{opt.description}</p>
                </div>
              </button>
            )

            if (opt.permission) {
              return (
                <PermissionGuard key={opt.type} permission={opt.permission}>
                  {content}
                </PermissionGuard>
              )
            }

            return content
          })}
        </div>

        <Button variant="outline" onClick={onClose} className="mt-2">
          إلغاء
        </Button>
      </DialogContent>
    </Dialog>
  )
}
