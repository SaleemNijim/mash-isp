/**
 * Offline Sync Engine — §6.2
 *
 * Guarantees:
 *  - Single-tab execution via Web Locks API (`mash_sync_engine` lock).
 *  - Retry schedule: [5 s, 15 s, 30 s, 60 s] then → dead_letter.
 *  - Every operation carries a UUID nonce; a 409 from the server means
 *    "already applied" → silently discard.
 *  - Conflict resolution:
 *      renew_subscription → Server Wins (§6.2)
 *      sell_cards         → Client Wins + stock-warning console event (§6.2)
 */

import { db, type SyncQueueItem } from '@/lib/db/schema'

// ────────────────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────────────────

const LOCK_NAME     = 'mash_sync_engine'
const RETRY_DELAYS  = [5_000, 15_000, 30_000, 60_000] as const

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

interface DispatchResult {
  ok: boolean
  status: number
  conflict: boolean
  body: Record<string, unknown> | null
}

// ────────────────────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────────────────────

/**
 * Enqueue an offline operation.
 * Call this from renew-subscription or sell-cards flows when offline.
 */
export async function enqueueOp(
  op: SyncQueueItem['op'],
  payload: Record<string, unknown>,
): Promise<void> {
  await db.sync_queue.add({
    op,
    payload,
    nonce:      crypto.randomUUID(),
    retries:    0,
    created_at: new Date().toISOString(),
  })
}

/**
 * Attempt to flush the sync queue.
 * Safe to call at any time; a no-op if offline or lock unavailable.
 */
export async function runSyncEngine(): Promise<void> {
  if (!navigator.onLine) return

  if (!('locks' in navigator)) {
    // Fallback: no Web Locks support — run directly (single-tab assumed)
    await _processQueue()
    return
  }

  await navigator.locks.request(
    LOCK_NAME,
    { ifAvailable: true },       // don't queue — skip if another tab is syncing
    async (lock: Lock | null) => {
      if (lock === null) return  // another tab holds the lock
      await _processQueue()
    },
  )
}

/**
 * Wire the sync engine to the browser `online` event.
 * Returns a cleanup function for use in `useEffect`.
 */
export function initSyncEngine(): () => void {
  const onOnline = () => { void runSyncEngine() }
  window.addEventListener('online', onOnline)
  return () => window.removeEventListener('online', onOnline)
}

// ────────────────────────────────────────────────────────────────────────────
// Internal — queue processing
// ────────────────────────────────────────────────────────────────────────────

async function _processQueue(): Promise<void> {
  // Process oldest-first; collect snapshot to avoid cursor issues
  const items = await db.sync_queue.orderBy('created_at').toArray()
  for (const item of items) {
    await _processItem(item)
  }
}

async function _processItem(item: SyncQueueItem): Promise<void> {
  let result: DispatchResult

  try {
    result = await _dispatch(item)
  } catch (err) {
    // Network failure (fetch threw) — schedule retry
    await _scheduleRetry(item, err instanceof Error ? err.message : 'network_error')
    return
  }

  // 409 → duplicate nonce → already applied → silently discard (§6.2)
  if (result.status === 409) {
    await db.sync_queue.delete(item.id!)
    return
  }

  if (!result.ok) {
    // Server error (5xx) or client error (4xx != 409) — retry
    await _scheduleRetry(item, `http_${result.status}`)
    return
  }

  // Success — handle conflict resolution before removing from queue
  if (result.conflict) {
    _resolveConflict(item, result)
  }

  await db.sync_queue.delete(item.id!)
}

// ────────────────────────────────────────────────────────────────────────────
// Dispatch to Next.js API routes
// ────────────────────────────────────────────────────────────────────────────

async function _dispatch(item: SyncQueueItem): Promise<DispatchResult> {
  const ENDPOINTS: Record<SyncQueueItem['op'], string> = {
    renew_subscription: '/api/offline/renew-subscription',
    sell_cards:         '/api/offline/sell-cards',
  }

  const endpoint = ENDPOINTS[item.op]
  const res = await fetch(endpoint, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ ...item.payload, nonce: item.nonce }),
  })

  let body: Record<string, unknown> | null = null
  try {
    body = await res.json() as Record<string, unknown>
  } catch {
    // non-JSON body — ignore
  }

  return {
    ok:       res.ok,
    status:   res.status,
    conflict: body?.conflict === true,
    body,
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Conflict resolution (§6.2)
// ────────────────────────────────────────────────────────────────────────────

function _resolveConflict(item: SyncQueueItem, result: DispatchResult): void {
  if (item.op === 'renew_subscription') {
    // Server Wins — server already has a newer renewal; local copy is stale.
    // The sync_queue item will be deleted after this function returns.
    console.info(
      '[Sync] renew_subscription conflict — Server Wins. Local op discarded.',
      { nonce: item.nonce, server: result.body },
    )
    return
  }

  if (item.op === 'sell_cards') {
    // Client Wins — offline sale is accepted; stock may be insufficient.
    // Emit a CustomEvent so the UI can surface the warning banner.
    const event = new CustomEvent('mash:stock_warning', {
      detail: {
        nonce:      item.nonce,
        payload:    item.payload,
        serverBody: result.body,
      },
    })
    window.dispatchEvent(event)
    console.warn(
      '[Sync] sell_cards conflict — Client Wins. Stock may be insufficient.',
      { nonce: item.nonce, payload: item.payload },
    )
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Retry + dead-letter
// ────────────────────────────────────────────────────────────────────────────

async function _scheduleRetry(item: SyncQueueItem, error: string): Promise<void> {
  if (item.retries >= RETRY_DELAYS.length) {
    // Exhausted all retries → dead_letter
    await db.dead_letter.add({
      op:         item.op,
      payload:    item.payload,
      nonce:      item.nonce,
      error,
      created_at: new Date().toISOString(),
    })
    await db.sync_queue.delete(item.id!)
    console.error('[Sync] Operation moved to dead_letter after max retries.', {
      op: item.op, nonce: item.nonce, error,
    })
    return
  }

  const delay = RETRY_DELAYS[item.retries]
  await db.sync_queue.update(item.id!, { retries: item.retries + 1 })
  setTimeout(() => { void runSyncEngine() }, delay)
}
