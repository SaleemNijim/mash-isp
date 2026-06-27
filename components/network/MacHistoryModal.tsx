'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface MacHistoryRow {
  id: string
  old_mac: string | null
  new_mac: string | null
  changed_by: string | null
  changed_at: string | null
}

interface UserRow {
  id: string
  name: string
}

interface MacHistoryModalProps {
  open: boolean
  routerId: string | null
  routerName: string
  onClose: () => void
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('ar-EG', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function MacHistoryModal({
  open,
  routerId,
  routerName,
  onClose,
}: MacHistoryModalProps) {
  const supabase = createClient()

  const { data: history = [], isLoading } = useQuery<MacHistoryRow[]>({
    queryKey: ['router-mac-history', routerId],
    queryFn: async () => {
      if (!routerId) return []
      const { data, error } = await supabase
        .from('router_mac_history')
        .select('id, old_mac, new_mac, changed_by, changed_at')
        .eq('router_id', routerId)
        .eq('is_deleted', false)
        .order('changed_at', { ascending: false })
      if (error) throw error
      return data ?? []
    },
    enabled: open && !!routerId,
  })

  const changerIds = [...new Set(history.map((h) => h.changed_by).filter(Boolean))] as string[]

  const { data: users = [] } = useQuery<UserRow[]>({
    queryKey: ['router-mac-history-users', changerIds.join(',')],
    queryFn: async () => {
      if (changerIds.length === 0) return []
      const { data, error } = await supabase
        .from('users')
        .select('id, name')
        .in('id', changerIds)
      if (error) throw error
      return data ?? []
    },
    enabled: open && changerIds.length > 0,
  })

  const userMap = new Map(users.map((u) => [u.id, u.name]))

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent dir="rtl" className="max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>سجل تغييرات MAC — {routerName}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-auto min-h-0">
          {isLoading && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              جارٍ التحميل…
            </p>
          )}

          {!isLoading && history.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              لا توجد تغييرات مسجَّلة
            </p>
          )}

          {!isLoading && history.length > 0 && (
            <table className="mash-data-table">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="py-2 px-2 text-right font-medium">التاريخ</th>
                  <th className="py-2 px-2 text-right font-medium">MAC القديم</th>
                  <th className="py-2 px-2 text-right font-medium">MAC الجديد</th>
                  <th className="py-2 px-2 text-right font-medium">بواسطة</th>
                </tr>
              </thead>
              <tbody>
                {history.map((row) => (
                  <tr key={row.id} className="border-b border-mash-row-border">
                    <td className="py-2 px-2 tabular-nums whitespace-nowrap">
                      {formatDateTime(row.changed_at)}
                    </td>
                    <td className="py-2 px-2">
                      <code dir="ltr" className="font-mono text-xs">
                        {row.old_mac || '—'}
                      </code>
                    </td>
                    <td className="py-2 px-2">
                      <code dir="ltr" className="font-mono text-xs">
                        {row.new_mac || '—'}
                      </code>
                    </td>
                    <td className="py-2 px-2">
                      {row.changed_by
                        ? userMap.get(row.changed_by) ?? '—'
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
