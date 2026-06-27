'use client'

import { useState, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { RefreshCw, Trash2, ChevronDown, ChevronLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useDeleteConfirm } from '@/hooks/useDeleteConfirm'
import { PermissionGuard } from '@/components/permissions/PermissionGuard'
import { DeleteConfirmModal } from '@/components/shared/DeleteConfirmModal'
import { DataPanel } from '@/components/shared/DataPanel'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { collectCascadePortIds } from '@/lib/network/ports'

interface PortRow {
  id: string
  tenant_id: string
  name: string
  parent_port_id: string | null
  capacity: number | null
}

interface PortNode extends PortRow {
  children: PortNode[]
}

function buildTree(ports: PortRow[]): PortNode[] {
  const map = new Map<string, PortNode>()
  for (const p of ports) {
    map.set(p.id, { ...p, children: [] })
  }

  const roots: PortNode[] = []
  for (const p of ports) {
    const node = map.get(p.id)!
    if (p.parent_port_id && map.has(p.parent_port_id)) {
      map.get(p.parent_port_id)!.children.push(node)
    } else {
      roots.push(node)
    }
  }

  const sortNodes = (nodes: PortNode[]) => {
    nodes.sort((a, b) => a.name.localeCompare(b.name, 'ar'))
    for (const n of nodes) sortNodes(n.children)
  }
  sortNodes(roots)
  return roots
}

/** يجمع معرّف المنفذ وجميع أبنائه (عمقاً) — re-export للتوافق */
function collectCascadeIds(rootId: string, ports: PortRow[]): string[] {
  return collectCascadePortIds(rootId, ports)
}

export default function NetworkPortsPage() {
  return <NetworkPortsContent />
}

function NetworkPortsContent() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const { open, target, openModal, closeModal } = useDeleteConfirm()

  const {
    data: ports = [],
    isLoading,
    refetch,
  } = useQuery<PortRow[]>({
    queryKey: ['network_ports'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('network_ports')
        .select('id, tenant_id, name, parent_port_id, capacity')
        .eq('is_deleted', false)
        .order('name')
      if (error) throw error
      return data ?? []
    },
  })

  const tree = useMemo(() => buildTree(ports), [ports])

  const invalidateAll = () => {
    void refetch()
    void queryClient.invalidateQueries({ queryKey: ['network_ports'] })
  }

  const handleDeleteRequest = (node: PortNode) => {
    const childCount = collectCascadeIds(node.id, ports).length - 1
    openModal({
      id: node.id,
      table: 'network_ports',
      name: node.name,
      consequences:
        childCount > 0
          ? `حذف نهائي لهذا المنفذ و${childCount.toLocaleString('ar-EG')} منفذاً فرعياً وجميع الراوترات المرتبطة. باقي البورتات لن تتأثر.`
          : 'حذف نهائي للمنفذ وجميع الراوترات المرتبطة به. باقي البورتات لن تتأثر.',
    })
  }

  const handleDeleteConfirm = async () => {
    if (!target) return

    const cascadeIds = collectCascadeIds(target.id, ports)

    const res = await fetch('/api/network/wipe-port', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ port_id: target.id }),
    })
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    if (!res.ok) throw new Error(body.error ?? 'delete_failed')

    toast.success(
      cascadeIds.length > 1
        ? `تم حذف ${cascadeIds.length.toLocaleString('ar-EG')} منفذاً نهائياً`
        : 'تم الحذف نهائياً',
    )
    invalidateAll()
    void queryClient.invalidateQueries({ queryKey: ['network-ports'] })
    void queryClient.invalidateQueries({ queryKey: ['network_routers'] })
  }

  return (
    <div dir="rtl" className="space-y-4">
      <PageHeader
        title="منافذ الشبكة"
        description={`${ports.length.toLocaleString('ar-EG')} منفذ — عرض هرمي`}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => void refetch()}
            className="gap-1.5"
          >
            <RefreshCw size={14} />
            تحديث
          </Button>
        }
      />

      <DataPanel noPadding>
        {isLoading && (
          <p className="py-12 text-center text-sm text-muted-foreground">
            جارٍ التحميل…
          </p>
        )}

        {!isLoading && tree.length === 0 && (
          <p className="py-12 text-center text-sm text-muted-foreground">
            لا توجد منافذ
          </p>
        )}

        {!isLoading && tree.length > 0 && (
          <ul className="divide-y divide-border">
            {tree.map((node) => (
              <PortTreeNode
                key={node.id}
                node={node}
                depth={0}
                onDelete={handleDeleteRequest}
              />
            ))}
          </ul>
        )}
      </DataPanel>

      <DeleteConfirmModal
        open={open}
        onClose={closeModal}
        onConfirm={handleDeleteConfirm}
        recordName={target?.name ?? ''}
        isPermanent
        consequences={target?.consequences}
      />
    </div>
  )
}

function PortTreeNode({
  node,
  depth,
  onDelete,
}: {
  node: PortNode
  depth: number
  onDelete: (node: PortNode) => void
}) {
  const [expanded, setExpanded] = useState(true)
  const hasChildren = node.children.length > 0

  return (
    <li>
      <div
        className="flex items-center gap-2 py-2.5 px-3 hover:bg-mash-page"
        style={{ paddingRight: `${depth * 1.25 + 0.75}rem` }}
      >
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="shrink-0 p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
          disabled={!hasChildren}
          aria-label={expanded ? 'طي' : 'توسيع'}
        >
          {hasChildren ? (
            expanded ? <ChevronDown size={16} /> : <ChevronLeft size={16} />
          ) : (
            <span className="inline-block w-4" />
          )}
        </button>

        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate">{node.name}</p>
          {node.capacity != null && (
            <p className="text-xs text-muted-foreground">
              السعة: {node.capacity.toLocaleString('ar-EG')}
              {hasChildren &&
                ` · ${node.children.length.toLocaleString('ar-EG')} فرعي`}
            </p>
          )}
        </div>

        <PermissionGuard permission="delete_records">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-destructive hover:text-destructive gap-1 shrink-0"
            onClick={() => onDelete(node)}
          >
            <Trash2 size={12} />
            حذف
          </Button>
        </PermissionGuard>
      </div>

      {hasChildren && expanded && (
        <ul>
          {node.children.map((child) => (
            <PortTreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              onDelete={onDelete}
            />
          ))}
        </ul>
      )}
    </li>
  )
}
