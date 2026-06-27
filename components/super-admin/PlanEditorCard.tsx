'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  GripVertical,
  Plus,
  Trash2,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Plan } from '@/components/public/PricingCards'
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export interface SubscriptionPlanRow {
  id: string
  slug: string
  name: string
  billing_cycle: string
  price_monthly: number | null
  price_annual: number | null
  discount_percent: number | null
  trial_days: number | null
  features: unknown
  is_active: boolean
  is_coming_soon: boolean
  promotional_message: string | null
  sort_order: number
  updated_at?: string
}

function parseFeatures(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw.filter((f): f is string => typeof f === 'string')
}

function planFeatures(raw: unknown): string[] {
  return parseFeatures(raw)
}

function FeatureList({ features }: { features: string[] }) {
  if (!features.length) return null
  return (
    <ul className="space-y-2 text-sm text-muted-foreground">
      {features.map((f) => (
        <li key={f} className="flex items-center gap-2">
          <CheckCircle2 size={15} className="text-green-500 shrink-0" />
          <span>{f}</span>
        </li>
      ))}
    </ul>
  )
}

/** معاينة PlanCard — نفس تنسيق components/public/PricingCards.tsx */
function PlanCardPreview({ plan }: { plan: Plan }) {
  const features = planFeatures(plan.features)
  const isHighlighted = plan.billing_cycle === 'annual'
  const price =
    plan.billing_cycle === 'monthly' ? plan.price_monthly : plan.price_annual
  const period = plan.billing_cycle === 'monthly' ? 'شهر' : 'سنة'
  const hasDiscount =
    plan.discount_percent != null && plan.discount_percent > 0

  return (
    <div
      className={`relative rounded-2xl p-8 flex flex-col gap-5 shadow-sm ${
        isHighlighted
          ? 'border-2 border-primary bg-primary-50'
          : 'border border-border bg-card'
      }`}
      dir="rtl"
    >
      {isHighlighted && (
        <div className="absolute -top-4 inset-x-0 flex justify-center">
          <span className="bg-primary text-primary-foreground text-xs font-bold px-4 py-1.5 rounded-full shadow-sm">
            الأفضل قيمة
          </span>
        </div>
      )}

      <div>
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="text-lg font-bold text-foreground">{plan.name}</h3>
          {hasDiscount && (
            <span className="bg-mash-success-bg text-mash-success-text text-xs font-bold px-2.5 py-0.5 rounded-full">
              وفِّر {plan.discount_percent}%
            </span>
          )}
        </div>

        <div className="mt-3 flex items-end gap-1">
          <span
            className={`text-4xl font-extrabold ${
              isHighlighted ? 'text-primary-600' : 'text-foreground'
            }`}
          >
            {price} ₪
          </span>
          <span className="text-muted-foreground text-sm mb-1.5">/{period}</span>
        </div>
      </div>

      <FeatureList features={features} />
    </div>
  )
}

type PriceConfirmState =
  | {
      kind: 'price_monthly' | 'price_annual'
      value: string
    }
  | {
      kind: 'enterprise_activate'
      value: string
      billingCycle: 'monthly' | 'annual'
    }
  | null

interface PlanEditorCardProps {
  plan: SubscriptionPlanRow
  onUpdated: () => void
}

export function PlanEditorCard({ plan, onUpdated }: PlanEditorCardProps) {
  const supabase = createClient()

  const [trialDays, setTrialDays] = useState('')
  const [priceMonthly, setPriceMonthly] = useState('')
  const [priceAnnual, setPriceAnnual] = useState('')
  const [promotionalMessage, setPromotionalMessage] = useState('')
  const [features, setFeatures] = useState<string[]>([])
  const [newFeature, setNewFeature] = useState('')
  const [isActive, setIsActive] = useState(plan.is_active)
  const [discountPercent, setDiscountPercent] = useState<number | null>(
    plan.discount_percent,
  )

  const [savingTrial, setSavingTrial] = useState(false)
  const [savingFeatures, setSavingFeatures] = useState(false)
  const [savingPromo, setSavingPromo] = useState(false)
  const [togglingActive, setTogglingActive] = useState(false)
  const [enterprisePrice, setEnterprisePrice] = useState('')
  const [enterpriseBillingCycle, setEnterpriseBillingCycle] = useState<
    'monthly' | 'annual'
  >('monthly')

  const [priceConfirm, setPriceConfirm] = useState<PriceConfirmState>(null)
  const [confirmingPrice, setConfirmingPrice] = useState(false)

  useEffect(() => {
    setTrialDays(plan.trial_days != null ? String(plan.trial_days) : '')
    setPriceMonthly(
      plan.price_monthly != null ? String(plan.price_monthly) : '',
    )
    setPriceAnnual(plan.price_annual != null ? String(plan.price_annual) : '')
    setPromotionalMessage(plan.promotional_message ?? '')
    setFeatures(parseFeatures(plan.features))
    setIsActive(plan.is_active)
    setDiscountPercent(plan.discount_percent)
  }, [plan])

  function toPreviewPlan(overrides: Partial<Plan>): Plan {
    return {
      id: plan.id,
      slug: plan.slug,
      name: plan.name,
      billing_cycle: overrides.billing_cycle ?? plan.billing_cycle,
      price_monthly:
        overrides.price_monthly !== undefined
          ? overrides.price_monthly
          : plan.price_monthly,
      price_annual:
        overrides.price_annual !== undefined
          ? overrides.price_annual
          : plan.price_annual,
      discount_percent:
        overrides.discount_percent !== undefined
          ? overrides.discount_percent
          : plan.discount_percent,
      trial_days:
        overrides.trial_days !== undefined
          ? overrides.trial_days
          : plan.trial_days,
      features: overrides.features ?? features,
      is_active: plan.is_active,
      is_coming_soon: plan.is_coming_soon,
      promotional_message: plan.promotional_message,
      sort_order: plan.sort_order,
    }
  }

  function renderPricePreview() {
    if (!priceConfirm) return null

    if (priceConfirm.kind === 'enterprise_activate') {
      const price = parseFloat(priceConfirm.value)
      const preview = toPreviewPlan({
        billing_cycle: priceConfirm.billingCycle,
        is_coming_soon: false,
        price_monthly:
          priceConfirm.billingCycle === 'monthly' ? price : plan.price_monthly,
        price_annual:
          priceConfirm.billingCycle === 'annual' ? price : plan.price_annual,
        discount_percent: null,
      })
      return <PlanCardPreview plan={preview} />
    }

    if (plan.slug === 'pro_monthly' && priceConfirm.kind === 'price_monthly') {
      const price = parseFloat(priceConfirm.value)
      return (
        <PlanCardPreview
          plan={toPreviewPlan({
            billing_cycle: 'monthly',
            price_monthly: price,
            discount_percent: null,
          })}
        />
      )
    }

    if (plan.slug === 'pro_annual' && priceConfirm.kind === 'price_annual') {
      const price = parseFloat(priceConfirm.value)
      return (
        <PlanCardPreview
          plan={toPreviewPlan({
            billing_cycle: 'annual',
            price_annual: price,
            discount_percent: null,
          })}
        />
      )
    }

    return null
  }

  async function handleConfirmPriceSave() {
    if (!priceConfirm) return
    setConfirmingPrice(true)

    try {
      if (priceConfirm.kind === 'price_monthly') {
        const value = parseFloat(priceConfirm.value)
        if (Number.isNaN(value) || value < 0) {
          toast.error('أدخل سعراً صالحاً')
          return
        }
        const { error } = await supabase
          .from('subscription_plans')
          .update({ price_monthly: value })
          .eq('slug', 'pro_monthly')
        if (error) throw error

        // مزامنة price_monthly في صف pro_annual حتى تُحسب نسبة التوفير
        // (Generated Column) بناءً على السعر الشهري الفعلي لا قيمة قديمة.
        const { error: syncError } = await supabase
          .from('subscription_plans')
          .update({ price_monthly: value })
          .eq('slug', 'pro_annual')
        if (syncError) throw syncError

        toast.success('تم تحديث السعر الشهري')
      } else if (priceConfirm.kind === 'price_annual') {
        const value = parseFloat(priceConfirm.value)
        if (Number.isNaN(value) || value < 0) {
          toast.error('أدخل سعراً صالحاً')
          return
        }

        // اقرأ السعر الشهري الحالي من صف pro_monthly واكتبه في صف pro_annual
        // ليكون أساس حساب نسبة التوفير صحيحاً في قاعدة البيانات.
        const { data: monthlyRow } = await supabase
          .from('subscription_plans')
          .select('price_monthly')
          .eq('slug', 'pro_monthly')
          .single()

        const updatePayload: Record<string, unknown> = { price_annual: value }
        if (monthlyRow?.price_monthly != null) {
          updatePayload.price_monthly = monthlyRow.price_monthly
        }

        const { data, error } = await supabase
          .from('subscription_plans')
          .update(updatePayload)
          .eq('slug', 'pro_annual')
          .select('*')
          .single()
        if (error) throw error
        setDiscountPercent(data.discount_percent)
        toast.success('تم تحديث السعر السنوي')
      } else if (priceConfirm.kind === 'enterprise_activate') {
        const value = parseFloat(priceConfirm.value)
        if (Number.isNaN(value) || value < 0) {
          toast.error('أدخل سعراً صالحاً')
          return
        }
        const payload: Record<string, unknown> = {
          is_coming_soon: false,
          is_active: true,
          billing_cycle: priceConfirm.billingCycle,
        }
        if (priceConfirm.billingCycle === 'monthly') {
          payload.price_monthly = value
        } else {
          payload.price_annual = value
        }
        const { error } = await supabase
          .from('subscription_plans')
          .update(payload)
          .eq('slug', 'enterprise')
        if (error) throw error
        toast.success('تم تفعيل Enterprise')
        setEnterprisePrice('')
      }

      setPriceConfirm(null)
      onUpdated()
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'فشل حفظ التغيير',
      )
    } finally {
      setConfirmingPrice(false)
    }
  }

  async function handleSaveTrialDays() {
    const value = parseInt(trialDays, 10)
    if (Number.isNaN(value) || value < 1) {
      toast.error('أدخل عدد أيام صالحاً')
      return
    }
    setSavingTrial(true)
    try {
      const { error } = await supabase
        .from('subscription_plans')
        .update({ trial_days: value })
        .eq('slug', 'free_trial')
      if (error) throw error
      toast.success('تم تحديث مدة التجربة')
      onUpdated()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'فشل الحفظ')
    } finally {
      setSavingTrial(false)
    }
  }

  async function handleSaveFeatures() {
    setSavingFeatures(true)
    try {
      const { error } = await supabase
        .from('subscription_plans')
        .update({ features })
        .eq('id', plan.id)
      if (error) throw error
      toast.success('تم حفظ المميزات')
      onUpdated()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'فشل الحفظ')
    } finally {
      setSavingFeatures(false)
    }
  }

  async function handleSavePromotionalMessage() {
    setSavingPromo(true)
    try {
      const { error } = await supabase
        .from('subscription_plans')
        .update({ promotional_message: promotionalMessage || null })
        .eq('slug', 'enterprise')
      if (error) throw error
      toast.success('تم حفظ الرسالة الترويجية')
      onUpdated()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'فشل الحفظ')
    } finally {
      setSavingPromo(false)
    }
  }

  async function handleToggleActive(checked: boolean) {
    setTogglingActive(true)
    try {
      const { error } = await supabase
        .from('subscription_plans')
        .update({ is_active: checked })
        .eq('id', plan.id)
      if (error) throw error
      setIsActive(checked)
      toast.success(checked ? 'تم تفعيل الخطة' : 'تم تعطيل الخطة')
      onUpdated()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'فشل التحديث')
    } finally {
      setTogglingActive(false)
    }
  }

  function addFeature() {
    const trimmed = newFeature.trim()
    if (!trimmed || features.includes(trimmed)) return
    setFeatures([...features, trimmed])
    setNewFeature('')
  }

  function removeFeature(index: number) {
    setFeatures(features.filter((_, i) => i !== index))
  }

  function moveFeature(index: number, direction: -1 | 1) {
    const next = index + direction
    if (next < 0 || next >= features.length) return
    const copy = [...features]
    ;[copy[index], copy[next]] = [copy[next], copy[index]]
    setFeatures(copy)
  }

  function requestPriceSave(kind: 'price_monthly' | 'price_annual') {
    const value = kind === 'price_monthly' ? priceMonthly : priceAnnual
    if (!value.trim()) {
      toast.error('أدخل السعر')
      return
    }
    setPriceConfirm({ kind, value })
  }

  function requestEnterpriseActivate() {
    if (!enterprisePrice.trim()) {
      toast.error('أدخل السعر')
      return
    }
    setPriceConfirm({
      kind: 'enterprise_activate',
      value: enterprisePrice,
      billingCycle: enterpriseBillingCycle,
    })
  }

  return (
    <>
      <div className="rounded-xl border bg-card p-6 flex flex-col gap-5" dir="rtl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">{plan.name}</h2>
            <p className="text-sm text-muted-foreground">{plan.slug}</p>
          </div>
          <div className="flex flex-wrap gap-2 justify-end">
            {plan.is_coming_soon && (
              <Badge variant="secondary">Coming Soon</Badge>
            )}
            <Badge variant={isActive ? 'default' : 'outline'}>
              {isActive ? 'نشطة' : 'معطّلة'}
            </Badge>
          </div>
        </div>

        {/* ⑥ Toggle is_active */}
        <div className="flex items-center justify-between rounded-lg border px-4 py-3">
          <Label htmlFor={`active-${plan.id}`} className="cursor-pointer">
            تفعيل الخطة في صفحة الأسعار
          </Label>
          <button
            id={`active-${plan.id}`}
            type="button"
            role="switch"
            aria-checked={isActive}
            disabled={togglingActive}
            onClick={() => void handleToggleActive(!isActive)}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 ${
              isActive ? 'bg-primary' : 'bg-input'
            }`}
          >
            <span
              className={`pointer-events-none block size-5 rounded-full bg-background shadow-lg ring-0 transition-transform ${
                isActive ? '-translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* ③ trial_days — free_trial */}
        {plan.slug === 'free_trial' && (
          <div className="space-y-2">
            <Label htmlFor={`trial-${plan.id}`}>مدة التجربة (يوم)</Label>
            <div className="flex gap-2">
              <Input
                id={`trial-${plan.id}`}
                type="number"
                min={1}
                value={trialDays}
                onChange={(e) => setTrialDays(e.target.value)}
                placeholder=""
              />
              <Button
                disabled={savingTrial}
                onClick={() => void handleSaveTrialDays()}
              >
                {savingTrial ? 'جاري...' : 'حفظ'}
              </Button>
            </div>
          </div>
        )}

        {/* ① price_monthly — pro_monthly */}
        {plan.slug === 'pro_monthly' && (
          <div className="space-y-2">
            <Label htmlFor={`monthly-${plan.id}`}>السعر الشهري (₪)</Label>
            <div className="flex gap-2">
              <Input
                id={`monthly-${plan.id}`}
                type="number"
                min={0}
                step="0.01"
                value={priceMonthly}
                onChange={(e) => setPriceMonthly(e.target.value)}
                placeholder=""
              />
              <Button onClick={() => requestPriceSave('price_monthly')}>
                حفظ السعر
              </Button>
            </div>
          </div>
        )}

        {/* ② price_annual — pro_annual + discount_percent من DB */}
        {plan.slug === 'pro_annual' && (
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor={`annual-${plan.id}`}>السعر السنوي (₪)</Label>
              <div className="flex gap-2">
                <Input
                  id={`annual-${plan.id}`}
                  type="number"
                  min={0}
                  step="0.01"
                  value={priceAnnual}
                  onChange={(e) => setPriceAnnual(e.target.value)}
                  placeholder=""
                />
                <Button onClick={() => requestPriceSave('price_annual')}>
                  حفظ السعر
                </Button>
              </div>
            </div>
            {discountPercent != null && discountPercent > 0 && (
              <p className="text-sm text-mash-success-text bg-mash-success-bg rounded-lg px-3 py-2">
                نسبة التوفير من قاعدة البيانات:{' '}
                <span className="font-bold">وفِّر {discountPercent}%</span>
              </p>
            )}
            {discountPercent != null && discountPercent <= 0 && (
              <p className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 dark:border-amber-900/40 dark:bg-amber-950/30">
                لا يوجد توفير — السعر السنوي ({priceAnnual || '—'} ₪) أعلى من أو يساوي
                السعر الشهري × 12. اجعل السعر السنوي أقل من{' '}
                {priceMonthly ? (Number(priceMonthly) * 12).toFixed(0) : '—'} ₪ لإظهار
                نسبة توفير.
              </p>
            )}
          </div>
        )}

        {/* ⑤ promotional_message — enterprise */}
        {plan.slug === 'enterprise' && plan.is_coming_soon && (
          <div className="space-y-2">
            <Label htmlFor={`promo-${plan.id}`}>رسالة Coming Soon</Label>
            <textarea
              id={`promo-${plan.id}`}
              value={promotionalMessage}
              onChange={(e) => setPromotionalMessage(e.target.value)}
              rows={4}
              className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
            <Button
              disabled={savingPromo}
              onClick={() => void handleSavePromotionalMessage()}
            >
              {savingPromo ? 'جاري...' : 'حفظ الرسالة'}
            </Button>
          </div>
        )}

        {/* ⑦ تفعيل Enterprise */}
        {plan.slug === 'enterprise' && plan.is_coming_soon && (
          <div className="rounded-lg border border-dashed border-primary-400 bg-primary-50 p-4 space-y-3">
            <h3 className="font-semibold text-primary-800">تفعيل Enterprise</h3>
            <p className="text-xs text-muted-foreground">
              إدخال السعر ودورة الفوترة ثم تفعيل الخطة بنقرة واحدة — بدون
              تعديل كود.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor={`ent-price-${plan.id}`}>السعر (₪)</Label>
                <Input
                  id={`ent-price-${plan.id}`}
                  type="number"
                  min={0}
                  step="0.01"
                  value={enterprisePrice}
                  onChange={(e) => setEnterprisePrice(e.target.value)}
                  placeholder=""
                />
              </div>
              <div className="space-y-2">
                <Label>دورة الفوترة</Label>
                <Select
                  value={enterpriseBillingCycle}
                  onValueChange={(v) =>
                    setEnterpriseBillingCycle(v as 'monthly' | 'annual')
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">شهري</SelectItem>
                    <SelectItem value="annual">سنوي</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button onClick={requestEnterpriseActivate}>
              تفعيل Enterprise
            </Button>
          </div>
        )}

        {/* ④ features editor — كل الخطط */}
        <div className="space-y-3 border-t pt-4">
          <Label>مميزات الخطة (JSONB)</Label>
          <ul className="space-y-2">
            {features.map((feature, index) => (
              <li
                key={`${feature}-${index}`}
                className="flex items-center gap-2 rounded-lg border px-3 py-2 bg-muted/30"
              >
                <GripVertical className="size-4 text-muted-foreground shrink-0" />
                <span className="flex-1 text-sm">{feature}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={index === 0}
                  onClick={() => moveFeature(index, -1)}
                  aria-label="تحريك لأعلى"
                >
                  <ChevronUp className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={index === features.length - 1}
                  onClick={() => moveFeature(index, 1)}
                  aria-label="تحريك لأسفل"
                >
                  <ChevronDown className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => removeFeature(index)}
                  aria-label="حذف"
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <Input
              value={newFeature}
              onChange={(e) => setNewFeature(e.target.value)}
              placeholder="ميزة جديدة"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addFeature()
                }
              }}
            />
            <Button type="button" variant="outline" onClick={addFeature}>
              <Plus className="size-4" />
              إضافة
            </Button>
          </div>
          <Button
            disabled={savingFeatures}
            onClick={() => void handleSaveFeatures()}
          >
            {savingFeatures ? 'جاري...' : 'حفظ المميزات'}
          </Button>
        </div>
      </div>

      {/* Dialog تحذير قبل حفظ السعر + Preview */}
      <Dialog
        open={priceConfirm != null}
        onOpenChange={(open) => {
          if (!open && !confirmingPrice) setPriceConfirm(null)
        }}
      >
        <DialogContent className="max-w-lg" dir="rtl">
          <DialogHeader>
            <DialogTitle>تأكيد تغيير السعر</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-destructive font-medium">
            التغيير فوري — سيظهر للمستخدمين مباشرة في صفحة الأسعار وUpgradeModal.
          </p>
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">
              معاينة البطاقة بعد التغيير:
            </p>
            <div className="pointer-events-none scale-90 origin-top">
              {renderPricePreview()}
            </div>
            {priceConfirm?.kind === 'price_annual' && (
              <p className="text-xs text-muted-foreground">
                نسبة التوفير تُحدَّث تلقائياً في قاعدة البيانات بعد الحفظ.
              </p>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              disabled={confirmingPrice}
              onClick={() => setPriceConfirm(null)}
            >
              إلغاء
            </Button>
            <Button
              disabled={confirmingPrice}
              onClick={() => void handleConfirmPriceSave()}
            >
              {confirmingPrice ? 'جاري الحفظ...' : 'تأكيد وحفظ'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
