import { ImageResponse } from 'next/og'

// Image metadata
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

// Image generation
export default async function Icon() {
  const text = 'e'

  return new ImageResponse(
    (
      <div
        style={{
          fontSize: 42,
          fontFamily: 'Titan One',
          fontWeight: '400',
          background: 'transparent',
          width: '100%',
          height: '100%',
          marginTop: "-14%",
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#93c5fd', // blue-300 color
        }}
      >
        {text}
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
