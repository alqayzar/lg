import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { PeerTransport } from './peer-transport'
import type { NetworkMessage, NetworkSnapshot, TransportEvent } from './types'

interface NetworkContextValue<TMetadata extends object> extends NetworkSnapshot<TMetadata> {
  broadcast(type: string, payload: unknown): void
  close(): void
  joinHost(hostId: string, preferredPeerId?: string): Promise<string>
  resumeHost(roomId: string): void
  sendToHost(type: string, payload: unknown): boolean
  sendToPeer(peerId: string, type: string, payload: unknown): boolean
  setLocalMetadata(metadata: TMetadata): void
  startHost(roomId: string): Promise<string>
  subscribeToMessages(listener: (message: NetworkMessage, fromPeerId: string) => void): () => void
  updateConnectionMetadata(peerId: string, metadata: Partial<TMetadata>): boolean
}

interface NetworkProviderProps {
  children: ReactNode
}

const NetworkContext = createContext<NetworkContextValue<object> | null>(null)

export function NetworkProvider(props: NetworkProviderProps) {
  const transportRef = useRef<PeerTransport | null>(null)

  if (!transportRef.current) {
    transportRef.current = new PeerTransport()
  }

  const transport = transportRef.current
  const [snapshot, setSnapshot] = useState<NetworkSnapshot<object>>(() => transport.getSnapshot())

  useEffect(() => {
    const unsubscribe = transport.subscribe(() => setSnapshot(transport.getSnapshot()))

    return () => {
      unsubscribe()
      transport.close()
    }
  }, [transport])

  function startHost(roomId: string): Promise<string> {
    return transport.startHost(roomId)
  }

  function joinHost(hostId: string, preferredPeerId?: string): Promise<string> {
    return transport.joinHost(hostId, preferredPeerId)
  }

  function resumeHost(roomId: string): void {
    transport.resumeHost(roomId)
  }

  function sendToHost(type: string, payload: unknown): boolean {
    return transport.sendToHost(type, payload)
  }

  function sendToPeer(peerId: string, type: string, payload: unknown): boolean {
    return transport.sendToPeer(peerId, type, payload)
  }

  function setLocalMetadata(metadata: object): void {
    transport.setLocalMetadata(metadata)
  }

  function updateConnectionMetadata(peerId: string, metadata: object): boolean {
    return transport.updateConnectionMetadata(peerId, metadata)
  }

  function broadcast(type: string, payload: unknown): void {
    transport.broadcast(type, payload)
  }

  function close(): void {
    transport.close()
  }

  function subscribeToMessages(listener: (message: NetworkMessage, fromPeerId: string) => void): () => void {
    return transport.subscribe((event: TransportEvent) => {
      if (event.type === 'message') {
        listener(event.message, event.fromPeerId)
      }
    })
  }

  return (
    <NetworkContext
      value={{
        ...snapshot,
        broadcast,
        close,
        joinHost,
        resumeHost,
        sendToHost,
        sendToPeer,
        setLocalMetadata,
        startHost,
        subscribeToMessages,
        updateConnectionMetadata,
      }}
    >
      {props.children}
    </NetworkContext>
  )
}

export function useNetwork<TMetadata extends object>(): NetworkContextValue<TMetadata> {
  const context = useContext(NetworkContext)

  if (!context) {
    throw new Error('useNetwork must be used within a NetworkProvider.')
  }

  return context as NetworkContextValue<TMetadata>
}
