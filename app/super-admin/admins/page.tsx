'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus, RefreshCw, Shield } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

interface SuperAdminRow {
  id: string
  name: string
  email: string
  is_active: boolean
  created_at: string
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ar-EG', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export default function SuperAdminAdminsPage() {
  const queryClient = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  const [resetTarget, setResetTarget] = useState<SuperAdminRow | null>(null)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [saving, setSaving] = useState(false)

  const { data: admins = [], isLoading, refetch } = useQuery<SuperAdminRow[]>({
    queryKey: ['super-admin-admins'],
    queryFn: async () => {
      const res = await fetch('/api/super-admin/admins')
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'فشل التحميل')
      return (json.admins ?? []) as SuperAdminRow[]
    },
  })

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const res = await fetch('/api/super-admin/admins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'فشل الإنشاء')

      toast.success(`تم إنشاء حساب «${json.name}»`)
      setCreateOpen(false)
      setName('')
      setEmail('')
      setPassword('')
      void queryClient.invalidateQueries({ queryKey: ['super-admin-admins'] })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'فشل الإنشاء')
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(admin: SuperAdminRow) {
    setSaving(true)
    try {
      const res = await fetch(`/api/super-admin/admins/${admin.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !admin.is_active }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'فشل التحديث')

      toast.success(admin.is_active ? 'تم التعطيل' : 'تم التفعيل')
      void queryClient.invalidateQueries({ queryKey: ['super-admin-admins'] })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'فشل التحديث')
    } finally {
      setSaving(false)
    }
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault()
    if (!resetTarget) return

    setSaving(true)
    try {
      const res = await fetch(
        `/api/super-admin/admins/${resetTarget.id}/reset-password`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: newPassword }),
        },
      )
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'فشل إعادة التعيين')

      toast.success('تم تحديث كلمة المرور')
      setResetTarget(null)
      setNewPassword('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'فشل إعادة التعيين')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div dir="rtl" className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="size-6" />
            حسابات Super Admin
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            إنشاء وإدارة مديري المنصة
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            <RefreshCw className="size-4" />
            تحديث
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" />
            حساب جديد
          </Button>
        </div>
      </div>

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-right">الاسم</TableHead>
              <TableHead className="text-right">البريد</TableHead>
              <TableHead className="text-right">الحالة</TableHead>
              <TableHead className="text-right">تاريخ الإنشاء</TableHead>
              <TableHead className="text-right">إجراءات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  جاري التحميل...
                </TableCell>
              </TableRow>
            )}
            {!isLoading && admins.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  لا توجد حسابات
                </TableCell>
              </TableRow>
            )}
            {admins.map((admin) => (
              <TableRow key={admin.id}>
                <TableCell className="font-medium">{admin.name}</TableCell>
                <TableCell dir="ltr" className="text-right">
                  {admin.email || '—'}
                </TableCell>
                <TableCell>
                  <Badge variant={admin.is_active ? 'default' : 'destructive'}>
                    {admin.is_active ? 'نشط' : 'معطّل'}
                  </Badge>
                </TableCell>
                <TableCell>{formatDate(admin.created_at)}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={saving}
                      onClick={() => {
                        setNewPassword('')
                        setResetTarget(admin)
                      }}
                    >
                      كلمة المرور
                    </Button>
                    <Button
                      size="sm"
                      variant={admin.is_active ? 'destructive' : 'default'}
                      disabled={saving}
                      onClick={() => void toggleActive(admin)}
                    >
                      {admin.is_active ? 'تعطيل' : 'تفعيل'}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent dir="rtl" className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>إنشاء Super Admin</DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => void handleCreate(e)} className="space-y-4">
            <div className="space-y-1.5">
              <Label>الاسم</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label>البريد الإلكتروني</Label>
              <Input
                type="email"
                dir="ltr"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>كلمة المرور</Label>
              <Input
                type="password"
                dir="ltr"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                required
              />
            </div>
            <DialogFooter className="gap-2 sm:justify-start">
              <Button type="submit" disabled={saving}>
                {saving ? 'جاري الإنشاء...' : 'إنشاء'}
              </Button>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                إلغاء
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!resetTarget} onOpenChange={(open) => !open && setResetTarget(null)}>
        <DialogContent dir="rtl" className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>إعادة تعيين كلمة المرور — {resetTarget?.name}</DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => void handleResetPassword(e)} className="space-y-4">
            <div className="space-y-1.5">
              <Label>كلمة المرور الجديدة</Label>
              <Input
                type="password"
                dir="ltr"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                minLength={8}
                required
              />
            </div>
            <DialogFooter className="gap-2 sm:justify-start">
              <Button type="submit" disabled={saving}>
                {saving ? 'جاري الحفظ...' : 'حفظ'}
              </Button>
              <Button type="button" variant="outline" onClick={() => setResetTarget(null)}>
                إلغاء
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
