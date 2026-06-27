'use client'

import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { KeyRound, Mail, User } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useCurrentUserId } from '@/hooks/useMessages'
import { formatProfileError, saveMyUserName } from '@/lib/tenant/profile'
import { ChangeEmailForm } from '@/components/settings/ChangeEmailForm'
import { ChangePasswordForm } from '@/components/settings/ChangePasswordForm'
import { DataPanel } from '@/components/shared/DataPanel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'

const ROLE_LABELS: Record<string, string> = {
  admin: 'مسؤول',
  employee: 'كاشير',
  super_admin: 'Super Admin',
}

export function AdminAccountSection() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const { data: authUserId } = useCurrentUserId()

  const [displayName, setDisplayName] = useState('')
  const [saving, setSaving] = useState(false)

  const { data: authUser } = useQuery({
    queryKey: ['auth-user-email'],
    queryFn: async () => {
      const { data, error } = await supabase.auth.getUser()
      if (error) throw error
      return data.user
    },
  })

  const { data: dbUser } = useQuery({
    queryKey: ['my-db-user', authUserId],
    queryFn: async () => {
      if (!authUserId) return null
      const { data, error } = await supabase
        .from('users')
        .select('id, name, role')
        .eq('id', authUserId)
        .single()
      if (error) throw error
      return data
    },
    enabled: !!authUserId,
  })

  useEffect(() => {
    if (dbUser?.name) setDisplayName(dbUser.name)
  }, [dbUser?.name])

  async function handleSaveName(e: React.FormEvent) {
    e.preventDefault()
    if (!displayName.trim()) {
      toast.error('الاسم مطلوب')
      return
    }

    setSaving(true)
    try {
      await saveMyUserName(supabase, displayName.trim())
      toast.success('تم تحديث الاسم')
      void queryClient.invalidateQueries({ queryKey: ['my-db-user'] })
      void queryClient.invalidateQueries({ queryKey: ['tenant-users'] })
    } catch (err) {
      toast.error(formatProfileError(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <DataPanel className="p-5 h-full">
      <div className="flex items-center gap-2 mb-5">
        <User size={18} className="text-primary" />
        <h2 className="font-semibold">حساب المسؤول</h2>
      </div>

      <div className="space-y-6 max-w-md">
        <section>
          <h3 className="text-sm font-medium mb-3">الملف الشخصي</h3>
          <form onSubmit={(e) => void handleSaveName(e)} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="admin-name">الاسم المعروض</Label>
              <Input
                id="admin-name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                disabled={saving}
              />
            </div>

            <div className="flex items-center gap-2">
              <Label>الدور</Label>
              <Badge variant="secondary">
                {ROLE_LABELS[dbUser?.role ?? ''] ?? dbUser?.role ?? '—'}
              </Badge>
            </div>

            <Button type="submit" disabled={saving}>
              {saving ? 'جارٍ الحفظ…' : 'حفظ الاسم'}
            </Button>
          </form>
        </section>

        <section className="border-t border-border pt-6">
          <div className="flex items-center gap-2 mb-3">
            <Mail size={16} className="text-muted-foreground" />
            <h3 className="text-sm font-medium">البريد الإلكتروني</h3>
          </div>

          <div className="space-y-1.5 mb-4">
            <Label>البريد الحالي</Label>
            <Input
              value={authUser?.email ?? '—'}
              disabled
              dir="ltr"
              className="text-left bg-muted/40"
            />
          </div>

          <ChangeEmailForm currentEmail={authUser?.email} />
        </section>

        <section className="border-t border-border pt-6">
          <div className="flex items-center gap-2 mb-3">
            <KeyRound size={16} className="text-muted-foreground" />
            <h3 className="text-sm font-medium">كلمة المرور</h3>
          </div>
          <ChangePasswordForm email={authUser?.email} />
        </section>
      </div>
    </DataPanel>
  )
}
