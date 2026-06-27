export type NetworkViewFilter = 'all' | `port:${string}`

export interface NetworkPortRow {
  id: string
  name: string
  parent_port_id: string | null
  capacity: number | null
}

export function portViewFilter(portId: string): NetworkViewFilter {
  return `port:${portId}`
}

export function parseNetworkViewFilter(value: NetworkViewFilter): {
  mode: 'all' | 'port'
  portId?: string
} {
  if (value === 'all') return { mode: 'all' }
  if (value.startsWith('port:')) {
    return { mode: 'port', portId: value.slice(5) }
  }
  return { mode: 'all' }
}

/** يجمع معرّف المنفذ وجميع أبنائه (عمقاً) */
export function collectCascadePortIds(
  rootId: string,
  ports: Pick<NetworkPortRow, 'id' | 'parent_port_id'>[],
): string[] {
  const childrenByParent = new Map<string, typeof ports>()
  for (const p of ports) {
    if (!p.parent_port_id) continue
    const siblings = childrenByParent.get(p.parent_port_id) ?? []
    siblings.push(p)
    childrenByParent.set(p.parent_port_id, siblings)
  }

  const ids: string[] = [rootId]
  const stack = [rootId]
  while (stack.length > 0) {
    const current = stack.pop()!
    for (const child of childrenByParent.get(current) ?? []) {
      ids.push(child.id)
      stack.push(child.id)
    }
  }
  return ids
}

/** @deprecated — للتوافق مع قوالب Excel القديمة فقط */
export const NETWORK_PORT_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const

/** @deprecated */
export type NetworkPortNumber = (typeof NETWORK_PORT_NUMBERS)[number]

/** @deprecated */
export function networkPortLabel(n: NetworkPortNumber): string {
  return `Port ${n}`
}

/** @deprecated */
export type NetworkViewFilterLegacy = NetworkViewFilter | 'bypassed'
