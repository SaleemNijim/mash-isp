import { Wifi, CheckCircle2, CreditCard } from 'lucide-react'

export function HeroIllustration() {
  return (
    <div className="relative flex items-center justify-center mx-auto w-[200px] h-[200px] md:w-[280px] md:h-[280px]">
      <div className="w-full h-full rounded-full bg-primary-50 flex items-center justify-center">
        <div className="w-[72%] h-[72%] rounded-full bg-primary-100 flex items-center justify-center">
          <div className="w-[46%] h-[46%] rounded-full bg-primary-600 flex items-center justify-center">
            <Wifi className="w-14 h-14 md:w-16 md:h-16 text-primary-50" strokeWidth={1.5} aria-hidden />
          </div>
        </div>
      </div>

      <div
        className="absolute top-1 right-1 md:top-2 md:right-2 bg-mash-surface border border-mash-border rounded-lg px-3 py-2 flex items-center gap-2"
        aria-hidden
      >
        <CheckCircle2 className="w-4 h-4 text-primary-600 shrink-0" />
        <span className="text-xs text-mash-text whitespace-nowrap">447 مشترك متصل</span>
      </div>

      <div
        className="absolute bottom-2 -left-1 md:bottom-3 bg-mash-surface border border-mash-border rounded-lg px-3 py-2 flex items-center gap-2"
        aria-hidden
      >
        <CreditCard className="w-4 h-4 text-primary-600 shrink-0" />
        <span className="text-xs text-mash-text whitespace-nowrap">بطاقة جديدة مُفعّلة</span>
      </div>
    </div>
  )
}
