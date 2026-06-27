'use client'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Download, FileSpreadsheet, Upload, CheckCircle2, AlertCircle } from 'lucide-react'
import {
  downloadNetworkSinglePortTemplate,
  ROUTER_SHEET_HEADERS,
} from '@/lib/excel/network-routers-template'

interface NetworkImportGuideDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  portName?: string | null
  onStartImport?: () => void
}

export function NetworkImportGuideDialog({
  open,
  onOpenChange,
  portName,
  onStartImport,
}: NetworkImportGuideDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" dir="rtl">
        <DialogHeader>
          <DialogTitle>كيف أستورد راوترات بورت؟</DialogTitle>
          <DialogDescription>
            {portName
              ? `كل راوتر في الملف يُضاف إلى «${portName}».`
              : 'أنشئ بورتاً → اختره من التبويبات → ارفع ملف Excel.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          {[
            { icon: Download, t: 'حمّل النموذج الفارغ (ورقة واحدة).' },
            {
              icon: FileSpreadsheet,
              t: 'عبّئ الورقة من الصف 2 — البيانات تُنسخ كما في الخلايا.',
            },
            { icon: Upload, t: 'اختر البورت من التبويبات ثم ارفع الملف.' },
            { icon: CheckCircle2, t: 'راجع التقرير بعد اكتمال الاستيراد.' },
          ].map(({ icon: Icon, t }) => (
            <div key={t} className="flex gap-2 rounded-lg border bg-muted/30 p-3">
              <Icon size={16} className="mt-0.5 shrink-0 text-primary" />
              <p>{t}</p>
            </div>
          ))}

          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs dark:border-amber-900/40 dark:bg-amber-950/30">
            <p className="font-medium mb-1">الأعمدة المعتمدة:</p>
            <p className="text-muted-foreground leading-relaxed">{ROUTER_SHEET_HEADERS.join(' · ')}</p>
          </div>

          <div className="flex gap-2 text-xs text-muted-foreground">
            <AlertCircle size={14} className="shrink-0 mt-0.5" />
            <p>
              البورت يُحدَّد من الواجهة — لا حاجة لتبويبات Port في الملف. «SSID» = اسم الجهاز
              في التطبيق.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={downloadNetworkSinglePortTemplate}
          >
            <Download size={14} />
            تحميل النموذج
          </Button>
          {onStartImport && (
            <Button type="button" size="sm" className="gap-1.5" onClick={onStartImport}>
              <Upload size={14} />
              بدء الاستيراد
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
