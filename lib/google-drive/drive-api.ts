import crypto from 'crypto'

const DRIVE_API = 'https://www.googleapis.com/drive/v3'
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3'
const EXCEL_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const FOLDER_MIME = 'application/vnd.google-apps.folder'

async function parseDriveResponse<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    const message =
      typeof data?.error?.message === 'string'
        ? data.error.message
        : typeof data?.error === 'string'
          ? data.error
          : 'Google Drive request failed'
    throw new Error(message)
  }
  return data as T
}

function escapeDriveQuery(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

function driveHeaders(accessToken: string, contentType = 'application/json') {
  return {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': contentType,
  }
}

export async function ensureDriveFolder(options: {
  accessToken: string
  name: string
  parentId?: string | null
}): Promise<string> {
  const { accessToken, name, parentId } = options
  const parentQuery = parentId ? ` and '${escapeDriveQuery(parentId)}' in parents` : ''
  const params = new URLSearchParams({
    q: `name = '${escapeDriveQuery(name)}' and mimeType = '${FOLDER_MIME}' and trashed = false${parentQuery}`,
    fields: 'files(id,name)',
    spaces: 'drive',
    pageSize: '1',
  })

  const existing = await parseDriveResponse<{ files?: { id: string }[] }>(
    await fetch(`${DRIVE_API}/files?${params.toString()}`, {
      headers: driveHeaders(accessToken),
    }),
  )

  const existingId = existing.files?.[0]?.id
  if (existingId) return existingId

  const metadata: Record<string, unknown> = {
    name,
    mimeType: FOLDER_MIME,
  }
  if (parentId) metadata.parents = [parentId]

  const created = await parseDriveResponse<{ id: string }>(
    await fetch(`${DRIVE_API}/files`, {
      method: 'POST',
      headers: driveHeaders(accessToken),
      body: JSON.stringify(metadata),
    }),
  )

  return created.id
}

export async function findExcelFileInFolder(options: {
  accessToken: string
  folderId: string
  fileName: string
}): Promise<string | null> {
  const ids = await findExcelFileIdsInFolder(options)
  return ids[0] ?? null
}

export async function findExcelFileIdsInFolder(options: {
  accessToken: string
  folderId: string
  fileName: string
}): Promise<string[]> {
  const { accessToken, folderId, fileName } = options
  const params = new URLSearchParams({
    q: `name = '${escapeDriveQuery(fileName)}' and '${escapeDriveQuery(folderId)}' in parents and mimeType = '${EXCEL_MIME}' and trashed = false`,
    fields: 'files(id,name)',
    spaces: 'drive',
    pageSize: '20',
  })

  const existing = await parseDriveResponse<{ files?: { id: string }[] }>(
    await fetch(`${DRIVE_API}/files?${params.toString()}`, {
      headers: driveHeaders(accessToken),
    }),
  )

  return (existing.files ?? []).map((file) => file.id)
}

async function deleteDuplicateExcelFiles(options: {
  accessToken: string
  fileIds: string[]
  keepId: string
}): Promise<void> {
  for (const fileId of options.fileIds) {
    if (fileId === options.keepId) continue
    await deleteDriveFile({ accessToken: options.accessToken, fileId })
  }
}

async function uploadExcelMultipart(options: {
  accessToken: string
  fileId: string | null
  folderId: string
  fileName: string
  buffer: Buffer
}): Promise<{ id: string; status: number }> {
  const { accessToken, fileId, folderId, fileName, buffer } = options
  const metadata = {
    name: fileName,
    mimeType: EXCEL_MIME,
    ...(fileId ? {} : { parents: [folderId] }),
  }

  const boundary = `mash_isp_${crypto.randomUUID()}`
  const delimiter = `--${boundary}`
  const closeDelimiter = `--${boundary}--`
  const body = Buffer.concat([
    Buffer.from(
      `${delimiter}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
    ),
    Buffer.from(`${delimiter}\r\nContent-Type: ${EXCEL_MIME}\r\n\r\n`),
    buffer,
    Buffer.from(`\r\n${closeDelimiter}\r\n`),
  ])

  const url = fileId
    ? `${DRIVE_UPLOAD_API}/files/${fileId}?uploadType=multipart&fields=id`
    : `${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id`

  const response = await fetch(url, {
    method: fileId ? 'PATCH' : 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
  })

  const data = await response.json().catch(() => null)
  if (!response.ok) {
    const message =
      typeof data?.error?.message === 'string'
        ? data.error.message
        : typeof data?.error === 'string'
          ? data.error
          : 'Google Drive request failed'
    const error = new Error(message) as Error & { status?: number }
    error.status = response.status
    throw error
  }

  return { id: (data as { id: string }).id, status: response.status }
}

export async function uploadExcelFile(options: {
  accessToken: string
  fileId?: string | null
  folderId: string
  fileName: string
  buffer: Buffer
}): Promise<string> {
  const { accessToken, folderId, fileName, buffer } = options
  let targetFileId = options.fileId ?? null
  let duplicateIds: string[] = []

  if (!targetFileId) {
    duplicateIds = await findExcelFileIdsInFolder({ accessToken, folderId, fileName })
    targetFileId = duplicateIds[0] ?? null
  }

  try {
    const uploaded = await uploadExcelMultipart({
      accessToken,
      fileId: targetFileId,
      folderId,
      fileName,
      buffer,
    })
    if (duplicateIds.length > 1) {
      await deleteDuplicateExcelFiles({
        accessToken,
        fileIds: duplicateIds,
        keepId: uploaded.id,
      })
    }
    return uploaded.id
  } catch (error) {
    const status = (error as Error & { status?: number }).status
    if (targetFileId && status === 404) {
      duplicateIds = await findExcelFileIdsInFolder({ accessToken, folderId, fileName })
      const retryFileId = duplicateIds[0] ?? null
      const uploaded = await uploadExcelMultipart({
        accessToken,
        fileId: retryFileId,
        folderId,
        fileName,
        buffer,
      })
      if (duplicateIds.length > 1) {
        await deleteDuplicateExcelFiles({
          accessToken,
          fileIds: duplicateIds,
          keepId: uploaded.id,
        })
      }
      return uploaded.id
    }

    throw error
  }
}

export async function deleteDriveFile(options: {
  accessToken: string
  fileId: string
}): Promise<void> {
  const response = await fetch(`${DRIVE_API}/files/${options.fileId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${options.accessToken}`,
    },
  })

  if (!response.ok && response.status !== 404) {
    const data = await response.json().catch(() => null)
    throw new Error(
      typeof data?.error?.message === 'string'
        ? data.error.message
        : 'Google Drive delete failed',
    )
  }
}
