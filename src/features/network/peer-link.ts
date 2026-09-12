import type { DataConnection } from 'peerjs'
import { createNetworkMessage, parseNetworkMessage } from './protocol'
import type { NetworkMessage } from './types'

export interface LinkOptions {
  connectionTimeoutMs: number
  heartbeatIntervalMs: number
  heartbeatTimeoutMs: number
  maxBufferedBytes: number
}

interface LinkEvents {
  open(): void
  message(message: NetworkMessage): void
  close(error?: Error): void
}

const PING = '$network/ping'
const PONG = '$network/pong'

/** Owns one data channel, including channels that never finish opening. */
export class PeerLink {
  readonly peerId: string
  ready = false
  private closed = false
  private lastReceived = Date.now()
  private lastTick = Date.now()
  private readonly connection: DataConnection
  private readonly options: LinkOptions
  private readonly events: LinkEvents
  private readonly timeout: ReturnType<typeof setTimeout>
  private heartbeat: ReturnType<typeof setInterval> | undefined

  constructor(connection: DataConnection, options: LinkOptions, events: LinkEvents) {
    this.connection = connection
    this.peerId = connection.peer
    this.options = options
    this.events = events
    this.timeout = setTimeout(() => this.close(new Error('Connection timed out.')), options.connectionTimeoutMs)
    connection.on('open', this.onOpen)
    connection.on('data', this.onData)
    connection.on('close', this.onClose)
    connection.on('error', this.onError)
    connection.on('iceStateChanged', this.onIceState)
    if (connection.open) queueMicrotask(this.onOpen)
  }

  send(message: NetworkMessage): boolean {
    if (this.closed || !this.ready || !this.connection.open) return false
    if ((this.connection.dataChannel?.bufferedAmount ?? 0) > this.options.maxBufferedBytes) {
      this.close(new Error('Connection send buffer is full.'))
      return false
    }
    try {
      // PeerJS's binary serializer may reject asynchronously.
      const result = this.connection.send(message)
      if (result) void result.catch(this.onError)
      return true
    } catch (error) {
      this.onError(error)
      return false
    }
  }

  close(error?: Error): void {
    if (this.closed) return
    this.closed = true
    this.ready = false
    clearTimeout(this.timeout)
    clearInterval(this.heartbeat)
    this.connection.off('open', this.onOpen)
    this.connection.off('data', this.onData)
    this.connection.off('close', this.onClose)
    this.connection.off('error', this.onError)
    this.connection.off('iceStateChanged', this.onIceState)
    try {
      this.connection.close()
    } finally {
      this.events.close(error)
    }
  }

  private onOpen = (): void => {
    if (this.closed || this.ready) return
    clearTimeout(this.timeout)
    this.ready = true
    this.lastReceived = this.lastTick = Date.now()
    this.heartbeat = setInterval(this.tick, this.options.heartbeatIntervalMs)
    this.events.open()
  }

  private onData = (data: unknown): void => {
    if (this.closed || !this.ready) return
    const message = parseNetworkMessage(data)
    if (!message) {
      this.close(new Error('Invalid network message.'))
      return
    }
    this.lastReceived = Date.now()
    if (message.type === PING) this.send(createNetworkMessage(PONG, null))
    else if (!message.type.startsWith('$network/')) this.events.message(message)
  }

  private onClose = (): void => this.close()

  private onError = (error: unknown): void => {
    this.close(error instanceof Error ? error : new Error(String(error)))
  }

  private onIceState = (state: RTCIceConnectionState): void => {
    if (state === 'failed' || state === 'closed') this.close(new Error('Data channel disconnected.'))
  }

  private tick = (): void => {
    const now = Date.now()
    // A suspended local tab cannot judge remote liveness until it probes again.
    if (now - this.lastTick > this.options.heartbeatTimeoutMs) this.lastReceived = now
    this.lastTick = now
    if (now - this.lastReceived >= this.options.heartbeatTimeoutMs) {
      this.close(new Error('Remote peer stopped responding.'))
    } else {
      this.send(createNetworkMessage(PING, null))
    }
  }
}
