function supportsWebp(): boolean {
  const canvas = document.createElement('canvas')
  return canvas.toDataURL('image/webp').startsWith('data:image/webp')
}

export async function compressAvatarImage(image: File): Promise<File> {
  const { default: imageCompression } = await import('browser-image-compression')

  return imageCompression(image, {
    fileType: supportsWebp() ? 'image/webp' : 'image/jpeg',
    initialQuality: 0.8,
    maxSizeMB: 0.3,
    maxWidthOrHeight: 512,
    preserveExif: false,
    useWebWorker: false,
  })
}
