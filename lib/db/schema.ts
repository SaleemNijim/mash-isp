import Dexie, { type Table } from 'dexie'

// ────────────────────────────────────────────────────────────────────────────
// Row interfaces (§6.1 — Offline scope: renewal + card sales + cached view)
// ────────────────────────────────────────────────────────────────────────────

/** Last-known subscription records synced from server — read-only offline. */
export interface SubscriptionsCache {
  id: string            // subscription UUID (primary key)
  tenant_id: string
  customer_id: string
  customer_name: string
  plan_name: string
  status: string
  expires_at: string
  synced_at: string
}

/** Offline card sale events — each row mirrors one sell_cards operation. */
export interface CardSalesQueueItem {
  id?: number           // auto-increment (undefined on insert)
  nonce: string         // UUID — dedup key, mirrors sync_queue nonce
  product_id: string
  quantity: number
  unit_price: number
  tenant_id: string
  created_at: string
}

/**
 * General offline operation queue.
 * op: 'renew_subscription' | 'sell_cards'
 * payload: arbitrary object matching the RPC/API contract.
 * nonce: UUID — server rejects a duplicate with 409 (§6.2).
 */
export interface SyncQueueItem {
  id?: number
  op: 'renew_subscription' | 'sell_cards'
  payload: Record<string, unknown>
  nonce: string
  retries: number
  created_at: string
}

/** Operations that exhausted all retry attempts (moved here, not deleted). */
export interface DeadLetterItem {
  id?: number
  op: string
  payload: Record<string, unknown>
  nonce: string
  error: string
  created_at: string
}

// ────────────────────────────────────────────────────────────────────────────
// Dexie v3 database class
// ────────────────────────────────────────────────────────────────────────────

class MashOfflineDB extends Dexie {
  subscriptions_cache!: Table<SubscriptionsCache, string>
  card_sales_queue!: Table<CardSalesQueueItem, number>
  sync_queue!: Table<SyncQueueItem, number>
  dead_letter!: Table<DeadLetterItem, number>

  constructor() {
    super('mash_isp_offline')
    this.version(1).stores({
      // Indexed columns only — unindexed columns are still stored
      subscriptions_cache: 'id, tenant_id, customer_id, status, synced_at',
      card_sales_queue:    '++id, nonce, product_id, tenant_id',
      sync_queue:          '++id, op, nonce, retries, created_at',
      dead_letter:         '++id, op, nonce, created_at',
    })
  }
}

export const db = new MashOfflineDB()
