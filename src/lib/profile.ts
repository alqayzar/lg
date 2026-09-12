import { database } from './database'

export interface Profile {
  name: string
  avatar: Blob | null
}

export async function loadProfile(): Promise<Profile | undefined> {
  return (await database).get('profile', 'local-player')
}

export async function saveProfile(profile: Profile): Promise<void> {
  await (await database).put('profile', profile, 'local-player')
}
