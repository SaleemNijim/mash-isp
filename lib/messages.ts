export type MessageChannel =
  | 'super_to_tenant'
  | 'super_to_all_tenants'
  | 'admin_to_employees'
  | 'admin_to_platform'

export type MessagePriority = 'low' | 'normal' | 'high' | 'urgent'
export type MessageCategory = 'general' | 'announcement' | 'alert' | 'billing' | 'operations'

export interface InboxMessage {
  recipientId: string
  readAt: string | null
  receivedAt: string
  id: string
  title: string
  body: string
  channel: MessageChannel
  priority: MessagePriority
  category: MessageCategory
  sentAt: string
  senderName: string
  senderRole: string | null
}

export interface SentMessage {
  id: string
  title: string
  body: string
  channel: MessageChannel
  priority: MessagePriority
  category: MessageCategory
  sentAt: string
  recipientCount: number
}

export const CHANNEL_LABELS: Record<MessageChannel, string> = {
  super_to_tenant: 'من المنصة',
  super_to_all_tenants: 'إعلان عام',
  admin_to_employees: 'من الإدارة',
  admin_to_platform: 'طلب للمنصة',
}

export const PRIORITY_LABELS: Record<MessagePriority, string> = {
  low: 'منخفضة',
  normal: 'عادية',
  high: 'مهمة',
  urgent: 'عاجلة',
}

export const CATEGORY_LABELS: Record<MessageCategory, string> = {
  general: 'عام',
  announcement: 'إعلان',
  alert: 'تنبيه',
  billing: 'فوترة',
  operations: 'عمليات',
}

export function senderDisplayName(
  channel: MessageChannel,
  name: string | null | undefined,
): string {
  if (name) return name
  if (channel === 'super_to_tenant' || channel === 'super_to_all_tenants') {
    return 'فريق MASH ISP'
  }
  return 'مستخدم'
}

export function priorityBadgeClass(priority: MessagePriority): string {
  switch (priority) {
    case 'urgent':
      return 'mash-badge-danger'
    case 'high':
      return 'mash-badge-warning'
    case 'low':
      return 'mash-badge-info'
    default:
      return 'mash-badge-success'
  }
}
