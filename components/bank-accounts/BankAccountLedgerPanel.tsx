'use client'

import { useMemo } from 'react'
import { X } from 'lucide-react'
import type { LedgerEntry } from '@/lib/payments/account-ledger'
import {
  LEDGER_KIND_LABELS,
  LEDGER_METHOD_LABELS,
  ledgerEntriesForAccount,
} from '@/lib/payments/ledger-labels'
import { formatMoney } from '@/lib/format-money'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DataPanel } from '@/components/shared/DataPanel'

interface BankAccountSummary {
  id: string
  bank_name: string
  account_name: string | null
  account_number: string | null
  current_total: number
}

interface BankAccountLedgerPanelProps {
  account: BankAccountSummary
  ledger: LedgerEntry[]
  onClose: () => void
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

export function BankAccountLedgerPanel({
  account,
  ledger,
  onClose,
}: BankAccountLedgerPanelProps) {
  const entries = useMemo(
    () => ledgerEntriesForAccount(ledger, account.id),
    [account.id, ledger],
  )

  const total = useMemo(
    () => entries.reduce((s, e) => s + Number(e.amount), 0),
    [entries],
  )

  return (
    <DataPanel noPadding className="border-primary/20">
      <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-border bg-muted/30">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">تحويلات — {account.bank_name}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {account.account_name ?? '—'}
            {account.account_number ? (
              <>
                {' · '}
                <span dir="ltr" className="tabular-nums inline-block">
                  {account.account_number}
                </span>
              </>
            ) : null}
            {' · '}
            إجمالي: <span className="font-medium tabular-nums">{formatMoney(total)}</span>
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0 shrink-0"
          onClick={onClose}
          aria-label="إغلاق"
        >
          <X size={16} />
        </Button>
      </div>

      {entries.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          لا تحويلات مسجّلة على هذا الحساب بعد
        </p>
      ) : (
        <div className="overflow-x-auto max-h-56 overflow-y-auto">
          <table className="mash-data-table">
            <thead className="sticky top-0 z-10 bg-muted/90 backdrop-blur border-b border-border">
              <tr>
                <th className="px-3 py-2 text-right font-semibold text-xs">التاريخ</th>
                <th className="px-3 py-2 text-right font-semibold text-xs">من</th>
                <th className="px-3 py-2 text-right font-semibold text-xs">الحساب الصادر</th>
                <th className="px-3 py-2 text-right font-semibold text-xs">الطريقة</th>
                <th className="px-3 py-2 text-right font-semibold text-xs">المبلغ</th>
                <th className="px-3 py-2 text-right font-semibold text-xs">النوع</th>
                <th className="px-3 py-2 text-right font-semibold text-xs">ملاحظات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {entries.map((entry) => (
                <tr key={`${entry.kind}-${entry.id}`} className="hover:bg-muted/20">
                  <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">
                    {formatDate(entry.recorded_at)}
                  </td>
                  <td className="px-3 py-2 text-xs font-medium">{entry.counterparty}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {entry.source_account_label?.trim() || '—'}
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant="secondary" className="text-[10px] font-normal px-1.5 py-0">
                      {LEDGER_METHOD_LABELS[entry.method] ?? entry.method}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 tabular-nums text-xs font-semibold">
                    {formatMoney(entry.amount)}
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant="outline" className="text-[10px] font-normal px-1.5 py-0">
                      {LEDGER_KIND_LABELS[entry.kind] ?? entry.kind}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground max-w-[120px]">
                    <span className="line-clamp-2">{entry.notes?.trim() || '—'}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </DataPanel>
  )
}
