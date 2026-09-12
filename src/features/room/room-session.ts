import { database } from '@/lib/database'
import { normalizeRoomCode, roomCodeToPeerId } from './room-code'
import { createRoomToken } from './room-token'

export interface HostRoomSession {
  connectedPeerIds: string[]
  peerId: string
  role: 'host'
  roomCode: string
  sessionKey: string
}

export type RoomEntry = {
  hostPeerId: string
  roomCode: string
} & ({ role: 'guest' } | { role: 'host'; session: HostRoomSession })

export async function clearRoomSession(sessionKey: string): Promise<void> {
  const transaction = (await database).transaction('room-session', 'readwrite')
  const current = await transaction.store.get('active')
  if (current?.sessionKey === sessionKey) {
    await transaction.store.delete('active')
  }
  await transaction.done
}

export async function loadRoomSession(): Promise<HostRoomSession | undefined> {
  const transaction = (await database).transaction('room-session', 'readwrite')
  const current = await transaction.store.get('active')
  const roomCode = typeof current?.roomCode === 'string' ? normalizeRoomCode(current.roomCode) : null
  if (!current || current.role !== 'host' || !roomCode || current.peerId !== roomCodeToPeerId(roomCode)) {
    await transaction.done
    return undefined
  }

  const session: HostRoomSession = {
    connectedPeerIds: Array.isArray(current.connectedPeerIds)
      ? current.connectedPeerIds.filter((id: unknown): id is string => typeof id === 'string')
      : [],
    peerId: current.peerId,
    role: 'host',
    roomCode,
    sessionKey: typeof current.sessionKey === 'string' && current.sessionKey ? current.sessionKey : createRoomToken(),
  }
  if (session.sessionKey !== current.sessionKey) {
    await transaction.store.put(session, 'active')
  }
  await transaction.done
  return session
}

export async function saveRoomSession(
  session: HostRoomSession,
  isCurrent: () => boolean = () => true,
): Promise<void> {
  const transaction = (await database).transaction('room-session', 'readwrite')
  if (isCurrent()) {
    await transaction.store.put(session, 'active')
  }
  await transaction.done
}

export async function updateRoomSessionPeers(
  sessionKey: string,
  connectedPeerIds: string[],
  isCurrent: () => boolean,
): Promise<void> {
  const transaction = (await database).transaction('room-session', 'readwrite')
  const current = await transaction.store.get('active')
  // The read and conditional write must share a transaction, including across tabs.
  if (isCurrent() && current?.sessionKey === sessionKey) {
    await transaction.store.put({ ...current, connectedPeerIds }, 'active')
  }
  await transaction.done
}

export async function resolveRoomEntry(roomParameter: string | null): Promise<RoomEntry> {
  if (roomParameter !== null) {
    const roomCode = normalizeRoomCode(roomParameter)
    if (!roomCode) {
      throw new Error('Code de partie invalide.')
    }
    return { hostPeerId: roomCodeToPeerId(roomCode), role: 'guest', roomCode }
  }

  const session = await loadRoomSession()
  if (!session) {
    throw new Error('Aucune partie enregistree. Creez ou rejoignez une partie.')
  }
  return { hostPeerId: session.peerId, role: 'host', roomCode: session.roomCode, session }
}

export async function claimHostRoom(hostPeerId: string, signal: AbortSignal): Promise<() => void> {
  if (typeof navigator === 'undefined' || !navigator.locks) return () => {}
  signal.throwIfAborted()
  return new Promise((resolve, reject) => {
    // Web Locks forbids combining ifAvailable with its signal option.
    void navigator.locks.request(`loupgarou-host:${hostPeerId}`, { ifAvailable: true }, async (lock) => {
      if (signal.aborted) {
        reject(signal.reason)
        return
      }
      if (!lock) {
        reject(new Error('Cette partie est deja ouverte dans un autre onglet.'))
        return
      }
      await new Promise<void>((release) => { resolve(release) })
    }).catch(reject)
  })
}

export async function isCurrentHostSession(sessionKey: string): Promise<boolean> {
  return (await (await database).get('room-session', 'active'))?.sessionKey === sessionKey
}
