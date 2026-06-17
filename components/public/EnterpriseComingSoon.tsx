import { Rocket } from 'lucide-react'

export function EnterpriseComingSoonCard({ message }: { message: string | null }) {
  return (
    <div
      className="border border-dashed border-mash-border rounded-xl p-6 flex flex-col items-center justify-center text-center bg-mash-page opacity-90"
      dir="rtl"
    >
      <div className="w-10 h-10 rounded-lg bg-primary-50 flex items-center justify-center mb-4">
        <Rocket className="w-5 h-5 text-primary-600" strokeWidth={1.5} />
      </div>
      <h3 className="text-[15px] font-medium text-mash-text mb-2">Enterprise</h3>
      <span className="bg-mash-page text-mash-text-muted text-xs font-medium px-3 py-1 rounded-full mb-4 border border-mash-border">
        قريباً
      </span>
      <p className="text-mash-text-muted text-sm leading-relaxed">
        {message ?? 'حلول Enterprise قيد التطوير. ميزات متقدمة وإدارة الفرق ستكون متاحة قريباً.'}
      </p>
      <button
        disabled
        type="button"
        className="mt-6 w-full min-h-11 py-2 rounded-lg bg-mash-border text-mash-text-muted cursor-not-allowed font-medium text-sm"
      >
        قريباً
      </button>
    </div>
  )
}
