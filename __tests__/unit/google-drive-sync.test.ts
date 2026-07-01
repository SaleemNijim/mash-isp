import { describe, expect, it, vi, afterEach } from 'vitest'
import { findExcelFileInFolder, uploadExcelFile } from '@/lib/google-drive/drive-api'
import { normalizeFileIds } from '@/lib/google-drive/sync'
import { getMonthlyRenewalsFileName } from '@/lib/excel/monthly-renewals-export'

describe('normalizeFileIds', () => {
  it('يعيد كائناً فارغاً عند null أو undefined', () => {
    expect(normalizeFileIds(null)).toEqual({})
    expect(normalizeFileIds(undefined)).toEqual({})
  })

  it('يفك JSON string المخزّن كسلسلة', () => {
    expect(normalizeFileIds('{"distributors":"abc123"}')).toEqual({ distributors: 'abc123' })
  })

  it('ينسخ كائن file_ids كما هو', () => {
    const source = { distributors: 'abc123', 'renewals:2026-07': 'def456' }
    expect(normalizeFileIds(source)).toEqual(source)
    expect(normalizeFileIds(source)).not.toBe(source)
  })
})

describe('getMonthlyRenewalsFileName', () => {
  it('ينتج ملفاً منفصلاً لكل شهر', () => {
    expect(getMonthlyRenewalsFileName('2026-07')).toBe('سجل_التجديد_07-2026.xlsx')
    expect(getMonthlyRenewalsFileName('2026-08')).toBe('سجل_التجديد_08-2026.xlsx')
  })
})

describe('uploadExcelFile', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('يحدّث ملفاً موجوداً عبر fileId بدلاً من إنشاء نسخة جديدة', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/upload/drive/v3/files/existing-id')) {
        expect(init?.method).toBe('PATCH')
        return new Response(JSON.stringify({ id: 'existing-id' }), { status: 200 })
      }
      throw new Error(`Unexpected fetch: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const id = await uploadExcelFile({
      accessToken: 'token',
      folderId: 'folder-id',
      fileId: 'existing-id',
      fileName: 'الموزعون.xlsx',
      buffer: Buffer.from('test'),
    })

    expect(id).toBe('existing-id')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('يبحث بالاسم ويحدّث الملف عند غياب fileId', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/drive/v3/files?') && init?.method !== 'PATCH' && init?.method !== 'POST') {
        return new Response(JSON.stringify({ files: [{ id: 'found-by-name', name: 'Port 2.xlsx' }] }), {
          status: 200,
        })
      }
      if (url.includes('/upload/drive/v3/files/found-by-name')) {
        expect(init?.method).toBe('PATCH')
        return new Response(JSON.stringify({ id: 'found-by-name' }), { status: 200 })
      }
      throw new Error(`Unexpected fetch: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const id = await uploadExcelFile({
      accessToken: 'token',
      folderId: 'folder-id',
      fileName: 'Port 2.xlsx',
      buffer: Buffer.from('test'),
    })

    expect(id).toBe('found-by-name')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})

describe('findExcelFileInFolder', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('يعيد null عند عدم وجود ملف مطابق', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ files: [] }), { status: 200 })),
    )

    const id = await findExcelFileInFolder({
      accessToken: 'token',
      folderId: 'folder-id',
      fileName: 'الموزعون.xlsx',
    })

    expect(id).toBeNull()
  })
})
