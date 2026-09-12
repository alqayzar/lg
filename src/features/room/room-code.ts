const ROOM_CODE_CHARACTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const ROOM_CODE_LENGTH = 6
const ROOM_CODE_GROUP_LENGTH = 3

export function createRoomCode(): string {
  const values = crypto.getRandomValues(new Uint8Array(ROOM_CODE_LENGTH))
  const characters = Array.from(values, (value) => ROOM_CODE_CHARACTERS[value & 31])
  const compactCode = characters.join('')

  return `${compactCode.slice(0, ROOM_CODE_GROUP_LENGTH)}-${compactCode.slice(ROOM_CODE_GROUP_LENGTH)}`
}

export function roomCodeToPeerId(roomCode: string): string {
  return `lg-${roomCode}`
}

export function normalizeRoomCode(value: string): string | null {
  const compactCode = value.toUpperCase().replace(/[^A-Z0-9]/g, '')

  if (!/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/.test(compactCode)) {
    return null
  }

  return `${compactCode.slice(0, ROOM_CODE_GROUP_LENGTH)}-${compactCode.slice(ROOM_CODE_GROUP_LENGTH)}`
}

export function peerIdToRoomCode(peerId: string | null): string | null {
  return peerId?.startsWith('lg-') ? peerId.slice(3) : null
}
