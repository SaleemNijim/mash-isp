'use client'

import { useEffect, useState, useCallback } from 'react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { PERMISSION_CODES, PERMISSION_LABELS, type PermissionCode } from '@/lib/permissions'

interface User {
  id: string
  name: string
  role: string
}

export function PermissionMatrix() {
  const [users, setUsers] = useState<User[]>([])
  const [userPerms, setUserPerms] = useState<Record<string, Set<string>>>({})
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState<string | null>(null)

  const supabase = createClient()

  const load = useCallback(async () => {
    setLoading(true)
    const [usersRes, permsRes] = await Promise.all([
      supabase
        .from('users')
        .select('id,name,role')
        .eq('is_active', true)
        .not('role', 'in', '(admin,super_admin)')
        .order('name'),
      supabase.from('user_permissions').select('user_id,permission'),
    ])

    if (usersRes.error) {
      toast.error('فشل تحميل المستخدمين')
    }

    const map: Record<string, Set<string>> = {}
    permsRes.data?.forEach((p) => {
      if (!map[p.user_id]) map[p.user_id] = new Set()
      map[p.user_id].add(p.permission as string)
    })

    setUsers(usersRes.data ?? [])
    setUserPerms(map)
    setLoading(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    void load()
  }, [load])

  const toggle = async (userId: string, permission: PermissionCode) => {
    const key = `${userId}:${permission}`
    setToggling(key)

    const has = userPerms[userId]?.has(permission) ?? false

    if (has) {
      const { error } = await supabase
        .from('user_permissions')
        .delete()
        .eq('user_id', userId)
        .eq('permission', permission)

      if (error) {
        toast.error('فشل إزالة الصلاحية')
        setToggling(null)
        return
      }

      setUserPerms((prev) => {
        const next = { ...prev, [userId]: new Set(prev[userId]) }
        next[userId].delete(permission)
        return next
      })
    } else {
      const { error } = await supabase
        .from('user_permissions')
        .insert({ user_id: userId, permission })

      if (error) {
        toast.error('فشل منح الصلاحية')
        setToggling(null)
        return
      }

      setUserPerms((prev) => {
        const next = { ...prev, [userId]: new Set(prev[userId] ?? []) }
        next[userId].add(permission)
        return next
      })
    }

    setToggling(null)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12 text-sm text-muted-foreground" dir="rtl">
        جارٍ تحميل مصفوفة الصلاحيات...
      </div>
    )
  }

  if (users.length === 0) {
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
          {users.map((user, idx) => (
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
