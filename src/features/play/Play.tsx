import { useEffect, useState } from 'react'
import { Lobby } from '@/features/lobby/Lobby'
import { useNetwork } from '@/features/network/NetworkProvider'
import { useProfile } from '@/features/profile/use-profile'
import type { PlayerMetadata } from '@/features/profile/types'
import { loadRoomSession, type HostRoomSession } from '@/features/room/room-session'

export function Play() {
  const [session, setSession] = useState<HostRoomSession | null | undefined>(undefined)
  const network = useNetwork<PlayerMetadata>()
  const profile = useProfile()

  useEffect(() => {
    network.setLocalMetadata({
      avatarUrl: profile.avatarUrl,
      name: profile.name.trim() || 'Joueur',
    })
  }, [network, profile.avatarUrl, profile.name])

  useEffect(() => {
    let isMounted = true

    async function restoreSession() {
      const savedSession = await loadRoomSession()

      if (isMounted) {
        setSession(savedSession ?? null)
      }
    }

    void restoreSession()

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    if (
      !session
      || network.role !== null
      || (network.status !== 'idle' && network.status !== 'closed')
    ) {
      return
    }

    network.resumeHost(session.peerId)
  }, [network, session])

  return session ? <Lobby roomCode={session.roomCode} /> : null
}
