import { openDB } from 'idb'

// Keep the existing v2 stores and share one connection between profile and room storage.
export const database = openDB('loupgarou', 2, {
  upgrade(db) {
    if (!db.objectStoreNames.contains('profile')) {
      db.createObjectStore('profile')
    }
    if (!db.objectStoreNames.contains('room-session')) {
      db.createObjectStore('room-session')
    }
  },
})
