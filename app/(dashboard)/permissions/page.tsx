'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { UserPlus, UserX, RefreshCw } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useTenant } from '@/hooks/useTenant'
import { usePermissions } from '@/hooks/usePermissions'
import { PermissionGuard } from '@/components/permissions/PermissionGuard'
import { PermissionMatrix } from '@/components/permissions/PermissionMatrix'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'

interface TenantUser {
  id: string
  name: string
  role: string
  is_active: boolean
}

export default function PermissionsPage() {
  return (
    <PermissionGuard permission="manage_users">
      <PermissionsContent />
    </PermissionGuard>
  )
}

function PermissionsContent() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const { data: tenant } = useTenant()
  const currentRole = usePermissions((s) => s.role)

  const [suspending, setSuspending] = useState<string | null>(null)

  const [empName, setEmpName] = useState('')
  const [empEmail, setEmpEmail] = useState('')
  const [empPassword, setEmpPassword] = useState('')
  const [adding, setAdding] = useState(false)

  const isAdmin = currentRole === 'admin' || currentRole === 'super_admin'

  const { data: users = [], isLoading: loadingUsers, refetch } = useQuery<TenantUser[]>({
    queryKey: ['permissions-users', tenant?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('users')
        .select('id,name,role,is_active')
        .eq('is_active', true)
        .not('role', 'in', '(super_admin)')
        .order('name')

      if (error) throw error
      return data ?? []
    },
    enabled: !!tenant?.id,
  })

  async function handleAddEmployee(e: React.FormEvent) {
    e.preventDefault()
    if (!tenant?.id) {
      toast.error('تعذّر تحديد الشركة')
      return
    }
    if (empPassword.length < 8) {
      toast.error('كلمة المرور يجب أن تكون 8 أحرف على الأقل')
      return
    }

    setAdding(true)

    const res = await fetch('/api/employees/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: empName.trim(),
        email: empEmail.trim(),
        password: empPassword,
      }),
    })

    const payload = (await res.json().catch(() => ({}))) as { error?: string }

    if (!res.ok) {
      toast.error(payload.error ?? 'فشل إنشاء حساب الكاشير')
      setAdding(false)
      return
    }

    toast.success('تم إنشاء حساب الكاشير — صلاحيات: مبيعات + تجديد + شبكة (قراءة)')
    setEmpName('')
    setEmpEmail('')
    setEmpPassword('')
    void queryClient.invalidateQueries({ queryKey: ['permissions-users'] })
    setAdding(false)
  }

  async function handleSuspend(userId: string, userName: string) {
    if (!confirm(`هل تريد تعليق المستخدم «${userName}»؟ سيُخرج فوراً عند أول تنقّل.`)) {
      return
    }

    setSuspending(userId)

    const { error } = await supabase
      .from('users')
      .update({
        is_active: false,
        force_logout_at: new Date().toISOString(),
      })
      .eq('id', userId)

    if (error) {
      toast.error('فشل تعليق المستخدم: ' + error.message)
      setSuspending(null)
      return
    }

    toast.success(`تم تعليق «${userName}» — سيُخرج عند أول تنقّل`)
    void queryClient.invalidateQueries({ queryKey: ['permissions-users'] })
    setSuspending(null)
  }

  const ROLE_LABELS: Record<string, string> = {
    admin: 'مدير',
    employee: 'كاشير',
  }

  return (
    <div dir="rtl" className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">الصلاحيات والمستخدمون</h1>
        <p className="mt-1 text-sm text-gray-500">
          إدارة موظفي الشركة ومصفوفة الصلاحيات
        </p>
      </div>

      {isAdmin && (
        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-gray-900">
            <UserPlus size={18} />
            إضافة موظف (كاشير)
          </h2>
          <form onSubmit={handleAddEmployee} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label htmlFor="empName">الاسم</Label>
              <Input
                id="empName"
                value={empName}
                onChange={(e) => setEmpName(e.target.value)}
                placeholder="أحمد محمد"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="empEmail">البريد الإلكتروني</Label>
              <Input
                id="empEmail"
                type="email"
                value={empEmail}
                onChange={(e) => setEmpEmail(e.target.value)}
                placeholder="cashier@company.com"
                required
                dir="ltr"
                className="text-right"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="empPassword">كلمة المرور</Label>
              <Input
                id="empPassword"
                type="password"
                value={empPassword}
                onChange={(e) => setEmpPassword(e.target.value)}
                placeholder="8 أحرف على الأقل"
                required
                minLength={8}
                dir="ltr"
                className="text-right"
              />
            </div>
            <div className="flex items-end">
              <Button type="submit" disabled={adding} className="w-full">
                {adding ? 'جارٍ الإنشاء...' : 'إنشاء حساب'}
              </Button>
            </div>
          </form>
        </section>
      )}

      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">المستخدمون النشطون</h2>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            <RefreshCw size={14} className="ml-1" />
            تحديث
          </Button>
        </div>

        {loadingUsers ? (
          <p className="text-sm text-gray-500">جارٍ التحميل...</p>
        ) : users.length === 0 ? (
          <p className="text-sm text-gray-500">لا يوجد مستخدمون نشطون.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {users.map((user) => (
              <div
                key={user.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div className="flex items-center gap-3">
                  <span className="font-medium text-gray-900">{user.name}</span>
                  <Badge variant="secondary">
                    {ROLE_LABELS[user.role] ?? user.role}
                  </Badge>
                </div>
                {user.role === 'employee' && isAdmin && (
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={suspending === user.id}
                    onClick={() => void handleSuspend(user.id, user.name)}
                  >
                    <UserX size={14} className="ml-1" />
                    {suspending === user.id ? 'جارٍ التعليق...' : 'تعليق مستخدم'}
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-4 text-base font-semibold text-gray-900">مصفوفة الصلاحيات</h2>
        <PermissionMatrix />
      </section>
    </div>
  )
}
