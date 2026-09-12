import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import { PeerTransport } from './peer-transport'
import type { NetworkClient, NetworkSnapshot } from './types'

export interface NetworkContextValue<TMetadata extends object> extends NetworkClient<TMetadata>, NetworkSnapshot<TMetadata> {
  client: NetworkClient<TMetadata>
}

const NetworkContext = createContext<NetworkClient<object> | null>(null)

export function NetworkProvider(props: { children: ReactNode }) {
  // Construction is inert; only an explicit room entry opens sockets.
  const [client] = useState(() => new PeerTransport())
  useEffect(() => () => client.close(), [client])
  return <NetworkContext value={client}>{props.children}</NetworkContext>
}

export function useNetwork<TMetadata extends object>(): NetworkContextValue<TMetadata> {
  const context = useContext(NetworkContext)
  if (!context) throw new Error('useNetwork must be used within a NetworkProvider.')
  const client = context as NetworkClient<TMetadata>
  const snapshot = useSyncExternalStore(client.subscribeState, client.getSnapshot, client.getSnapshot)
  return {
    ...snapshot, client,
    getSnapshot: client.getSnapshot,
    subscribe: client.subscribe,
    subscribeState: client.subscribeState,
    subscribeToMessages: client.subscribeToMessages,
    startHost: client.startHost,
    resumeHost: client.resumeHost,
    joinHost: client.joinHost,
    beginLeave: client.beginLeave,
    close: client.close,
    disconnectPeer: client.disconnectPeer,
    sendToHost: client.sendToHost,
    sendToPeer: client.sendToPeer,
    broadcast: client.broadcast,
    setLocalMetadata: client.setLocalMetadata,
    registerConnectionMetadata: client.registerConnectionMetadata,
    updateConnectionMetadata: client.updateConnectionMetadata,
  }
}
