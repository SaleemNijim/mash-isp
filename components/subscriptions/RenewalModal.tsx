'use client'

import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { AlertTriangle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useTenant } from '@/hooks/useTenant'
import { enqueueOp } from '@/lib/sync/engine'
import { AccountSelector } from '@/components/subscriptions/AccountSelector'
import { PaymentProofUpload } from '@/components/shared/PaymentProofUpload'
import {
  uploadPaymentProof,
  attachProofToPayment,
  fetchLatestSubscriptionPayment,
} from '@/lib/payment-proof'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export interface RenewalSubscription {
  id: string
  customer_id: string
  type: 'bb' | 'we'
  price: number | null
  end_date: string | null
  customer_name?: string
}

interface Credential {
  id: string
  username: string
}

type PaymentMethod = 'cash' | 'debt' | 'electronic'

interface RenewalModalProps {
  open: boolean
  subscription: RenewalSubscription | null
  onClose: () => void
  onSuccess: () => void
}

export function RenewalModal({
  open,
  subscription,
  onClose,
  onSuccess,
}: RenewalModalProps) {
  const { data: tenant } = useTenant()
  const supabase = createClient()

  const [credentialId, setCredentialId] = useState<string | null>(null)
  const [weUsername, setWeUsername] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [bankAccountId, setBankAccountId] = useState<string | null>(null)
  const [proofFile, setProofFile] = useState<File | null>(null)
  const [notifyLater, setNotifyLater] = useState(false)
  const [loading, setLoading] = useState(false)

  const isBB = subscription?.type === 'bb'
  const amount = subscription?.price ?? 0

  useEffect(() => {
    if (!open) return
    setCredentialId(null)
    setWeUsername('')
    setPaymentMethod('cash')
    setBankAccountId(null)
    setProofFile(null)
    setNotifyLater(false)
  }, [open, subscription?.id])

  const { data: bbCredentials = [] } = useQuery<Credential[]>({
    queryKey: ['bb-credentials-unused', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return []
      const { data, error } = await supabase
        .from('internet_credentials')
        .select('id, username')
        .eq('tenant_id', tenant.id)
        .eq('type', 'bb')
        .eq('is_used', false)
        .eq('is_deleted', false)
        .order('username')
      if (error) throw error
      return data ?? []
    },
    enabled: open && isBB && !!tenant?.id,
  })

  async function handleSubmit() {
    if (!subscription || !tenant) return

    if (isBB && !credentialId) {
      toast.error('يجب اختيار كريدنشال BB غير مستخدم')
      return
    }

    if (!notifyLater && paymentMethod === 'electronic' && !bankAccountId) {
      toast.error('الدفع الإلكتروني يتطلب اختيار حساب بنكي')
      return
    }

    if (!notifyLater && paymentMethod === 'electronic' && !proofFile) {
      toast.error('يجب إرفاق إشعار الدفع')
      return
    }

    setLoading(true)
    try {
      if (notifyLater) {
        if (!navigator.onLine) {
          toast.error('إشعار لاحقاً يتطلب اتصالاً بالإنترنت')
          return
        }

        const dueAt = subscription.end_date
          ? new Date(subscription.end_date).toISOString()
          : new Date().toISOString()

        const { error } = await supabase.from('pending_tasks').insert({
          tenant_id: tenant.id,
          customer_id: subscription.customer_id,
          amount,
          due_at: dueAt,
          status: 'pending',
        })

        if (error) throw error
        toast.success('تم إنشاء مهمة إشعار لاحقاً')
        onSuccess()
        onClose()
        return
      }

      const method =
        paymentMethod === 'electronic' ? 'bank' : paymentMethod

      const rpcParams = {
        p_subscription_id: subscription.id,
        p_credential_id: isBB ? credentialId : null,
        p_amount: amount,
        p_method: method,
        p_bank_account_id:
          paymentMethod === 'electronic' ? bankAccountId : null,
        p_nonce: crypto.randomUUID(),
      }

      if (!navigator.onLine) {
        await enqueueOp('renew_subscription', {
          subscription_id: subscription.id,
          credential_id: rpcParams.p_credential_id,
          amount,
          method,
          bank_account_id: rpcParams.p_bank_account_id,
        })
        toast.success('تم حفظ التجديد — سيُزامَن عند عودة الاتصال')
        onSuccess()
        onClose()
        return
      }

      const { error } = await supabase.rpc('renew_subscription', rpcParams)
      if (error) throw error

      if (paymentMethod === 'electronic' && proofFile) {
        const {
          data: { user },
        } = await supabase.auth.getUser()
        const paymentId = await fetchLatestSubscriptionPayment(
          supabase,
          subscription.id,
        )
        if (paymentId && user) {
          const proofUrl = await uploadPaymentProof(
            supabase,
            tenant.id,
            `renewal/${subscription.id}`,
            proofFile,
          )
          await attachProofToPayment(
            supabase,
            tenant.id,
            paymentId,
            proofUrl,
            user.id,
          )
        }
      }

      toast.success('تم تجديد الاشتراك بنجاح')
      onSuccess()
      onClose()
    } catch {
      toast.error('فشلت عملية التجديد. يرجى المحاولة مرة أخرى.')
    } finally {
      setLoading(false)
    }
  }

  if (!subscription) return null

  return (
    <Dialog open={open} onOpenChange={(v) => !loading && !v && onClose()}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle>تجديد اشتراك</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg bg-muted/50 p-3 text-sm space-y-1">
            <p>
              <span className="text-muted-foreground">المشترك: </span>
              <strong>{subscription.customer_name ?? '—'}</strong>
            </p>
            <p>
              <span className="text-muted-foreground">النوع: </span>
              <strong>{subscription.type.toUpperCase()}</strong>
            </p>
            <p>
              <span className="text-muted-foreground">المبلغ: </span>
              <strong>{amount.toLocaleString('ar-EG')} ج.م</strong>
            </p>
          </div>

          {isBB ? (
            <div className="space-y-1.5">
              <Label>كريدنشال BB (غير مستخدم)</Label>
              <Select
                value={credentialId ?? ''}
                onValueChange={(v) => setCredentialId(v || null)}
                disabled={loading || notifyLater}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="اختر يوزر / باسورد" />
                </SelectTrigger>
                <SelectContent dir="rtl">
                  {bbCredentials.length === 0 ? (
                    <SelectItem value="_none" disabled>
                      لا توجد كريدنشالات متاحة
                    </SelectItem>
                  ) : (
                    bbCredentials.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.username}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="space-y-1.5">
                <Label>يوزر WE (معلوماتي)</Label>
                <Input
                  value={weUsername}
                  onChange={(e) => setWeUsername(e.target.value)}
                  placeholder="أدخل اسم المستخدم"
                  disabled={loading || notifyLater}
                  dir="ltr"
                  className="text-left"
                />
              </div>
              <Alert className="border-amber-200 bg-amber-50 text-amber-900">
                <AlertTriangle className="size-4" />
                <AlertDescription className="text-xs text-amber-900">
                  حقل is_used معلوماتي لـ WE — لا يُستهلك تلقائياً عند التجديد.
                </AlertDescription>
              </Alert>
            </div>
          )}

          <div className="space-y-2">
            <Label>طريقة الدفع</Label>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ['cash', 'نقداً'],
                  ['debt', 'دين'],
                  ['electronic', 'إلكتروني'],
                ] as const
              ).map(([val, label]) => (
                <Button
                  key={val}
                  type="button"
                  size="sm"
                  variant={paymentMethod === val ? 'default' : 'outline'}
                  onClick={() => setPaymentMethod(val)}
                  disabled={loading || notifyLater}
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>

          {paymentMethod === 'electronic' && !notifyLater && (
            <>
              <AccountSelector
                value={bankAccountId}
                onChange={setBankAccountId}
                disabled={loading}
              />
              <PaymentProofUpload
                file={proofFile}
                onChange={setProofFile}
                disabled={loading}
                required
              />
            </>
          )}

          <label className="flex items-center gap-2 cursor-pointer text-sm">
            <input
              type="checkbox"
              checked={notifyLater}
              onChange={(e) => setNotifyLater(e.target.checked)}
              disabled={loading}
              className="rounded border-input"
            />
            <span>إشعار لاحقاً (إنشاء مهمة معلقة بدل الدفع الفوري)</span>
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            إلغاء
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading
              ? 'جارٍ التنفيذ…'
              : notifyLater
                ? 'إنشاء إشعار'
                : 'تأكيد التجديد'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
