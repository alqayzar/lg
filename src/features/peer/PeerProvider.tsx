import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react'
import Peer, { type DataConnection, type PeerOptions } from 'peerjs'

const USE_DEV_PEER_SERVER = false
const GUEST_RETRY_INITIAL_DELAY_MS = 100
const GUEST_RETRY_MAX_DELAY_MS = 1000
const GUEST_CONNECTION_TIMEOUT_MS = 200
const CLOSE_FLUSH_DELAY_MS = 200
const SIGNALING_RECONNECT_DELAY_MS = 1000
const HOST_START_RETRY_DELAY_MS = 1000
const HOST_START_MAX_ATTEMPTS = 20
const STARTUP_RETRY_ERROR_TYPES = new Set(['network', 'server-error', 'socket-error', 'socket-closed'])
const SIGNALING_RECOVERABLE_ERROR_TYPES = new Set(['network', 'socket-error', 'socket-closed'])

export type RoomPeerEvent =
  | { type: 'peer-open' }
  | { type: 'guest-open'; connectionId: string; metadata: unknown }
  | { type: 'guest-message'; connectionId: string; message: unknown }
  | { type: 'guest-close'; connectionId: string }
  | { type: 'host-open' }
  | { type: 'host-message'; message: unknown }
  | { type: 'host-close' }
  | { type: 'error'; error: Error }

interface PeerProviderProps {
  children: ReactNode
  connectionMetadata?: unknown
  role: 'host' | 'guest'
  roomCode: string
}

interface PeerContextValue {
  broadcast: (message: unknown, connectionIds?: string[]) => void
  disconnectConnection: (connectionId: string) => void
  isConnected: (connectionId: string) => boolean
  sendTo: (connectionId: string, message: unknown) => void
  sendToHost: (message: unknown) => boolean
  shutdown: () => Promise<void>
  subscribe: (listener: (event: RoomPeerEvent) => void) => () => void
}

const PeerContext = createContext<PeerContextValue | null>(null)

function PeerProvider(props: PeerProviderProps) {
  const metadataRef = useRef(props.connectionMetadata)
  metadataRef.current = props.connectionMetadata

  const listenersRef = useRef(new Set<(event: RoomPeerEvent) => void>())
  const broadcastRef = useRef<PeerContextValue['broadcast']>(() => {})
  const disconnectConnectionRef = useRef<PeerContextValue['disconnectConnection']>(() => {})
  const isConnectedRef = useRef<PeerContextValue['isConnected']>(() => false)
  const sendToRef = useRef<PeerContextValue['sendTo']>(() => {})
  const sendToHostRef = useRef<PeerContextValue['sendToHost']>(() => false)
  const shutdownRef = useRef<PeerContextValue['shutdown']>(() => Promise.resolve())

  useEffect(() => {
    let closed = false
    let guestRetryTimeout: number | undefined
    let guestRetryDelayMs = GUEST_RETRY_INITIAL_DELAY_MS
    let hostStartRetryTimeout: number | undefined
    let peer: Peer | null = null
    let signalingReconnectTimeout: number | undefined
    let shutdownPromise: Promise<void> | undefined
    let hostStartAttempts = 0
    let hostConnection: DataConnection | null = null
    let hostConnectionTimeout: number | undefined
    const connections = new Map<string, DataConnection>()
    const options: PeerOptions = USE_DEV_PEER_SERVER
      ? { host: window.location.hostname, path: '/lg-narrator', port: 9000 }
      : {}

    function emit(event: RoomPeerEvent) {
      if (closed) return
      listenersRef.current.forEach((listener) => listener(event))
    }

    function scheduleGuestRetry() {
      if (closed || guestRetryTimeout !== undefined) return
      guestRetryTimeout = window.setTimeout(() => {
        guestRetryTimeout = undefined
        connectToHost()
      }, guestRetryDelayMs)
      guestRetryDelayMs = Math.min(guestRetryDelayMs + 200, GUEST_RETRY_MAX_DELAY_MS)
    }

    function clearHostConnectionTimeout() {
      if (hostConnectionTimeout === undefined) return
      window.clearTimeout(hostConnectionTimeout)
      hostConnectionTimeout = undefined
    }

    function retryHostConnection(connection: DataConnection) {
      if (closed || hostConnection !== connection) return
      clearHostConnectionTimeout()
      hostConnection = null
      connection.close()
      emit({ type: 'host-close' })
      scheduleGuestRetry()
    }

    function connectToHost() {
      if (closed || hostConnection) return
      if (!peer?.open || peer.disconnected) {
        scheduleGuestRetry()
        return
      }

      const connection = peer.connect(props.roomCode, { metadata: metadataRef.current })
      hostConnection = connection
      hostConnectionTimeout = window.setTimeout(() => {
        retryHostConnection(connection)
      }, GUEST_CONNECTION_TIMEOUT_MS)

      connection.on('open', () => {
        if (closed || hostConnection !== connection) return
        clearHostConnectionTimeout()
        guestRetryDelayMs = GUEST_RETRY_INITIAL_DELAY_MS
        emit({ type: 'host-open' })
      })
      connection.on('data', (message) => {
        if (closed || hostConnection !== connection) return
        emit({ type: 'host-message', message })
      })
      connection.on('close', () => {
        if (closed || hostConnection !== connection) return
        clearHostConnectionTimeout()
        hostConnection = null
        emit({ type: 'host-close' })
        scheduleGuestRetry()
      })
      connection.on('error', () => {
        retryHostConnection(connection)
      })
    }

    function scheduleSignalingReconnect(targetPeer: Peer) {
      if (closed || peer !== targetPeer || targetPeer.destroyed || signalingReconnectTimeout !== undefined) return
      signalingReconnectTimeout = window.setTimeout(() => {
        signalingReconnectTimeout = undefined
        if (!closed && peer === targetPeer && targetPeer.disconnected && !targetPeer.destroyed) {
          targetPeer.reconnect()
        }
      }, SIGNALING_RECONNECT_DELAY_MS)
    }

    function createPeer() {
      if (closed) return

      hostStartAttempts += 1
      const nextPeer = props.role === 'host' ? new Peer(props.roomCode, options) : new Peer(options)
      let hasOpened = false
      peer = nextPeer

      nextPeer.on('open', () => {
        if (closed || peer !== nextPeer) return
        hasOpened = true
        if (signalingReconnectTimeout !== undefined) {
          window.clearTimeout(signalingReconnectTimeout)
          signalingReconnectTimeout = undefined
        }
        emit({ type: 'peer-open' })
        if (props.role === 'guest') connectToHost()
      })
      nextPeer.on('disconnected', () => scheduleSignalingReconnect(nextPeer))
      nextPeer.on('error', (error) => {
        if (closed || peer !== nextPeer) return

        const shouldRetryHostId = props.role === 'host' && error.type === 'unavailable-id'
        const shouldRetryStartup = !hasOpened && STARTUP_RETRY_ERROR_TYPES.has(error.type)
        if ((shouldRetryHostId || shouldRetryStartup) && hostStartAttempts < HOST_START_MAX_ATTEMPTS) {
          peer = null
          nextPeer.destroy()
          hostStartRetryTimeout = window.setTimeout(() => {
            hostStartRetryTimeout = undefined
            createPeer()
          }, HOST_START_RETRY_DELAY_MS)
          return
        }

        if (hasOpened && SIGNALING_RECOVERABLE_ERROR_TYPES.has(error.type)) {
          scheduleSignalingReconnect(nextPeer)
          return
        }

        emit({ type: 'error', error })
        if (props.role !== 'guest' || error.type !== 'peer-unavailable') return

        const unavailableConnection = hostConnection
        clearHostConnectionTimeout()
        hostConnection = null
        unavailableConnection?.close()
        emit({ type: 'host-close' })
        scheduleGuestRetry()
      })

      if (props.role !== 'host') return

      nextPeer.on('connection', (connection) => {
        const connectionId = connection.peer

        connection.on('open', () => {
          if (closed || peer !== nextPeer) {
            connection.close()
            return
          }

          const previousConnection = connections.get(connectionId)
          connections.set(connectionId, connection)
          if (previousConnection && previousConnection !== connection) previousConnection.close()
          emit({ type: 'guest-open', connectionId, metadata: connection.metadata })
        })
        connection.on('data', (message) => {
          if (closed || connections.get(connectionId) !== connection) return
          emit({ type: 'guest-message', connectionId, message })
        })
        connection.on('close', () => {
          if (closed || connections.get(connectionId) !== connection) return
          connections.delete(connectionId)
          emit({ type: 'guest-close', connectionId })
        })
        connection.on('error', () => {
          if (closed || connections.get(connectionId) !== connection) return
          connections.delete(connectionId)
          connection.close()
          emit({ type: 'guest-close', connectionId })
        })
      })
    }

    broadcastRef.current = (message, connectionIds) => {
      if (connectionIds) {
        connectionIds.forEach((connectionId) => connections.get(connectionId)?.send(message))
        return
      }
      connections.forEach((connection) => connection.send(message))
    }
    disconnectConnectionRef.current = (connectionId) => connections.get(connectionId)?.close()
    isConnectedRef.current = (connectionId) => {
      if (props.role === 'guest') return hostConnection?.open === true
      return connections.get(connectionId)?.open === true
    }
    sendToRef.current = (connectionId, message) => connections.get(connectionId)?.send(message)
    sendToHostRef.current = (message) => {
      if (props.role !== 'guest' || !hostConnection?.open) return false
      hostConnection.send(message)
      return true
    }
    shutdownRef.current = () => {
      if (shutdownPromise) return shutdownPromise

      closed = true
      if (guestRetryTimeout !== undefined) window.clearTimeout(guestRetryTimeout)
      clearHostConnectionTimeout()
      if (hostStartRetryTimeout !== undefined) window.clearTimeout(hostStartRetryTimeout)
      if (signalingReconnectTimeout !== undefined) window.clearTimeout(signalingReconnectTimeout)
      shutdownPromise = new Promise<void>((resolve) => {
        window.setTimeout(() => {
          peer?.destroy()
          resolve()
        }, CLOSE_FLUSH_DELAY_MS)
      })
      return shutdownPromise
    }

    createPeer()

    return () => {
      closed = true
      if (guestRetryTimeout !== undefined) window.clearTimeout(guestRetryTimeout)
      clearHostConnectionTimeout()
      if (hostStartRetryTimeout !== undefined) window.clearTimeout(hostStartRetryTimeout)
      if (signalingReconnectTimeout !== undefined) window.clearTimeout(signalingReconnectTimeout)
      peer?.destroy()
      broadcastRef.current = () => {}
      disconnectConnectionRef.current = () => {}
      isConnectedRef.current = () => false
      sendToRef.current = () => {}
      sendToHostRef.current = () => false
      shutdownRef.current = () => Promise.resolve()
    }
  }, [props.role, props.roomCode])

  const value = useMemo<PeerContextValue>(
    () => ({
      broadcast: (message, connectionIds) => broadcastRef.current(message, connectionIds),
      disconnectConnection: (connectionId) => disconnectConnectionRef.current(connectionId),
      isConnected: (connectionId) => isConnectedRef.current(connectionId),
      sendTo: (connectionId, message) => sendToRef.current(connectionId, message),
      sendToHost: (message) => sendToHostRef.current(message),
      shutdown: () => shutdownRef.current(),
      subscribe: (listener) => {
        listenersRef.current.add(listener)
        return () => listenersRef.current.delete(listener)
      },
    }),
    [],
  )

  return <PeerContext.Provider value={value}>{props.children}</PeerContext.Provider>
}

function usePeer(): PeerContextValue {
  const context = useContext(PeerContext)

  if (!context) {
    throw new Error('usePeer must be used within a PeerProvider')
  }

  return context
}

export { PeerProvider, usePeer }
