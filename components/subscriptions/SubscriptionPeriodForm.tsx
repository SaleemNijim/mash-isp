'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { PostgrestError } from '@supabase/supabase-js'
import { toast } from 'sonner'
import { ArrowRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useTenant } from '@/hooks/useTenant'
import { MacAddressField } from '@/components/subscriptions/MacAddressField'
import { BbCredentialField } from '@/components/subscriptions/BbCredentialField'
import {
  isRpcMissingError,
  resolveBbCredentialId,
  RPC_MIGRATION_HINT,
  type BbCredentialInputMode,
} from '@/lib/subscriptions/resolve-bb-credential'
import { PaymentMethodPicker } from '@/components/payments/PaymentMethodPicker'
import { PaymentDetailsSection } from '@/components/payments/PaymentDetailsSection'
import {
  uploadPaymentProof,
  attachProofToPayment,
  fetchLatestSubscriptionPayment,
} from '@/lib/payment-proof'
import { enqueueOp } from '@/lib/sync/engine'
import { formatMoney } from '@/lib/format-money'
import {
  isBankPayment,
  parsePaymentMethodValue,
  toDbPaymentMethod,
  validatePaymentForm,
  type PaymentMethodValue,
} from '@/lib/payments/payment-selection'
import { PageHeader } from '@/components/shared/PageHeader'
import { DataPanel } from '@/components/shared/DataPanel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface CustomerOption {
  id: string
  name: string
  phone: string | null
}

interface SubscriptionRecord {
  id: string
  customer_id: string
  type: 'bb' | 'we'
  speed: string | null
  price: number | null
  end_date: string | null
  customers: { name: string; phone: string | null } | null
}

type PaymentMethod = PaymentMethodValue

export type SubscriptionPeriodFormProps =
  | { mode: 'create'; preselectedCustomerId?: string | null }
  | { mode: 'renew'; subscriptionId: string }

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

function addMonthISO(from: string): string {
  const d = new Date(from)
  d.setMonth(d.getMonth() + 1)
  return d.toISOString().slice(0, 10)
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('ar-EG', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function FormSection({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="space-y-4">
      <h2 className="text-sm font-semibold text-foreground border-b border-border pb-2">
        {title}
      </h2>
      {children}
    </section>
  )
}

export function SubscriptionPeriodForm(props: SubscriptionPeriodFormProps) {
  const isCreate = props.mode === 'create'
  const isRenew = props.mode === 'renew'
  const router = useRouter()
  const queryClient = useQueryClient()
  const { data: tenant } = useTenant()
  const supabase = createClient()

  const [customerId, setCustomerId] = useState(
    isCreate ? (props.preselectedCustomerId ?? '') : '',
  )
  const [credentialId, setCredentialId] = useState<string | null>(null)
  const [credentialMode, setCredentialMode] = useState<BbCredentialInputMode>('inventory')
  const [manualUsername, setManualUsername] = useState('')
  const [manualPassword, setManualPassword] = useState('')
  const [speed, setSpeed] = useState('')
  const [price, setPrice] = useState('')
  const [macAddress, setMacAddress] = useState('')
  const [startDate, setStartDate] = useState(todayISO())
  const [endDate, setEndDate] = useState(addMonthISO(todayISO()))
  const [amountDue, setAmountDue] = useState('')
  const [cashAmount, setCashAmount] = useState('0')
  const [appAmount, setAppAmount] = useState('0')
  const [discountAmount, setDiscountAmount] = useState('0')
  const [balanceRemaining, setBalanceRemaining] = useState('0')
  const [paidAt, setPaidAt] = useState('')
  const [notes, setNotes] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [sourceAccountLabel, setSourceAccountLabel] = useState('')
  const [attachProof, setAttachProof] = useState(false)
  const [bankAccountId, setBankAccountId] = useState<string | null>(null)
  const [proofFile, setProofFile] = useState<File | null>(null)
  const [notifyLater, setNotifyLater] = useState(false)
  const [loading, setLoading] = useState(false)
  const [renewInitialized, setRenewInitialized] = useState(false)

  const { data: subscription, isLoading: subscriptionLoading } = useQuery<SubscriptionRecord>({
    queryKey: ['subscription-renew-form', props.mode === 'renew' ? props.subscriptionId : null],
    queryFn: async () => {
      if (props.mode !== 'renew') throw new Error('invalid')
      const { data, error } = await supabase
        .from('subscriptions')
        .select('id, customer_id, type, speed, price, end_date, customers(name, phone)')
        .eq('id', props.subscriptionId)
        .eq('is_deleted', false)
        .maybeSingle()
      if (error) throw error
      if (!data) throw new Error('not_found')
      const raw = data.customers as
        | { name: string; phone: string | null }
        | { name: string; phone: string | null }[]
        | null
      const customers = Array.isArray(raw) ? raw[0] ?? null : raw
      return { ...data, customers } as SubscriptionRecord
    },
    enabled: isRenew && !!props.subscriptionId,
  })

  useEffect(() => {
    if (isCreate && props.preselectedCustomerId) {
      setCustomerId(props.preselectedCustomerId)
    }
  }, [isCreate, isCreate ? props.preselectedCustomerId : null])

  useEffect(() => {
    if (isCreate && price.trim()) setAmountDue(price)
  }, [isCreate, price])

  useEffect(() => {
    if (!isRenew || !subscription || renewInitialized) return
    const defaultAmount = subscription.price ?? 0
    setCustomerId(subscription.customer_id)
    setSpeed(subscription.speed ?? '')
    setPrice(String(defaultAmount))
    setAmountDue(String(defaultAmount))
    setCashAmount(String(defaultAmount))
    setAppAmount('0')
    setDiscountAmount('0')
    setBalanceRemaining('0')
    setRenewInitialized(true)
  }, [isRenew, subscription, renewInitialized])

  useEffect(() => {
    if (!isRenew || notifyLater) return
    const due = Number(amountDue) || 0
    if (paymentMethod === 'cash') {
      setCashAmount(String(due))
      setAppAmount('0')
      setBalanceRemaining('0')
    } else if (paymentMethod === 'debt') {
      setCashAmount('0')
      setAppAmount('0')
      setBalanceRemaining(String(due))
    } else if (isBankPayment(paymentMethod)) {
      setCashAmount('0')
      setAppAmount(String(due))
      setBalanceRemaining('0')
      const parsed = parsePaymentMethodValue(paymentMethod)
      setBankAccountId(parsed.bankAccountId)
    }
  }, [isRenew, paymentMethod, amountDue, notifyLater])

  const { data: customers = [] } = useQuery<CustomerOption[]>({
    queryKey: ['customers-select', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return []
      const { data, error } = await supabase
        .from('customers')
        .select('id, name, phone')
        .eq('tenant_id', tenant.id)
        .eq('is_deleted', false)
        .order('name')
        .limit(500)
      if (error) throw error
      return data ?? []
    },
    enabled: isCreate && !!tenant?.id,
  })

  const customerName =
    isRenew
      ? subscription?.customers?.name
      : customers.find((c) => c.id === customerId)?.name

  const customerPhone =
    isRenew
      ? subscription?.customers?.phone
      : customers.find((c) => c.id === customerId)?.phone

  const cancelHref = isRenew
    ? `/subscriptions/customer/${subscription?.customer_id ?? customerId}`
    : '/customers'

  async function invalidateCaches() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['bb-credentials-with-passwords'] }),
      queryClient.invalidateQueries({ queryKey: ['internet_credentials'] }),
      queryClient.invalidateQueries({ queryKey: ['subscriptions'] }),
      queryClient.invalidateQueries({ queryKey: ['subscription-periods'] }),
      queryClient.invalidateQueries({ queryKey: ['debts'] }),
      queryClient.invalidateQueries({ queryKey: ['hub-subscriptions'] }),
      queryClient.invalidateQueries({ queryKey: ['hub-debts'] }),
      queryClient.invalidateQueries({ queryKey: ['customers'] }),
    ])
  }

  async function resolveCredentialForSubmit(targetCustomerId: string): Promise<string> {
    try {
      return await resolveBbCredentialId(supabase, {
        mode: credentialMode,
        credentialId,
        manualUsername,
        manualPassword,
        customerId: targetCustomerId,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      if (isRpcMissingError(msg)) {
        throw new Error(RPC_MIGRATION_HINT)
      }
      throw err
    }
  }

  async function handleCreate() {
    if (!tenant?.id) return
    if (!customerId) {
      toast.error('اختر المشترك')
      return
    }
    if (!startDate || !endDate) {
      toast.error('تواريخ البداية والنهاية مطلوبة')
      return
    }

    const priceNum = price.trim() ? Number(price) : null
    if (price.trim() && (!Number.isFinite(priceNum) || priceNum! < 0)) {
      toast.error('السعر غير صالح')
      return
    }

    setLoading(true)
    try {
      const resolvedCredentialId = await resolveCredentialForSubmit(customerId)

      const { error } = await supabase.rpc('create_subscription_with_period', {
        p_customer_id: customerId,
        p_speed: speed.trim() || null,
        p_price: priceNum,
        p_start_date: startDate,
        p_end_date: endDate,
        p_mac_address: macAddress.trim() || null,
        p_notes: notes.trim() || null,
        p_amount_due: amountDue.trim() ? Number(amountDue) : priceNum,
        p_cash_amount: Number(cashAmount) || 0,
        p_app_amount: Number(appAmount) || 0,
        p_discount_amount: Number(discountAmount) || 0,
        p_balance_remaining: Number(balanceRemaining) || 0,
        p_paid_at: paidAt.trim() ? new Date(paidAt).toISOString() : null,
        p_credential_id: resolvedCredentialId,
      })
      if (error) throw error

      await invalidateCaches()
      toast.success('تم إنشاء الاشتراك وحجز username')
      router.push('/customers')
    } catch (err) {
      handleRpcError(err, 'فشل إنشاء الاشتراك')
    } finally {
      setLoading(false)
    }
  }

  async function handleRenew() {
    if (!subscription || !tenant) return

    if (subscription.type === 'we') {
      toast.error('التجديد متاح لاشتراكات PPP (BB) فقط')
      return
    }

    const due = Number(amountDue)
    if (!Number.isFinite(due) || due < 0) {
      toast.error('المبلغ المستحق غير صالح')
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
      let resolvedCredentialId: string | null = null
      if (!notifyLater) {
        resolvedCredentialId = await resolveCredentialForSubmit(subscription.customer_id)
      }

      if (notifyLater) {
        if (!navigator.onLine) {
          toast.error('إشعار لاحقاً يتطلب اتصالاً بالإنترنت')
          return
        }

        const { error } = await supabase.rpc('record_unpaid_subscription_period', {
          p_subscription_id: subscription.id,
          p_mac_address: macAddress.trim() || null,
          p_amount_due: due,
          p_notes: notes.trim() || null,
        })
        if (error) throw error

        await invalidateCaches()
        toast.success('تم تسجيل الدورة بدون دفع')
        router.push(cancelHref)
        return
      }

      const parsed = parsePaymentMethodValue(paymentMethod)
      const validationError = validatePaymentForm({
        method: paymentMethod,
        sourceAccountLabel,
        attachProof,
        proofFile,
        requireSourceForBank: isBankPayment(paymentMethod),
      })
      if (isBankPayment(paymentMethod) && validationError) {
        toast.error(validationError)
        return
      }

      const method = toDbPaymentMethod(paymentMethod)
      const paidTotal = due - (Number(discountAmount) || 0)

      const rpcParams = {
        p_subscription_id: subscription.id,
        p_credential_id: resolvedCredentialId!,
        p_amount: paidTotal,
        p_method: method,
        p_bank_account_id: parsed.bankAccountId,
        p_nonce: crypto.randomUUID(),
        p_mac_address: macAddress.trim() || null,
        p_cash_amount: Number(cashAmount) || 0,
        p_app_amount: Number(appAmount) || 0,
        p_discount_amount: Number(discountAmount) || 0,
        p_balance_remaining: Number(balanceRemaining) || 0,
        p_notes: notes.trim() || null,
        p_source_account_label: sourceAccountLabel.trim() || null,
      }

      if (!navigator.onLine) {
        await enqueueOp('renew_subscription', {
          subscription_id: subscription.id,
          credential_id: rpcParams.p_credential_id,
          amount: paidTotal,
          method,
          bank_account_id: rpcParams.p_bank_account_id,
          mac_address: rpcParams.p_mac_address,
          cash_amount: rpcParams.p_cash_amount,
          app_amount: rpcParams.p_app_amount,
          discount_amount: rpcParams.p_discount_amount,
          balance_remaining: rpcParams.p_balance_remaining,
          notes: rpcParams.p_notes,
        })
        toast.success('تم حفظ التجديد — سيُزامَن عند عودة الاتصال')
        router.push(cancelHref)
        return
      }

      const { error } = await supabase.rpc('renew_subscription', rpcParams)
      if (error) throw error

      if (attachProof && proofFile && isBankPayment(paymentMethod)) {
        const {
          data: { user },
        } = await supabase.auth.getUser()
        const paymentId = await fetchLatestSubscriptionPayment(supabase, subscription.id)
        if (paymentId && user) {
          const proofUrl = await uploadPaymentProof(
            supabase,
            tenant.id,
            `renewal/${subscription.id}`,
            proofFile,
          )
          await attachProofToPayment(supabase, tenant.id, paymentId, proofUrl, user.id)
        }
      }

      await invalidateCaches()
      toast.success('تم تجديد الاشتراك بنجاح')
      router.push(cancelHref)
    } catch {
      toast.error('فشلت عملية التجديد')
    } finally {
      setLoading(false)
    }
  }

  function handleRpcError(err: unknown, fallback: string) {
    const msg =
      err instanceof Error
        ? err.message
        : ((err as PostgrestError).message ?? '')
    if (isRpcMissingError(msg)) {
      toast.error(RPC_MIGRATION_HINT)
    } else {
      toast.error(msg || fallback)
    }
  }

  function handleSubmit() {
    if (isCreate) void handleCreate()
    else void handleRenew()
  }

  if (isRenew && subscriptionLoading) {
    return (
      <div dir="rtl" className="py-16 text-center text-muted-foreground">
        جارٍ التحميل…
      </div>
    )
  }

  if (isRenew && !subscription) {
    return (
      <div dir="rtl" className="py-16 text-center space-y-4">
        <p className="text-muted-foreground">الاشتراك غير موجود</p>
        <Button variant="outline" asChild>
          <Link href="/customers">العودة للمشتركين</Link>
        </Button>
      </div>
    )
  }

  const paymentDisabled = loading || (isRenew && notifyLater)
  const paymentSectionTitle = isCreate
    ? 'تفاصيل الدفع (الدورة الأولى)'
    : 'تفاصيل الدفع'

  return (
    <div dir="rtl" className="w-full min-h-[calc(100vh-8rem)] flex flex-col gap-6">
      <PageHeader
        title={isCreate ? 'اشتراك PPP جديد' : 'تجديد اشتراك PPP'}
        description={
          isCreate
            ? 'تسجيل اشتراك جديد — إن لم يُدفع يُسجَّل تلقائياً في سجل الدائنين'
            : customerName
              ? `المشترك: ${customerName}${customerPhone ? ` — ${customerPhone}` : ''}`
              : undefined
        }
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href={cancelHref} className="gap-1.5">
              <ArrowRight size={14} />
              {isCreate ? 'العودة للمشتركين' : 'العودة للسجل'}
            </Link>
          </Button>
        }
      />

      <DataPanel className="flex-1">
        <div className="p-6 lg:p-8 space-y-8">
          <FormSection title="بيانات الاشتراك">
            {isCreate ? (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div className="space-y-1.5 md:col-span-2 xl:col-span-4">
                  <Label>المشترك *</Label>
                  <Select value={customerId} onValueChange={setCustomerId} disabled={loading}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="اختر مشتركاً" />
                    </SelectTrigger>
                    <SelectContent>
                      {customers.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                          {c.phone ? ` — ${c.phone}` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Field label="السرعة" id="subSpeed">
                  <Input
                    id="subSpeed"
                    value={speed}
                    onChange={(e) => setSpeed(e.target.value)}
                    placeholder="4M"
                    disabled={loading}
                  />
                </Field>

                <Field label="سعر الاشتراك (ش)" id="subPrice">
                  <Input
                    id="subPrice"
                    type="number"
                    min={0}
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder="70"
                    disabled={loading}
                    dir="ltr"
                    className="text-right tabular-nums"
                  />
                </Field>

                <Field label="تاريخ بداية الاشتراك" id="subStart">
                  <Input
                    id="subStart"
                    type="date"
                    value={startDate}
                    onChange={(e) => {
                      setStartDate(e.target.value)
                      setEndDate(addMonthISO(e.target.value))
                    }}
                    disabled={loading}
                    dir="ltr"
                    className="text-right"
                  />
                </Field>

                <Field label="تاريخ الانتهاء" id="subEnd">
                  <Input
                    id="subEnd"
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    disabled={loading}
                    dir="ltr"
                    className="text-right"
                  />
                </Field>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <ReadOnlyField label="المشترك" value={customerName ?? '—'} />
                <ReadOnlyField label="السرعة" value={subscription?.speed ?? '—'} />
                <ReadOnlyField
                  label="السعر"
                  value={formatMoney(subscription?.price)}
                />
                <ReadOnlyField
                  label="ينتهي حالياً"
                  value={formatDate(subscription?.end_date ?? null)}
                />
                <ReadOnlyField
                  label="بعد التجديد"
                  value={formatDate(
                    subscription?.end_date ? addMonthISO(subscription.end_date) : null,
                  )}
                />
              </div>
            )}
          </FormSection>

          {!(isRenew && notifyLater) && (
            <FormSection title="بيانات الدخول">
              <BbCredentialField
                mode={credentialMode}
                onModeChange={setCredentialMode}
                credentialId={credentialId}
                onCredentialChange={setCredentialId}
                manualUsername={manualUsername}
                manualPassword={manualPassword}
                onManualUsernameChange={setManualUsername}
                onManualPasswordChange={setManualPassword}
                disabled={loading}
              />
            </FormSection>
          )}

          <FormSection title="MAC وملاحظات">
            <div className="grid gap-4 lg:grid-cols-2 items-stretch">
              <MacAddressField
                value={macAddress}
                onChange={setMacAddress}
                customerId={customerId || undefined}
                disabled={loading}
              />
              <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3 h-full flex flex-col">
                <Label className="text-sm font-semibold">ملاحظات</Label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  disabled={loading}
                  rows={4}
                  className="flex min-h-[88px] w-full flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
                  placeholder="اختياري"
                />
              </div>
            </div>
          </FormSection>

          <FormSection title={paymentSectionTitle}>
            <div className="rounded-lg border border-border bg-muted/20 p-4 lg:p-5 space-y-5">
              <div className="grid gap-4 grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
                <NumField
                  label="المستحق"
                  value={amountDue}
                  onChange={setAmountDue}
                  disabled={paymentDisabled}
                />
                <NumField
                  label="نقداً"
                  value={cashAmount}
                  onChange={setCashAmount}
                  disabled={paymentDisabled}
                />
                <NumField
                  label="تطبيق"
                  value={appAmount}
                  onChange={setAppAmount}
                  disabled={paymentDisabled}
                />
                <NumField
                  label="خصم"
                  value={discountAmount}
                  onChange={setDiscountAmount}
                  disabled={paymentDisabled}
                />
                <NumField
                  label="الباقي"
                  value={balanceRemaining}
                  onChange={setBalanceRemaining}
                  disabled={paymentDisabled}
                />
                {isCreate ? (
                  <div className="space-y-1.5 col-span-2 md:col-span-1">
                    <Label>تاريخ الدفع</Label>
                    <Input
                      type="datetime-local"
                      value={paidAt}
                      onChange={(e) => setPaidAt(e.target.value)}
                      disabled={loading}
                      dir="ltr"
                      className="text-right bg-background"
                    />
                    <p className="text-xs text-muted-foreground">
                      الباقي يُسجَّل تلقائياً في سجل الديون
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4 col-span-2 md:col-span-3 xl:col-span-6">
                    <PaymentMethodPicker
                      value={paymentMethod}
                      onChange={(v) => {
                        setPaymentMethod(v)
                        if (!isBankPayment(v)) {
                          setSourceAccountLabel('')
                          setAttachProof(false)
                          setProofFile(null)
                          setBankAccountId(null)
                        }
                      }}
                      disabled={paymentDisabled}
                    />
                  </div>
                )}
              </div>

              {isRenew && !notifyLater && isBankPayment(paymentMethod) && (
                <PaymentDetailsSection
                  method={paymentMethod}
                  sourceAccountLabel={sourceAccountLabel}
                  onSourceAccountLabelChange={setSourceAccountLabel}
                  attachProof={attachProof}
                  onAttachProofChange={setAttachProof}
                  proofFile={proofFile}
                  onProofFileChange={setProofFile}
                  disabled={loading}
                />
              )}

              {isCreate && Number(appAmount) > 0 && (
                <div className="space-y-4">
                  <PaymentMethodPicker
                    value={
                      bankAccountId
                        ? (`bank:${bankAccountId}` as PaymentMethodValue)
                        : ('cash' as PaymentMethodValue)
                    }
                    onChange={(v) => {
                      if (isBankPayment(v)) {
                        setBankAccountId(parsePaymentMethodValue(v).bankAccountId)
                      } else {
                        setBankAccountId(null)
                      }
                    }}
                    allowDebt={false}
                    disabled={paymentDisabled}
                    label="حساب الشركة المستلم (للمبلغ عبر التطبيق)"
                  />
                  {bankAccountId && (
                    <PaymentDetailsSection
                      method={`bank:${bankAccountId}` as PaymentMethodValue}
                      sourceAccountLabel={sourceAccountLabel}
                      onSourceAccountLabelChange={setSourceAccountLabel}
                      attachProof={attachProof}
                      onAttachProofChange={setAttachProof}
                      proofFile={proofFile}
                      onProofFileChange={setProofFile}
                      disabled={loading}
                    />
                  )}
                </div>
              )}

              {!isCreate && (
                <label className="flex items-center gap-2 cursor-pointer text-sm">
                  <input
                    type="checkbox"
                    checked={notifyLater}
                    onChange={(e) => setNotifyLater(e.target.checked)}
                    disabled={loading}
                    className="rounded border-input"
                  />
                  <span>إشعار لاحقاً (سجل بدون دفع + مهمة معلقة)</span>
                </label>
              )}
            </div>
          </FormSection>

          <div className="flex flex-wrap gap-3 pt-4 border-t border-border">
            <Button size="lg" onClick={() => void handleSubmit()} disabled={loading}>
              {loading
                ? 'جارٍ التنفيذ…'
                : isCreate
                  ? 'إنشاء اشتراك'
                  : notifyLater
                    ? 'تسجيل بدون دفع'
                    : 'تأكيد التجديد'}
            </Button>
            <Button variant="outline" size="lg" asChild disabled={loading}>
              <Link href={cancelHref}>إلغاء</Link>
            </Button>
          </div>
        </div>
      </DataPanel>
    </div>
  )
}

function Field({
  label,
  id,
  children,
}: {
  label: string
  id: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  )
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="rounded-md border border-input bg-muted/30 px-3 py-2 text-sm min-h-10 flex items-center">
        {value}
      </div>
    </div>
  )
}

function NumField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  disabled?: boolean
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input
        type="number"
        min={0}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        dir="ltr"
        className="text-right tabular-nums bg-background"
      />
    </div>
  )
}
