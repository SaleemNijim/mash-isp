'use client'

import { useState } from 'react'
import { Eye, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
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
  const [visible, setVisible] = useState(false)
  const [password, setPassword] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleReveal() {
    setLoading(true)
    try {
      const { data, error } = await supabase.rpc('reveal_credential_password', {
        p_credential_id: credentialId,
      })
      if (error) throw error
      setPassword(data ?? '')
      setVisible(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-muted-foreground">
        {visible && password !== null ? password : '••••'}
      </span>
      <PermissionGuard permission="view_full_password">
        {!visible && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs gap-1"
            disabled={loading}
            onClick={() => void handleReveal()}
          >
            <Eye size={12} />
            {loading ? '…' : 'إظهار'}
          </Button>
        )}
      </PermissionGuard>
    </div>
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
