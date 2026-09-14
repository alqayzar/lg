import { openDB } from 'idb'
import { createEmojiImage } from './emoji-image'

export type ProfileAvatar = Blob | null

export interface Profile {
  name: string
  avatar: ProfileAvatar
}

const database = openDB('loupgarou', 3, {
  upgrade(db) {
    if (!db.objectStoreNames.contains('profile')) {
      db.createObjectStore('profile')
    }

    if (!db.objectStoreNames.contains('room-session')) {
      db.createObjectStore('room-session')
    }

    if (!db.objectStoreNames.contains('room-player-info')) {
      db.createObjectStore('room-player-info')
    }
  },
})

export async function loadProfile(): Promise<Profile | undefined> {
  const db = await database
  const profile: Profile | undefined = await db.get('profile', 'local-player')
  if (!profile || typeof profile.avatar !== 'string') return profile

  const migratedProfile: Profile = {
    ...profile,
    avatar: await createEmojiImage(profile.avatar),
  }
  await db.put('profile', migratedProfile, 'local-player')
  return migratedProfile
}

export async function saveProfile(profile: Profile): Promise<void> {
  await (await database).put('profile', profile, 'local-player')
}
