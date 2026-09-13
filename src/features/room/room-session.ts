import { openDB } from 'idb'

export interface HostRoomSession {
  peerId: string
  role: 'host'
  roomCode: string
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

export async function clearRoomSession(): Promise<void> {
  await (await database).delete('room-session', 'active')
}

export async function loadRoomSession(): Promise<HostRoomSession | undefined> {
  return (await database).get('room-session', 'active')
}

export async function saveRoomSession(session: HostRoomSession): Promise<void> {
  await (await database).put('room-session', session, 'active')
}
