'use client'

import { useEffect, useState, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Upload, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { parsePppCredentialExcel } from '@/lib/ppp/excel-import'
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

interface PlanOption {
  id: string
  name: string
  speed: string
}

interface ReceivePppBatchModalProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

export function ReceivePppBatchModal({ open, onClose, onSuccess }: ReceivePppBatchModalProps) {
  const supabase = createClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const [planId, setPlanId] = useState('')
  const [batchNumber, setBatchNumber] = useState('')
  const [notes, setNotes] = useState('')
  const [fileName, setFileName] = useState<string | null>(null)
  const [receiving, setReceiving] = useState(false)

  useEffect(() => {
    if (!open) return
    setPlanId('')
    setBatchNumber('')
    setNotes('')
    setFileName(null)
  }, [open])

  const { data: plans = [], isLoading: loadingPlans } = useQuery<PlanOption[]>({
    queryKey: ['ppp-plans-options'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ppp_plans')
        .select('id, name, speed')
        .eq('is_deleted', false)
        .order('name')
      if (error) throw error
      return data ?? []
    },
    enabled: open,
  })

  async function handleFile(file: File) {
    if (!planId) {
      toast.error('اختر الفئة أولاً')
      return
    }
    if (!batchNumber.trim()) {
      toast.error('رقم الدفعة مطلوب')
      return
    }

    setReceiving(true)
    setFileName(file.name)
    try {
      const parsed = await parsePppCredentialExcel(await file.arrayBuffer())
      if (parsed.rows.length === 0) {
        toast.error('لم يُعثر على usernames صالحة في الملف')
        return
      }

      const p_rows = parsed.rows.map((r) => ({
        username: r.username,
        password: r.password || null,
        type: 'bb',
        is_used: r.is_used,
      }))

      const { error } = await supabase.rpc('receive_ppp_batch', {
        p_plan_id: planId,
        p_batch_number: batchNumber.trim(),
        p_notes: notes.trim() || null,
        p_rows,
      })
      if (error) throw error

      toast.success(`تم استلام ${parsed.rows.length} username في الدفعة`)
      if (parsed.errors.length > 0) {
        toast.warning(`تُرك ${parsed.skipped + parsed.errors.length} صف`)
      }
      onSuccess()
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'فشل استلام الدفعة')
    } finally {
      setReceiving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !receiving && onClose()}>
      <DialogContent dir="rtl" className="max-w-lg">
        <DialogHeader>
          <DialogTitle>استلام دفعة usernames</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          مثل استلام بطاقات — اختر الفئة، رقم الدفعة، ثم ملف Excel (username + password).
        </p>

        <div className="grid gap-3">
          <div className="space-y-1.5">
            <Label>الفئة *</Label>
            <Select value={planId || undefined} onValueChange={setPlanId} disabled={receiving || loadingPlans}>
              <SelectTrigger><SelectValue placeholder="اختر الفئة" /></SelectTrigger>
              <SelectContent dir="rtl">
                {plans.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name} ({p.speed})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ppp-batch-num">رقم الدفعة *</Label>
            <Input
              id="ppp-batch-num"
              value={batchNumber}
              onChange={(e) => setBatchNumber(e.target.value)}
              placeholder="مثال: 2025-03-001"
              disabled={receiving}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ppp-batch-notes">ملاحظات</Label>
            <Input
              id="ppp-batch-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={receiving}
            />
          </div>
        </div>

        <button
          type="button"
          disabled={receiving}
          onClick={() => inputRef.current?.click()}
          className="flex w-full flex-col items-center gap-2 rounded-lg border-2 border-dashed border-border p-6 hover:bg-muted/30"
        >
          {receiving ? (
            <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
          ) : (
            <Upload className="h-7 w-7 text-muted-foreground" />
          )}
          <span className="text-sm">{receiving ? 'جارٍ الاستلام…' : 'اختر ملف Excel (.xlsx)'}</span>
          {fileName && <span className="text-xs text-muted-foreground">{fileName}</span>}
        </button>

        <input
          ref={inputRef}
          type="file"
          accept=".xlsx"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void handleFile(f)
            e.target.value = ''
          }}
        />

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={receiving}>إلغاء</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
