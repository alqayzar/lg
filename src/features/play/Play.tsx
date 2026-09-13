import { useEffect, useState } from 'react'
import { Lobby } from '@/features/lobby/Lobby'
import { useProfile } from '@/features/profile/use-profile'
import { loadRoomSession, type HostRoomSession } from '@/features/room/room-session'

export function Play() {
  const [session, setSession] = useState<HostRoomSession | null | undefined>(undefined)
  const profile = useProfile()

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

  return session ? (
    <Lobby
      currentPlayerId="host"
      players={[{
        avatarUrl: profile.avatarUrl,
        id: 'host',
        isHost: true,
        name: profile.name || 'Joueur',
      }]}
      roomCode={session.roomCode}
    />
  ) : null
}
