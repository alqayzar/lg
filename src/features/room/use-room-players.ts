import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useNetwork } from '@/features/network/NetworkProvider'
import type { PlayerMetadata } from '@/features/profile/types'
import { loadProfile } from '@/lib/profile'
import { EMPTY_ROOM, RoomController, type RoomState } from './room-controller'
import { prepareRoomProfile } from './room-profile'
import { claimHostRoom, clearRoomSession, isCurrentHostSession, resolveRoomEntry, updateRoomSessionPeers } from './room-session'

export function useRoomPlayers(roomParameter: string | null) {
  const { client } = useNetwork<PlayerMetadata>()
  const navigate = useNavigate()
  const [state, setState] = useState<RoomState>(EMPTY_ROOM)
  const quitRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    let active = true
    let quitting = false
    let controller: RoomController | null = null
    let unsubscribe: (() => void) | undefined
    let releaseHost: (() => void) | undefined
    const abort = new AbortController()
    const initialSessionId = client.getSnapshot().sessionId
    const closePendingTransport = () => {
      if (client.getSnapshot().sessionId === initialSessionId) client.close()
    }
    const entryPromise = resolveRoomEntry(roomParameter)
    setState(EMPTY_ROOM)

    async function enter() {
      try {
        const [entry, profile] = await Promise.all([entryPromise, loadProfile()])
        if (!active || quitting) return
        const metadata = await prepareRoomProfile(profile)
        if (!active || quitting) return
        if (entry.role === 'host') {
          releaseHost = await claimHostRoom(entry.hostPeerId, abort.signal)
          if (!active || quitting) { releaseHost(); return }
          if (!await isCurrentHostSession(entry.session.sessionKey)) {
            throw new Error('Cette partie a ete fermee ou remplacee.')
          }
        }
        if (!active || quitting) return
        if (client.getSnapshot().sessionId !== initialSessionId) throw new Error('La session de connexion a change.')

        controller = new RoomController(client, entry, metadata, entry.role === 'host' ? {
          updatePeers: (ids, isCurrent) => updateRoomSessionPeers(entry.session.sessionKey, ids, isCurrent),
          clear: () => clearRoomSession(entry.session.sessionKey),
        } : undefined)
        unsubscribe = controller.subscribe(() => {
          if (!active || !controller) return
          const next = controller.getSnapshot()
          setState(next)
          if (next.isClosed) {
            navigate('/', { replace: true, state: next.error ? { roomError: next.error } : null })
          }
        })
        controller.start()
        setState(controller.getSnapshot())
      } catch (error) {
        if (!active || quitting) return
        controller?.dispose()
        if (!controller) closePendingTransport()
        controller = null
        releaseHost?.()
        setState({ ...EMPTY_ROOM, status: 'error', error: error instanceof Error ? error.message : 'Impossible de charger la partie.' })
      }
    }

    const quit = async () => {
      if (controller) {
        await controller.leave()
      } else {
        if (quitting) return
        quitting = true
        abort.abort()
        if (client.getSnapshot().sessionId === initialSessionId) client.beginLeave()
        closePendingTransport()
        releaseHost?.()
        setState((current) => ({ ...current, isLeaving: true, status: 'leaving' }))
        let error: string | null = null
        try {
          const entry = await entryPromise
          if (entry.role === 'host') await clearRoomSession(entry.session.sessionKey)
        } catch (failure) {
          error = failure instanceof Error ? failure.message : 'Impossible de fermer la partie.'
        }
        if (active) navigate('/', { replace: true, state: error ? { roomError: error } : null })
      }
    }
    quitRef.current = quit
    void enter()

    return () => {
      active = false
      abort.abort()
      unsubscribe?.()
      const leaving = controller?.getSnapshot().isLeaving ? controller.leave() : null
      if (controller) controller.dispose()
      else closePendingTransport()
      if (leaving) void leaving.then(() => releaseHost?.())
      else releaseHost?.()
      if (quitRef.current === quit) quitRef.current = null
    }
  }, [client, navigate, roomParameter])

  return { ...state, onQuit: () => quitRef.current?.() }
}
