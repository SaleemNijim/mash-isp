import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ref, ...props }: React.ComponentProps<"input">) {
  const innerRef = React.useRef<HTMLInputElement>(null)

  React.useImperativeHandle(
    ref,
    () => innerRef.current as HTMLInputElement,
  )

  // عجلة الماوس كانت تغيّر قيمة حقول الأرقام بالخطأ. نمنع ذلك عبر مستمع
  // أصلي غير-passive (onWheel في React يكون passive فلا يعمل معه
  // preventDefault). نمنع فقط عندما يكون الحقل مركَّزاً، حتى يبقى تمرير
  // الصفحة طبيعياً حين لا يكون مركَّزاً.
  React.useEffect(() => {
    const el = innerRef.current
    if (!el || type !== "number") return

    const onWheel = (event: WheelEvent) => {
      if (document.activeElement === el) {
        event.preventDefault()
      }
    }

    el.addEventListener("wheel", onWheel, { passive: false })
    return () => el.removeEventListener("wheel", onWheel)
  }, [type])

  return (
    <input
      ref={innerRef}
      type={type}
      data-slot="input"
      className={cn(
        "h-10 w-full min-w-0 rounded-xl border border-input bg-white px-3 py-2 text-base transition-colors outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Input }
