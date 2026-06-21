'use client'

import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

function handleMacChange(payload: unknown) {
  console.log('[Realtime] MAC changed:', payload)
}

export function useRealtimeChannels(tenantId: string) {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!tenantId) return
    const supabase = createClient()

    const macChannel = supabase
      .channel(`mac-changes-${tenantId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'router_mac_history',
        filter: `tenant_id=eq.${tenantId}`,
      }, handleMacChange)
      .subscribe()

    const taskChannel = supabase
      .channel(`pending-tasks-${tenantId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'pending_tasks',
        filter: `tenant_id=eq.${tenantId}`,
      }, () => {
        queryClient.invalidateQueries({ queryKey: ['pending-inbox'] })
        queryClient.invalidateQueries({ queryKey: ['pending-inbox-count'] })
      })
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'debts',
        filter: `tenant_id=eq.${tenantId}`,
      }, () => {
        queryClient.invalidateQueries({ queryKey: ['pending-inbox'] })
        queryClient.invalidateQueries({ queryKey: ['pending-inbox-count'] })
      })
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'payments',
        filter: `tenant_id=eq.${tenantId}`,
      }, () => {
        queryClient.invalidateQueries({ queryKey: ['pending-inbox'] })
        queryClient.invalidateQueries({ queryKey: ['pending-inbox-count'] })
      })
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'payment_proofs',
        filter: `tenant_id=eq.${tenantId}`,
      }, () => {
        queryClient.invalidateQueries({ queryKey: ['pending-inbox'] })
        queryClient.invalidateQueries({ queryKey: ['pending-inbox-count'] })
      })
      .subscribe()

    return () => {
      supabase.removeChannel(macChannel)
      supabase.removeChannel(taskChannel)
    }
  }, [tenantId, queryClient])
}
