'use client'

import { use, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { ArrowRight, Plus, Wallet } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { PageHeader } from '@/components/shared/PageHeader'
import { DataPanel } from '@/components/shared/DataPanel'
import { SellToDistributorModal } from '@/components/card-sales/SellToDistributorModal'
import { SettleDistributorDebtModal } from '@/components/debts/SettleDistributorDebtModal'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatMoney } from '@/lib/format-money'

interface SaleRow {
  id: string
  total_amount: number | null
  payment_method: string | null
  proof_url: string | null
  created_at: string
}

interface ReceiptRow {
  id: string
  amount: number
  method: string
  proof_url: string | null
  created_at: string
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('ar-EG', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const METHOD_LABELS: Record<string, string> = {
  cash: 'نقدي',
  debt: 'دين',
  reflect: 'Reflect',
  jawwal_pay: 'Jawwal Pay',
  bank: 'بنك',
}

export default function DistributorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const supabase = createClient()
  const [saleOpen, setSaleOpen] = useState(false)
  const [settleOpen, setSettleOpen] = useState(false)

  const { data: distributor, refetch: refetchDist } = useQuery({
    queryKey: ['distributor', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('distributors')
        .select('id, name, phone, balance_due, notes')
        .eq('id', id)
        .eq('is_deleted', false)
        .single()
      if (error) throw error
      return data
    },
    enabled: !!id,
  })

  const { data: sales = [], refetch: refetchSales } = useQuery<SaleRow[]>({
    queryKey: ['distributor-sales', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('card_distributor_sales')
        .select('id, total_amount, payment_method, proof_url, created_at')
        .eq('distributor_id', id)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data ?? []
    },
    enabled: !!id,
  })

  const { data: receipts = [], refetch: refetchReceipts } = useQuery<ReceiptRow[]>({
    queryKey: ['distributor-receipts', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('distributor_payment_receipts')
        .select('id, amount, method, proof_url, created_at')
        .eq('distributor_id', id)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data ?? []
    },
    enabled: !!id,
  })

  if (!distributor) {
    return (
      <p className="text-center text-muted-foreground py-16" dir="rtl">
        جارٍ التحميل...
      </p>
    )
  }

  return (
    <div dir="rtl" className="space-y-6">
      <Link
        href="/distributors"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowRight size={16} />
        كل الموزعين
      </Link>

      <PageHeader
        title={distributor.name}
        description={distributor.phone ?? 'بدون هاتف'}
        actions={
          <div className="flex flex-wrap gap-2">
            {Number(distributor.balance_due) > 0 && (
              <Button variant="outline" className="gap-1.5" onClick={() => setSettleOpen(true)}>
                <Wallet size={16} />
                تسديد
              </Button>
            )}
            <Button className="gap-1.5" onClick={() => setSaleOpen(true)}>
              <Plus size={16} />
              بيع دفعة
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <DataPanel className="p-4">
          <p className="text-sm text-muted-foreground">الرصيد المستحق</p>
          <p className="text-2xl font-bold tabular-nums text-primary mt-1">
            {formatMoney(distributor.balance_due)}
          </p>
        </DataPanel>
        <DataPanel className="p-4">
          <p className="text-sm text-muted-foreground">عدد عمليات البيع</p>
          <p className="text-2xl font-bold tabular-nums mt-1">{sales.length}</p>
        </DataPanel>
      </div>

      <div>
        <h2 className="text-sm font-medium text-muted-foreground mb-3">سجل المبيعات</h2>
        <DataPanel noPadding>
          {sales.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">لا توجد مبيعات بعد</p>
          ) : (
            <ul className="divide-y divide-border">
              {sales.map((sale) => (
                <li key={sale.id} className="px-4 py-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium tabular-nums">
                      {formatMoney(sale.total_amount)}
                    </p>
                    <p className="text-xs text-muted-foreground">{formatDate(sale.created_at)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {sale.payment_method && (
                      <Badge variant="outline">
                        {METHOD_LABELS[sale.payment_method] ?? sale.payment_method}
                      </Badge>
                    )}
                    {sale.proof_url && (
                      <a
                        href={sale.proof_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary hover:underline"
                      >
                        إشعار الدفع
                      </a>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </DataPanel>
      </div>

      <div>
        <h2 className="text-sm font-medium text-muted-foreground mb-3">سجل الاستلام</h2>
        <DataPanel noPadding>
          {receipts.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              لا توجد دفعات مستلمة بعد
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {receipts.map((receipt) => (
                <li
                  key={receipt.id}
                  className="px-4 py-3 flex flex-wrap items-center justify-between gap-2"
                >
                  <div>
                    <p className="font-medium tabular-nums text-emerald-700">
                      +{formatMoney(receipt.amount)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(receipt.created_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">
                      {METHOD_LABELS[receipt.method] ?? receipt.method}
                    </Badge>
                    {receipt.proof_url && (
                      <a
                        href={receipt.proof_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary hover:underline"
                      >
                        إشعار الدفع
                      </a>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </DataPanel>
      </div>

      <SellToDistributorModal
        open={saleOpen}
        preselectedDistributorId={id}
        onClose={() => setSaleOpen(false)}
        onSuccess={() => {
          void refetchDist()
          void refetchSales()
        }}
      />

      <SettleDistributorDebtModal
        open={settleOpen}
        onClose={() => setSettleOpen(false)}
        onSuccess={() => {
          void refetchDist()
          void refetchReceipts()
        }}
        distributor={
          distributor
            ? {
                id: distributor.id,
                name: distributor.name,
                balance_due: Number(distributor.balance_due),
              }
            : null
        }
      />
    </div>
  )
}
