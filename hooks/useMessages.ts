'use client'

import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import {
  type InboxMessage,
  type MessageChannel,
  type MessageCategory,
  type MessagePriority,
  type SentMessage,
  senderDisplayName,
} from '@/lib/messages'

function normalizeSender(raw: unknown): { name: string; role: string | null } {
  if (Array.isArray(raw)) {
    const u = raw[0] as { name?: string; role?: string } | undefined
    return { name: u?.name ?? '', role: u?.role ?? null }
  }
  if (raw && typeof raw === 'object') {
    const u = raw as { name?: string; role?: string }
    return { name: u.name ?? '', role: u.role ?? null }
  }
  return { name: '', role: null }
}

function mapInboxRow(row: Record<string, unknown>): InboxMessage | null {
  const msg = row.message as Record<string, unknown> | null
  if (!msg) return null
  const sender = normalizeSender(msg.sender)
  const channel = msg.channel as MessageChannel
  return {
    recipientId: row.id as string,
    readAt: (row.read_at as string | null) ?? null,
    receivedAt: row.created_at as string,
    id: msg.id as string,
    title: msg.title as string,
    body: msg.body as string,
    channel,
    priority: msg.priority as MessagePriority,
    category: msg.category as MessageCategory,
    sentAt: msg.created_at as string,
    senderName: senderDisplayName(channel, sender.name),
    senderRole: sender.role,
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
      const { data, error } = await supabase
        .from('message_recipients')
        .select(`
          id,
          read_at,
          created_at,
          message:internal_messages (
            id,
            title,
            body,
            channel,
            priority,
            category,
            created_at,
            sender:users!internal_messages_sender_id_fkey ( name, role )
          )
        `)
        .eq('recipient_user_id', userId!)
        .order('created_at', { ascending: false })
        .limit(100)

      if (error) throw error
      return (data ?? [])
        .map((row) => mapInboxRow(row as Record<string, unknown>))
        .filter((m): m is InboxMessage => m !== null)
    },
    refetchInterval: 60_000,
  })
}

export function useSentMessages(userId: string | null | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['messages-sent', userId],
    enabled: !!userId && enabled,
    queryFn: async (): Promise<SentMessage[]> => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('internal_messages')
        .select(`
          id,
          title,
          body,
          channel,
          priority,
          category,
          created_at,
          message_recipients ( id )
        `)
        .eq('sender_id', userId!)
        .order('created_at', { ascending: false })
        .limit(50)

      if (error) throw error

      return (data ?? []).map((row) => {
        const rec = row.message_recipients as { id: string }[] | null
        return {
          id: row.id as string,
          title: row.title as string,
          body: row.body as string,
          channel: row.channel as MessageChannel,
          priority: row.priority as MessagePriority,
          category: row.category as MessageCategory,
          sentAt: row.created_at as string,
          recipientCount: rec?.length ?? 0,
        }
      })
    },
  })
}

export function useUnreadMessageCount(userId: string | null | undefined) {
  return useQuery({
    queryKey: ['messages-unread-count', userId],
    enabled: !!userId,
    queryFn: async () => {
      const supabase = createClient()
      const { count, error } = await supabase
        .from('message_recipients')
        .select('*', { count: 'exact', head: true })
        .eq('recipient_user_id', userId!)
        .is('read_at', null)

      if (error) throw error
      return count ?? 0
    },
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
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const markAllRead = useMutation({
    mutationFn: async () => {
      const supabase = createClient()
      const { error } = await supabase.rpc('mark_all_messages_read')
      if (error) throw error
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
          if (messageId && onNewMessage) {
            const { data } = await supabase
              .from('internal_messages')
              .select('title, priority')
              .eq('id', messageId)
              .single()
            if (data) {
              onNewMessage(data.title, data.priority as MessagePriority)
            }
          }
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
