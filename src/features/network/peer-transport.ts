import Peer, { type DataConnection, type PeerOptions } from 'peerjs'
import { PeerLink, type LinkOptions } from './peer-link'
import { createNetworkMessage } from './protocol'
import type { ConnectionStatus, NetworkClient, NetworkMessage, NetworkSnapshot, TransportEvent, TransportListener } from './types'

interface PeerTransportOptions extends Partial<LinkOptions> {
  peerOptions?: PeerOptions
  reconnectBaseDelayMs?: number
  maxReconnectDelayMs?: number
  maxReconnectAttempts?: number
  startupTimeoutMs?: number
}

interface Session {
  id: number
  role: 'host' | 'guest'
  hostId: string
  requestedId?: string
  mode: 'create' | 'resume' | 'guest'
  peer: Peer | null
  signaling: boolean
  localPeerId: string | null
  leaving: boolean
  peerAttempts: number
  signalAttempts: number
  linkAttempts: number
  links: Map<string, PeerLink>
  pending: Set<PeerLink>
  guestLink: PeerLink | null
  metadata: Map<string, object>
  timers: Map<string, ReturnType<typeof setTimeout>>
  resolve?: (id: string) => void
  reject?: (error: Error) => void
}

const DEFAULTS = {
  connectionTimeoutMs: 10_000,
  heartbeatIntervalMs: 5_000,
  heartbeatTimeoutMs: 30_000,
  maxBufferedBytes: 16 * 1024 * 1024,
  reconnectBaseDelayMs: 500,
  maxReconnectDelayMs: 8_000,
  maxReconnectAttempts: 10,
  startupTimeoutMs: 30_000,
}

const initialSnapshot = (sessionId: number, status: ConnectionStatus): NetworkSnapshot<object> => ({
  connections: [], connectedPeerIds: [], localPeerId: null, hostPeerId: null,
  role: null, lastError: null, sessionId, status,
})

/** Session identity fences every timer, promise, peer and channel callback. */
export class PeerTransport implements NetworkClient<object> {
  private readonly options: typeof DEFAULTS & PeerTransportOptions
  private session: Session | null = null
  private sequence = 0
  private localMetadata: object = {}
  private snapshot = initialSnapshot(0, 'idle')
  private readonly listeners = new Set<TransportListener>()
  private readonly stateListeners = new Set<() => void>()

  constructor(options: PeerTransportOptions = {}) {
    this.options = { ...DEFAULTS, ...options }
  }

  getSnapshot = (): NetworkSnapshot<object> => this.snapshot

  subscribe = (listener: TransportListener): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  subscribeState = (listener: () => void): (() => void) => {
    this.stateListeners.add(listener)
    return () => this.stateListeners.delete(listener)
  }

  subscribeToMessages = (listener: (message: NetworkMessage, fromPeerId: string) => void): (() => void) => (
    this.subscribe((event) => {
      if (event.type === 'message') listener(event.message, event.fromPeerId)
    })
  )

  startHost = (hostId: string): Promise<string> => this.start('create', hostId)

  joinHost = (hostId: string, preferredPeerId?: string): Promise<string> => this.start('guest', hostId, preferredPeerId)

  resumeHost = (hostId: string): void => {
    // Failures are surfaced by the snapshot; no fire-and-forget rejection.
    void this.start('resume', hostId).catch(() => {})
  }

  beginLeave = (): void => {
    const session = this.session
    if (!session || session.leaving) return
    session.leaving = true
    this.clearTimers(session)
    this.rejectStartup(session, new DOMException('Leaving the session.', 'AbortError'))
    for (const link of [...session.pending]) link.close()
    this.publish('leaving')
  }

  close = (): void => {
    const session = this.session
    this.session = null
    ++this.sequence
    this.localMetadata = {}
    if (session) {
      this.rejectStartup(session, new DOMException('Session closed.', 'AbortError'))
      this.disposeSession(session)
    }
    this.removeBrowserListeners()
    this.snapshot = initialSnapshot(this.sequence, 'closed')
    this.notify({ type: 'status', status: 'closed' })
  }

  sendToHost = (type: string, payload: unknown): boolean => {
    const session = this.session
    return session?.role === 'guest' && !!session.guestLink
      && this.send(session.guestLink, type, payload)
  }

  sendToPeer = (peerId: string, type: string, payload: unknown): boolean => {
    const session = this.session
    const link = session?.role === 'host' ? session.links.get(peerId) : undefined
    return !!link && this.send(link, type, payload)
  }

  broadcast = (type: string, payload: unknown): void => {
    if (this.session?.role !== 'host') return
    for (const link of [...this.session.links.values()]) this.send(link, type, payload)
  }

  disconnectPeer = (peerId: string): boolean => {
    const link = this.session?.role === 'host' ? this.session.links.get(peerId) : undefined
    if (!link) return false
    link.close()
    return true
  }

  setLocalMetadata = (metadata: object): void => {
    if (!this.session || this.session.leaving) return
    const entries = Object.entries(metadata)
    const previous = new Map(Object.entries(this.localMetadata))
    if (entries.length === previous.size && entries.every(([key, value]) => previous.get(key) === value)) return
    this.localMetadata = { ...metadata }
    this.publish(this.snapshot.status, { type: 'connections-change' })
  }

  registerConnectionMetadata = (peerId: string, metadata: object): boolean => {
    if (this.session?.metadata.has(peerId)) return false
    return this.updateConnectionMetadata(peerId, metadata)
  }

  updateConnectionMetadata = (peerId: string, metadata: object): boolean => {
    const session = this.session
    if (!session || session.leaving || !session.links.has(peerId)) return false
    session.metadata.set(peerId, { ...session.metadata.get(peerId), ...metadata })
    this.publish(this.snapshot.status, { type: 'connections-change' })
    return true
  }

  private start(mode: Session['mode'], hostId: string, requestedId?: string): Promise<string> {
    this.close()
    const session: Session = {
      id: ++this.sequence, mode, role: mode === 'guest' ? 'guest' : 'host', hostId, requestedId,
      peer: null, signaling: false, localPeerId: mode === 'guest' ? null : hostId, leaving: false,
      peerAttempts: 0, signalAttempts: 0, linkAttempts: 0,
      links: new Map(), pending: new Set(), guestLink: null, metadata: new Map(), timers: new Map(),
    }
    this.session = session
    this.snapshot = initialSnapshot(session.id, 'starting')
    this.addBrowserListeners()
    const result = new Promise<string>((resolve, reject) => {
      session.resolve = resolve
      session.reject = reject
    })
    this.publish('starting')
    this.later(session, 'startup', this.options.startupTimeoutMs, () => this.fail(session, new Error('Connection startup timed out.')))
    this.openPeer(session)
    return result
  }

  private openPeer(session: Session): void {
    if (!this.isActive(session)) return
    this.dropPeer(session)
    let peer: Peer
    try {
      const id = session.role === 'host' ? session.hostId : session.requestedId
      peer = id ? new Peer(id, this.options.peerOptions) : new Peer(this.options.peerOptions ?? {})
      session.peer = peer
    } catch (error) {
      this.fail(session, this.toError(error))
      return
    }
    const current = () => this.isActive(session) && session.peer === peer
    this.later(session, 'peer-open', this.options.connectionTimeoutMs, () => this.retryPeer(session, new Error('Signaling startup timed out.')))
    peer.on('open', (id) => {
      if (!current()) return
      this.clearTimer(session, 'peer-open')
      this.clearTimer(session, 'signaling')
      this.clearTimer(session, 'signal-open')
      session.signaling = true
      session.localPeerId = id
      session.peerAttempts = session.signalAttempts = 0
      this.snapshot = { ...this.snapshot, lastError: null }
      if (session.role === 'host') {
        this.completeStartup(session)
        this.publish('connected')
      } else if (!session.guestLink) {
        this.connectGuest(session)
      } else {
        this.publish(session.guestLink.ready ? 'connected' : 'connecting')
      }
    })
    peer.on('connection', (connection) => {
      if (!current() || session.role !== 'host') connection.close()
      else this.attachLink(session, connection)
    })
    peer.on('call', (call) => call.close())
    peer.on('disconnected', () => {
      if (!current()) return
      session.signaling = false
      // Losing the signaling socket does not break established WebRTC channels.
      this.recoverSignaling(session)
    })
    peer.on('close', () => {
      if (current()) this.retryPeer(session, new Error('Signaling peer closed.'))
    })
    peer.on('error', (error) => {
      if (!current()) return
      if (error.type === 'peer-unavailable' && session.role === 'guest') {
        if (session.guestLink && !session.guestLink.ready) session.guestLink.close(error)
        else if (!session.guestLink) this.retryGuest(session, error)
        return
      }
      if (['invalid-id', 'invalid-key', 'browser-incompatible', 'ssl-unavailable'].includes(error.type)
        || (error.type === 'unavailable-id' && session.mode === 'create')) {
        this.fail(session, error)
      } else if (peer.open || peer.disconnected && session.localPeerId) {
        session.signaling = false
        this.recordError(error)
        this.recoverSignaling(session)
      } else {
        this.retryPeer(session, error)
      }
    })
  }

  private connectGuest(session: Session): void {
    if (!this.isActive(session) || !session.peer || !session.signaling || session.guestLink) return
    this.clearTimer(session, 'guest-retry')
    this.publish(session.linkAttempts ? 'reconnecting' : 'connecting')
    try {
      // Only the data channel is negotiated here. Application info is a message.
      this.attachLink(session, session.peer.connect(session.hostId, { reliable: true }))
    } catch (error) {
      this.retryGuest(session, this.toError(error))
    }
  }

  private attachLink(session: Session, connection: DataConnection): void {
    const link = new PeerLink(connection, this.options, {
      open: () => {
        if (!this.isActive(session) || !session.pending.has(link)) {
          link.close()
          return
        }
        session.pending.delete(link)
        const previous = session.links.get(link.peerId)
        // Install the replacement BEFORE closing the old channel.
        session.links.set(link.peerId, link)
        session.metadata.delete(link.peerId)
        previous?.close()
        if (session.role === 'guest') {
          session.linkAttempts = 0
          this.clearTimer(session, 'guest-retry')
          this.completeStartup(session)
        }
        this.snapshot = { ...this.snapshot, lastError: null }
        this.publish(this.connectionStatus(session), { type: 'connection-open', peerId: link.peerId })
      },
      message: (message) => {
        if (this.session !== session || session.links.get(link.peerId) !== link) return
        this.emit({ type: 'message', fromPeerId: link.peerId, message })
      },
      close: (error) => {
        if (this.session !== session) return
        const wasActive = session.links.get(link.peerId) === link
        session.pending.delete(link)
        if (wasActive) {
          session.links.delete(link.peerId)
          session.metadata.delete(link.peerId)
        }
        const wasGuest = session.guestLink === link
        if (wasGuest) session.guestLink = null
        if (wasActive) this.publish(this.connectionStatus(session), { type: 'connection-close', peerId: link.peerId })
        if (wasGuest && !session.leaving) this.retryGuest(session, error)
      },
    })
    session.pending.add(link)
    if (session.role === 'guest') session.guestLink = link
  }

  private recoverSignaling(session: Session): void {
    if (!this.isActive(session) || session.timers.has('signaling') || session.timers.has('signal-open')) return
    if (++session.signalAttempts > this.options.maxReconnectAttempts) {
      this.fail(session, new Error('Signaling reconnection failed.'))
      return
    }
    this.publish(this.connectionStatus(session))
    this.later(session, 'signaling', this.backoff(session.signalAttempts), () => {
      const peer = session.peer
      if (!peer || peer.destroyed) {
        this.retryPeer(session)
        return
      }
      this.later(session, 'signal-open', this.options.connectionTimeoutMs, () => {
        this.recoverSignaling(session)
      })
      try {
        if (peer.disconnected) peer.reconnect()
      } catch (error) {
        this.recordError(this.toError(error))
        this.clearTimer(session, 'signal-open')
        this.recoverSignaling(session)
      }
    })
  }

  private retryPeer(session: Session, error?: Error): void {
    if (!this.isActive(session) || session.timers.has('peer-retry')) return
    this.dropPeer(session)
    if (++session.peerAttempts > this.options.maxReconnectAttempts) {
      this.fail(session, error ?? new Error('Peer reconnection failed.'))
      return
    }
    if (error) this.recordError(error)
    this.publish('reconnecting')
    this.later(session, 'peer-retry', this.backoff(session.peerAttempts), () => this.openPeer(session))
  }

  private retryGuest(session: Session, error?: Error): void {
    if (!this.isActive(session) || session.guestLink || session.timers.has('guest-retry')) return
    if (++session.linkAttempts > this.options.maxReconnectAttempts) {
      this.fail(session, error ?? new Error('Host is unavailable.'))
      return
    }
    if (error) this.recordError(error)
    this.publish('reconnecting')
    this.later(session, 'guest-retry', this.backoff(session.linkAttempts), () => this.connectGuest(session))
  }

  private completeStartup(session: Session): void {
    this.clearTimer(session, 'startup')
    session.resolve?.(session.localPeerId!)
    session.resolve = session.reject = undefined
  }

  private rejectStartup(session: Session, error: Error): void {
    session.reject?.(error)
    session.resolve = session.reject = undefined
  }

  private fail(session: Session, error: Error): void {
    if (!this.isActive(session)) return
    // Keep the session identity for the owner to see failure and explicitly leave.
    session.leaving = true
    this.rejectStartup(session, error)
    this.disposeSession(session)
    this.removeBrowserListeners()
    this.snapshot = { ...this.snapshot, lastError: error.message }
    this.publish('error', { type: 'error', error })
  }

  private dropPeer(session: Session): void {
    this.clearTimer(session, 'peer-open')
    this.clearTimer(session, 'signaling')
    this.clearTimer(session, 'signal-open')
    this.clearTimer(session, 'guest-retry')
    const peer = session.peer
    session.peer = null
    session.signaling = false
    session.guestLink = null
    const links = new Set([...session.pending, ...session.links.values()])
    const ids = [...session.links.keys()]
    session.links.clear()
    session.pending.clear()
    session.metadata.clear()
    peer?.removeAllListeners()
    for (const link of links) link.close()
    peer?.destroy()
    if (this.session === session) {
      for (const peerId of ids) this.publish(this.connectionStatus(session), { type: 'connection-close', peerId })
    }
  }

  private disposeSession(session: Session): void {
    this.clearTimers(session)
    this.dropPeer(session)
  }

  private isActive(session: Session): boolean {
    return this.session === session && !session.leaving
  }

  private send(link: PeerLink, type: string, payload: unknown): boolean {
    return !type.startsWith('$network/') && link.send(createNetworkMessage(type, payload))
  }

  private connectionStatus(session: Session): ConnectionStatus {
    if (session.leaving) return 'leaving'
    return (session.role === 'host' ? session.signaling : session.guestLink?.ready) ? 'connected' : 'reconnecting'
  }

  private publish(status: ConnectionStatus, event: TransportEvent = { type: 'status', status }): void {
    const session = this.session
    if (!session) return
    this.snapshot = {
      ...this.snapshot, status, sessionId: session.id, role: session.role,
      localPeerId: session.localPeerId, hostPeerId: session.hostId,
      connectedPeerIds: [...session.links.keys()],
      connections: [
        ...(session.localPeerId ? [{ peerId: session.localPeerId, isHost: session.role === 'host', metadata: this.localMetadata }] : []),
        ...[...session.links.keys()].map((peerId) => ({
          peerId, isHost: session.role === 'guest', metadata: session.metadata.get(peerId) ?? {},
        })),
      ],
    }
    this.notify(event)
  }

  private notify(event: TransportEvent): void {
    for (const listener of this.stateListeners) listener()
    this.emit(event)
  }

  private emit(event: TransportEvent): void {
    for (const listener of [...this.listeners]) {
      try { listener(event) } catch (error) { console.error('Network subscriber failed.', error) }
    }
  }

  private recordError(error: Error): void {
    this.snapshot = { ...this.snapshot, lastError: error.message }
  }

  private later(session: Session, name: string, delay: number, action: () => void): void {
    this.clearTimer(session, name)
    session.timers.set(name, setTimeout(() => {
      session.timers.delete(name)
      if (this.isActive(session)) action()
    }, delay))
  }

  private clearTimer(session: Session, name: string): void {
    clearTimeout(session.timers.get(name))
    session.timers.delete(name)
  }

  private clearTimers(session: Session): void {
    for (const timer of session.timers.values()) clearTimeout(timer)
    session.timers.clear()
  }

  private backoff(attempt: number): number {
    return Math.min(this.options.maxReconnectDelayMs, this.options.reconnectBaseDelayMs * 2 ** Math.min(attempt - 1, 16))
      * (0.9 + Math.random() * 0.2)
  }

  private onOnline = (): void => {
    const session = this.session
    if (!session || !this.isActive(session)) return
    if (!session.peer) this.openPeer(session)
    else if (!session.signaling) this.recoverSignaling(session)
    else if (session.role === 'guest' && !session.guestLink) this.connectGuest(session)
  }

  private onPageHide = (): void => this.close()

  private addBrowserListeners(): void {
    if (typeof window === 'undefined') return
    window.addEventListener('online', this.onOnline)
    window.addEventListener('pagehide', this.onPageHide)
  }

  private removeBrowserListeners(): void {
    if (typeof window === 'undefined') return
    window.removeEventListener('online', this.onOnline)
    window.removeEventListener('pagehide', this.onPageHide)
  }

  private toError(error: unknown): Error {
    return error instanceof Error ? error : new Error(String(error))
  }
}
