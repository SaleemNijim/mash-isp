'use client'

import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { throwIfSupabaseError } from '@/lib/supabase/errors'
import {
  type InboxMessage,
  type MessageChannel,
  type MessageCategory,
  type MessagePriority,
  type SentMessage,
  senderDisplayName,
} from '@/lib/messages'

function mapRpcInboxRow(row: Record<string, unknown>): InboxMessage {
  const channel = row.channel as MessageChannel
  return {
    recipientId: row.recipient_id as string,
    readAt: (row.read_at as string | null) ?? null,
    receivedAt: row.received_at as string,
    id: row.message_id as string,
    title: row.title as string,
    body: row.body as string,
    channel,
    priority: row.priority as MessagePriority,
    category: row.category as MessageCategory,
    sentAt: row.sent_at as string,
    senderName: senderDisplayName(channel, row.sender_name as string | null),
    senderRole: (row.sender_role as string | null) ?? null,
  }
}

export function useCurrentUserId() {
  return useQuery({
    queryKey: ['auth-user-id'],
    queryFn: async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      return user?.id ?? null
    },
    staleTime: 300_000,
  })
}

export function useInbox(userId: string | null | undefined) {
  return useQuery({
    queryKey: ['messages-inbox', userId],
    enabled: !!userId,
    queryFn: async (): Promise<InboxMessage[]> => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('get_my_inbox')
      throwIfSupabaseError(error)
      return (Array.isArray(data) ? data : []).map((row) =>
        mapRpcInboxRow(row as Record<string, unknown>),
      )
    },
    refetchInterval: 60_000,
  })
}

function mapRpcSentRow(row: Record<string, unknown>): SentMessage {
  return {
    id: row.message_id as string,
    title: row.title as string,
    body: row.body as string,
    channel: row.channel as MessageChannel,
    priority: row.priority as MessagePriority,
    category: row.category as MessageCategory,
    sentAt: row.sent_at as string,
    recipientCount: Number(row.recipient_count ?? 0),
  }
}

export function useSentMessages(userId: string | null | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['messages-sent', userId],
    enabled: !!userId && enabled,
    queryFn: async (): Promise<SentMessage[]> => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('get_my_sent_messages')
      throwIfSupabaseError(error)
      return (Array.isArray(data) ? data : []).map((row) =>
        mapRpcSentRow(row as Record<string, unknown>),
      )
    },
  })
}

export function useUnreadMessageCount(userId: string | null | undefined) {
  return useQuery({
    queryKey: ['messages-unread-count', userId],
    enabled: !!userId,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('get_my_unread_message_count')
      throwIfSupabaseError(error)
      return typeof data === 'number' ? data : Number(data ?? 0)
    },
    staleTime: 0,
    refetchInterval: 30_000,
  })
}

export function useMessageMutations(userId: string | null | undefined) {
  const queryClient = useQueryClient()

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['messages-inbox', userId] })
    void queryClient.invalidateQueries({ queryKey: ['messages-sent', userId] })
    void queryClient.invalidateQueries({ queryKey: ['messages-unread-count', userId] })
  }

  const markRead = useMutation({
    mutationFn: async (recipientId: string) => {
      const supabase = createClient()
      const { error } = await supabase.rpc('mark_message_read', {
        p_recipient_id: recipientId,
      })
      throwIfSupabaseError(error)
    },
    onSuccess: invalidate,
  })

  const markAllRead = useMutation({
    mutationFn: async () => {
      const supabase = createClient()
      const { error } = await supabase.rpc('mark_all_messages_read')
      throwIfSupabaseError(error)
    },
    onSuccess: invalidate,
  })

  return { markRead, markAllRead, invalidate }
}

export function useMessageRealtime(
  userId: string | null | undefined,
  onNewMessage?: (title: string, priority: MessagePriority) => void,
) {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!userId) return
    const supabase = createClient()

    const channel = supabase
      .channel(`messages-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'message_recipients',
          filter: `recipient_user_id=eq.${userId}`,
        },
        async (payload) => {
          const messageId = (payload.new as { message_id?: string }).message_id
          let title = 'رسالة جديدة'
          let priority: MessagePriority = 'normal'

          if (messageId) {
            const { data } = await supabase.rpc('peek_inbox_message', {
              p_message_id: messageId,
            })
            const row = Array.isArray(data) ? data[0] : data
            if (row && typeof row === 'object' && 'title' in row) {
              const peek = row as { title: string; priority: string }
              if (peek.title) title = peek.title
              if (peek.priority) priority = peek.priority as MessagePriority
            }
          }

          onNewMessage?.(title, priority)

          queryClient.setQueryData<number>(
            ['messages-unread-count', userId],
            (prev) => (typeof prev === 'number' ? prev : 0) + 1,
          )
          void queryClient.invalidateQueries({ queryKey: ['messages-inbox', userId] })
          void queryClient.invalidateQueries({ queryKey: ['messages-unread-count', userId] })
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [userId, queryClient, onNewMessage])
}
