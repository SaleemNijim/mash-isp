import Link from 'next/link'
import { AlertTriangle, Clock, CreditCard, Users } from 'lucide-react'

export interface DashboardAlert {
  id: string
  severity: 'critical' | 'warning'
  title: string
  description: string
  href?: string
}

interface AlertsPanelProps {
  alerts: DashboardAlert[]
}

const SEVERITY_STYLES = {
  critical: {
    dot: 'bg-red-500',
    border: 'border-red-200 bg-red-50',
    text: 'text-red-800',
    icon: 'text-red-600',
  },
  warning: {
    dot: 'bg-amber-500',
    border: 'border-amber-200 bg-amber-50',
    text: 'text-amber-800',
    icon: 'text-amber-600',
  },
} as const

const ALERT_ICONS = {
  'expiring-today': Clock,
  'overdue-tasks': AlertTriangle,
  'bb-low': Users,
  'cards-low': CreditCard,
} as const

export function AlertsPanel({ alerts }: AlertsPanelProps) {
  if (alerts.length === 0) {
    return (
      <div
        dir="rtl"
        className="rounded-xl border border-green-200 bg-green-50 px-4 py-6 text-center text-sm text-green-800"
      >
        لا توجد تنبيهات حرجة — كل شيء يبدو طبيعياً.
      </div>
    )
  }

  return (
    <div dir="rtl" className="space-y-3">
      <h2 className="text-base font-semibold text-gray-900">التنبيهات</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {alerts.map((alert) => {
          const styles = SEVERITY_STYLES[alert.severity]
          const Icon =
            ALERT_ICONS[alert.id as keyof typeof ALERT_ICONS] ?? AlertTriangle

          const content = (
            <div
              className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${styles.border}`}
            >
              <span
                className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${styles.dot}`}
                aria-hidden
              />
              <Icon size={18} className={`mt-0.5 shrink-0 ${styles.icon}`} />
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-semibold ${styles.text}`}>{alert.title}</p>
                <p className={`mt-0.5 text-xs ${styles.text} opacity-90`}>
                  {alert.description}
                </p>
              </div>
            </div>
          )

          if (alert.href) {
            return (
              <Link
                key={alert.id}
                href={alert.href}
                className="block transition-opacity hover:opacity-90"
              >
                {content}
              </Link>
            )
          }

          return <div key={alert.id}>{content}</div>
        })}
      </div>
    </div>
  )
}
