import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ACK_FLUSH_MS, LEAVE_TIMEOUT_MS, RoomController, type RoomPersistence } from './room-controller'
import { parsePlayerList, parseRoomRequest, ROOM_MESSAGE } from './room-protocol'
import { FakeRoomClient, deferred } from './room-test-client'
import type { RoomEntry } from './room-session'

const hostId = 'lg-ABC-234'
const profile = { name: 'Alice', avatarUrl: 'data:image/png;base64,YQ==' }
const guestEntry: RoomEntry = { role: 'guest', roomCode: 'ABC-234', hostPeerId: hostId }
const hostEntry: RoomEntry = {
  role: 'host', roomCode: 'ABC-234', hostPeerId: hostId,
  session: { role: 'host', roomCode: 'ABC-234', peerId: hostId, connectedPeerIds: ['saved-zombie'], sessionKey: 'saved-session' },
}
let controllers: RoomController[]

function start(role: 'host' | 'guest', persistence?: RoomPersistence) {
  const client = new FakeRoomClient()
  const controller = new RoomController(client, role === 'host' ? hostEntry : guestEntry, profile, persistence)
  controllers.push(controller)
  controller.start()
  return { client, controller }
}

function latestRequest(client: FakeRoomClient, type: string = ROOM_MESSAGE.getInfos) {
  return parseRoomRequest(client.sent.filter((message) => message.type === type).at(-1)?.payload)!
}

function list(client: FakeRoomClient, revision = 1, others = ['other'], epoch = 'host-epoch') {
  return {
    epoch, revision, requestId: latestRequest(client).requestId,
    players: [
      { peerId: hostId, isHost: true }, { peerId: 'guest-self', isHost: false },
      ...others.map((peerId) => ({ peerId, isHost: false })),
    ],
  }
}

beforeEach(() => { controllers = []; vi.useFakeTimers() })
afterEach(() => { for (const controller of controllers) controller.dispose(); vi.useRealTimers() })

describe('authoritative host roster', () => {
  it('never treats saved IDs as live and answers from the synchronous transport snapshot', async () => {
    const persistence = { updatePeers: vi.fn(async () => {}), clear: vi.fn(async () => {}) }
    const { client, controller } = start('host', persistence)
    expect(controller.getSnapshot().players.map((player) => player.peerId)).toEqual([hostId])
    client.update({ connectedPeerIds: ['new-guest'] })
    client.receive('new-guest', ROOM_MESSAGE.getInfos, { requestId: 'request' })
    const response = client.sent.filter((message) => message.type === ROOM_MESSAGE.playerList).at(-1)!
    expect(parsePlayerList(response.payload)?.players.map((player) => player.peerId)).toEqual([hostId, 'new-guest'])
    expect(parsePlayerList(response.payload)?.requestId).toBe('request')
    await Promise.resolve()
    expect(persistence.updatePeers).toHaveBeenCalledWith([], expect.any(Function))
    expect(controller.getSnapshot().players.some((player) => player.peerId === 'saved-zombie')).toBe(false)
  })

  it('rejects metadata from nonmembers, spoofed identities and invalid avatars', () => {
    const { client, controller } = start('host')
    client.open('guest')
    for (const [peerId, payload] of [
      ['zombie', { metadata: profile }],
      ['guest', { metadata: profile, peerId: hostId }],
      ['guest', { metadata: profile, isHost: true }],
      ['guest', { metadata: { name: 'Bad', avatarUrl: 'blob:local-only' } }],
    ] as const) client.receive(peerId, ROOM_MESSAGE.playerInfo, payload)
    expect(controller.getSnapshot().players[1].metadata).toEqual({})
    client.receive('guest', ROOM_MESSAGE.playerInfo, { metadata: { ...profile, avatarDataUrl: profile.avatarUrl } })
    expect(controller.getSnapshot().players[1].metadata).toEqual(profile)
    expect(JSON.stringify(client.sent)).not.toContain('avatarDataUrl')
    client.disconnectPeer('guest')
    client.receive('guest', ROOM_MESSAGE.playerInfo, { metadata: profile })
    expect(controller.getSnapshot().players.map((player) => player.peerId)).toEqual([hostId])
  })

  it('removes a quitting guest immediately but gives the ACK time to flush', () => {
    const { client, controller } = start('host')
    client.open('guest')
    client.open('observer')
    client.receive('guest', ROOM_MESSAGE.playerLeave, { requestId: 'quit' })
    expect(controller.getSnapshot().players.map((player) => player.peerId)).toEqual([hostId, 'observer'])
    expect(latestRequest(client, ROOM_MESSAGE.playerLeft).requestId).toBe('quit')
    const broadcast = client.sent.filter((message) => message.type === ROOM_MESSAGE.playerList && message.peerId === 'observer').at(-1)!
    expect(parsePlayerList(broadcast.payload)?.players).not.toContainEqual({ isHost: false, peerId: 'guest' })
    client.receive('guest', ROOM_MESSAGE.playerInfo, { metadata: profile })
    expect(controller.getSnapshot().players).toHaveLength(2)
    expect(client.disconnectPeer).not.toHaveBeenCalled()
    vi.advanceTimersByTime(ACK_FLUSH_MS)
    expect(client.disconnectPeer).toHaveBeenCalledWith('guest')
  })

  it('does not disconnect a replacement link with the same peer ID', () => {
    const { client, controller } = start('host')
    client.open('guest')
    client.receive('guest', ROOM_MESSAGE.playerLeave, { requestId: 'old-quit' })
    client.open('guest')
    vi.advanceTimersByTime(ACK_FLUSH_MS * 2)
    expect(client.disconnectPeer).not.toHaveBeenCalled()
    expect(controller.getSnapshot().players.map((player) => player.peerId)).toEqual([hostId, 'guest'])
  })

  it('bootstraps already-open peers when adopting a host reservation', () => {
    const client = new FakeRoomClient()
    client.resumeHost(hostId)
    client.open('guest')
    const controller = new RoomController(client, hostEntry, profile)
    controllers.push(controller)
    controller.start()
    expect(client.resumeHost).toHaveBeenCalledOnce()
    expect(client.sent.some((message) => message.peerId === 'guest' && message.type === ROOM_MESSAGE.getInfos)).toBe(true)
    client.receive('guest', ROOM_MESSAGE.getInfos, { requestId: 'fresh' })
    const response = client.sent.filter((message) => message.type === ROOM_MESSAGE.playerList).at(-1)!
    expect(parsePlayerList(response.payload)?.requestId).toBe('fresh')
  })

  it('serializes persistence and invalidates pending writes before clear', async () => {
    const pendingWrite = deferred<void>()
    const guards: Array<() => boolean> = []
    const persistence: RoomPersistence = {
      updatePeers: vi.fn((_ids, isCurrent) => { guards.push(isCurrent); return pendingWrite.promise }),
      clear: vi.fn(async () => {}),
    }
    const { client, controller } = start('host', persistence)
    await Promise.resolve()
    client.open('guest')
    expect(persistence.updatePeers).toHaveBeenCalledTimes(1)
    const leaving = controller.leave()
    expect(guards[0]()).toBe(false)
    vi.advanceTimersByTime(LEAVE_TIMEOUT_MS)
    expect(client.getSnapshot().status).toBe('closed')
    expect(persistence.clear).not.toHaveBeenCalled()
    pendingWrite.resolve()
    await leaving
    expect(persistence.updatePeers).toHaveBeenCalledTimes(1)
    expect(persistence.clear).toHaveBeenCalledOnce()
  })
})

describe('guest synchronization', () => {
  it('requests and announces once on EVERY new host data connection, including the same peer ID', () => {
    const { client, controller } = start('guest')
    expect(client.sent).toEqual([])
    client.open(hostId)
    const firstRequest = latestRequest(client)
    client.receive(hostId, ROOM_MESSAGE.playerList, list(client))
    expect(controller.getSnapshot().players).toHaveLength(3)
    client.disconnectPeer(hostId)
    expect(controller.getSnapshot().players).toEqual([])
    expect(client.beginLeave).not.toHaveBeenCalled()
    client.open(hostId)
    expect(latestRequest(client).requestId).not.toBe(firstRequest.requestId)
    expect(client.sent.filter((message) => message.type === ROOM_MESSAGE.getInfos)).toHaveLength(2)
    expect(client.sent.filter((message) => message.type === ROOM_MESSAGE.playerInfo)).toHaveLength(2)
    expect(client.setLocalMetadata).toHaveBeenCalledOnce()
    expect(JSON.stringify(client.sent)).not.toContain('blob:')
    expect(JSON.stringify(client.sent)).not.toContain('avatarDataUrl')
  })

  it('accepts membership only from the actual host and current handshake', () => {
    const { client, controller } = start('guest')
    client.open(hostId)
    const current = list(client)
    client.receive('attacker', ROOM_MESSAGE.playerList, current)
    client.receive(hostId, ROOM_MESSAGE.playerList, { ...current, requestId: 'obsolete' })
    client.receive(hostId, ROOM_MESSAGE.playerList, { ...current, players: [{ peerId: 'impostor', isHost: true }] })
    client.receive(hostId, ROOM_MESSAGE.playerInfo, { epoch: current.epoch, revision: 1, peerId: 'other', isHost: false, metadata: profile })
    expect(controller.getSnapshot().players).toEqual([])
    client.receive(hostId, ROOM_MESSAGE.playerList, current)
    expect(controller.getSnapshot().players).toHaveLength(3)
  })

  it('cannot resurrect removed players with stale lists or late metadata', () => {
    const { client, controller } = start('guest')
    client.open(hostId)
    const first = list(client)
    client.receive(hostId, ROOM_MESSAGE.playerList, first)
    client.receive(hostId, ROOM_MESSAGE.playerInfo, { epoch: first.epoch, revision: 1, peerId: 'other', isHost: false, metadata: profile })
    expect(controller.getSnapshot().players[2].metadata.name).toBe('Alice')
    client.receive(hostId, ROOM_MESSAGE.playerList, list(client, 2, []))
    client.receive(hostId, ROOM_MESSAGE.playerInfo, { epoch: first.epoch, revision: 2, peerId: 'other', isHost: false, metadata: profile })
    client.receive(hostId, ROOM_MESSAGE.playerList, first)
    expect(controller.getSnapshot().players.map((player) => player.peerId)).toEqual([hostId, 'guest-self'])
    client.open(hostId)
    client.receive(hostId, ROOM_MESSAGE.playerList, first)
    expect(controller.getSnapshot().players).toEqual([])
    client.receive(hostId, ROOM_MESSAGE.playerList, list(client, 1, [], 'new-host-epoch'))
    expect(controller.getSnapshot().players).toHaveLength(2)
    client.receive(hostId, ROOM_MESSAGE.playerList, { ...first, revision: 999 })
    expect(controller.getSnapshot().players).toHaveLength(2)
  })
})

describe('bounded, session-owned shutdown', () => {
  it('begins leave first and requires the matching request, host and epoch ACK', async () => {
    const { client, controller } = start('guest')
    client.open(hostId)
    client.receive(hostId, ROOM_MESSAGE.playerList, list(client))
    client.trace = []
    const leaving = controller.leave()
    expect(controller.leave()).toBe(leaving)
    const request = latestRequest(client, ROOM_MESSAGE.playerLeave)
    expect(client.trace.slice(0, 2)).toEqual(['beginLeave', ROOM_MESSAGE.playerLeave])
    client.receive('attacker', ROOM_MESSAGE.playerLeft, request)
    client.receive(hostId, ROOM_MESSAGE.playerLeft, { ...request, requestId: 'wrong' })
    client.receive(hostId, ROOM_MESSAGE.playerLeft, { ...request, epoch: 'wrong' })
    expect(client.close).not.toHaveBeenCalled()
    client.open(hostId)
    expect(client.sent.filter((message) => message.type === ROOM_MESSAGE.getInfos)).toHaveLength(1)
    client.receive(hostId, ROOM_MESSAGE.playerLeft, request)
    await leaving
    expect(client.getSnapshot().status).toBe('closed')
    expect(controller.getSnapshot().players).toEqual([])
    vi.advanceTimersByTime(LEAVE_TIMEOUT_MS * 2)
    expect(client.close).toHaveBeenCalledOnce()
  })

  it('times out a missing ACK and leaves immediately when offline', async () => {
    const { client, controller } = start('guest')
    client.open(hostId)
    const leaving = controller.leave()
    vi.advanceTimersByTime(LEAVE_TIMEOUT_MS - 1)
    expect(client.close).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    await leaving
    expect(client.close).toHaveBeenCalledOnce()
    const offline = start('guest')
    await offline.controller.leave()
    expect(offline.client.trace).toEqual(['beginLeave', ROOM_MESSAGE.playerLeave, 'close'])
  })

  it('waits for host-close ACKs or a deadline, closes before storage, and cannot close a later session', async () => {
    const clearing = deferred<void>()
    const persistence = { updatePeers: vi.fn(async () => {}), clear: vi.fn(() => clearing.promise) }
    const { client, controller } = start('host', persistence)
    client.open('guest')
    client.open('other')
    const leaving = controller.leave()
    const request = latestRequest(client, ROOM_MESSAGE.roomClose)
    client.receive('guest', ROOM_MESSAGE.roomClosed, { ...request, requestId: 'wrong' })
    client.receive('not-a-member', ROOM_MESSAGE.roomClosed, request)
    client.receive('guest', ROOM_MESSAGE.roomClosed, request)
    expect(client.close).not.toHaveBeenCalled()
    client.receive('other', ROOM_MESSAGE.roomClosed, request)
    expect(client.close).toHaveBeenCalledOnce()
    client.resumeHost('lg-NEW-234')
    const newSession = client.getSnapshot().sessionId
    clearing.resolve()
    await leaving
    expect(controller.getSnapshot().isClosed).toBe(false)
    controller.dispose()
    vi.advanceTimersByTime(LEAVE_TIMEOUT_MS * 2)
    expect(client.getSnapshot().sessionId).toBe(newSession)
    expect(client.getSnapshot().localPeerId).toBe('lg-NEW-234')
    expect(client.close).toHaveBeenCalledOnce()
  })

  it('treats host-close as definitive, but not an ordinary host reload', async () => {
    const { client, controller } = start('guest')
    client.open(hostId)
    client.receive(hostId, ROOM_MESSAGE.playerList, list(client))
    client.receive('attacker', ROOM_MESSAGE.roomClose, { epoch: 'host-epoch', requestId: 'close' })
    expect(client.beginLeave).not.toHaveBeenCalled()
    client.receive(hostId, ROOM_MESSAGE.roomClose, { epoch: 'host-epoch', requestId: 'close' })
    expect(controller.getSnapshot().players).toEqual([])
    expect(controller.getSnapshot().isLeaving).toBe(true)
    expect(client.trace.slice(-2)).toEqual(['beginLeave', ROOM_MESSAGE.roomClosed])
    client.receive(hostId, ROOM_MESSAGE.playerList, list(client, 100))
    expect(controller.getSnapshot().players).toEqual([])
    expect(client.close).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(ACK_FLUSH_MS)
    expect(client.close).toHaveBeenCalledOnce()
    expect(controller.getSnapshot().isClosed).toBe(true)
  })

  it('duplicate host-close messages cannot extend the shutdown deadline or trigger another leave', async () => {
    const { client, controller } = start('guest')
    client.open(hostId)
    const request = { epoch: 'host-epoch', requestId: 'close' }
    client.receive(hostId, ROOM_MESSAGE.roomClose, request)
    vi.advanceTimersByTime(ACK_FLUSH_MS - 1)
    client.receive(hostId, ROOM_MESSAGE.roomClose, request)
    void controller.leave()
    await vi.advanceTimersByTimeAsync(1)
    expect(client.close).toHaveBeenCalledOnce()
    expect(client.sent.some((message) => message.type === ROOM_MESSAGE.playerLeave)).toBe(false)
    expect(client.beginLeave).toHaveBeenCalledOnce()
  })

  it('disposal cancels pending timers and listeners without affecting a replacement controller', async () => {
    const { client, controller } = start('guest')
    client.open(hostId)
    void controller.leave()
    controller.dispose()
    const next = new RoomController(client, guestEntry, profile)
    controllers.push(next)
    next.start()
    client.open(hostId)
    const session = client.getSnapshot().sessionId
    await vi.advanceTimersByTimeAsync(LEAVE_TIMEOUT_MS * 2)
    expect(client.getSnapshot().sessionId).toBe(session)
    expect(client.listeners.size).toBe(1)
    expect(next.getSnapshot().isLeaving).toBe(false)
  })
})
