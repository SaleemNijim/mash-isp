'use client'

import { useState } from 'react'

export function ContactForm() {
  const [form, setForm] = useState({ name: '', email: '', message: '' })
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('sending')

    try {
      const mailtoLink = `mailto:info@mashisp.com?subject=رسالة من ${encodeURIComponent(form.name)}&body=${encodeURIComponent(
        `الاسم: ${form.name}\nالبريد: ${form.email}\n\nالرسالة:\n${form.message}`
      )}`
      window.location.href = mailtoLink
      setStatus('sent')
      setForm({ name: '', email: '', message: '' })
    } catch {
      setStatus('error')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-1.5">
        <label htmlFor="name" className="block text-sm font-medium text-mash-text">
          الاسم الكامل <span className="text-destructive">*</span>
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          placeholder="محمد أحمد"
          value={form.name}
          onChange={handleChange}
          className="w-full min-h-11 rounded-lg border border-mash-border bg-mash-surface px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 transition-colors"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="email" className="block text-sm font-medium text-mash-text">
          البريد الإلكتروني <span className="text-destructive">*</span>
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          placeholder="you@company.com"
          dir="ltr"
          value={form.email}
          onChange={handleChange}
          className="w-full min-h-11 rounded-lg border border-mash-border bg-mash-surface px-3 text-sm text-right focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 transition-colors"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="message" className="block text-sm font-medium text-mash-text">
          الرسالة <span className="text-destructive">*</span>
        </label>
        <textarea
          id="message"
          name="message"
          required
          rows={5}
          placeholder="أخبرنا كيف يمكننا مساعدتك..."
          value={form.message}
          onChange={handleChange}
          className="w-full rounded-lg border border-mash-border bg-mash-surface px-3 py-2.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 transition-colors resize-none"
        />
      </div>

      <button
        type="submit"
        disabled={status === 'sending'}
        className="mash-btn-primary w-full disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {status === 'sending' ? 'جارِ الإرسال...' : 'أرسل رسالة'}
      </button>

      {status === 'sent' && (
        <p className="text-center text-sm text-mash-success-text font-medium">
          تم فتح تطبيق البريد الإلكتروني بالرسالة. سنرد في أقرب وقت.
        </p>
      )}
      {status === 'error' && (
        <p className="text-center text-sm text-destructive font-medium">
          حدث خطأ، يرجى المحاولة مجدداً أو التواصل عبر واتساب.
        </p>
      )}
    </form>
  )
}
