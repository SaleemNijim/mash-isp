import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { DeleteConfirmModal } from '@/components/shared/DeleteConfirmModal'

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

    const confirmBtn = screen.getByRole('button', { name: 'تأكيد الإخفاء' })
    expect(confirmBtn).toBeDisabled()

    fireEvent.change(screen.getByPlaceholderText('حذف'), {
      target: { value: 'حذف' },
    })

    expect(confirmBtn).not.toBeDisabled()
  })

  it('shows inline error and stays open on failure with a blocking message', async () => {
    onConfirm.mockRejectedValueOnce(
      new Error('لا يمكن الحذف — المنتج مُستخدم في مبيعات سابقة. يمكنك الاسترجاع فقط.'),
    )

    render(
      <DeleteConfirmModal
        open
        onClose={onClose}
        onConfirm={onConfirm}
        recordName="دفعة بطاقات"
      />,
    )

    fireEvent.change(screen.getByPlaceholderText('حذف'), {
      target: { value: 'حذف' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'تأكيد الإخفاء' }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'لا يمكن الحذف — المنتج مُستخدم في مبيعات سابقة. يمكنك الاسترجاع فقط.',
      )
    })

    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'تأكيد الإخفاء' })).toBeInTheDocument()
  })

  it('falls back to a generic inline error on unknown failure', async () => {
    onConfirm.mockRejectedValueOnce(new Error('delete_failed'))

    render(
      <DeleteConfirmModal
        open
        onClose={onClose}
        onConfirm={onConfirm}
        recordName="سجل آخر"
      />,
    )

    fireEvent.change(screen.getByPlaceholderText('حذف'), {
      target: { value: 'حذف' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'تأكيد الإخفاء' }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'فشلت عملية الحذف. يرجى المحاولة مرة أخرى.',
      )
    })

    expect(onClose).not.toHaveBeenCalled()
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

    fireEvent.change(screen.getByPlaceholderText('حذف'), {
      target: { value: 'حذف' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'تأكيد الإخفاء' }))

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled()
    })

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('uses permanent labels when isPermanent', () => {
    render(
      <DeleteConfirmModal
        open
        onClose={onClose}
        onConfirm={onConfirm}
        recordName="username@test"
        isPermanent
      />,
    )

    expect(screen.getByRole('button', { name: 'تأكيد الحذف النهائي' })).toBeDisabled()
  })
})
