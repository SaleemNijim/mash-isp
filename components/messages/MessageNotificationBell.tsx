'use client'

import { useCallback } from 'react'
import Link from 'next/link'
import { Bell } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import {
  useCurrentUserId,
  useMessageRealtime,
  useUnreadMessageCount,
} from '@/hooks/useMessages'
import { type MessagePriority } from '@/lib/messages'

interface MessageNotificationBellProps {
  href: string
}

export function MessageNotificationBell({ href }: MessageNotificationBellProps) {
  const { data: userId } = useCurrentUserId()
  const { data: unread = 0 } = useUnreadMessageCount(userId)

  const handleNew = useCallback((title: string, priority: MessagePriority) => {
    const isUrgent = priority === 'urgent' || priority === 'high'
    if (isUrgent) {
      toast.error(`رسالة ${priority === 'urgent' ? 'عاجلة' : 'مهمة'}: ${title}`, {
        duration: 8000,
      })
    } else {
      toast.info(`رسالة جديدة: ${title}`)
    }
  }, [])

  useMessageRealtime(userId, handleNew)

  return (
    <Link
      href={href}
      className="relative inline-flex items-center justify-center min-h-11 min-w-11 rounded-lg text-mash-text-secondary hover:bg-mash-page hover:text-mash-text transition-colors"
      aria-label={unread > 0 ? `الرسائل — ${unread} غير مقروءة` : 'الرسائل'}
    >
      <Bell size={20} />
      {unread > 0 && (
        <Badge
          variant="destructive"
          className="absolute -top-0.5 -left-0.5 h-5 min-w-5 px-1 text-[10px] flex items-center justify-center"
        >
          {unread > 99 ? '99+' : unread}
        </Badge>
      )}
    </Link>
  )
}
