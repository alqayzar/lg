import { openDB } from 'idb'

export interface Profile {
  name: string
  avatar: Blob | null
}

const database = openDB('loupgarou', 2, {
  upgrade(db) {
    if (!db.objectStoreNames.contains('profile')) {
      db.createObjectStore('profile')
    }

    if (!db.objectStoreNames.contains('room-session')) {
      db.createObjectStore('room-session')
    }
  },
})

export async function loadProfile(): Promise<Profile | undefined> {
  return (await database).get('profile', 'local-player')
}

export async function saveProfile(profile: Profile): Promise<void> {
  await (await database).put('profile', profile, 'local-player')
}
