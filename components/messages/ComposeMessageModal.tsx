'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Send } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  CATEGORY_LABELS,
  type MessageCategory,
  type MessagePriority,
  PRIORITY_LABELS,
} from '@/lib/messages'

export type ComposeMode =
  | 'super_to_tenant'
  | 'super_broadcast'
  | 'admin_to_employees'
  | 'admin_to_platform'

interface ComposeMessageModalProps {
  open: boolean
  onClose: () => void
  mode: ComposeMode
}

export function ComposeMessageModal({ open, onClose, mode }: ComposeMessageModalProps) {
  const queryClient = useQueryClient()
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [priority, setPriority] = useState<MessagePriority>('normal')
  const [category, setCategory] = useState<MessageCategory>('general')
  const [tenantId, setTenantId] = useState('')
  const [employeeId, setEmployeeId] = useState('all')
  const [sending, setSending] = useState(false)

  const supabase = createClient()

  const { data: tenants = [] } = useQuery({
    queryKey: ['compose-tenants'],
    enabled: open && (mode === 'super_to_tenant' || mode === 'super_broadcast'),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tenants')
        .select('id, name')
        .eq('is_active', true)
        .order('name')
      if (error) throw error
      return data ?? []
    },
  })

  const { data: employees = [] } = useQuery({
    queryKey: ['compose-employees'],
    enabled: open && mode === 'admin_to_employees',
    queryFn: async () => {
      const { data, error } = await supabase
        .from('users')
        .select('id, name')
        .eq('role', 'employee')
        .eq('is_active', true)
        .order('name')
      if (error) throw error
      return data ?? []
    },
  })

  function reset() {
    setTitle('')
    setBody('')
    setPriority('normal')
    setCategory('general')
    setTenantId('')
    setEmployeeId('all')
  }

  async function handleSend() {
    if (!title.trim() || !body.trim()) {
      toast.error('العنوان والنص مطلوبان')
      return
    }

    setSending(true)
    try {
      let error: { message: string } | null = null

      if (mode === 'super_to_tenant') {
        if (!tenantId) {
          toast.error('اختر الشركة')
          setSending(false)
          return
        }
        const res = await supabase.rpc('super_admin_send_to_tenant', {
          p_tenant_id: tenantId,
          p_title: title.trim(),
          p_body: body.trim(),
          p_priority: priority,
          p_category: category,
        })
        error = res.error
      } else if (mode === 'super_broadcast') {
        const res = await supabase.rpc('super_admin_broadcast_to_tenants', {
          p_title: title.trim(),
          p_body: body.trim(),
          p_priority: priority,
          p_category: category,
          p_tenant_ids: tenantId ? [tenantId] : null,
        })
        error = res.error
      } else if (mode === 'admin_to_employees') {
        const res = await supabase.rpc('admin_send_to_employees', {
          p_title: title.trim(),
          p_body: body.trim(),
          p_priority: priority,
          p_category: category,
          p_employee_ids: employeeId === 'all' ? null : [employeeId],
        })
        error = res.error
      } else {
        const res = await supabase.rpc('admin_send_to_platform', {
          p_title: title.trim(),
          p_body: body.trim(),
          p_priority: priority,
          p_category: category,
        })
        error = res.error
      }

      if (error) {
        const msg =
          error.message.includes('no_recipients')
            ? 'لا يوجد مستلمون نشطون'
            : error.message.includes('not_authorized')
              ? 'غير مصرّح لك بهذا الإجراء'
              : error.message
        toast.error(msg)
        return
      }

      toast.success('تم إرسال الرسالة')
      void queryClient.invalidateQueries({ queryKey: ['messages-sent'] })
      reset()
      onClose()
    } finally {
      setSending(false)
    }
  }

  const modeTitle: Record<ComposeMode, string> = {
    super_to_tenant: 'رسالة لشركة',
    super_broadcast: 'إعلان للمشتركين',
    admin_to_employees: 'إشعار للكاشير',
    admin_to_platform: 'رسالة لفريق المنصة',
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent dir="rtl" className="max-w-lg bg-mash-surface">
        <DialogHeader>
          <DialogTitle className="text-mash-text font-medium">{modeTitle[mode]}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {mode === 'super_to_tenant' && (
            <div className="space-y-1.5">
              <Label>الشركة</Label>
              <Select value={tenantId} onValueChange={setTenantId}>
                <SelectTrigger>
                  <SelectValue placeholder="اختر شركة..." />
                </SelectTrigger>
                <SelectContent>
                  {tenants.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {mode === 'super_broadcast' && (
            <div className="space-y-1.5">
              <Label>النطاق (اختياري)</Label>
              <Select value={tenantId || 'all'} onValueChange={(v) => setTenantId(v === 'all' ? '' : v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الشركات النشطة</SelectItem>
                  {tenants.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name} فقط
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {mode === 'admin_to_employees' && (
            <div className="space-y-1.5">
              <Label>المستلم</Label>
              <Select value={employeeId} onValueChange={setEmployeeId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الكاشير</SelectItem>
                  {employees.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>الأولوية</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as MessagePriority)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(PRIORITY_LABELS) as MessagePriority[]).map((p) => (
                    <SelectItem key={p} value={p}>
                      {PRIORITY_LABELS[p]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>التصنيف</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as MessageCategory)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(CATEGORY_LABELS) as MessageCategory[]).map((c) => (
                    <SelectItem key={c} value={c}>
                      {CATEGORY_LABELS[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="msg-title">العنوان</Label>
            <Input
              id="msg-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="مثال: تحديث سياسة البيع"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="msg-body">النص</Label>
            <textarea
              id="msg-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={5}
              placeholder="اكتب رسالتك هنا..."
              className="w-full rounded-lg border border-mash-border bg-mash-surface px-3 py-2.5 text-sm resize-none focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-600"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={sending}>
            إلغاء
          </Button>
          <Button onClick={() => void handleSend()} disabled={sending} className="gap-2">
            <Send size={16} />
            {sending ? 'جارِ الإرسال...' : 'إرسال'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
