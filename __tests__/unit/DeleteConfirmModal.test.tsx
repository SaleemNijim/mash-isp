import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { DeleteConfirmModal } from '@/components/shared/DeleteConfirmModal'

const toastError = vi.fn()

vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => toastError(...args),
  },
}))

describe('DeleteConfirmModal (§1.1 B8)', () => {
  const onClose = vi.fn()
  const onConfirm = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    onConfirm.mockReset()
    onClose.mockReset()
  })

  it('keeps confirm disabled until user types "حذف"', () => {
    render(
      <DeleteConfirmModal
        open
        onClose={onClose}
        onConfirm={onConfirm}
        recordName="مشترك تجريبي"
      />,
    )

    const confirmBtn = screen.getByRole('button', { name: 'تأكيد الحذف' })
    expect(confirmBtn).toBeDisabled()

    fireEvent.change(screen.getByPlaceholderText(/اكتب/), {
      target: { value: 'حذف' },
    })

    expect(confirmBtn).not.toBeDisabled()
  })

  it('shows toast.error and stays open on network failure', async () => {
    onConfirm.mockRejectedValueOnce(new Error('Network error'))

    render(
      <DeleteConfirmModal
        open
        onClose={onClose}
        onConfirm={onConfirm}
        recordName="دفعة بطاقات"
      />,
    )

    fireEvent.change(screen.getByPlaceholderText(/اكتب/), {
      target: { value: 'حذف' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'تأكيد الحذف' }))

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith(
        'فشلت عملية الحذف. يرجى المحاولة مرة أخرى.',
      )
    })

    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'تأكيد الحذف' })).toBeInTheDocument()
  })

  it('closes modal on successful delete', async () => {
    onConfirm.mockResolvedValueOnce(undefined)

    render(
      <DeleteConfirmModal
        open
        onClose={onClose}
        onConfirm={onConfirm}
        recordName="سجل آمن"
      />,
    )

    fireEvent.change(screen.getByPlaceholderText(/اكتب/), {
      target: { value: 'حذف' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'تأكيد الحذف' }))

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled()
    })

    expect(toastError).not.toHaveBeenCalled()
  })
})
