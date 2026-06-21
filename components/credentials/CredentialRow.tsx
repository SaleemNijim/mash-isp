'use client'

import { useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { usePermissions } from '@/hooks/usePermissions'
import { PermissionGuard } from '@/components/permissions/PermissionGuard'
import { Button } from '@/components/ui/button'

export interface CredentialListItem {
  id: string
  tenant_id: string
  username: string
  type: 'bb' | 'we'
  is_used: boolean
  is_deleted: boolean
  created_at: string
}

function credentialStatus(row: CredentialListItem): {
  emoji: string
  label: string
  className: string
} {
  if (row.is_deleted) {
    return { emoji: '⚫', label: 'محذوف', className: 'text-gray-500' }
  }
  if (row.is_used) {
    return { emoji: '🔴', label: 'مستخدم', className: 'text-red-600' }
  }
  return { emoji: '🟢', label: 'متاح', className: 'text-green-600' }
}

function PasswordCell({ credentialId }: { credentialId: string }) {
  const supabase = createClient()
  const hasPermission = usePermissions((s) => s.hasPermission)
  const canView = hasPermission('view_full_password')
  const [password, setPassword] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!canView) {
      setLoading(false)
      return
    }

    let cancelled = false
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
  }, [credentialId, canView, supabase])

  if (!canView) {
    return <span className="text-muted-foreground">—</span>
  }

  if (loading) {
    return <span className="font-mono text-muted-foreground">…</span>
  }

  return (
    <span className="font-mono text-gray-900" dir="ltr">
      {password?.trim() || '—'}
    </span>
  )
}

interface CredentialRowProps {
  row: CredentialListItem
  style?: React.CSSProperties
  onDelete: (row: CredentialListItem) => void
}

export function CredentialRow({ row, style, onDelete }: CredentialRowProps) {
  const st = credentialStatus(row)

  return (
    <tr
      style={style}
      className={`hover:bg-mash-page border-b border-gray-100 ${
        row.is_deleted ? 'bg-gray-50/80 opacity-75' : ''
      }`}
    >
      <td className="px-3 py-2 font-medium font-mono">{row.username}</td>
      <td className="px-3 py-2">
        <PasswordCell credentialId={row.id} />
      </td>
      <td className="px-3 py-2">
        <span className={`inline-flex items-center gap-1.5 text-sm ${st.className}`}>
          <span aria-hidden>{st.emoji}</span>
          {st.label}
        </span>
      </td>
      <td className="px-3 py-2">
        {!row.is_deleted && (
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
        )}
      </td>
    </tr>
  )
}
