import type { Profile } from '@/lib/profile'
import { avatarToDataUrl } from '@/features/profile/avatar-data'
import { MAX_AVATAR_BYTES, parsePlayerMetadata, type RegisteredPlayerMetadata } from './room-protocol'

export async function prepareRoomProfile(profile: Profile | undefined): Promise<RegisteredPlayerMetadata> {
  if (profile?.avatar && (!profile.avatar.type.startsWith('image/') || profile.avatar.size > MAX_AVATAR_BYTES)) {
    throw new Error('Photo de profil invalide ou trop volumineuse (7 Mo maximum).')
  }

  const metadata = parsePlayerMetadata({
    avatarUrl: await avatarToDataUrl(profile?.avatar ?? null),
    name: profile?.name.trim(),
  })
  if (!metadata) {
    throw new Error('Choisissez un pseudo valide (1 a 20 caracteres) et une photo valide.')
  }
  return metadata
}
