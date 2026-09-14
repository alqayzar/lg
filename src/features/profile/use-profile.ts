import { useEffect, useRef, useState } from 'react'
import { loadProfile, saveProfile, type ProfileAvatar } from '@/lib/profile'

export function useProfile() {
  const [name, setName] = useState('')
  const [avatar, setAvatar] = useState<ProfileAvatar>(null)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const hasEditedProfile = useRef(false)

  useEffect(() => {
    async function restoreProfile() {
      const savedProfile = await loadProfile()

      if (!savedProfile || hasEditedProfile.current) {
        return
      }

      setName(savedProfile.name)
      setAvatar(savedProfile.avatar)
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

  function updateAvatar(nextAvatar: Exclude<ProfileAvatar, null>) {
    hasEditedProfile.current = true
    setAvatar(nextAvatar)
    void saveProfile({ name, avatar: nextAvatar })
  }

  function removeAvatar() {
    hasEditedProfile.current = true
    setAvatar(null)
    void saveProfile({ name, avatar: null })
  }

  return { avatar, avatarUrl, name, removeAvatar, updateName, updateAvatar }
}
