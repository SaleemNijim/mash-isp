'use client'

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { UserPlus, UserX, RefreshCw, Pencil } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useTenant } from '@/hooks/useTenant'
import { useCurrentUserId } from '@/hooks/useMessages'
import {
  TENANT_USER_PERMISSIONS_QUERY_KEY,
  TENANT_USERS_QUERY_KEY,
  useTenantUsers,
} from '@/hooks/useTenantUsers'
import { usePermissions } from '@/hooks/usePermissions'
import { PermissionGuard } from '@/components/permissions/PermissionGuard'
import { PermissionMatrix } from '@/components/permissions/PermissionMatrix'
import { SuspendUserConfirmModal } from '@/components/permissions/SuspendUserConfirmModal'
import { EditEmployeeModal } from '@/components/permissions/EditEmployeeModal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/shared/PageHeader'
import { DataPanel } from '@/components/shared/DataPanel'

function invalidateTenantUserQueries(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: TENANT_USERS_QUERY_KEY })
  void queryClient.invalidateQueries({ queryKey: TENANT_USER_PERMISSIONS_QUERY_KEY })
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
  const { data: authUserId } = useCurrentUserId()
  const currentRole = usePermissions((s) => s.role)

  const [suspendTarget, setSuspendTarget] = useState<{ id: string; name: string } | null>(
    null,
  )
  const [editTarget, setEditTarget] = useState<{ id: string; name: string } | null>(null)
  const [suspending, setSuspending] = useState(false)

  const [empName, setEmpName] = useState('')
  const [empEmail, setEmpEmail] = useState('')
  const [empPassword, setEmpPassword] = useState('')
  const [adding, setAdding] = useState(false)

  const isAdmin = currentRole === 'admin' || currentRole === 'super_admin'

  const {
    data: users = [],
    isLoading: loadingUsers,
    refetch,
    isError: usersError,
    error: usersLoadError,
  } = useTenantUsers()

  const currentAdmin = users.find((u) => u.id === authUserId)

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

    toast.success('تم إنشاء حساب الكاشير — صلاحيات: مبيعات + تجديد')
    setEmpName('')
    setEmpEmail('')
    setEmpPassword('')
    invalidateTenantUserQueries(queryClient)
    setAdding(false)
  }

  async function confirmSuspend(): Promise<boolean> {
    if (!suspendTarget) return false

    setSuspending(true)
    const { error } = await supabase.rpc('suspend_tenant_employee', {
      p_user_id: suspendTarget.id,
    })

    if (error) {
      setSuspending(false)
      toast.error('فشل تعليق المستخدم: ' + error.message)
      return false
    }

    toast.success(`تم تعليق «${suspendTarget.name}» — سيُخرج عند أول تنقّل`)
    invalidateTenantUserQueries(queryClient)
    setSuspending(false)
    setSuspendTarget(null)
    return true
  }

  const ROLE_LABELS: Record<string, string> = {
    admin: 'مدير',
    employee: 'كاشير',
  }

  return (
    <div dir="rtl" className="space-y-8">
      <PageHeader
        title="الصلاحيات والمستخدمون"
        description="إدارة موظفي الشركة ومصفوفة الصلاحيات"
      />
      {currentAdmin && (
        <p className="-mt-4 text-xs text-muted-foreground">
          مسجّل الدخول:{' '}
          <span className="font-medium text-foreground">{currentAdmin.name}</span>
          <span className="text-muted-foreground/60"> · </span>
          {ROLE_LABELS[currentAdmin.role] ?? currentAdmin.role}
        </p>
      )}

      {isAdmin && (
        <section className="mash-section">
          <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-foreground">
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
                placeholder="••••••••"
                required
                minLength={8}
                dir="ltr"
                className="text-right"
                aria-describedby="empPassword-hint"
              />
              <p id="empPassword-hint" className="text-xs text-muted-foreground">
                8 أحرف على الأقل
              </p>
            </div>
            <div className="flex items-end">
              <Button type="submit" disabled={adding} className="w-full min-h-11">
                {adding ? 'جارٍ الإنشاء...' : 'إنشاء حساب'}
              </Button>
            </div>
          </form>
        </section>
      )}

      <DataPanel className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">المستخدمون النشطون</h2>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            <RefreshCw size={14} className="ml-1" />
            تحديث
          </Button>
        </div>

        {loadingUsers ? (
          <p className="text-sm text-muted-foreground">جارٍ التحميل...</p>
        ) : usersError ? (
          <p className="text-sm text-destructive">
            تعذّر تحميل المستخدمين:{' '}
            {usersLoadError instanceof Error ? usersLoadError.message : 'خطأ غير معروف'}
          </p>
        ) : users.length === 0 ? (
          <p className="text-sm text-muted-foreground">لا يوجد مستخدمون نشطون.</p>
        ) : (
          <div className="divide-y divide-border">
            {users.map((user) => (
              <div
                key={user.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-foreground">{user.name}</span>
                    <Badge variant="secondary">
                      {ROLE_LABELS[user.role] ?? user.role}
                    </Badge>
                  </div>
                </div>
                {user.role === 'employee' && isAdmin && (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditTarget({ id: user.id, name: user.name })}
                    >
                      <Pencil size={14} className="ml-1" />
                      تعديل الحساب
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={suspending && suspendTarget?.id === user.id}
                      onClick={() => setSuspendTarget({ id: user.id, name: user.name })}
                    >
                      <UserX size={14} className="ml-1" />
                      {suspending && suspendTarget?.id === user.id
                        ? 'جارٍ التعليق...'
                        : 'تعليق مستخدم'}
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </DataPanel>

      <section>
        <h2 className="mb-4 text-base font-semibold text-foreground">مصفوفة الصلاحيات</h2>
        <PermissionMatrix />
      </section>

      <SuspendUserConfirmModal
        open={suspendTarget !== null}
        employeeName={suspendTarget?.name ?? null}
        onClose={() => {
          if (!suspending) setSuspendTarget(null)
        }}
        onConfirm={confirmSuspend}
      />

      <EditEmployeeModal
        open={editTarget !== null}
        employee={editTarget}
        onClose={() => setEditTarget(null)}
        onSaved={() => invalidateTenantUserQueries(queryClient)}
      />
    </div>
  )
}
