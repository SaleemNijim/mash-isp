'use client'

import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowLeftRight, RefreshCw } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useTenant } from '@/hooks/useTenant'
import { usePermissions } from '@/hooks/usePermissions'
import { PppPlanSelect } from '@/components/subscriptions/PppPlanSelect'
import { BbCredentialField } from '@/components/subscriptions/BbCredentialField'
import type { PppPlan } from '@/lib/ppp/plans'
import type { BbCredentialInputMode } from '@/lib/subscriptions/resolve-bb-credential'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

type CorrectionMode = 'reassign' | 'swap'

interface CredentialCorrectionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  customerId: string
  customerName: string
  onSuccess: () => void
}

interface CurrentAssignment {
  credential_id: string
  username: string | null
  speed: string | null
  price: number | null
}

function mapRpcError(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('admin_only') || m.includes('staff_only')) {
    return 'هذه العملية للمسؤول أو الكاشير فقط'
  }
  if (m.includes('credential_not_available')) return 'اليوزر غير متاح — اختر username آخر من المخزون'
  if (m.includes('both_customers_need_active_credential')) {
    return 'يجب أن يكون لكل مشترك يوزر نشط لتنفيذ التبديل'
  }
  if (m.includes('same_customer')) return 'اختر مشتركاً مختلفاً'
  if (m.includes('customer_not_found')) return 'المشترك غير موجود'
  return message
}

export function CredentialCorrectionDialog({
  open,
  onOpenChange,
  customerId,
  customerName,
  onSuccess,
}: CredentialCorrectionDialogProps) {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const { data: tenant } = useTenant()
  const role = usePermissions((s) => s.role)
  const canUse =
    role === 'admin' || role === 'super_admin' || role === 'employee'

  const [mode, setMode] = useState<CorrectionMode>('reassign')
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null)
  const [selectedPlan, setSelectedPlan] = useState<PppPlan | null>(null)
  const [credentialId, setCredentialId] = useState<string | null>(null)
  const [credentialMode, setCredentialMode] = useState<BbCredentialInputMode>('inventory')
  const [manualUsername, setManualUsername] = useState('')
  const [manualPassword, setManualPassword] = useState('')
  const [fixAmounts, setFixAmounts] = useState(true)
  const [notes, setNotes] = useState('')
  const [swapCustomerId, setSwapCustomerId] = useState('')
  const [swapFixAmounts, setSwapFixAmounts] = useState(false)
  const [loading, setLoading] = useState(false)

  const { data: current } = useQuery<CurrentAssignment | null>({
    queryKey: ['customer-credential-current', customerId],
    enabled: open && !!customerId,
    queryFn: async () => {
      const { data: usage, error: usageError } = await supabase
        .from('customer_credential_usage')
        .select('credential_id')
        .eq('customer_id', customerId)
        .is('released_at', null)
        .eq('is_deleted', false)
        .order('assigned_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (usageError) throw usageError
      if (!usage?.credential_id) return null

      const { data: sub, error: subError } = await supabase
        .from('subscriptions')
        .select('speed, price')
        .eq('customer_id', customerId)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (subError) throw subError

      const { data: cred, error: credError } = await supabase
        .from('internet_credentials')
        .select('username')
        .eq('id', usage.credential_id)
        .maybeSingle()
      if (credError) throw credError

      return {
        credential_id: usage.credential_id as string,
        username: (cred?.username as string) ?? null,
        speed: (sub?.speed as string) ?? null,
        price: sub?.price != null ? Number(sub.price) : null,
      }
    },
  })

  const { data: customers = [] } = useQuery({
    queryKey: ['customers-select', tenant?.id],
    enabled: open && mode === 'swap' && !!tenant?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customers')
        .select('id, name, phone')
        .eq('tenant_id', tenant!.id)
        .eq('is_deleted', false)
        .order('name')
      if (error) throw error
      return data ?? []
    },
  })

  const { data: swapTarget } = useQuery<CurrentAssignment & { customerName: string } | null>({
    queryKey: ['customer-credential-current', swapCustomerId],
    enabled: open && mode === 'swap' && !!swapCustomerId,
    queryFn: async () => {
      const customer = customers.find((c) => c.id === swapCustomerId)
      const { data: usage, error: usageError } = await supabase
        .from('customer_credential_usage')
        .select('credential_id')
        .eq('customer_id', swapCustomerId)
        .is('released_at', null)
        .eq('is_deleted', false)
        .order('assigned_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (usageError) throw usageError
      if (!usage?.credential_id) return null

      const { data: sub } = await supabase
        .from('subscriptions')
        .select('speed, price')
        .eq('customer_id', swapCustomerId)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      const { data: cred } = await supabase
        .from('internet_credentials')
        .select('username')
        .eq('id', usage.credential_id)
        .maybeSingle()

      return {
        credential_id: usage.credential_id as string,
        username: (cred?.username as string) ?? null,
        speed: (sub?.speed as string) ?? null,
        price: sub?.price != null ? Number(sub.price) : null,
        customerName: customer?.name ?? '—',
      }
    },
  })

  const swapOptions = useMemo(
    () => customers.filter((c) => c.id !== customerId),
    [customers, customerId],
  )

  useEffect(() => {
    if (!open) return
    setMode('reassign')
    setSelectedPlanId(null)
    setSelectedPlan(null)
    setCredentialId(null)
    setCredentialMode('inventory')
    setManualUsername('')
    setManualPassword('')
    setFixAmounts(true)
    setNotes('')
    setSwapCustomerId('')
    setSwapFixAmounts(false)
  }, [open, customerId])

  function handlePlanChange(plan: PppPlan | null) {
    setSelectedPlan(plan)
    setSelectedPlanId(plan?.id ?? null)
    setCredentialId(null)
    setCredentialMode('inventory')
  }

  async function handleReassign() {
    if (!credentialId) {
      toast.error('اختر username من مخزون الباقة الصحيحة')
      return
    }
    if (!selectedPlan) {
      toast.error('اختر الباقة الصحيحة')
      return
    }

    setLoading(true)
    try {
      const { error } = await supabase.rpc('reassign_customer_credential', {
        p_customer_id: customerId,
        p_new_credential_id: credentialId,
        p_new_speed: selectedPlan.speed,
        p_new_price: selectedPlan.price,
        p_fix_amounts: fixAmounts,
        p_notes: notes.trim() || null,
      })
      if (error) throw error

      toast.success('تم تصحيح اليوزر والباقة')
      void queryClient.invalidateQueries({ queryKey: ['customer-credential-current'] })
      void queryClient.invalidateQueries({ queryKey: ['credential-assignees'] })
      void queryClient.invalidateQueries({ queryKey: ['bb-credentials-with-passwords'] })
      onSuccess()
      onOpenChange(false)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'فشل التصحيح'
      toast.error(mapRpcError(msg))
    } finally {
      setLoading(false)
    }
  }

  async function handleSwap() {
    if (!swapCustomerId) {
      toast.error('اختر المشترك الثاني')
      return
    }
    if (!current?.credential_id || !swapTarget?.credential_id) {
      toast.error('يجب أن يكون لكل مشترك يوزر نشط')
      return
    }

    setLoading(true)
    try {
      const { error } = await supabase.rpc('swap_customer_credentials', {
        p_customer_a_id: customerId,
        p_customer_b_id: swapCustomerId,
        p_fix_amounts: swapFixAmounts,
        p_notes: notes.trim() || null,
      })
      if (error) throw error

      toast.success('تم تبديل اليوزر بين المشتركين')
      void queryClient.invalidateQueries({ queryKey: ['customer-credential-current'] })
      void queryClient.invalidateQueries({ queryKey: ['credential-assignees'] })
      onSuccess()
      onOpenChange(false)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'فشل التبديل'
      toast.error(mapRpcError(msg))
    } finally {
      setLoading(false)
    }
  }

  if (!canUse) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>تصحيح خلط يوزر / باقة</DialogTitle>
          <DialogDescription>
            {customerName} — أصلح خطأ الباقة أو بدّل اليوزر مع مشترك آخر
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant={mode === 'reassign' ? 'default' : 'outline'}
            className="flex-1 gap-1.5"
            onClick={() => setMode('reassign')}
          >
            <RefreshCw size={14} />
            إعادة تعيين
          </Button>
          <Button
            type="button"
            size="sm"
            variant={mode === 'swap' ? 'default' : 'outline'}
            className="flex-1 gap-1.5"
            onClick={() => setMode('swap')}
          >
            <ArrowLeftRight size={14} />
            تبديل
          </Button>
        </div>

        <div className="rounded-lg border bg-muted/30 p-3 text-sm space-y-1">
          <p className="font-medium">الوضع الحالي</p>
          <p className="text-muted-foreground">
            يوزر: <span className="font-mono" dir="ltr">{current?.username ?? '—'}</span>
          </p>
          <p className="text-muted-foreground">
            باقة: {current?.speed ?? '—'}
            {current?.price != null ? ` — ${current.price} ₪` : ''}
          </p>
        </div>

        {mode === 'reassign' ? (
          <div className="space-y-4">
            <PppPlanSelect
              value={selectedPlanId}
              onChange={handlePlanChange}
              disabled={loading}
              required
            />

            <BbCredentialField
              mode={credentialMode}
              onModeChange={setCredentialMode}
              credentialId={credentialId}
              onCredentialChange={setCredentialId}
              manualUsername={manualUsername}
              manualPassword={manualPassword}
              onManualUsernameChange={setManualUsername}
              onManualPasswordChange={setManualPassword}
              planId={selectedPlanId}
              disabled={loading}
            />

            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={fixAmounts}
                onChange={(e) => setFixAmounts(e.target.checked)}
                disabled={loading}
              />
              تصحيح المستحق والباقي تلقائياً حسب الباقة الجديدة
            </label>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>المشترك الثاني</Label>
              <Select
                value={swapCustomerId || undefined}
                onValueChange={setSwapCustomerId}
                disabled={loading}
              >
                <SelectTrigger>
                  <SelectValue placeholder="اختر مشتركاً للتبديل معه" />
                </SelectTrigger>
                <SelectContent dir="rtl" className="max-h-64">
                  {swapOptions.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                      {c.phone ? ` — ${c.phone}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {swapTarget && current && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm space-y-2">
                <p className="font-medium text-amber-900">معاينة التبديل</p>
                <p>
                  <span className="font-mono" dir="ltr">{current.username}</span>
                  {' '}({current.speed}) ← {swapTarget.customerName}
                </p>
                <p>
                  <span className="font-mono" dir="ltr">{swapTarget.username}</span>
                  {' '}({swapTarget.speed}) ← {customerName}
                </p>
              </div>
            )}

            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={swapFixAmounts}
                onChange={(e) => setSwapFixAmounts(e.target.checked)}
                disabled={loading}
              />
              تصحيح المستحق والباقي لكل مشترك حسب باقته الجديدة
            </label>
          </div>
        )}

        <div className="space-y-1.5">
          <Label>ملاحظة (اختياري)</Label>
          <Input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="مثال: تصحيح خلط 8M و 4M"
            disabled={loading}
          />
        </div>

        <DialogFooter className="gap-2 sm:justify-start">
          <Button
            onClick={() => void (mode === 'reassign' ? handleReassign() : handleSwap())}
            disabled={loading}
          >
            {loading ? 'جارٍ التنفيذ…' : mode === 'reassign' ? 'تأكيد إعادة التعيين' : 'تأكيد التبديل'}
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            إلغاء
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
