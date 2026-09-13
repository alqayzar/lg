const ROOM_CODE_CHARACTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const ROOM_CODE_LENGTH = 6
const ROOM_CODE_GROUP_LENGTH = 3

export function normalizeRoomCode(value: string): string {
  const compactCode = value
    .toUpperCase()
    .split('')
    .filter((character) => ROOM_CODE_CHARACTERS.includes(character))
    .slice(0, ROOM_CODE_LENGTH)
    .join('')

  if (compactCode.length <= ROOM_CODE_GROUP_LENGTH) return compactCode
  return `${compactCode.slice(0, ROOM_CODE_GROUP_LENGTH)}-${compactCode.slice(ROOM_CODE_GROUP_LENGTH)}`
}

export function isRoomCode(value: string): boolean {
  return normalizeRoomCode(value).length === ROOM_CODE_LENGTH + 1
}

export function createRoomCode(): string {
  const values = crypto.getRandomValues(new Uint8Array(ROOM_CODE_LENGTH))
  const characters = Array.from(values, (value) => ROOM_CODE_CHARACTERS[value & 31])
  const compactCode = characters.join('')

  return `${compactCode.slice(0, ROOM_CODE_GROUP_LENGTH)}-${compactCode.slice(ROOM_CODE_GROUP_LENGTH)}`
}
