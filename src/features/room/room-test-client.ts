import { vi } from 'vitest'
import type { NetworkClient, NetworkMessage, NetworkSnapshot, TransportEvent, TransportListener } from '@/features/network/types'
import type { PlayerMetadata } from '@/features/profile/types'

export class FakeRoomClient implements NetworkClient<PlayerMetadata> {
  snapshot: NetworkSnapshot<PlayerMetadata> = {
    connections: [], connectedPeerIds: [], lastError: null, localPeerId: null,
    hostPeerId: null, sessionId: 0, role: null, status: 'idle',
  }
  listeners = new Set<TransportListener>()
  stateListeners = new Set<() => void>()
  sent: Array<{ peerId: string; type: string; payload: unknown }> = []
  trace: string[] = []
  private pendingJoin: { resolve(id: string): void; reject(error: Error): void } | null = null

  getSnapshot = () => this.snapshot
  subscribe = (listener: TransportListener) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }
  subscribeState = (listener: () => void) => {
    this.stateListeners.add(listener)
    return () => { this.stateListeners.delete(listener) }
  }
  subscribeToMessages = (listener: (message: NetworkMessage, fromPeerId: string) => void) => this.subscribe((event) => {
    if (event.type === 'message') listener(event.message, event.fromPeerId)
  })
  emit(event: TransportEvent) {
    for (const listener of this.listeners) listener(event)
  }
  update(patch: Partial<NetworkSnapshot<PlayerMetadata>>, event?: TransportEvent) {
    this.snapshot = { ...this.snapshot, ...patch }
    for (const listener of this.stateListeners) listener()
    if (event) this.emit(event)
  }
  private start(role: 'host' | 'guest', hostPeerId: string, localPeerId: string) {
    this.update({
      sessionId: this.snapshot.sessionId + 1, role, hostPeerId, localPeerId,
      connections: [{ peerId: localPeerId, isHost: role === 'host', metadata: {} }],
      connectedPeerIds: [], lastError: null, status: role === 'host' ? 'connected' : 'connecting',
    }, { type: 'status', status: role === 'host' ? 'connected' : 'connecting' })
  }
  startHost = vi.fn(async (hostId: string) => {
    this.start('host', hostId, hostId)
    return hostId
  })
  resumeHost = vi.fn((hostId: string) => { this.start('host', hostId, hostId) })
  joinHost = vi.fn((hostId: string, preferredPeerId = 'guest-self'): Promise<string> => {
    this.start('guest', hostId, preferredPeerId)
    return new Promise((resolve, reject) => { this.pendingJoin = { resolve, reject } })
  })
  beginLeave = vi.fn(() => {
    this.trace.push('beginLeave')
    this.update({ status: 'leaving' }, { type: 'status', status: 'leaving' })
  })
  close = vi.fn(() => {
    this.trace.push('close')
    this.pendingJoin?.reject(new DOMException('Closed', 'AbortError'))
    this.pendingJoin = null
    this.update({
      connectedPeerIds: [], connections: [], role: null, hostPeerId: null, localPeerId: null,
      sessionId: this.snapshot.sessionId + 1, status: 'closed',
    }, { type: 'status', status: 'closed' })
  })
  open(peerId: string) {
    this.update({
      connectedPeerIds: [...new Set([...this.snapshot.connectedPeerIds, peerId])],
      connections: [
        ...this.snapshot.connections.filter((connection) => connection.peerId !== peerId),
        { peerId, isHost: peerId === this.snapshot.hostPeerId, metadata: {} },
      ],
      status: this.snapshot.status === 'leaving' ? 'leaving' : 'connected',
    }, { type: 'connection-open', peerId })
    if (this.snapshot.role === 'guest') {
      this.pendingJoin?.resolve(this.snapshot.localPeerId!)
      this.pendingJoin = null
    }
  }
  disconnectPeer = vi.fn((peerId: string) => {
    if (!this.snapshot.connectedPeerIds.includes(peerId)) return false
    this.update({
      connectedPeerIds: this.snapshot.connectedPeerIds.filter((id) => id !== peerId),
      connections: this.snapshot.connections.filter((connection) => connection.peerId !== peerId),
      status: this.snapshot.role === 'guest' ? 'reconnecting' : this.snapshot.status,
    }, { type: 'connection-close', peerId })
    return true
  })
  sendToHost = vi.fn((type: string, payload: unknown) => {
    this.trace.push(type)
    if (this.snapshot.role !== 'guest' || !this.snapshot.hostPeerId || !this.snapshot.connectedPeerIds.includes(this.snapshot.hostPeerId)) return false
    this.sent.push({ peerId: this.snapshot.hostPeerId, type, payload })
    return true
  })
  sendToPeer = vi.fn((peerId: string, type: string, payload: unknown) => {
    this.trace.push(type)
    if (this.snapshot.role !== 'host' || !this.snapshot.connectedPeerIds.includes(peerId)) return false
    this.sent.push({ peerId, type, payload })
    return true
  })
  broadcast = vi.fn((type: string, payload: unknown) => {
    for (const peerId of this.snapshot.connectedPeerIds) this.sendToPeer(peerId, type, payload)
  })
  setLocalMetadata = vi.fn((metadata: PlayerMetadata) => {
    this.update({ connections: this.snapshot.connections.map((connection) => connection.peerId === this.snapshot.localPeerId
      ? { ...connection, metadata } : connection) }, { type: 'connections-change' })
  })
  registerConnectionMetadata = vi.fn((peerId: string, metadata: PlayerMetadata) => this.updateConnectionMetadata(peerId, metadata))
  updateConnectionMetadata = vi.fn((peerId: string, metadata: Partial<PlayerMetadata>) => {
    if (!this.snapshot.connectedPeerIds.includes(peerId)) return false
    this.update({ connections: this.snapshot.connections.map((connection) => connection.peerId === peerId
      ? { ...connection, metadata: { ...connection.metadata, ...metadata } } : connection) }, { type: 'connections-change' })
    return true
  })
  receive(peerId: string, type: string, payload: unknown) {
    this.emit({ type: 'message', fromPeerId: peerId, message: { id: crypto.randomUUID(), type, payload, sentAt: Date.now(), version: 1 } })
  }
}

export function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((accept, fail) => { resolve = accept; reject = fail })
  return { promise, resolve, reject }
}
