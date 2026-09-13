import { useEffect, useRef, useState } from 'react'
import { usePeer } from '@/features/peer/PeerProvider'
import {
  parseClaimedPlayerId,
  parseGuestRoomMessage,
  parseHostRoomMessage,
  type HostRoomMessage,
  type PlayerInfo,
} from './room-protocol'
import { saveRoomSession, type RoomSession } from './room-session'

type RoomConnectionStatus = 'connecting' | 'connected' | 'room-closed' | 'error'
const CONTROL_MESSAGE_TIMEOUT_MS = 4000

interface UseRoomPlayersOptions {
  onPlayerIdAssigned: (playerId: string) => void
  player: PlayerInfo
  session: RoomSession
}

export function useRoomPlayers(options: UseRoomPlayersOptions) {
  const peer = usePeer()
  const [error, setError] = useState<Error | null>(null)
  const [localPlayerId, setLocalPlayerId] = useState<string | null>(
    options.session.role === 'host' ? options.session.playerId : options.session.playerId ?? null,
  )
  const [playerIds, setPlayerIds] = useState<string[]>(
    options.session.role === 'host' ? [options.session.playerId] : [],
  )
  const [playerInfoById, setPlayerInfoById] = useState<Record<string, PlayerInfo>>({})
  const [status, setStatus] = useState<RoomConnectionStatus>('connecting')
  const assignedPlayerIdCallbackRef = useRef(options.onPlayerIdAssigned)
  const activeHostConnectionIdsRef = useRef(new Set<string>())
  const guestLeaveAckRef = useRef<(() => void) | null>(null)
  const hasRosterRef = useRef(false)
  const hostClosureAckRef = useRef<(() => void) | null>(null)
  const hostClosurePendingRef = useRef<Set<string> | null>(null)
  const hostClosingRef = useRef(false)
  const hostPersistenceRef = useRef(Promise.resolve())
  const leavingRef = useRef(false)
  const localPlayerIdRef = useRef(localPlayerId)
  const localPlayerRef = useRef(options.player)
  const playerInfoRef = useRef(new Map<string, PlayerInfo>())
  const roomClosedRef = useRef(false)

  assignedPlayerIdCallbackRef.current = options.onPlayerIdAssigned
  localPlayerIdRef.current = localPlayerId
  localPlayerRef.current = options.player

  useEffect(() => {
    let active = true

    if (options.session.role === 'host') {
      const hostSession = options.session
      const activePlayers = new Map<string, string>()
      const assignedPlayerIds = new Set(hostSession.assignedPlayerIds)
      const claimedPlayerIds = new Map<string, string | null>()
      const pendingPlayerInfo = new Map<string, PlayerInfo>()
      const playerConnections = new Map<string, string>()
      playerInfoRef.current.set(hostSession.playerId, localPlayerRef.current)
      setPlayerInfoById(Object.fromEntries(playerInfoRef.current))

      function cachePlayerInfo(playerId: string, player: PlayerInfo, connectionId?: string) {
        playerInfoRef.current.set(playerId, player)
        setPlayerInfoById(Object.fromEntries(playerInfoRef.current))
        const message: HostRoomMessage = { type: 'player-info', player, playerId }
        const recipientConnectionIds = connectionId
          ? [...activePlayers.keys()].filter((id) => id !== connectionId)
          : undefined
        peer.broadcast(message, recipientConnectionIds)
      }

      function currentPlayerIds() {
        return [hostSession.playerId, ...activePlayers.values()]
      }

      function publishPlayers() {
        const nextPlayerIds = currentPlayerIds()
        setPlayerIds(nextPlayerIds)
        const message: HostRoomMessage = { type: 'players-sync', playerIds: nextPlayerIds }
        peer.broadcast(message, [...activePlayers.keys()])
      }

      function acknowledgeHostClosure(connectionId: string) {
        const pendingConnectionIds = hostClosurePendingRef.current
        if (!pendingConnectionIds) return
        pendingConnectionIds.delete(connectionId)
        if (pendingConnectionIds.size === 0) hostClosureAckRef.current?.()
      }

      function persistAssignments() {
        const session = {
          ...hostSession,
          assignedPlayerIds: [...assignedPlayerIds],
        }
        const nextSave = hostPersistenceRef.current.then(() => saveRoomSession(session))
        hostPersistenceRef.current = nextSave.catch(() => {})
        return nextSave
      }

      function createPlayerId() {
        let playerId = crypto.randomUUID()
        while (playerId === hostSession.playerId || assignedPlayerIds.has(playerId)) {
          playerId = crypto.randomUUID()
        }
        return playerId
      }

      async function joinPlayer(connectionId: string) {
        let playerId = activePlayers.get(connectionId)
        let isNewAssignment = false

        if (!playerId) {
          const claimedPlayerId = claimedPlayerIds.get(connectionId)
          if (
            claimedPlayerId
            && claimedPlayerId !== hostSession.playerId
            && assignedPlayerIds.has(claimedPlayerId)
          ) {
            playerId = claimedPlayerId
          } else {
            playerId = createPlayerId()
            assignedPlayerIds.add(playerId)
            isNewAssignment = true
          }

          const previousConnectionId = playerConnections.get(playerId)
          if (previousConnectionId && previousConnectionId !== connectionId) {
            activePlayers.delete(previousConnectionId)
            activeHostConnectionIdsRef.current.delete(previousConnectionId)
            claimedPlayerIds.delete(previousConnectionId)
            peer.disconnectConnection(previousConnectionId)
          }

          activePlayers.set(connectionId, playerId)
          activeHostConnectionIdsRef.current.add(connectionId)
          playerConnections.set(playerId, connectionId)
        }

        if (isNewAssignment) {
          try {
            await persistAssignments()
          } catch {
            if (!active || activePlayers.get(connectionId) !== playerId) return
            activePlayers.delete(connectionId)
            activeHostConnectionIdsRef.current.delete(connectionId)
            claimedPlayerIds.delete(connectionId)
            playerConnections.delete(playerId)
            assignedPlayerIds.delete(playerId)
            const nextError = new Error('Unable to save the assigned player ID.')
            setError(nextError)
            setStatus('error')
            peer.disconnectConnection(connectionId)
            return
          }
        }

        if (!active || !peer.isConnected(connectionId) || activePlayers.get(connectionId) !== playerId) return
        const joinedMessage: HostRoomMessage = { type: 'joined', playerId }
        peer.sendTo(connectionId, joinedMessage)
        for (const [knownPlayerId, knownPlayer] of playerInfoRef.current) {
          peer.sendTo(connectionId, { type: 'player-info', player: knownPlayer, playerId: knownPlayerId } satisfies HostRoomMessage)
        }
        const pendingPlayer = pendingPlayerInfo.get(connectionId)
        if (pendingPlayer) {
          pendingPlayerInfo.delete(connectionId)
          cachePlayerInfo(playerId, pendingPlayer, connectionId)
        }
        publishPlayers()
      }

      function removePlayer(connectionId: string, forgetAssignment: boolean) {
        claimedPlayerIds.delete(connectionId)
        pendingPlayerInfo.delete(connectionId)
        const playerId = activePlayers.get(connectionId)
        if (!playerId) return Promise.resolve()

        activePlayers.delete(connectionId)
        activeHostConnectionIdsRef.current.delete(connectionId)
        if (playerConnections.get(playerId) === connectionId) playerConnections.delete(playerId)
        let persistence = Promise.resolve()
        if (forgetAssignment) {
          assignedPlayerIds.delete(playerId)
          persistence = persistAssignments()
        }
        publishPlayers()
        return persistence
      }

      const unsubscribe = peer.subscribe((event) => {
        if (!active) return

        if (event.type === 'peer-open') {
          setStatus('connected')
          return
        }
        if (event.type === 'guest-open') {
          claimedPlayerIds.set(event.connectionId, parseClaimedPlayerId(event.metadata))
          return
        }
        if (event.type === 'guest-close') {
          void removePlayer(event.connectionId, false)
          return
        }
        if (event.type === 'error') {
          setError(event.error)
          setStatus('error')
          return
        }
        if (event.type !== 'guest-message') return

        const message = parseGuestRoomMessage(event.message)
        if (message?.type === 'join') {
          if (hostClosingRef.current) {
            hostClosurePendingRef.current?.add(event.connectionId)
            peer.sendTo(event.connectionId, { type: 'room-closed' } satisfies HostRoomMessage)
            return
          }
          void joinPlayer(event.connectionId)
        } else if (message?.type === 'player-info') {
          const playerId = activePlayers.get(event.connectionId)
          if (playerId) {
            cachePlayerInfo(playerId, message.player, event.connectionId)
          } else {
            pendingPlayerInfo.set(event.connectionId, message.player)
          }
        } else if (message?.type === 'leave') {
          void removePlayer(event.connectionId, true).then(() => {
            peer.sendTo(event.connectionId, { type: 'left' } satisfies HostRoomMessage)
          }).catch(() => {
            setError(new Error('Unable to remove the player assignment.'))
            peer.disconnectConnection(event.connectionId)
          })
        } else if (message?.type === 'room-closed-ack') {
          acknowledgeHostClosure(event.connectionId)
        }
      })

      return () => {
        active = false
        activeHostConnectionIdsRef.current.clear()
        unsubscribe()
      }
    }

    const unsubscribe = peer.subscribe((event) => {
      if (!active || roomClosedRef.current) return

      if (event.type === 'host-open') {
        setStatus('connecting')
        peer.sendToHost({ type: 'join' })
        peer.sendToHost({ type: 'player-info', player: localPlayerRef.current })
        return
      }
      if (event.type === 'host-close') {
        hasRosterRef.current = false
        setPlayerIds([])
        setStatus('connecting')
        return
      }
      if (event.type === 'error') {
        setError(event.error)
        return
      }
      if (event.type !== 'host-message') return

      const message = parseHostRoomMessage(event.message)
      if (message?.type === 'joined') {
        localPlayerIdRef.current = message.playerId
        setLocalPlayerId(message.playerId)
        playerInfoRef.current.set(message.playerId, localPlayerRef.current)
        setPlayerInfoById(Object.fromEntries(playerInfoRef.current))
        assignedPlayerIdCallbackRef.current(message.playerId)
        if (hasRosterRef.current) setStatus('connected')
        void saveRoomSession({
          ...options.session,
          playerId: message.playerId,
        }).catch(() => {
          setError(new Error('Unable to save the assigned player ID.'))
        })
      } else if (message?.type === 'players-sync') {
        hasRosterRef.current = true
        setPlayerIds(message.playerIds)
        if (localPlayerIdRef.current) {
          setStatus('connected')
        }
      } else if (message?.type === 'player-info') {
        playerInfoRef.current.set(message.playerId, message.player)
        setPlayerInfoById(Object.fromEntries(playerInfoRef.current))
      } else if (message?.type === 'left') {
        guestLeaveAckRef.current?.()
      } else if (message?.type === 'room-closed') {
        roomClosedRef.current = true
        hasRosterRef.current = false
        setPlayerIds([])
        setStatus('connecting')
        peer.sendToHost({ type: 'room-closed-ack' })
        void peer.shutdown().then(() => {
          if (active) setStatus('room-closed')
        })
      }
    })

    return () => {
      active = false
      unsubscribe()
    }
  }, [options.session, peer])

  useEffect(() => {
    if (options.session.role === 'host') {
      playerInfoRef.current.set(options.session.playerId, options.player)
      setPlayerInfoById(Object.fromEntries(playerInfoRef.current))
      peer.broadcast({ type: 'player-info', player: options.player, playerId: options.session.playerId } satisfies HostRoomMessage)
      return
    }

    const localPlayerId = localPlayerIdRef.current
    if (localPlayerId) {
      playerInfoRef.current.set(localPlayerId, options.player)
      setPlayerInfoById(Object.fromEntries(playerInfoRef.current))
    }
    peer.sendToHost({ type: 'player-info', player: options.player })
  }, [options.player.avatar, options.player.name, options.session, peer])

  async function leaveRoom() {
    if (leavingRef.current) return
    leavingRef.current = true

    if (options.session.role === 'host') {
      const message: HostRoomMessage = { type: 'room-closed' }
      hostClosingRef.current = true
      const acknowledgements = new Promise<void>((resolve) => {
        hostClosureAckRef.current = resolve
      })
      hostClosurePendingRef.current = new Set(activeHostConnectionIdsRef.current)
      if (hostClosurePendingRef.current.size === 0) hostClosureAckRef.current?.()
      peer.broadcast(message)
      await Promise.race([
        acknowledgements,
        new Promise<void>((resolve) => window.setTimeout(resolve, CONTROL_MESSAGE_TIMEOUT_MS)),
      ])
      hostClosureAckRef.current = null
      hostClosurePendingRef.current = null
      await Promise.all([peer.shutdown(), hostPersistenceRef.current])
      return
    }

    const leaveAcknowledgement = new Promise<void>((resolve) => {
      guestLeaveAckRef.current = resolve
    })
    if (peer.sendToHost({ type: 'leave' })) {
      await Promise.race([
        leaveAcknowledgement,
        new Promise<void>((resolve) => window.setTimeout(resolve, CONTROL_MESSAGE_TIMEOUT_MS)),
      ])
    }
    guestLeaveAckRef.current = null
    await peer.shutdown()
  }

  return { error, leaveRoom, localPlayerId, playerIds, playerInfoById, status }
}
