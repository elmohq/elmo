import { ImageResponse } from 'next/og'

export const size = {
  width: 32,
  height: 32,
}
export const contentType = 'image/png'

async function loadGoogleFont(font: string, text: string) {
  const url = `https://fonts.googleapis.com/css2?family=${font}&text=${encodeURIComponent(text)}`
  const css = await (await fetch(url)).text()
  const resource = css.match(/src: url\((.+)\) format\('(opentype|truetype)'\)/)

  if (resource) {
    const response = await fetch(resource[1])
    if (response.status === 200) {
      return await response.arrayBuffer()
    }
  }

  throw new Error('failed to load font data')
}

export default async function Icon() {
  const text = 'e'

  return new ImageResponse(
    (
      <div
        style={{
          background: 'transparent',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
        }}
      >
        {/* Background rounded shape */}
        <div
          style={{
            position: 'absolute',
            background: '#f3f4f6', // light gray background
            width: '32px',
            height: '32px',
            borderRadius: '8px', // rounded corners
          }}
        />
        {/* Letter on top */}
        <div
          style={{
            fontSize: 42,
            fontFamily: 'Titan One',
            fontWeight: '400',
            top: "-14%",
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#2563eb', // blue-600 color
            position: 'relative',
            zIndex: 1,
          }}
        >
          {text}
        </div>
      </div>
    ),
    // ImageResponse options
    {
      ...size,
      fonts: [
        {
          name: 'Titan One',
          data: await loadGoogleFont('Titan+One', text),
          style: 'normal',
        },
      ],
    }
  )
}
