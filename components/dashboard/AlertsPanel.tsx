import Link from 'next/link'
import { AlertTriangle, ClipboardList, Clock, CreditCard, Users } from 'lucide-react'

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
    dot: 'bg-destructive',
    border: 'border-mash-danger-bg bg-mash-danger-bg',
    text: 'text-mash-danger-text',
    icon: 'text-mash-danger-text',
  },
  warning: {
    dot: 'bg-mash-warning-text',
    border: 'border-mash-warning-bg bg-mash-warning-bg',
    text: 'text-mash-warning-text',
    icon: 'text-mash-warning-text',
  },
} as const

const ALERT_ICONS = {
  'expiring-today': Clock,
  'overdue-tasks': AlertTriangle,
  'pending-followup': ClipboardList,
  'cards-low': CreditCard,
} as const

function alertIcon(id: string) {
  if (id.startsWith('ppp-low-')) return Users
  return ALERT_ICONS[id as keyof typeof ALERT_ICONS] ?? AlertTriangle
}

export function AlertsPanel({ alerts }: AlertsPanelProps) {
  if (alerts.length === 0) {
    return (
      <div
        dir="rtl"
        className="rounded-2xl border border-[#D1E8E2] bg-[#E8F5F1] px-4 py-6 text-center text-sm font-medium text-[#0F6E56]"
      >
        لا توجد تنبيهات حرجة — كل شيء يبدو طبيعياً.
      </div>
    )
  }

  return (
    <div dir="rtl" className="space-y-3">
      <h2 className="text-base font-bold text-[#0D1F1A]">التنبيهات</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {alerts.map((alert) => {
          const styles = SEVERITY_STYLES[alert.severity]
          const Icon = alertIcon(alert.id)

          const content = (
            <div
              className={`flex items-start gap-3 rounded-2xl border px-4 py-3 shadow-sm ${styles.border}`}
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
