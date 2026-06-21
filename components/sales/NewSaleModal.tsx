'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CreditCard, RefreshCw, Truck, Tag } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useTenant } from '@/hooks/useTenant'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { PermissionGuard } from '@/components/permissions/PermissionGuard'

export type SaleSelection =
  | {
      type: 'retail'
      productId: string
      productName: string
      cardType: string | null
    }
  | { type: 'distributor' }
  | { type: 'renewal' }

interface CardCategoryOption {
  id: string
  name: string
  quantity_in_stock: number
  card_type: string | null
}

interface NewSaleModalProps {
  open: boolean
  onClose: () => void
  onSelect: (selection: SaleSelection) => void
}

const FIXED_OPTIONS = [
  {
    type: 'distributor' as const,
    label: 'بيع للموزع',
    description: 'بيع دفعة بطاقات لموزع',
    icon: Truck,
    permission: 'sell_cards',
  },
  {
    type: 'renewal' as const,
    label: 'تجديد اشتراك PPP',
    description: 'تجديد BB أو WE للمشترك',
    icon: RefreshCw,
    permission: 'renew_subscriptions',
  },
]

export function NewSaleModal({ open, onClose, onSelect }: NewSaleModalProps) {
  const supabase = createClient()
  const { data: tenant } = useTenant()
  const [hovered, setHovered] = useState<string | null>(null)

  const { data: categories = [], isLoading } = useQuery<CardCategoryOption[]>({
    queryKey: ['card-products-sale-menu', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return []
      const { data, error } = await supabase
        .from('card_products')
        .select('id, name, quantity_in_stock, card_type')
        .eq('tenant_id', tenant.id)
        .eq('is_deleted', false)
        .order('name')
      if (error) throw error
      return data ?? []
    },
    enabled: open && !!tenant?.id,
  })

  function renderOption(
    key: string,
    label: string,
    description: string,
    Icon: typeof CreditCard,
    onClick: () => void,
    disabled?: boolean,
  ) {
    return (
      <button
        key={key}
        type="button"
        disabled={disabled}
        onClick={onClick}
        onMouseEnter={() => setHovered(key)}
        onMouseLeave={() => setHovered(null)}
        className={[
          'flex w-full items-start gap-3 rounded-lg border p-4 text-right transition-all',
          disabled
            ? 'cursor-not-allowed opacity-50 border-border bg-muted/30'
            : hovered === key
              ? 'border-primary bg-primary/5 shadow-sm'
              : 'border-border bg-card hover:border-primary/40',
        ].join(' ')}
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icon size={20} />
        </div>
        <div>
          <p className="font-medium text-foreground">{label}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        </div>
      </button>
    )
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent dir="rtl" className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard size={20} className="text-primary" />
            إضافة عملية بيع
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-2">
          {isLoading && (
            <p className="text-sm text-muted-foreground text-center py-4">جارٍ التحميل…</p>
          )}

          {!isLoading && categories.length === 0 && (
            <p className="text-sm text-amber-700 bg-amber-50 rounded-md px-3 py-2">
              لا توجد فئات في مخزون البطاقات — أضف فئة أولاً من صفحة المخزون.
            </p>
          )}

          <PermissionGuard permission="sell_cards">
            {categories.map((cat) =>
              renderOption(
                `retail-${cat.id}`,
                cat.name,
                `مخزون متاح: ${cat.quantity_in_stock.toLocaleString('ar-EG')}`,
                Tag,
                () => {
                  onSelect({
                    type: 'retail',
                    productId: cat.id,
                    productName: cat.name,
                    cardType: cat.card_type,
                  })
                  onClose()
                },
              ),
            )}
          </PermissionGuard>

          {FIXED_OPTIONS.map((opt) => {
            const Icon = opt.icon
            const content = renderOption(
              opt.type,
              opt.label,
              opt.description,
              Icon,
              () => {
                onSelect({ type: opt.type })
                onClose()
              },
            )

            return (
              <PermissionGuard key={opt.type} permission={opt.permission}>
                {content}
              </PermissionGuard>
            )
          })}
        </div>

        <Button variant="outline" onClick={onClose} className="mt-2">
          إلغاء
        </Button>
      </DialogContent>
    </Dialog>
  )
}
