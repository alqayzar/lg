import type { ConnectionStatus, NetworkClient, NetworkMessage, TransportEvent } from '@/features/network/types'
import type { PlayerMetadata } from '@/features/profile/types'
import type { RoomEntry } from './room-session'
import { createRoomToken } from './room-token'
import {
  parsePlayerInfo,
  parsePlayerList,
  parseRoomRequest,
  ROOM_MESSAGE,
  type RegisteredPlayerMetadata,
  type RoomPlayer,
} from './room-protocol'

export const LEAVE_TIMEOUT_MS = 750
export const ACK_FLUSH_MS = 120

export interface RoomState {
  currentPeerId: string | null
  error: string | null
  isClosed: boolean
  isLeaving: boolean
  players: RoomPlayer[]
  role: 'guest' | 'host' | null
  roomCode: string | null
  status: ConnectionStatus | 'loading'
}

export interface RoomPersistence {
  updatePeers(peerIds: string[], isCurrent: () => boolean): Promise<void>
  clear(): Promise<void>
}

export const EMPTY_ROOM: RoomState = {
  currentPeerId: null,
  error: null,
  isClosed: false,
  isLeaving: false,
  players: [],
  role: null,
  roomCode: null,
  status: 'loading',
}

export class RoomController {
  private readonly client: NetworkClient<PlayerMetadata>
  private readonly entry: RoomEntry
  private readonly profile: RegisteredPlayerMetadata
  private readonly persistence?: RoomPersistence
  private readonly epoch = createRoomToken()
  private readonly listeners = new Set<() => void>()
  private readonly metadata = new Map<string, RegisteredPlayerMetadata>()
  private readonly departing = new Map<string, ReturnType<typeof setTimeout>>()
  private readonly linkVersions = new Map<string, number>()
  private state: RoomState
  private sessionId: number | null = null
  private unsubscribe: (() => void) | null = null
  private disposed = false
  private finishing = false
  private revision = 0
  private hostEpoch: string | null = null
  private hostRevision = -1
  private infoRequest: string | null = null
  private persistedIds: string[] | null = null
  private writes: Promise<void> = Promise.resolve()
  private leavePromise: Promise<void> | null = null
  private resolveLeave: (() => void) | null = null
  private leaveRequest: string | null = null
  private hostCloseRequest: string | null = null
  private closingPeers = new Set<string>()
  private leaveTimer: ReturnType<typeof setTimeout> | null = null

  constructor(client: NetworkClient<PlayerMetadata>, entry: RoomEntry, profile: RegisteredPlayerMetadata, persistence?: RoomPersistence) {
    this.client = client
    this.entry = entry
    this.profile = profile
    this.persistence = persistence
    this.state = { ...EMPTY_ROOM, role: entry.role, roomCode: entry.roomCode }
  }

  getSnapshot = (): RoomState => this.state

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  start(): void {
    if (this.disposed || this.sessionId !== null) return

    const snapshot = this.client.getSnapshot()
    const canAdopt = snapshot.role === this.entry.role
      && (this.entry.role === 'host' ? snapshot.localPeerId : snapshot.hostPeerId) === this.entry.hostPeerId
      && !['idle', 'closed', 'leaving', 'error'].includes(snapshot.status)
    let joining: Promise<string> | undefined
    if (!canAdopt) {
      if (snapshot.status !== 'idle' && snapshot.status !== 'closed') this.client.close()
      if (this.entry.role === 'host') this.client.resumeHost(this.entry.hostPeerId)
      else joining = this.client.joinHost(this.entry.hostPeerId)
    }

    this.sessionId = this.client.getSnapshot().sessionId
    this.unsubscribe = this.client.subscribe((event) => this.onEvent(event))
    this.client.setLocalMetadata(this.profile)
    this.syncState()
    if (this.entry.role === 'host') {
      this.syncHostRoster()
      // An adopted host reservation may already have received a guest's first request.
      for (const peerId of this.remotePeerIds()) {
        this.client.sendToPeer(peerId, ROOM_MESSAGE.getInfos, { requestId: createRoomToken() })
      }
    } else if (this.hostIsConnected()) this.openGuestConnection()

    void joining?.catch((error: unknown) => {
      if (this.ownsSession() && !this.state.isLeaving) {
        this.publish({ error: error instanceof Error ? error.message : 'Connexion impossible.' })
      }
    })
  }

  leave(): Promise<void> {
    if (this.leavePromise) return this.leavePromise
    if (!this.ownsSession()) return Promise.resolve()

    // Stop transport recovery before any final application message is sent.
    this.state = { ...this.state, isLeaving: true }
    this.client.beginLeave()
    this.publish({ isLeaving: true, status: 'leaving' })
    this.leavePromise = new Promise((resolve) => { this.resolveLeave = resolve })
    this.leaveRequest = createRoomToken()
    this.leaveTimer = setTimeout(() => { void this.finishLeave() }, LEAVE_TIMEOUT_MS)

    if (this.entry.role === 'host') {
      this.closingPeers = new Set(this.remotePeerIds())
      for (const peerId of this.closingPeers) {
        if (!this.client.sendToPeer(peerId, ROOM_MESSAGE.roomClose, { epoch: this.epoch, requestId: this.leaveRequest })) {
          this.closingPeers.delete(peerId)
        }
      }
      if (this.closingPeers.size === 0) void this.finishLeave()
    } else if (!this.client.sendToHost(ROOM_MESSAGE.playerLeave, {
      epoch: this.hostEpoch ?? undefined,
      requestId: this.leaveRequest,
    })) {
      void this.finishLeave()
    }
    return this.leavePromise
  }

  dispose(): void {
    if (this.disposed) return
    if (this.state.isLeaving) void this.finishLeave()
    const ownsSession = this.ownsSession()
    this.disposed = true
    this.detach()
    if (ownsSession) this.client.close()
    this.listeners.clear()
  }

  private ownsSession(): boolean {
    return !this.disposed && this.sessionId !== null && this.client.getSnapshot().sessionId === this.sessionId
  }

  private hostIsConnected(): boolean {
    const snapshot = this.client.getSnapshot()
    return snapshot.hostPeerId === this.entry.hostPeerId && snapshot.connectedPeerIds.includes(this.entry.hostPeerId)
  }

  private remotePeerIds(): string[] {
    return [...new Set(this.client.getSnapshot().connectedPeerIds)]
      .filter((id) => id !== this.entry.hostPeerId && !this.departing.has(id)).sort()
  }

  private publish(update: Partial<RoomState>): void {
    this.state = { ...this.state, ...update }
    for (const listener of this.listeners) listener()
  }

  private syncState(): void {
    const snapshot = this.client.getSnapshot()
    this.publish({
      currentPeerId: snapshot.localPeerId,
      error: snapshot.lastError ?? (snapshot.status === 'connected' ? null : this.state.error),
      status: snapshot.status,
    })
  }

  private onEvent(event: TransportEvent): void {
    if (!this.ownsSession() || this.finishing) return
    this.syncState()
    if (this.state.isLeaving) {
      if (event.type === 'message') this.onLeavingMessage(event.message, event.fromPeerId)
      if (event.type === 'connection-close' && this.entry.role === 'host') {
        this.closingPeers.delete(event.peerId)
        if (this.closingPeers.size === 0 && this.leaveRequest) void this.finishLeave()
      }
      return
    }

    if (this.entry.role === 'host') {
      if (event.type === 'connection-open') {
        this.linkVersions.set(event.peerId, (this.linkVersions.get(event.peerId) ?? 0) + 1)
        this.cancelDeparture(event.peerId)
        this.metadata.delete(event.peerId)
      }
      if (event.type === 'connection-close' && !this.client.getSnapshot().connectedPeerIds.includes(event.peerId)) {
        this.cancelDeparture(event.peerId)
      }
      // Read the transport NOW, even when a message precedes React's next render.
      this.syncHostRoster(event.type === 'connection-open')
      if (event.type === 'message') this.onHostMessage(event.message, event.fromPeerId)
    } else {
      if (event.type === 'connection-open' && event.peerId === this.entry.hostPeerId && this.hostIsConnected()) {
        this.openGuestConnection()
      }
      if (!this.hostIsConnected()) {
        this.hostEpoch = null
        this.hostRevision = -1
        this.infoRequest = null
        if (this.state.players.length) this.publish({ players: [] })
      }
      if (event.type === 'message' && event.fromPeerId === this.entry.hostPeerId && this.hostIsConnected()) {
        this.onGuestMessage(event.message)
      }
    }
  }

  private syncHostRoster(forceRevision = false): void {
    const snapshot = this.client.getSnapshot()
    const ids = this.remotePeerIds()
    const players: RoomPlayer[] = snapshot.localPeerId
      ? [{ isHost: true, peerId: snapshot.localPeerId, metadata: this.profile }]
      : []
    for (const id of this.metadata.keys()) {
      if (!ids.includes(id)) this.metadata.delete(id)
    }
    players.push(...ids.map((peerId) => ({ isHost: false, peerId, metadata: this.metadata.get(peerId) ?? {} })))
    const changed = forceRevision || players.length !== this.state.players.length
      || players.some((player, index) => player.peerId !== this.state.players[index]?.peerId)
    if (changed) {
      this.revision += 1
      this.publish({ players })
      for (const peerId of ids) this.sendPlayerList(peerId)
    }

    if (!this.persistedIds || ids.length !== this.persistedIds.length || ids.some((id, index) => id !== this.persistedIds?.[index])) {
      this.persistedIds = ids
      this.writes = this.writes.then(async () => {
        const isCurrent = () => this.ownsSession() && !this.state.isLeaving
        if (isCurrent()) await this.persistence?.updatePeers(ids, isCurrent)
      }).catch(() => {
        if (this.ownsSession() && !this.state.isLeaving) {
          this.publish({ error: 'Impossible de sauvegarder la partie.' })
        }
      })
    }
  }

  private sendPlayerList(peerId: string, requestId?: string): void {
    this.client.sendToPeer(peerId, ROOM_MESSAGE.playerList, {
      epoch: this.epoch,
      players: this.state.players.map(({ isHost, peerId: id }) => ({ isHost, peerId: id })),
      requestId,
      revision: this.revision,
    })
  }

  private sendPlayerInfo(peerId: string, player: RoomPlayer): void {
    if (!player.metadata.name) return
    this.client.sendToPeer(peerId, ROOM_MESSAGE.playerInfo, {
      epoch: this.epoch,
      isHost: player.isHost,
      metadata: player.metadata,
      peerId: player.peerId,
      revision: this.revision,
    })
  }

  private onHostMessage(message: NetworkMessage, fromPeerId: string): void {
    if (!this.remotePeerIds().includes(fromPeerId)) return
    if (message.type === ROOM_MESSAGE.getInfos) {
      const request = parseRoomRequest(message.payload)
      if (!request) return
      this.sendPlayerList(fromPeerId, request.requestId)
      for (const player of this.state.players) this.sendPlayerInfo(fromPeerId, player)
    } else if (message.type === ROOM_MESSAGE.playerInfo) {
      const info = parsePlayerInfo(message.payload)
      if (!info || info.isHost === true || (info.peerId && info.peerId !== fromPeerId)
        || (info.epoch && info.epoch !== this.epoch)) return
      const previous = this.metadata.get(fromPeerId)
      if (previous?.name === info.metadata.name && previous.avatarUrl === info.metadata.avatarUrl) return
      this.metadata.set(fromPeerId, info.metadata)
      const players = this.state.players.map((player) => player.peerId === fromPeerId ? { ...player, metadata: info.metadata } : player)
      this.publish({ players })
      const player = players.find((current) => current.peerId === fromPeerId)
      if (player) for (const peerId of this.remotePeerIds()) this.sendPlayerInfo(peerId, player)
    } else if (message.type === ROOM_MESSAGE.playerLeave) {
      const request = parseRoomRequest(message.payload)
      if (!request || (request.epoch && request.epoch !== this.epoch)) return
      const linkVersion = this.linkVersions.get(fromPeerId)
      this.departing.set(fromPeerId, setTimeout(() => {
        if (this.ownsSession() && !this.state.isLeaving && this.departing.has(fromPeerId)
          && this.linkVersions.get(fromPeerId) === linkVersion) {
          this.client.disconnectPeer(fromPeerId)
        }
        this.cancelDeparture(fromPeerId)
      }, ACK_FLUSH_MS))
      this.syncHostRoster()
      this.client.sendToPeer(fromPeerId, ROOM_MESSAGE.playerLeft, { epoch: this.epoch, requestId: request.requestId })
    }
  }

  private openGuestConnection(): void {
    this.hostEpoch = null
    this.hostRevision = -1
    this.infoRequest = createRoomToken()
    this.publish({ players: [] })
    this.client.sendToHost(ROOM_MESSAGE.getInfos, { requestId: this.infoRequest })
    if (this.ownsSession() && !this.state.isLeaving) {
      this.client.sendToHost(ROOM_MESSAGE.playerInfo, { metadata: this.profile })
    }
  }

  private onGuestMessage(message: NetworkMessage): void {
    if (message.type === ROOM_MESSAGE.getInfos && parseRoomRequest(message.payload)) {
      this.openGuestConnection()
    } else if (message.type === ROOM_MESSAGE.roomClose) {
      this.acceptHostClose(message)
    } else if (message.type === ROOM_MESSAGE.playerList) {
      const list = parsePlayerList(message.payload)
      if (!list || !this.infoRequest) return
      if (this.hostEpoch === null ? list.requestId !== this.infoRequest : list.epoch !== this.hostEpoch) return
      if (list.revision < this.hostRevision) return
      const hosts = list.players.filter((player) => player.isHost)
      if (hosts.length !== 1 || hosts[0].peerId !== this.entry.hostPeerId) return
      this.hostEpoch = list.epoch
      this.hostRevision = list.revision
      this.publish({ players: list.players.map((player) => ({
        ...player,
        metadata: player.peerId === this.client.getSnapshot().localPeerId
          ? this.profile
          : this.state.players.find((current) => current.peerId === player.peerId)?.metadata ?? {},
      })) })
    } else if (message.type === ROOM_MESSAGE.playerInfo) {
      const info = parsePlayerInfo(message.payload)
      if (!info || info.epoch !== this.hostEpoch || info.revision !== this.hostRevision) return
      // Metadata can enrich existing membership, never create it.
      this.publish({ players: this.state.players.map((player) => (
        player.peerId === info.peerId && player.isHost === info.isHost
          ? { ...player, metadata: info.metadata }
          : player
      )) })
    }
  }

  private onLeavingMessage(message: NetworkMessage, fromPeerId: string): void {
    const request = parseRoomRequest(message.payload)
    if (!request) return
    if (this.entry.role === 'guest') {
      if (fromPeerId !== this.entry.hostPeerId || !this.hostIsConnected()) return
      if (message.type === ROOM_MESSAGE.roomClose) this.acceptHostClose(message)
      if (message.type === ROOM_MESSAGE.playerLeft && request.requestId === this.leaveRequest
        && (!this.hostEpoch || request.epoch === this.hostEpoch)) void this.finishLeave()
    } else if (message.type === ROOM_MESSAGE.roomClosed && request.requestId === this.leaveRequest
      && request.epoch === this.epoch && this.closingPeers.delete(fromPeerId) && this.closingPeers.size === 0) {
      void this.finishLeave()
    } else if (message.type === ROOM_MESSAGE.playerLeave && this.closingPeers.has(fromPeerId)
      && (!request.epoch || request.epoch === this.epoch)) {
      this.client.sendToPeer(fromPeerId, ROOM_MESSAGE.playerLeft, { epoch: this.epoch, requestId: request.requestId })
    }
  }

  private acceptHostClose(message: NetworkMessage): void {
    const request = parseRoomRequest(message.payload)
    if (!request?.epoch || (this.hostEpoch && request.epoch !== this.hostEpoch)) return
    if (this.hostCloseRequest) return
    this.hostCloseRequest = request.requestId
    this.leavePromise ??= new Promise((resolve) => { this.resolveLeave = resolve })
    this.state = { ...this.state, isLeaving: true }
    this.client.beginLeave()
    this.publish({ players: [], isLeaving: true, status: 'leaving' })
    this.client.sendToHost(ROOM_MESSAGE.roomClosed, request)
    if (this.leaveTimer !== null) clearTimeout(this.leaveTimer)
    this.leaveTimer = setTimeout(() => { void this.finishLeave() }, ACK_FLUSH_MS)
  }

  private async finishLeave(): Promise<void> {
    if (this.finishing) return
    this.finishing = true
    const ownsSession = this.ownsSession()
    this.detach()
    if (ownsSession) this.client.close()
    const closedSessionId = this.client.getSnapshot().sessionId
    let error: string | null = null
    if (this.entry.role === 'host') {
      try {
        await this.writes
        await this.persistence?.clear()
      } catch {
        error = 'Impossible de supprimer la partie enregistree.'
      }
    }
    if (!this.disposed && ownsSession && this.client.getSnapshot().sessionId === closedSessionId) {
      this.publish({ players: [], currentPeerId: null, error, status: 'closed', isClosed: true })
    }
    this.resolveLeave?.()
  }

  private cancelDeparture(peerId: string): void {
    const timer = this.departing.get(peerId)
    if (timer !== undefined) clearTimeout(timer)
    this.departing.delete(peerId)
  }

  private detach(): void {
    this.unsubscribe?.()
    this.unsubscribe = null
    if (this.leaveTimer !== null) clearTimeout(this.leaveTimer)
    this.leaveTimer = null
    for (const peerId of this.departing.keys()) this.cancelDeparture(peerId)
  }
}
