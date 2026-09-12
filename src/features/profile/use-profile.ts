import { useEffect, useRef, useState } from 'react'
import { loadProfile, saveProfile } from '@/lib/profile'

export function useProfile() {
  const [name, setName] = useState('')
  const [avatar, setAvatar] = useState<Blob | null>(null)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [isLoaded, setIsLoaded] = useState(false)
  const hasEditedProfile = useRef(false)

  useEffect(() => {
    async function restoreProfile() {
      const savedProfile = await loadProfile()

      if (savedProfile && !hasEditedProfile.current) {
        setName(savedProfile.name)
        setAvatar(savedProfile.avatar)
      }

      setIsLoaded(true)
    }

    void restoreProfile()
  }, [])

  useEffect(() => {
    if (!avatar) {
      setAvatarUrl(null)
      return
    }

    const nextAvatarUrl = URL.createObjectURL(avatar)
    setAvatarUrl(nextAvatarUrl)

    return () => URL.revokeObjectURL(nextAvatarUrl)
  }, [avatar])

  function updateName(nextName: string) {
    hasEditedProfile.current = true
    setName(nextName)
    void saveProfile({ name: nextName, avatar })
  }

  function updateAvatar(nextAvatar: Blob) {
    hasEditedProfile.current = true
    setAvatar(nextAvatar)
    void saveProfile({ name, avatar: nextAvatar })
  }

  return { avatar, avatarUrl, isLoaded, name, updateName, updateAvatar }
}
