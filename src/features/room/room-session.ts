import { openDB } from 'idb'
import type { PlayerInfo } from './room-protocol'

export interface HostRoomSession {
  assignedPlayerIds: string[]
  gameStarted: boolean
  playerId: string
  role: 'host'
  roomCode: string
}

export interface GuestRoomSession {
  gameStarted: boolean
  playerId?: string
  role: 'guest'
  roomCode: string
}

export type RoomSession = HostRoomSession | GuestRoomSession

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
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

const LAST_GUEST_ROOM_CODE_KEY = 'last-guest-room-code'

export async function clearRoomSession(): Promise<void> {
  await (await database).delete('room-session', 'active')
}

export async function loadRoomSession(): Promise<RoomSession | undefined> {
  const db = await database
  const session: unknown = await db.get('room-session', 'active')

  if (!isRecord(session) || typeof session.roomCode !== 'string') return undefined
  if (
    session.role === 'host'
    && typeof session.playerId === 'string'
    && Array.isArray(session.assignedPlayerIds)
    && session.assignedPlayerIds.every((playerId) => typeof playerId === 'string')
  ) {
    return {
      assignedPlayerIds: session.assignedPlayerIds,
      gameStarted: session.gameStarted === true,
      playerId: session.playerId,
      role: 'host',
      roomCode: session.roomCode,
    }
  }
  if (
    session.role === 'guest'
    && (session.playerId === undefined || typeof session.playerId === 'string')
  ) {
    return {
      ...(session.playerId ? { playerId: session.playerId } : {}),
      gameStarted: session.gameStarted === true,
      role: 'guest',
      roomCode: session.roomCode,
    }
  }

  if (session.role === undefined) {
    const migratedSession: HostRoomSession = {
      assignedPlayerIds: [],
      gameStarted: false,
      playerId: crypto.randomUUID(),
      role: 'host',
      roomCode: session.roomCode,
    }
    await db.put('room-session', migratedSession, 'active')
    return migratedSession
  }

  await db.delete('room-session', 'active')
  return undefined
}

export async function saveRoomSession(session: RoomSession): Promise<void> {
  await (await database).put('room-session', session, 'active')
}

export async function loadLastGuestRoomCode(): Promise<string | undefined> {
  const roomCode: unknown = await (await database).get('room-session', LAST_GUEST_ROOM_CODE_KEY)
  return typeof roomCode === 'string' ? roomCode : undefined
}

export async function saveLastGuestRoomCode(roomCode: string): Promise<void> {
  await (await database).put('room-session', roomCode, LAST_GUEST_ROOM_CODE_KEY)
}

export async function loadRoomPlayerInfo(roomCode: string): Promise<Record<string, PlayerInfo>> {
  const playerInfo: unknown = await (await database).get('room-player-info', roomCode)
  if (!isRecord(playerInfo)) return {}

  return Object.fromEntries(
    Object.entries(playerInfo).filter((entry): entry is [string, PlayerInfo] => {
      const value = entry[1]
      return isRecord(value)
        && typeof value.name === 'string'
        && (value.avatar === null || typeof value.avatar === 'string')
    }),
  )
}

export async function saveRoomPlayerInfo(roomCode: string, playerInfo: Record<string, PlayerInfo>): Promise<void> {
  await (await database).put('room-player-info', playerInfo, roomCode)
}
