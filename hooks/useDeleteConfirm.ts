import { create } from 'zustand'

export interface DeleteTarget {
  /** Row identifier */
  id: string
  /** Table name (must be in SOFT_DELETE_WHITELIST at the API level) */
  table: string
  /** Human-readable label shown in the modal header */
  name: string
  /** Optional description of downstream effects */
  consequences?: string
}

interface DeleteConfirmState {
  open: boolean
  target: DeleteTarget | null
  /** Opens the confirmation modal for the given record */
  openModal: (target: DeleteTarget) => void
  /** Closes the modal and clears the target */
  closeModal: () => void
}

/**
 * Thin Zustand slice that drives DeleteConfirmModal visibility.
 *
 * Usage:
 *   const { openModal, closeModal, open, target } = useDeleteConfirm()
 *   <DeleteConfirmModal open={open} onClose={closeModal} ... />
 */
export const useDeleteConfirm = create<DeleteConfirmState>((set) => ({
  open:   false,
  target: null,

  openModal:  (target) => set({ open: true, target }),
  closeModal: ()       => set({ open: false, target: null }),
}))
