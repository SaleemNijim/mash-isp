'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface EditEmployeeModalProps {
  open: boolean
  employee: { id: string; name: string } | null
  onClose: () => void
  onSaved: () => void
}

export function EditEmployeeModal({
  open,
  employee,
  onClose,
  onSaved,
}: EditEmployeeModalProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loadingEmail, setLoadingEmail] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open || !employee) return

    setPassword('')
    setLoadingEmail(true)
    void (async () => {
      try {
        const res = await fetch(`/api/employees/${employee.id}`)
        const payload = (await res.json().catch(() => ({}))) as {
          email?: string
          error?: string
        }
        if (!res.ok) throw new Error(payload.error ?? 'تعذّر تحميل البريد')
        setEmail(payload.email ?? '')
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'تعذّر تحميل البريد')
        setEmail('')
      } finally {
        setLoadingEmail(false)
      }
    })()
  }, [open, employee])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!employee) return

    const trimmedEmail = email.trim()
    const hasPassword = password.length > 0

    if (!trimmedEmail) {
      toast.error('البريد الإلكتروني مطلوب')
      return
    }
    if (hasPassword && password.length < 8) {
      toast.error('كلمة المرور يجب أن تكون 8 أحرف على الأقل')
      return
    }

    setSaving(true)
    const body: { userId: string; email?: string; password?: string } = {
      userId: employee.id,
      email: trimmedEmail,
    }
    if (hasPassword) body.password = password

    const res = await fetch('/api/employees/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    const payload = (await res.json().catch(() => ({}))) as { error?: string }

    if (!res.ok) {
      toast.error(payload.error ?? 'فشل تحديث الحساب')
      setSaving(false)
      return
    }

    toast.success('تم تحديث حساب الكاشير')
    setSaving(false)
    setPassword('')
    onSaved()
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !saving && onClose()}>
      <DialogContent dir="rtl" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil size={16} />
            تعديل حساب الكاشير
          </DialogTitle>
        </DialogHeader>

        {employee && (
          <form onSubmit={(e) => void handleSave(e)} className="space-y-4">
            <p className="text-sm text-muted-foreground">
              الموظف: <span className="font-medium text-foreground">{employee.name}</span>
            </p>

            <div className="space-y-1.5">
              <Label htmlFor="edit-emp-email">البريد الإلكتروني</Label>
              <Input
                id="edit-emp-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loadingEmail || saving}
                required
                dir="ltr"
                className="text-right"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-emp-password">كلمة المرور الجديدة</Label>
              <Input
                id="edit-emp-password"
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={saving}
                placeholder="اتركها فارغة إن لم تُرد التغيير"
                minLength={8}
                dir="ltr"
                className="text-right font-mono"
                autoComplete="new-password"
              />
              <p className="text-xs text-muted-foreground">8 أحرف على الأقل — تظهر أثناء الكتابة</p>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
                إلغاء
              </Button>
              <Button type="submit" disabled={saving || loadingEmail}>
                {saving ? 'جارٍ الحفظ...' : 'حفظ التغييرات'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
