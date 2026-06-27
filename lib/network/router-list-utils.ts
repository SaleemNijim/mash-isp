/** ترتيب IP رقمي (octet-by-octet) — ليس ترتيباً نصياً */
export function parseIpOctets(ip: string | null | undefined): number[] | null {
  if (!ip?.trim()) return null
  const parts = ip.trim().split('.')
  if (parts.length !== 4) return null
  const octets = parts.map((p) => Number.parseInt(p, 10))
  if (octets.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return null
  return octets
}

export function compareIpAddress(
  a: string | null | undefined,
  b: string | null | undefined,
): number {
  const ao = parseIpOctets(a)
  const bo = parseIpOctets(b)
  if (ao && bo) {
    for (let i = 0; i < 4; i++) {
      if (ao[i] !== bo[i]) return ao[i] - bo[i]
    }
    return 0
  }
  if (ao && !bo) return -1
  if (!ao && bo) return 1
  return String(a ?? '').localeCompare(String(b ?? ''), 'ar')
}

export function normalizeMacForSearch(value: string): string {
  return value.replace(/[^a-f0-9]/gi, '').toLowerCase()
}

export interface NetworkRouterSearchRow {
  name?: string | null
  model?: string | null
  mac_address?: string | null
  ip_address?: string | null
  location?: string | null
  device_type?: string | null
  phone?: string | null
  notes?: string | null
}

/** بحث محلي — MAC بدون نقط، IP جزئي، SSID، موقع، كود… */
export function matchesNetworkRouterSearch(
  row: NetworkRouterSearchRow,
  rawQuery: string,
): boolean {
  const q = rawQuery.trim().toLowerCase()
  if (!q) return true

  const textFields = [
    row.name,
    row.model,
    row.ip_address,
    row.location,
    row.device_type,
    row.phone,
    row.notes,
    row.mac_address,
  ]

  if (textFields.some((f) => f && String(f).toLowerCase().includes(q))) return true

  const qMac = normalizeMacForSearch(q)
  if (qMac.length >= 2 && row.mac_address) {
    const macNorm = normalizeMacForSearch(row.mac_address)
    if (macNorm.includes(qMac)) return true
  }

  // SSID suffix: "1.10" أو ".10"
  const ssidSuffix = q.replace(/^\.+/, '')
  if (ssidSuffix && row.name?.toLowerCase().includes(ssidSuffix)) return true

  return false
}
