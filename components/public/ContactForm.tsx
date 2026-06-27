'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'

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
      <div className="space-y-2">
        <Label htmlFor="name">
          الاسم الكامل <span className="text-destructive">*</span>
        </Label>
        <Input
          id="name"
          name="name"
          type="text"
          required
          placeholder="محمد أحمد"
          value={form.name}
          onChange={handleChange}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">
          البريد الإلكتروني <span className="text-destructive">*</span>
        </Label>
        <Input
          id="email"
          name="email"
          type="email"
          required
          placeholder="you@company.com"
          dir="ltr"
          value={form.email}
          onChange={handleChange}
          className="text-right"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="message">
          الرسالة <span className="text-destructive">*</span>
        </Label>
        <textarea
          id="message"
          name="message"
          required
          rows={5}
          placeholder="أخبرنا كيف يمكننا مساعدتك..."
          value={form.message}
          onChange={handleChange}
          className="w-full resize-none rounded-xl border border-input bg-white px-3 py-2.5 text-sm transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
        />
      </div>

      <Button type="submit" disabled={status === 'sending'} className="mash-btn-primary w-full">
        {status === 'sending' ? 'جارِ الإرسال...' : 'أرسل رسالة'}
      </Button>

      {status === 'sent' && (
        <p className="text-center text-sm font-medium text-[#27500A]">
          تم فتح تطبيق البريد الإلكتروني بالرسالة. سنرد في أقرب وقت.
        </p>
      )}
      {status === 'error' && (
        <p className="text-center text-sm font-medium text-destructive">
          حدث خطأ، يرجى المحاولة مجدداً أو التواصل عبر واتساب.
        </p>
      )}
    </form>
  )
}
