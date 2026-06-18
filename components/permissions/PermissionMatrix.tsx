'use client'

import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { throwIfSupabaseError } from '@/lib/supabase/errors'
import {
  TENANT_USER_PERMISSIONS_QUERY_KEY,
  useTenantUsers,
} from '@/hooks/useTenantUsers'
import { PERMISSION_CODES, PERMISSION_LABELS, type PermissionCode } from '@/lib/permissions'

function mapPermissionRpcError(message: string): string {
  if (message.includes('not_authorized')) return 'غير مصرّح — فقط مدير الشركة'
  if (message.includes('employee_not_found')) return 'الموظف غير موجود أو ليس كاشيراً'
  if (message.includes('unknown_permission')) return 'صلاحية غير معروفة'
  if (message.includes('no_tenant_context')) return 'تعذّر تحديد الشركة'
  return message
}

export function PermissionMatrix() {
  const { data: users = [], isLoading: loadingUsers } = useTenantUsers()
  const employees = useMemo(
    () => users.filter((u) => u.role === 'employee'),
    [users],
  )

  const { data: permsData = [], isLoading: loadingPerms } = useQuery({
    queryKey: TENANT_USER_PERMISSIONS_QUERY_KEY,
    enabled: employees.length > 0,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('list_tenant_user_permissions')
      throwIfSupabaseError(error)
      return (Array.isArray(data) ? data : []) as { user_id: string; permission: string }[]
    },
    staleTime: 60_000,
  })

  const userPerms = useMemo(() => {
    const map: Record<string, Set<string>> = {}
    permsData.forEach((p) => {
      if (!map[p.user_id]) map[p.user_id] = new Set()
      map[p.user_id].add(p.permission)
    })
    return map
  }, [permsData])

  const [toggling, setToggling] = useState<string | null>(null)
  const supabase = createClient()
  const queryClient = useQueryClient()

  const loading = loadingUsers || (employees.length > 0 && loadingPerms)

  const toggle = async (userId: string, permission: PermissionCode) => {
    const key = `${userId}:${permission}`
    setToggling(key)

    const has = userPerms[userId]?.has(permission) ?? false

    const { error } = await supabase.rpc('set_employee_permission', {
      p_user_id: userId,
      p_permission: permission,
      p_grant: !has,
    })

    if (error) {
      toast.error(
        has ? 'فشل إزالة الصلاحية' : 'فشل منح الصلاحية',
        { description: mapPermissionRpcError(error.message) },
      )
      setToggling(null)
      return
    }

    void queryClient.invalidateQueries({ queryKey: TENANT_USER_PERMISSIONS_QUERY_KEY })
    setToggling(null)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12 text-sm text-muted-foreground" dir="rtl">
        جارٍ تحميل مصفوفة الصلاحيات...
      </div>
    )
  }

  if (employees.length === 0) {
    return (
      <div className="flex items-center justify-center p-12 text-sm text-muted-foreground" dir="rtl">
        لا يوجد موظفون — أضف كاشيراً أولاً لمنحه الصلاحيات.
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card" dir="rtl">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-muted/40 border-b border-border">
            <th className="sticky right-0 bg-muted/40 px-4 py-3 text-right font-semibold text-foreground min-w-[140px]">
              المستخدم
            </th>
            {PERMISSION_CODES.map((perm) => (
              <th
                key={perm}
                className="px-2 py-3 text-center font-medium text-muted-foreground min-w-[88px] text-xs leading-tight"
              >
                {PERMISSION_LABELS[perm]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {employees.map((user, idx) => (
            <tr
              key={user.id}
              className={`border-b border-border last:border-0 transition-colors hover:bg-muted/20 ${
                idx % 2 === 0 ? 'bg-card' : 'bg-muted/5'
              }`}
            >
              <td className="sticky right-0 bg-inherit px-4 py-3 font-medium text-foreground">
                {user.name}
              </td>
              {PERMISSION_CODES.map((perm) => {
                const key = `${user.id}:${perm}`
                const checked = userPerms[user.id]?.has(perm) ?? false
                const busy = toggling === key

                return (
                  <td key={perm} className="px-2 py-3 text-center">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={checked}
                      aria-label={`${PERMISSION_LABELS[perm]} — ${user.name}`}
                      onClick={() => void toggle(user.id, perm)}
                      disabled={busy}
                      className={[
                        'relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent',
                        'transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2',
                        'focus-visible:ring-ring focus-visible:ring-offset-2',
                        checked ? 'bg-primary' : 'bg-input',
                        busy ? 'opacity-50 cursor-wait' : 'cursor-pointer',
                      ].join(' ')}
                    >
                      <span
                        className={[
                          'pointer-events-none block h-4 w-4 rounded-full bg-background shadow-sm',
                          'transition-transform duration-200',
                          checked ? '-translate-x-4' : 'translate-x-0',
                        ].join(' ')}
                      />
                    </button>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
