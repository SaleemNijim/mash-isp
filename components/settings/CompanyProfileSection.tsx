'use client'

import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Building2, Upload, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useTenant, type Tenant } from '@/hooks/useTenant'
import { formatProfileError, saveTenantProfile, uploadTenantLogo } from '@/lib/tenant/profile'
import { DataPanel } from '@/components/shared/DataPanel'
import { TenantBrand } from '@/components/shared/TenantBrand'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function CompanyProfileSection() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const { data: tenant } = useTenant()
  const fileRef = useRef<HTMLInputElement>(null)

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [removeLogo, setRemoveLogo] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!tenant) return
    setName(tenant.name)
    setPhone(tenant.phone ?? '')
    setLogoPreview(tenant.logo_url)
    setLogoFile(null)
    setRemoveLogo(false)
  }, [tenant?.id, tenant?.name, tenant?.phone, tenant?.logo_url])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!tenant?.id) return

    if (!name.trim()) {
      toast.error('اسم الشركة مطلوب')
      return
    }

    setSaving(true)
    try {
      await saveTenantProfile(supabase, {
        name: name.trim(),
        phone: phone.trim() || null,
        ...(removeLogo ? { logo_url: '' } : {}),
      })

      if (logoFile && !removeLogo) {
        const logoUrl = await uploadTenantLogo(supabase, tenant.id, logoFile)
        await saveTenantProfile(supabase, { logo_url: logoUrl })
        setLogoPreview(logoUrl)
      } else if (removeLogo) {
        setLogoPreview(null)
      }

      toast.success('تم حفظ بيانات الشركة')
      setLogoFile(null)
      setRemoveLogo(false)
      queryClient.setQueryData<Tenant | null>(['tenant'], (prev) =>
        prev
          ? {
              ...prev,
              name: name.trim(),
              phone: phone.trim() || null,
              logo_url: removeLogo ? null : (logoPreview ?? prev.logo_url),
            }
          : prev,
      )
      await queryClient.invalidateQueries({ queryKey: ['tenant'] })
    } catch (err) {
      toast.error(formatProfileError(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <DataPanel className="p-5 h-full">
      <div className="flex items-center gap-2 mb-4">
        <Building2 size={18} className="text-primary" />
        <h2 className="font-semibold text-lg">بيانات الشركة</h2>
      </div>

      <form onSubmit={(e) => void handleSave(e)} className="space-y-5">
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="company-name">اسم الشركة *</Label>
              <Input
                id="company-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={saving}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="company-phone">هاتف الشركة</Label>
              <Input
                id="company-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={saving}
                dir="ltr"
                className="text-left tabular-nums"
              />
            </div>

            <div className="space-y-2">
              <Label>شعار الشركة</Label>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    if (file.size > 2 * 1024 * 1024) {
                      toast.error('حجم الملف يجب أن يكون أقل من 2 ميجابايت')
                      return
                    }
                    setLogoFile(file)
                    setRemoveLogo(false)
                    setLogoPreview(URL.createObjectURL(file))
                    e.target.value = ''
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  disabled={saving}
                  onClick={() => fileRef.current?.click()}
                >
                  <Upload size={14} />
                  رفع شعار
                </Button>
                {(logoPreview || tenant?.logo_url) && !removeLogo && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 text-destructive"
                    disabled={saving}
                    onClick={() => {
                      setRemoveLogo(true)
                      setLogoFile(null)
                      setLogoPreview(null)
                    }}
                  >
                    <Trash2 size={14} />
                    إزالة الشعار
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">PNG أو JPG — حتى 2 ميجابايت</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label>معاينة الشعار في القائمة</Label>
            <div className="rounded-lg border border-border bg-mash-surface p-4">
              <TenantBrand
                name={name.trim() || 'اسم الشركة'}
                logoUrl={removeLogo ? null : logoPreview}
              />
            </div>
          </div>
        </div>

        <Button type="submit" disabled={saving} size="lg">
          {saving ? 'جارٍ الحفظ…' : 'حفظ بيانات الشركة'}
        </Button>
      </form>
    </DataPanel>
  )
}
