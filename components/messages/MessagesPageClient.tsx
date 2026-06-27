'use client'

import { useState } from 'react'
import { Plus, Mail, MailOpen, Send } from 'lucide-react'
import { toast } from 'sonner'
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

function SentRow({
  msg,
  selected,
  onSelect,
}: {
  msg: SentMessage
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full text-right px-4 py-3 border-b border-mash-row-border transition-colors ${
        selected ? 'bg-primary-50' : 'hover:bg-mash-page'
      }`}
    >
      <div className="flex items-start gap-2">
        <Send size={16} className="text-mash-text-muted shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-mash-text truncate">{msg.title}</span>
            <span className={`text-[11px] px-2 py-0.5 rounded-full ${priorityBadgeClass(msg.priority)}`}>
              {PRIORITY_LABELS[msg.priority]}
            </span>
          </div>
          <p className="text-xs text-mash-text-muted mt-0.5">
            {CHANNEL_LABELS[msg.channel]} · {msg.recipientCount} مستلم · {formatWhen(msg.sentAt)}
          </p>
          <p className="text-sm text-mash-text-secondary mt-1 line-clamp-2">{msg.body}</p>
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

function SentMessageDetail({ msg }: { msg: SentMessage }) {
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
        {msg.recipientCount} مستلم · {formatWhen(msg.sentAt)}
      </p>
      <div className="text-sm text-mash-text-secondary leading-relaxed whitespace-pre-wrap border-t border-mash-border pt-4">
        {msg.body}
      </div>
    </div>
  )
}

export function MessagesPageClient({ role }: MessagesPageClientProps) {
  const { data: userId } = useCurrentUserId()
  const [tab, setTab] = useState<'inbox' | 'sent'>('inbox')
  const [selectedInboxId, setSelectedInboxId] = useState<string | null>(null)
  const [selectedSentId, setSelectedSentId] = useState<string | null>(null)
  const [composeMode, setComposeMode] = useState<ComposeMode | null>(null)

  const { data: inbox = [], isLoading, isError, error: inboxError, refetch } = useInbox(userId)
  const canSend = role === 'admin' || role === 'super_admin'
  const {
    data: sent = [],
    isLoading: loadingSent,
    isError: sentError,
    error: sentLoadError,
    refetch: refetchSent,
  } = useSentMessages(userId, canSend)
  const { markRead, markAllRead } = useMessageMutations(userId)

  const selectedInbox = inbox.find((m) => m.recipientId === selectedInboxId) ?? null
  const selectedSent = sent.find((m) => m.id === selectedSentId) ?? null

  function handleMarkReadError(err: unknown) {
    const msg = err instanceof Error ? err.message : 'فشل تعليم الرسالة كمقروءة'
    toast.error(msg)
  }

  function selectInboxMessage(msg: InboxMessage) {
    setSelectedInboxId(msg.recipientId)
    if (!msg.readAt) {
      void markRead.mutateAsync(msg.recipientId).catch(handleMarkReadError)
    }
  }

  function selectSentMessage(msg: SentMessage) {
    setSelectedSentId(msg.id)
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
              onClick={() =>
                void markAllRead.mutateAsync().catch((err) => {
                  const msg =
                    err instanceof Error ? err.message : 'فشل تعليم الرسائل كمقروءة'
                  toast.error(msg)
                })
              }
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
            {isError && (
              <div className="flex flex-col items-center gap-2 p-4 text-center">
                <p className="text-sm text-destructive">
                  تعذّر تحميل الرسائل:{' '}
                  {inboxError instanceof Error ? inboxError.message : 'خطأ غير معروف'}
                </p>
                <Button variant="outline" size="sm" onClick={() => void refetch()}>
                  إعادة المحاولة
                </Button>
              </div>
            )}
            {!isLoading && !isError && inbox.length === 0 && (
              <p className="p-4 text-sm text-mash-text-muted">لا توجد رسائل</p>
            )}
            {inbox.map((msg) => (
              <InboxRow
                key={msg.recipientId}
                msg={msg}
                selected={selectedInboxId === msg.recipientId}
                onSelect={() => selectInboxMessage(msg)}
              />
            ))}
          </div>
          <div className="min-h-[200px]">
            {selectedInbox ? (
              <MessageDetail msg={selectedInbox} />
            ) : (
              <div className="flex items-center justify-center h-full text-sm text-mash-text-muted p-8">
                اختر رسالة لعرضها
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] rounded-xl border border-mash-border bg-mash-surface overflow-hidden min-h-[420px]">
          <div className="border-l border-mash-border max-h-[520px] overflow-y-auto">
            {loadingSent && (
              <p className="p-4 text-sm text-mash-text-muted">جارِ التحميل...</p>
            )}
            {sentError && (
              <div className="flex flex-col items-center gap-2 p-4 text-center">
                <p className="text-sm text-destructive">
                  تعذّر تحميل الرسائل المرسلة:{' '}
                  {sentLoadError instanceof Error ? sentLoadError.message : 'خطأ غير معروف'}
                </p>
                <Button variant="outline" size="sm" onClick={() => void refetchSent()}>
                  إعادة المحاولة
                </Button>
              </div>
            )}
            {!loadingSent && !sentError && sent.length === 0 && (
              <p className="p-4 text-sm text-mash-text-muted">لم ترسل رسائل بعد</p>
            )}
            {!sentError &&
              sent.map((msg) => (
                <SentRow
                  key={msg.id}
                  msg={msg}
                  selected={selectedSentId === msg.id}
                  onSelect={() => selectSentMessage(msg)}
                />
              ))}
          </div>
          <div className="min-h-[200px]">
            {selectedSent ? (
              <SentMessageDetail msg={selectedSent} />
            ) : (
              <div className="flex items-center justify-center h-full text-sm text-mash-text-muted p-8">
                اختر رسالة لعرض تفاصيلها
              </div>
            )}
          </div>
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
