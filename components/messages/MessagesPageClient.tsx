'use client'

import { useState } from 'react'
import { Plus, Mail, MailOpen, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  useCurrentUserId,
  useInbox,
  useMessageMutations,
  useSentMessages,
} from '@/hooks/useMessages'
import {
  CHANNEL_LABELS,
  CATEGORY_LABELS,
  PRIORITY_LABELS,
  priorityBadgeClass,
  type InboxMessage,
  type SentMessage,
} from '@/lib/messages'
import {
  ComposeMessageModal,
  type ComposeMode,
} from '@/components/messages/ComposeMessageModal'

interface MessagesPageClientProps {
  role: 'admin' | 'employee' | 'super_admin'
}

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString('ar-EG', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function InboxRow({
  msg,
  selected,
  onSelect,
}: {
  msg: InboxMessage
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full text-right px-4 py-3 border-b border-mash-row-border transition-colors ${
        selected ? 'bg-primary-50' : 'hover:bg-mash-page'
      } ${!msg.readAt ? 'font-medium' : ''}`}
    >
      <div className="flex items-start gap-2">
        {!msg.readAt ? (
          <Mail size={16} className="text-primary-600 shrink-0 mt-0.5" />
        ) : (
          <MailOpen size={16} className="text-mash-text-muted shrink-0 mt-0.5" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-mash-text truncate">{msg.title}</span>
            <span className={`text-[11px] px-2 py-0.5 rounded-full ${priorityBadgeClass(msg.priority)}`}>
              {PRIORITY_LABELS[msg.priority]}
            </span>
          </div>
          <p className="text-xs text-mash-text-muted mt-0.5">
            {msg.senderName} · {formatWhen(msg.sentAt)}
          </p>
        </div>
      </div>
    </button>
  )
}

function MessageDetail({ msg }: { msg: InboxMessage }) {
  return (
    <div className="p-6 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`text-xs px-2.5 py-0.5 rounded-full ${priorityBadgeClass(msg.priority)}`}>
          {PRIORITY_LABELS[msg.priority]}
        </span>
        <span className="text-xs text-mash-text-muted">{CHANNEL_LABELS[msg.channel]}</span>
        <span className="text-xs text-mash-text-muted">· {CATEGORY_LABELS[msg.category]}</span>
      </div>
      <h2 className="text-lg font-medium text-mash-text">{msg.title}</h2>
      <p className="text-sm text-mash-text-muted">
        من: {msg.senderName} · {formatWhen(msg.sentAt)}
      </p>
      <div className="text-sm text-mash-text-secondary leading-relaxed whitespace-pre-wrap border-t border-mash-border pt-4">
        {msg.body}
      </div>
    </div>
  )
}

function SentRow({ msg }: { msg: SentMessage }) {
  return (
    <div className="px-4 py-3 border-b border-mash-row-border">
      <div className="flex items-center gap-2 flex-wrap">
        <Send size={14} className="text-mash-text-muted" />
        <span className="text-sm text-mash-text">{msg.title}</span>
        <span className={`text-[11px] px-2 py-0.5 rounded-full ${priorityBadgeClass(msg.priority)}`}>
          {PRIORITY_LABELS[msg.priority]}
        </span>
      </div>
      <p className="text-xs text-mash-text-muted mt-1">
        {CHANNEL_LABELS[msg.channel]} · {msg.recipientCount} مستلم · {formatWhen(msg.sentAt)}
      </p>
      <p className="text-sm text-mash-text-secondary mt-2 line-clamp-2">{msg.body}</p>
    </div>
  )
}

export function MessagesPageClient({ role }: MessagesPageClientProps) {
  const { data: userId } = useCurrentUserId()
  const [tab, setTab] = useState<'inbox' | 'sent'>('inbox')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [composeMode, setComposeMode] = useState<ComposeMode | null>(null)

  const { data: inbox = [], isLoading } = useInbox(userId)
  const canSend = role === 'admin' || role === 'super_admin'
  const { data: sent = [] } = useSentMessages(userId, canSend && tab === 'sent')
  const { markRead, markAllRead } = useMessageMutations(userId)

  const selected = inbox.find((m) => m.recipientId === selectedId) ?? null

  function selectMessage(msg: InboxMessage) {
    setSelectedId(msg.recipientId)
    if (!msg.readAt) {
      void markRead.mutateAsync(msg.recipientId)
    }
  }

  const composeOptions: { mode: ComposeMode; label: string }[] =
    role === 'super_admin'
      ? [
          { mode: 'super_to_tenant', label: 'رسالة لشركة' },
          { mode: 'super_broadcast', label: 'إعلان عام' },
        ]
      : role === 'admin'
        ? [
            { mode: 'admin_to_employees', label: 'إشعار للكاشير' },
            { mode: 'admin_to_platform', label: 'رسالة للمنصة' },
          ]
        : []

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-medium text-mash-text">الرسائل والإشعارات</h1>
          <p className="text-xs text-mash-text-muted mt-0.5">
            {role === 'employee'
              ? 'إشعارات من إدارة الشركة'
              : role === 'super_admin'
                ? 'تواصل مع المشتركين واستقبال طلباتهم'
                : 'تواصل مع الكاشير وفريق المنصة'}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {inbox.some((m) => !m.readAt) && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void markAllRead.mutateAsync()}
              disabled={markAllRead.isPending}
            >
              تعليم الكل كمقروء
            </Button>
          )}
          {composeOptions.map((opt) => (
            <Button
              key={opt.mode}
              size="sm"
              className="gap-1.5"
              onClick={() => setComposeMode(opt.mode)}
            >
              <Plus size={16} />
              {opt.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex gap-2 border-b border-mash-border">
        <button
          type="button"
          onClick={() => setTab('inbox')}
          className={`px-4 py-2 text-sm min-h-11 ${
            tab === 'inbox'
              ? 'border-b-2 border-primary-600 text-primary-800 font-medium'
              : 'text-mash-text-secondary'
          }`}
        >
          الوارد ({inbox.filter((m) => !m.readAt).length} جديد)
        </button>
        {canSend && (
          <button
            type="button"
            onClick={() => setTab('sent')}
            className={`px-4 py-2 text-sm min-h-11 ${
              tab === 'sent'
                ? 'border-b-2 border-primary-600 text-primary-800 font-medium'
                : 'text-mash-text-secondary'
            }`}
          >
            المرسلة
          </button>
        )}
      </div>

      {tab === 'inbox' ? (
        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] rounded-xl border border-mash-border bg-mash-surface overflow-hidden min-h-[420px]">
          <div className="border-l border-mash-border max-h-[520px] overflow-y-auto">
            {isLoading && (
              <p className="p-4 text-sm text-mash-text-muted">جارِ التحميل...</p>
            )}
            {!isLoading && inbox.length === 0 && (
              <p className="p-4 text-sm text-mash-text-muted">لا توجد رسائل</p>
            )}
            {inbox.map((msg) => (
              <InboxRow
                key={msg.recipientId}
                msg={msg}
                selected={selectedId === msg.recipientId}
                onSelect={() => selectMessage(msg)}
              />
            ))}
          </div>
          <div className="min-h-[200px]">
            {selected ? (
              <MessageDetail msg={selected} />
            ) : (
              <div className="flex items-center justify-center h-full text-sm text-mash-text-muted p-8">
                اختر رسالة لعرضها
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-mash-border bg-mash-surface overflow-hidden">
          {sent.length === 0 ? (
            <p className="p-4 text-sm text-mash-text-muted">لم ترسل رسائل بعد</p>
          ) : (
            sent.map((msg) => <SentRow key={msg.id} msg={msg} />)
          )}
        </div>
      )}

      {composeMode && (
        <ComposeMessageModal
          open
          mode={composeMode}
          onClose={() => setComposeMode(null)}
        />
      )}
    </div>
  )
}
