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
  DISTRIBUTORS_TEMPLATE,
  downloadDistributorTemplate,
} from '@/lib/excel/distributors-template'

interface DistributorImportGuideDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onStartImport?: () => void
}

const STEPS = [
  {
    icon: Download,
    title: '١ — تحميل النموذج الفارغ',
    body: 'اضغط «تحميل النموذج» لتنزيل ملف Excel الرسمي. لا تغيّر أسماء الأعمدة في الصف الأول ولا اسم ورقة العمل «الموزعون».',
  },
  {
    icon: FileSpreadsheet,
    title: '٢ — تعبئة البيانات',
    body: 'من الصف الثاني فما فوق، أدخل بيانات كل موزع: الاسم (إلزامي)، الهاتف، العنوان، والملاحظات. اترك الصف فارغاً إذا انتهيت.',
  },
  {
    icon: Upload,
    title: '٣ — رفع الملف',
    body: 'احفظ الملف بصيغة .xlsx ثم ارفعه من نافذة الاستيراد (سحب وإفلات أو اختيار ملف).',
  },
  {
    icon: CheckCircle2,
    title: '٤ — المعاينة والتأكيد',
    body: 'راجع البيانات في المعاينة ثم اضغط «تأكيد الاستيراد». الصفوف المكررة أو الفارغة تُتخطّى مع عرض تقرير بالأخطاء.',
  },
] as const

export function DistributorImportGuideDialog({
  open,
  onOpenChange,
  onStartImport,
}: DistributorImportGuideDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" dir="rtl">
        <DialogHeader>
          <DialogTitle>كيف أستورد الموزعين من Excel؟</DialogTitle>
          <DialogDescription>
            اتبع الخطوات بالترتيب — النموذج الرسمي يضمن قبول الملف دون أخطاء في الأعمدة.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {STEPS.map(({ icon: Icon, title, body }) => (
            <div key={title} className="flex gap-3 rounded-lg border border-border bg-muted/30 p-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Icon size={18} />
              </div>
              <div className="min-w-0 space-y-1">
                <p className="font-medium text-sm">{title}</p>
                <p className="text-xs text-muted-foreground leading-relaxed">{body}</p>
              </div>
            </div>
          ))}

          <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <div className="space-y-1 text-xs leading-relaxed">
              <p className="font-medium">تنبيهات مهمة</p>
              <ul className="list-disc list-inside space-y-0.5 opacity-90">
                <li>الموزع المسجّل مسبقاً بنفس الاسم يُتخطّى ولا يُحدَّث.</li>
                <li>المبالغ المستحقة لا تُستورد — تُحسب تلقائياً من المبيعات والديون.</li>
                <li>الأعمدة المطلوبة: {DISTRIBUTORS_TEMPLATE.headers.join(' · ')}</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 justify-end pt-1">
          <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={downloadDistributorTemplate}>
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
