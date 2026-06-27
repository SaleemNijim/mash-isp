'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { PermissionGuard } from '@/components/permissions/PermissionGuard'
import { Button } from '@/components/ui/button'
import { MASH_TD, MASH_TD_ACTIONS, MASH_TD_INDEX, MASH_TD_LTR } from '@/lib/ui/mash-table'

export interface CredentialAssignee {
  customerId: string
  customerName: string
}

export interface CredentialListItem {
  id: string
  tenant_id: string
  username: string
  type: 'bb' | 'we'
  is_used: boolean
  is_deleted: boolean
  created_at: string
  plan_id?: string | null
  plan_name?: string | null
  assignee?: CredentialAssignee | null
}

function credentialStatus(row: CredentialListItem): {
  emoji: string
  label: string
  className: string
} {
  if (row.is_used) {
    return { emoji: '🔴', label: 'مستخدم', className: 'text-destructive' }
  }
  return { emoji: '🟢', label: 'متاح', className: 'text-mash-success-text' }
}

function PasswordCell({ credentialId }: { credentialId: string }) {
  const supabase = createClient()
  const [password, setPassword] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void (async () => {
      try {
        const { data, error } = await supabase.rpc('reveal_credential_password', {
          p_credential_id: credentialId,
        })
        if (error) throw error
        if (!cancelled) setPassword(data ?? '')
      } catch {
        if (!cancelled) setPassword(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [credentialId, supabase])

  if (loading) {
    return <span className="font-mono text-muted-foreground">…</span>
  }

  return (
    <span className="font-mono text-foreground" dir="ltr">
      {password?.trim() || '—'}
    </span>
  )
}

interface CredentialRowProps {
  row: CredentialListItem
  style?: React.CSSProperties
  onDelete: (row: CredentialListItem) => void
  showPlanColumn?: boolean
  index?: number
}

export function CredentialRow({
  row,
  style,
  onDelete,
  showPlanColumn = false,
  index,
}: CredentialRowProps) {
  const st = credentialStatus(row)

  return (
    <tr style={style} className="hover:bg-mash-page border-b border-mash-row-border">
      {index != null && <td className={MASH_TD_INDEX}>{index}</td>}
      {showPlanColumn && (
        <td className={MASH_TD}>{row.plan_name ?? '—'}</td>
      )}
      <td className={cn(MASH_TD_LTR, 'font-medium')}>{row.username}</td>
      <td className={MASH_TD_LTR}>
        <PasswordCell credentialId={row.id} />
      </td>
      <td className={MASH_TD}>
        <span className={`inline-flex items-center gap-1.5 text-sm ${st.className}`}>
          <span aria-hidden>{st.emoji}</span>
          {st.label}
        </span>
      </td>
      <td className={MASH_TD}>
        {!row.is_used ? (
          <span className="text-muted-foreground">—</span>
        ) : row.assignee ? (
          <Link
            href={`/subscriptions/customer/${row.assignee.customerId}`}
            className="text-sm text-primary hover:underline font-medium"
          >
            {row.assignee.customerName}
          </Link>
        ) : (
          <span className="text-xs text-muted-foreground">غير مربوط</span>
        )}
      </td>
      <td className={MASH_TD_ACTIONS}>
        <PermissionGuard permission="delete_records">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-destructive hover:text-destructive gap-1"
            onClick={() => onDelete(row)}
          >
            <Trash2 size={12} />
            حذف
          </Button>
        </PermissionGuard>
      </td>
    </tr>
  )
}
