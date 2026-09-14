import { openDB } from 'idb'
import type { PlayerInfo } from './room-protocol'

export interface HostRoomSession {
  assignedPlayerIds: string[]
  playerId: string
  role: 'host'
  roomCode: string
}

export interface GuestRoomSession {
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
      role: 'guest',
      roomCode: session.roomCode,
    }
  }

  if (session.role === undefined) {
    const migratedSession: HostRoomSession = {
      assignedPlayerIds: [],
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
