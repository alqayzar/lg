export async function avatarToDataUrl(avatar: Blob | null): Promise<string | null> {
  if (!avatar) {
    return null
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener('error', () => reject(reader.error))
    reader.addEventListener('load', () => resolve(typeof reader.result === 'string' ? reader.result : null))
    reader.readAsDataURL(avatar)
  })
}
