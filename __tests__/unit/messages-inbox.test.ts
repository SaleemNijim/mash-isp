import { describe, expect, it } from 'vitest'
import { inboxSenderLine } from '@/lib/messages'
import type { InboxMessage } from '@/lib/messages'

function baseMessage(overrides: Partial<InboxMessage> = {}): InboxMessage {
  return {
    recipientId: 'r1',
    readAt: null,
    receivedAt: new Date().toISOString(),
    id: 'm1',
    title: 'طلب دعم',
    body: 'نص',
    channel: 'admin_to_platform',
    priority: 'normal',
    category: 'general',
    sentAt: new Date().toISOString(),
    senderName: 'أحمد',
    senderRole: 'admin',
    senderTenantName: null,
    ...overrides,
  }
}

describe('inboxSenderLine', () => {
  it('includes tenant name for platform messages', () => {
    expect(
      inboxSenderLine(
        baseMessage({
          channel: 'admin_to_platform',
          senderTenantName: 'شركة النور',
          senderName: 'أحمد',
        }),
      ),
    ).toBe('شركة النور — أحمد')
  })

  it('falls back to sender name for other channels', () => {
    expect(
      inboxSenderLine(
        baseMessage({
          channel: 'super_to_tenant',
          senderTenantName: 'شركة النور',
          senderName: 'فريق MASH ISP',
        }),
      ),
    ).toBe('فريق MASH ISP')
  })
})
