import { ImageResponse } from 'next/og'

export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0F6E56',
          borderRadius: 36,
          color: '#FFFFFF',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <div style={{ fontSize: 88, fontWeight: 700, lineHeight: 1 }}>M</div>
        <div style={{ fontSize: 22, fontWeight: 600, marginTop: 4, opacity: 0.9 }}>
          ISP
        </div>
      </div>
    ),
    { ...size },
  )
}
