'use client'

import { useRef, useState, useCallback } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Button } from '@/components/ui/button'
import { Download } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ExcelTableProps {
  headers: string[]
  rows: string[][]
  /** Called when the user finishes editing a cell (double-click → edit → blur/Enter) */
  onCellChange?: (rowIndex: number, colIndex: number, value: string) => void
  /** Called when the user clicks "Export CSV" */
  onExport?: () => void
  /** Max height of the scrollable area in pixels (default 360) */
  maxHeight?: number
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * Virtualised preview table built on @tanstack/react-virtual.
 * Renders large Excel sheets without performance issues.
 * Supports double-click inline editing and CSV export.
 */
export function ExcelTable({
  headers,
  rows,
  onCellChange,
  onExport,
  maxHeight = 360,
}: ExcelTableProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [editCell, setEditCell] = useState<{ row: number; col: number } | null>(null)
  const [editValue, setEditValue] = useState('')

  // ── Virtualizer ─────────────────────────────────────────────────────────────
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => 35,
    overscan: 8,
  })

  const virtualItems = virtualizer.getVirtualItems()
  const totalSize = virtualizer.getTotalSize()

  // Padding rows technique: keeps <table> structure valid
  const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0
  const paddingBottom =
    virtualItems.length > 0
      ? totalSize - virtualItems[virtualItems.length - 1].end
      : 0

  // ── Cell editing ────────────────────────────────────────────────────────────
  const startEdit = (rowIdx: number, colIdx: number) => {
    setEditCell({ row: rowIdx, col: colIdx })
    setEditValue(rows[rowIdx]?.[colIdx] ?? '')
  }

  const commitEdit = useCallback(() => {
    if (editCell && onCellChange) {
      onCellChange(editCell.row, editCell.col, editValue)
    }
    setEditCell(null)
  }, [editCell, editValue, onCellChange])

  const cancelEdit = () => setEditCell(null)

  // ── Empty state ─────────────────────────────────────────────────────────────
  if (rows.length === 0) {
    return (
      <div className="flex items-center justify-center h-24 text-sm text-muted-foreground border border-border rounded-lg bg-muted/40">
        لا توجد بيانات للعرض
      </div>
    )
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-2">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground tabular-nums">
          {rows.length.toLocaleString('ar-EG')} صف &middot; {headers.length} عمود
          {onCellChange && (
            <span className="text-xs text-muted-foreground/70 mr-2">· انقر مرتين لتعديل خلية</span>
          )}
        </span>
        {onExport && (
          <Button
            variant="outline"
            size="sm"
            onClick={onExport}
            className="gap-1.5 h-7 px-2 text-xs"
          >
            <Download size={12} />
            تصدير CSV
          </Button>
        )}
      </div>

      {/* Scrollable virtual table */}
      <div
        ref={containerRef}
        className="overflow-auto border border-border rounded-lg"
        style={{ height: maxHeight }}
      >
        <table
          className="w-full text-xs border-collapse"
          style={{
            tableLayout: 'fixed',
            minWidth: `${40 + Math.max(headers.length, 1) * 130}px`,
          }}
        >
          <colgroup>
            <col style={{ width: 40 }} />
            {headers.map((_, i) => (
              <col key={i} style={{ width: 130 }} />
            ))}
          </colgroup>

          {/* Sticky header */}
          <thead className="sticky top-0 z-10 bg-muted/60 shadow-sm">
            <tr>
              <th className="px-2 py-2 text-center text-muted-foreground font-medium border-b border-border">
                #
              </th>
              {headers.map((h, i) => (
                <th
                  key={i}
                  className="px-3 py-2 text-right font-semibold text-foreground border-b border-border truncate"
                  title={h}
                >
                  {h || <span className="text-muted-foreground/50 font-normal italic">—</span>}
                </th>
              ))}
            </tr>
          </thead>

          {/* Virtual body */}
          <tbody>
            {/* Top spacer */}
            {paddingTop > 0 && (
              <tr aria-hidden>
                <td style={{ height: paddingTop }} colSpan={headers.length + 1} />
              </tr>
            )}

            {virtualItems.map((vItem) => {
              const rowData = rows[vItem.index] ?? []
              return (
                <tr
                  key={vItem.key}
                  style={{ height: vItem.size }}
                  className={
                    vItem.index % 2 === 0
                      ? 'bg-card hover:bg-mash-page'
                      : 'bg-muted/30 hover:bg-mash-page'
                  }
                >
                  {/* Row number */}
                  <td className="px-2 text-center text-muted-foreground border-b border-mash-row-border select-none">
                    {vItem.index + 1}
                  </td>

                  {/* Data cells */}
                  {headers.map((_, ci) => {
                    const isEditing =
                      editCell?.row === vItem.index && editCell?.col === ci
                    return (
                      <td
                        key={ci}
                        className="px-3 border-b border-mash-row-border overflow-hidden"
                        onDoubleClick={() =>
                          onCellChange ? startEdit(vItem.index, ci) : undefined
                        }
                      >
                        {isEditing ? (
                          <input
                            autoFocus
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={commitEdit}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') commitEdit()
                              if (e.key === 'Escape') cancelEdit()
                            }}
                            className="w-full bg-primary-50 border border-primary-400 rounded px-1 py-0.5 outline-none text-xs"
                          />
                        ) : (
                          <span className="block truncate text-foreground">
                            {rowData[ci] ?? ''}
                          </span>
                        )}
                      </td>
                    )
                  })}
                </tr>
              )
            })}

            {/* Bottom spacer */}
            {paddingBottom > 0 && (
              <tr aria-hidden>
                <td style={{ height: paddingBottom }} colSpan={headers.length + 1} />
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
