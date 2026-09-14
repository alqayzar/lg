export function createEmojiImage(emoji: string): Promise<Blob> {
  const size = 512
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size

  const context = canvas.getContext('2d')
  if (!context) return Promise.reject(new Error('Canvas is unavailable.'))

  context.font = `${size * 0.5}px sans-serif`
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText(emoji, size / 2, size / 2 + size * 0.05)

  return new Promise((resolve, reject) => {
    canvas.toBlob((image) => {
      if (image) resolve(image)
      else reject(new Error('Unable to create the emoji image.'))
    }, 'image/png')
  })
}
