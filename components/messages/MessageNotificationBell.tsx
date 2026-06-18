'use client'

import Link from 'next/link'
import { Bell } from 'lucide-react'
import { useCurrentUserId, useUnreadMessageCount } from '@/hooks/useMessages'
import { useMessageNotifications } from '@/hooks/useMessageNotifications'

interface MessageNotificationBellProps {
  href: string
}

export function MessageNotificationBell({ href }: MessageNotificationBellProps) {
  const { data: userId } = useCurrentUserId()
  const { data: unread = 0 } = useUnreadMessageCount(userId)

  useMessageNotifications(href)

  const label =
    unread > 0
      ? `${unread} ${unread === 1 ? 'رسالة غير مقروءة' : 'رسائل غير مقروءة'}`
      : 'الرسائل'

  return (
    <Link
      href={href}
      className="relative inline-flex items-center justify-center min-h-11 min-w-11 rounded-lg text-mash-text-secondary hover:bg-mash-page hover:text-mash-text transition-colors"
      aria-label={label}
      title={label}
    >
      <Bell size={20} />
      {unread > 0 && (
        <span
          className="pointer-events-none absolute top-1.5 end-1.5 z-10 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-mash-surface"
          aria-hidden
        >
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </Link>
  )
}
