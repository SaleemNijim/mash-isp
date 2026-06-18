'use client'

import { useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  useCurrentUserId,
  useMessageRealtime,
} from '@/hooks/useMessages'
import { type MessagePriority } from '@/lib/messages'

/** Realtime toast + badge — يُستدعى من MessageNotificationBell في كل layout */
export function useMessageNotifications(messagesHref: string) {
  const router = useRouter()
  const { data: userId } = useCurrentUserId()

  const handleNew = useCallback(
    (title: string, priority: MessagePriority) => {
      const isUrgent = priority === 'urgent' || priority === 'high'
      const openMessages = () => router.push(messagesHref)

      if (isUrgent) {
        toast.error(`رسالة ${priority === 'urgent' ? 'عاجلة' : 'مهمة'}: ${title}`, {
          duration: 8000,
          action: { label: 'فتح الرسائل', onClick: openMessages },
        })
      } else {
        toast.info(`رسالة جديدة: ${title}`, {
          duration: 6000,
          action: { label: 'فتح الرسائل', onClick: openMessages },
        })
      }
    },
    [messagesHref, router],
  )

  useMessageRealtime(userId, handleNew)
}
