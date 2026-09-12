import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { database } from '@/lib/database'
import { loadProfile } from '@/lib/profile'
import { claimHostRoom, clearRoomSession, isCurrentHostSession, loadRoomSession, resolveRoomEntry, saveRoomSession, updateRoomSessionPeers, type HostRoomSession } from './room-session'
import { createRoomToken } from './room-token'

const session: HostRoomSession = {
  role: 'host', roomCode: 'ABC-234', peerId: 'lg-ABC-234', connectedPeerIds: ['old-peer'], sessionKey: 'original',
}

beforeEach(async () => {
  await (await database).clear('room-session')
  await (await database).clear('profile')
})
afterEach(() => { vi.unstubAllGlobals() })

describe('conditional host persistence', () => {
  it('preserves existing v2 profile and host records, assigning a stable session key', async () => {
    const legacy = { role: 'host', roomCode: 'ABC-234', peerId: 'lg-ABC-234', connectedPeerIds: ['saved-peer'] }
    await (await database).put('room-session', legacy, 'active')
    await (await database).put('profile', { name: 'Legacy player', avatar: null }, 'local-player')
    const loaded = await loadRoomSession()
    expect(loaded).toMatchObject(legacy)
    expect(loaded?.sessionKey).toBeTruthy()
    expect((await loadRoomSession())?.sessionKey).toBe(loaded?.sessionKey)
    expect(await loadProfile()).toEqual({ name: 'Legacy player', avatar: null })
    expect((await database).version).toBe(2)
  })

  it('never recreates a cleared session, regardless of transaction ordering', async () => {
    await saveRoomSession(session)
    await Promise.all([
      updateRoomSessionPeers(session.sessionKey, ['first'], () => true),
      clearRoomSession(session.sessionKey),
      updateRoomSessionPeers(session.sessionKey, ['late-zombie'], () => true),
    ])
    expect(await loadRoomSession()).toBeUndefined()
  })

  it('cannot update or clear a newer saved room with an older session key', async () => {
    await saveRoomSession(session)
    const next = { ...session, sessionKey: 'next', connectedPeerIds: ['new-peer'] }
    await saveRoomSession(next)
    await updateRoomSessionPeers(session.sessionKey, ['zombie'], () => true)
    await clearRoomSession(session.sessionKey)
    expect(await loadRoomSession()).toEqual(next)
    expect(await isCurrentHostSession(session.sessionKey)).toBe(false)
    expect(await isCurrentHostSession(next.sessionKey)).toBe(true)
  })

  it('checks cancellation inside the transaction, not before opening the database', async () => {
    await saveRoomSession(session)
    let current = true
    const updating = updateRoomSessionPeers(session.sessionKey, ['obsolete'], () => current)
    current = false
    await updating
    expect((await loadRoomSession())?.connectedPeerIds).toEqual(['old-peer'])
    await clearRoomSession(session.sessionKey)
    await saveRoomSession(session, () => false)
    expect(await loadRoomSession()).toBeUndefined()
  })

  it('an explicit guest URL bypasses shared host persistence entirely', async () => {
    const legacy = { role: 'host', roomCode: 'ABC-234', peerId: 'lg-ABC-234', connectedPeerIds: ['saved-peer'] }
    await (await database).put('room-session', legacy, 'active')
    expect(await resolveRoomEntry('DEF-567')).toEqual({ hostPeerId: 'lg-DEF-567', roomCode: 'DEF-567', role: 'guest' })
    expect(await (await database).get('room-session', 'active')).toEqual(legacy)
    await expect(resolveRoomEntry('')).rejects.toThrow('invalide')
    expect(await (await database).get('room-session', 'active')).toEqual(legacy)
  })

  it('restores a host only when the URL has no room parameter', async () => {
    await expect(resolveRoomEntry(null)).rejects.toThrow('Aucune partie')
    await saveRoomSession(session)
    expect(await resolveRoomEntry(null)).toEqual({ role: 'host', roomCode: session.roomCode, hostPeerId: session.peerId, session })
  })
})

describe('host tab ownership', () => {
  it('creates fresh room tokens on LAN pages without crypto.randomUUID', () => {
    vi.stubGlobal('crypto', { getRandomValues: crypto.getRandomValues.bind(crypto) })
    const token = createRoomToken()
    expect(token).toMatch(/^[a-f0-9]{32}$/)
    expect(createRoomToken()).not.toBe(token)
  })

  it('uses valid Web Lock options and retains the lock until released', async () => {
    let held = false
    const request = vi.fn(async (_name: string, options: LockOptions, callback: (lock: object | null) => Promise<void>) => {
      if (options.ifAvailable && options.signal) throw new Error('Invalid Web Lock options')
      if (held) return callback(null)
      held = true
      await callback({})
      held = false
    })
    vi.stubGlobal('navigator', { locks: { request } })
    const abort = new AbortController()
    const release = await claimHostRoom(session.peerId, abort.signal)
    expect(held).toBe(true)
    await expect(claimHostRoom(session.peerId, new AbortController().signal)).rejects.toThrow('autre onglet')
    release()
    await Promise.resolve()
    await Promise.resolve()
    expect(held).toBe(false)
  })

  it('does not acquire a host lock for an already-canceled entry', async () => {
    const request = vi.fn()
    vi.stubGlobal('navigator', { locks: { request } })
    const abort = new AbortController()
    abort.abort()
    await expect(claimHostRoom(session.peerId, abort.signal)).rejects.toHaveProperty('name', 'AbortError')
    expect(request).not.toHaveBeenCalled()
  })
})
