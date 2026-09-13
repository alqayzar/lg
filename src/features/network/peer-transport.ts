import Peer, { type DataConnection, type PeerError, type PeerOptions } from 'peerjs'
import { createNetworkMessage, parseNetworkMessage } from './protocol'
import type {
  ConnectionStatus,
  NetworkConnection,
  NetworkRole,
  NetworkSnapshot,
  TransportEvent,
  TransportListener,
} from './types'

interface PeerTransportOptions {
  maxQueuedMessages?: number
  maxReconnectDelayMs?: number
  peerOptions?: PeerOptions
  reconnectBaseDelayMs?: number
}

const DEFAULT_MAX_QUEUED_MESSAGES = 50
const DEFAULT_MAX_RECONNECT_DELAY_MS = 15_000
const DEFAULT_RECONNECT_BASE_DELAY_MS = 500

export class PeerTransport {
  private clientConnection: DataConnection | null = null
  private connections = new Map<string, DataConnection>()
  private connectionMetadata = new Map<string, object>()
  private guestHostId: string | null = null
  private lastError: string | null = null
  private localPeerId: string | null = null
  private localMetadata: object = {}
  private outbox: ReturnType<typeof createNetworkMessage>[] = []
  private peer: Peer | null = null
  private reconnectAttempt = 0
  private reconnectTimer: number | null = null
  private role: NetworkRole = null
  private status: ConnectionStatus = 'idle'
  private stopped = false
  private subscribers = new Set<TransportListener>()
  private readonly options: PeerTransportOptions

  public constructor(options: PeerTransportOptions = {}) {
    this.options = options
  }

  public getSnapshot(): NetworkSnapshot<object> {
    const connections = this.getConnections()

    return {
      connections,
      connectedPeerIds: this.role === 'guest' && this.clientConnection?.open
        ? [this.clientConnection.peer]
        : [...this.connections.keys()],
      lastError: this.lastError,
      localPeerId: this.localPeerId,
      role: this.role,
      status: this.status,
    }
  }

  public setLocalMetadata(metadata: object): void {
    if (this.hasSameMetadata(this.localMetadata, metadata)) {
      return
    }

    this.localMetadata = { ...metadata }
    this.emit({ type: 'connections-change' })
  }

  public updateConnectionMetadata(peerId: string, metadata: object): boolean {
    if (!this.connections.has(peerId)) {
      return false
    }

    this.connectionMetadata.set(peerId, {
      ...this.connectionMetadata.get(peerId),
      ...metadata,
    })
    this.emit({ type: 'connections-change' })
    return true
  }

  public subscribe(listener: TransportListener): () => void {
    this.subscribers.add(listener)
    return () => this.subscribers.delete(listener)
  }

  public async startHost(roomId: string): Promise<string> {
    this.reset()
    this.role = 'host'
    this.stopped = false
    this.setStatus('starting')

    try {
      const peerId = await this.openPeer(roomId)
      this.setStatus('connected')
      return peerId
    } catch (error) {
      this.fail(error)
      throw error
    }
  }

  public async joinHost(hostId: string, preferredPeerId?: string): Promise<string> {
    this.reset()
    this.role = 'guest'
    this.guestHostId = hostId
    this.stopped = false
    this.setStatus('starting')

    try {
      let peerId: string

      try {
        peerId = await this.openPeer(preferredPeerId)
      } catch (error) {
        if (!preferredPeerId || !this.isUnavailableIdError(error)) {
          throw error
        }

        this.destroyPeer()
        peerId = await this.openPeer()
      }

      this.connectGuestToHost()
      return peerId
    } catch (error) {
      this.fail(error)
      throw error
    }
  }

  public resumeHost(roomId: string): void {
    this.reset()
    this.role = 'host'
    this.stopped = false
    this.localPeerId = roomId
    this.setStatus('starting')
    this.tryResumeHost(roomId)
  }

  public sendToHost(type: string, payload: unknown): boolean {
    if (this.role !== 'guest') {
      return false
    }

    const message = createNetworkMessage(type, payload)
    const connection = this.clientConnection

    if (connection?.open) {
      return this.send(connection, message)
    }

    this.queueMessage(message)
    return true
  }

  public sendToPeer(peerId: string, type: string, payload: unknown): boolean {
    if (this.role !== 'host') {
      return false
    }

    const connection = this.connections.get(peerId)
    return connection ? this.send(connection, createNetworkMessage(type, payload)) : false
  }

  public broadcast(type: string, payload: unknown): void {
    if (this.role !== 'host') {
      return
    }

    const message = createNetworkMessage(type, payload)
    for (const connection of this.connections.values()) {
      this.send(connection, message)
    }
  }

  public close(): void {
    this.stopped = true
    this.clearReconnectTimer()
    this.outbox = []
    this.closeConnections()
    this.destroyPeer()
    this.guestHostId = null
    this.localPeerId = null
    this.role = null
    this.lastError = null
    this.setStatus('closed')
  }

  private async openPeer(requestedPeerId?: string): Promise<string> {
    const peer = requestedPeerId
      ? new Peer(requestedPeerId, this.options.peerOptions)
      : this.options.peerOptions
        ? new Peer(this.options.peerOptions)
        : new Peer()

    this.peer = peer

    return new Promise((resolve, reject) => {
      let opened = false

      peer.on('open', (peerId) => {
        if (peer !== this.peer) {
          return
        }

        opened = true
        this.localPeerId = peerId
        this.lastError = null
        this.reconnectAttempt = 0
        resolve(peerId)
      })

      peer.on('connection', (connection) => {
        if (peer === this.peer && this.role === 'host') {
          this.attachHostConnection(connection)
        }
      })

      peer.on('disconnected', () => {
        if (peer === this.peer && !this.stopped) {
          this.handlePeerDisconnect(peer)
        }
      })

      peer.on('close', () => {
        if (peer === this.peer && !this.stopped) {
          this.setStatus('offline')
        }
      })

      peer.on('error', (error) => {
        if (peer !== this.peer) {
          return
        }

        if (!opened) {
          reject(error)
          return
        }

        this.handlePeerError(error)
      })
    })
  }

  private attachHostConnection(connection: DataConnection): void {
    connection.on('open', () => {
      if (this.stopped) {
        connection.close()
        return
      }

      this.connections.get(connection.peer)?.close()
      this.connections.set(connection.peer, connection)
      this.connectionMetadata.set(connection.peer, this.asMetadata(connection.metadata))
      this.attachMessageListener(connection)
      this.emit({ type: 'connection-open', peerId: connection.peer })
    })

    connection.on('close', () => {
      if (this.connections.get(connection.peer) !== connection) {
        return
      }

      this.connections.delete(connection.peer)
      this.connectionMetadata.delete(connection.peer)
      this.emit({ type: 'connection-close', peerId: connection.peer })
    })

    connection.on('error', (error) => this.emit({ type: 'error', error }))
  }

  private attachMessageListener(connection: DataConnection): void {
    connection.on('data', (rawMessage) => {
      const message = parseNetworkMessage(rawMessage)

      if (!message) {
        this.emit({ type: 'error', error: new Error(`Ignored invalid message from ${connection.peer}.`) })
        return
      }

      this.emit({ type: 'message', fromPeerId: connection.peer, message })
    })
  }

  private connectGuestToHost(): void {
    if (!this.peer || !this.guestHostId || this.stopped) {
      return
    }

    this.clearReconnectTimer()
    const previousConnection = this.clientConnection
    this.clientConnection = null
    previousConnection?.close()
    this.setStatus(this.reconnectAttempt > 0 ? 'reconnecting' : 'connecting')

    const connection = this.peer.connect(this.guestHostId, {
      metadata: this.localMetadata,
      reliable: true,
    })
    this.clientConnection = connection
    this.attachMessageListener(connection)

    connection.on('open', () => {
      if (connection !== this.clientConnection || this.stopped) {
        connection.close()
        return
      }

      this.reconnectAttempt = 0
      this.setStatus('connected')
      this.flushOutbox(connection)
      this.emit({ type: 'connection-open', peerId: connection.peer })
    })

    connection.on('close', () => {
      if (connection !== this.clientConnection || this.stopped) {
        return
      }

      this.clientConnection = null
      this.emit({ type: 'connection-close', peerId: connection.peer })
      this.scheduleGuestReconnect()
    })

    connection.on('error', (error) => {
      if (connection !== this.clientConnection) {
        return
      }

      this.emit({ type: 'error', error })
      this.scheduleGuestReconnect()
    })
  }

  private tryResumeHost(roomId: string): void {
    if (this.stopped || this.role !== 'host') {
      return
    }

    void this.openPeer(roomId)
      .then(() => {
        this.reconnectAttempt = 0
        this.setStatus('connected')
      })
      .catch((error) => {
        this.destroyPeer()
        this.emit({ type: 'error', error: this.toError(error) })
        this.scheduleHostResume(roomId)
      })
  }

  private handlePeerDisconnect(peer: Peer): void {
    this.setStatus('reconnecting')

    try {
      peer.reconnect()
    } catch (error) {
      this.emit({ type: 'error', error: this.toError(error) })
    }

    if (this.role === 'guest') {
      this.scheduleGuestReconnect()
    }
  }

  private handlePeerError(error: PeerError<string>): void {
    if (this.role === 'guest' && !this.stopped) {
      this.emit({ type: 'error', error })
      this.scheduleGuestReconnect()
      return
    }

    this.fail(error)
  }

  private scheduleGuestReconnect(): void {
    if (this.stopped || this.role !== 'guest' || this.reconnectTimer !== null) {
      return
    }

    this.reconnectAttempt += 1
    this.setStatus('reconnecting')

    const baseDelay = this.options.reconnectBaseDelayMs ?? DEFAULT_RECONNECT_BASE_DELAY_MS
    const maxDelay = this.options.maxReconnectDelayMs ?? DEFAULT_MAX_RECONNECT_DELAY_MS
    const delay = Math.min(baseDelay * 2 ** (this.reconnectAttempt - 1), maxDelay)
    const jitter = Math.round(delay * (Math.random() * 0.2 - 0.1))

    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null
      this.connectGuestToHost()
    }, delay + jitter)
  }

  private scheduleHostResume(roomId: string): void {
    if (this.stopped || this.role !== 'host' || this.reconnectTimer !== null) {
      return
    }

    this.reconnectAttempt += 1
    this.setStatus('reconnecting')

    const baseDelay = this.options.reconnectBaseDelayMs ?? DEFAULT_RECONNECT_BASE_DELAY_MS
    const maxDelay = this.options.maxReconnectDelayMs ?? DEFAULT_MAX_RECONNECT_DELAY_MS
    const delay = Math.min(baseDelay * 2 ** (this.reconnectAttempt - 1), maxDelay)
    const jitter = Math.round(delay * (Math.random() * 0.2 - 0.1))

    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null
      this.tryResumeHost(roomId)
    }, delay + jitter)
  }

  private flushOutbox(connection: DataConnection): void {
    const queuedMessages = this.outbox
    this.outbox = []

    for (const message of queuedMessages) {
      if (!this.send(connection, message)) {
        this.queueMessage(message)
        break
      }
    }
  }

  private queueMessage(message: ReturnType<typeof createNetworkMessage>): void {
    const maxQueuedMessages = this.options.maxQueuedMessages ?? DEFAULT_MAX_QUEUED_MESSAGES
    if (this.outbox.length >= maxQueuedMessages) {
      this.outbox.shift()
    }
    this.outbox.push(message)
  }

  private send(connection: DataConnection, message: ReturnType<typeof createNetworkMessage>): boolean {
    if (!connection.open) {
      return false
    }

    try {
      connection.send(message)
      return true
    } catch (error) {
      this.emit({ type: 'error', error: this.toError(error) })
      return false
    }
  }

  private reset(): void {
    this.stopped = true
    this.clearReconnectTimer()
    this.outbox = []
    this.closeConnections()
    this.destroyPeer()
    this.guestHostId = null
    this.localPeerId = null
    this.lastError = null
    this.role = null
  }

  private closeConnections(): void {
    this.clientConnection?.close()
    this.clientConnection = null

    for (const connection of this.connections.values()) {
      connection.close()
    }
    this.connections.clear()
    this.connectionMetadata.clear()
  }

  private destroyPeer(): void {
    const peer = this.peer
    this.peer = null
    peer?.destroy()
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer === null) {
      return
    }

    window.clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
  }

  private fail(error: unknown): void {
    const normalizedError = this.toError(error)
    this.lastError = normalizedError.message
    this.emit({ type: 'error', error: normalizedError })
    this.setStatus('error')
  }

  private setStatus(status: ConnectionStatus): void {
    if (this.status === status) {
      return
    }

    this.status = status
    this.emit({ type: 'status', status })
  }

  private emit(event: TransportEvent): void {
    if (event.type === 'error') {
      this.lastError = event.error.message
    }

    for (const listener of this.subscribers) {
      listener(event)
    }
  }

  private getConnections(): NetworkConnection<object>[] {
    const localConnection = this.localPeerId
      ? [{
          isHost: this.role === 'host',
          metadata: this.localMetadata,
          peerId: this.localPeerId,
        }]
      : []
    const remoteConnections = this.role === 'guest' && this.clientConnection?.open
      ? [{ isHost: true, metadata: {}, peerId: this.clientConnection.peer }]
      : [...this.connections.keys()].map((peerId) => ({
          isHost: false,
          metadata: this.connectionMetadata.get(peerId) ?? {},
          peerId,
        }))

    return [...localConnection, ...remoteConnections]
  }

  private asMetadata(value: unknown): object {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? { ...(value as object) }
      : {}
  }

  private hasSameMetadata(first: object, second: object): boolean {
    const firstEntries = Object.entries(first)
    const secondEntries = Object.entries(second)

    return firstEntries.length === secondEntries.length
      && firstEntries.every(([key, value]) => secondEntries.some(
        ([secondKey, secondValue]) => key === secondKey && value === secondValue,
      ))
  }

  private isUnavailableIdError(error: unknown): boolean {
    return error instanceof Error && 'type' in error && error.type === 'unavailable-id'
  }

  private toError(error: unknown): Error {
    return error instanceof Error ? error : new Error(String(error))
  }
}
