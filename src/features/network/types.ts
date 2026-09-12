export type NetworkRole = 'host' | 'guest' | null

export type ConnectionStatus =
  | 'idle'
  | 'starting'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'offline'
  | 'leaving'
  | 'closed'
  | 'error'

export interface NetworkMessage {
  id: string
  payload: unknown
  sentAt: number
  type: string
  version: 1
}

export interface NetworkConnection<TMetadata extends object> {
  isHost: boolean
  metadata: TMetadata
  peerId: string
}

export interface NetworkSnapshot<TMetadata extends object> {
  connections: NetworkConnection<TMetadata>[]
  connectedPeerIds: string[]
  lastError: string | null
  localPeerId: string | null
  hostPeerId: string | null
  sessionId: number
  role: NetworkRole
  status: ConnectionStatus
}

export type TransportEvent =
  | { type: 'connections-change' }
  | { type: 'connection-open'; peerId: string }
  | { type: 'connection-close'; peerId: string }
  | { type: 'error'; error: Error }
  | { type: 'message'; fromPeerId: string; message: NetworkMessage }
  | { type: 'status'; status: ConnectionStatus }

export type TransportListener = (event: TransportEvent) => void

// No PeerJS objects cross this boundary. A true send result means accepted,
// not acknowledged by the application on the other end.
export interface NetworkClient<TMetadata extends object> {
  getSnapshot(): NetworkSnapshot<TMetadata>
  subscribe(listener: TransportListener): () => void
  subscribeState(listener: () => void): () => void
  subscribeToMessages(listener: (message: NetworkMessage, fromPeerId: string) => void): () => void
  startHost(hostId: string): Promise<string>
  resumeHost(hostId: string): void
  joinHost(hostId: string, preferredPeerId?: string): Promise<string>
  beginLeave(): void
  close(): void
  disconnectPeer(peerId: string): boolean
  sendToHost(type: string, payload: unknown): boolean
  sendToPeer(peerId: string, type: string, payload: unknown): boolean
  broadcast(type: string, payload: unknown): void
  setLocalMetadata(metadata: TMetadata): void
  registerConnectionMetadata(peerId: string, metadata: TMetadata): boolean
  updateConnectionMetadata(peerId: string, metadata: Partial<TMetadata>): boolean
}
