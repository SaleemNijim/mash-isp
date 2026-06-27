import { decryptToken, encryptToken } from '@/lib/google-drive/crypto'

export const GOOGLE_DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file'
const GOOGLE_EMAIL_SCOPE = 'https://www.googleapis.com/auth/userinfo.email'
const GOOGLE_OPENID_SCOPE = 'openid'

export interface GoogleTokenResponse {
  access_token: string
  expires_in?: number
  refresh_token?: string
  scope?: string
  token_type?: string
}

export interface DriveSyncTokens {
  access_token_encrypted: string | null
  refresh_token_encrypted: string | null
  token_expires_at: string | null
}

export type GoogleDriveConfigError =
  | 'missing_google_credentials'
  | 'missing_app_url'

export function getGoogleDriveConfigError(): GoogleDriveConfigError | null {
  if (!process.env.GOOGLE_DRIVE_CLIENT_ID || !process.env.GOOGLE_DRIVE_CLIENT_SECRET) {
    return 'missing_google_credentials'
  }
  return null
}

function resolveAppOrigin(fallbackOrigin?: string): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL ?? process.env.VERCEL_URL
  if (configured) {
    return configured.startsWith('http') ? configured.replace(/\/$/, '') : `https://${configured}`
  }
  if (fallbackOrigin) return fallbackOrigin.replace(/\/$/, '')
  throw new Error('Missing NEXT_PUBLIC_APP_URL')
}

function getGoogleClientConfig(redirectUri: string) {
  const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new Error('Missing GOOGLE_DRIVE_CLIENT_ID or GOOGLE_DRIVE_CLIENT_SECRET')
  }

  return { clientId, clientSecret, redirectUri }
}

export function createGoogleAuthUrl(state: string, fallbackOrigin?: string): string {
  const redirectUri = `${resolveAppOrigin(fallbackOrigin)}/api/google-drive/callback`
  const { clientId, redirectUri: uri } = getGoogleClientConfig(redirectUri)
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: uri,
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    scope: [GOOGLE_OPENID_SCOPE, GOOGLE_EMAIL_SCOPE, GOOGLE_DRIVE_FILE_SCOPE].join(' '),
    state,
  })

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}

async function parseGoogleResponse<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    const message =
      typeof data?.error_description === 'string'
        ? data.error_description
        : typeof data?.error === 'string'
          ? data.error
          : 'Google request failed'
    throw new Error(message)
  }
  return data as T
}

export async function exchangeCodeForTokens(
  code: string,
  fallbackOrigin?: string,
): Promise<GoogleTokenResponse> {
  const redirectUri = `${resolveAppOrigin(fallbackOrigin)}/api/google-drive/callback`
  const { clientId, clientSecret, redirectUri: uri } = getGoogleClientConfig(redirectUri)
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: uri,
      grant_type: 'authorization_code',
    }),
  })

  return parseGoogleResponse<GoogleTokenResponse>(response)
}

export async function refreshAccessToken(refreshToken: string): Promise<GoogleTokenResponse> {
  const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new Error('Missing GOOGLE_DRIVE_CLIENT_ID or GOOGLE_DRIVE_CLIENT_SECRET')
  }
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })

  return parseGoogleResponse<GoogleTokenResponse>(response)
}

export function encryptTokenPayload(tokens: {
  accessToken: string
  refreshToken?: string | null
  expiresIn?: number
}): DriveSyncTokens {
  const expiresAt = tokens.expiresIn
    ? new Date(Date.now() + tokens.expiresIn * 1000).toISOString()
    : null

  return {
    access_token_encrypted: encryptToken(tokens.accessToken),
    refresh_token_encrypted: tokens.refreshToken ? encryptToken(tokens.refreshToken) : null,
    token_expires_at: expiresAt,
  }
}

export async function getValidAccessToken(record: DriveSyncTokens): Promise<{
  accessToken: string
  refreshed: DriveSyncTokens | null
}> {
  if (!record.access_token_encrypted) {
    throw new Error('Google Drive is not connected')
  }

  const expiresAt = record.token_expires_at ? new Date(record.token_expires_at).getTime() : 0
  const hasValidAccessToken = expiresAt > Date.now() + 60_000
  if (hasValidAccessToken) {
    return { accessToken: decryptToken(record.access_token_encrypted), refreshed: null }
  }

  if (!record.refresh_token_encrypted) {
    throw new Error('Google refresh token is missing')
  }

  const refreshToken = decryptToken(record.refresh_token_encrypted)
  const refreshed = await refreshAccessToken(refreshToken)
  const encrypted = encryptTokenPayload({
    accessToken: refreshed.access_token,
    refreshToken,
    expiresIn: refreshed.expires_in,
  })

  return { accessToken: refreshed.access_token, refreshed: encrypted }
}

export async function getGoogleAccountEmail(accessToken: string): Promise<string | null> {
  const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const data = await parseGoogleResponse<{ email?: string }>(response)
  return data.email ?? null
}
