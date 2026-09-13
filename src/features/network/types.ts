export type NetworkRole = 'host' | 'guest' | null

export type ConnectionStatus =
  | 'idle'
  | 'starting'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'offline'
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
