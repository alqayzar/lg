import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Lobby, type LobbyPlayer } from '@/features/lobby/Lobby'
import { PeerProvider } from '@/features/peer/PeerProvider'
import { useProfile } from '@/features/profile/use-profile'
import {
  clearRoomSession,
  loadRoomSession,
  type RoomSession,
} from '@/features/room/room-session'
import { useRoomPlayers } from '@/features/room/use-room-players'

interface ConnectedRoomProps {
  onPlayerIdAssigned: (playerId: string) => void
  session: RoomSession
}

function useAvatarDataUrl(avatar: Blob | null): string | null {
  const [avatarDataUrl, setAvatarDataUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!avatar) {
      setAvatarDataUrl(null)
      return
    }

    let active = true
    const reader = new FileReader()
    reader.addEventListener('load', () => {
      if (active && typeof reader.result === 'string') setAvatarDataUrl(reader.result)
    })
    reader.readAsDataURL(avatar)

    return () => {
      active = false
    }
  }, [avatar])

  return avatarDataUrl
}

function ConnectedRoom(props: ConnectedRoomProps) {
  const navigate = useNavigate()
  const profile = useProfile()
  const avatarDataUrl = useAvatarDataUrl(profile.avatar)
  const room = useRoomPlayers({
    onPlayerIdAssigned: props.onPlayerIdAssigned,
    player: { avatar: avatarDataUrl, name: profile.name || 'Joueur' },
    session: props.session,
  })

  useEffect(() => {
    if (room.status !== 'room-closed') return

    let active = true
    void clearRoomSession().finally(() => {
      if (active) navigate('/', { replace: true })
    })

    return () => {
      active = false
    }
  }, [navigate, room.status])

  async function quitRoom() {
    try {
      await room.leaveRoom()
    } finally {
      try {
        await clearRoomSession()
      } finally {
        navigate('/', { replace: true })
      }
    }
  }

  async function cancelConnection() {
    await quitRoom()
  }

  if (room.status !== 'connected' || !room.localPlayerId) {
    return (
      <main className="grid min-h-dvh place-items-center bg-[#0d0a1a] px-4 text-[#f0e6ff]">
        <section className="w-full max-w-sm rounded-2xl border-2 border-[#2d1f55] bg-[#11102b] p-6 text-center shadow-[0_0_28px_rgba(124,77,255,0.25)]">
          <h1 className="text-xl font-black">
            {room.status === 'error' ? 'Connexion impossible' : 'Connexion à la partie...'}
          </h1>
          {room.error && <p className="mt-3 text-sm text-[#ff4081]" role="alert">{room.error.message}</p>}
          <Button
            className="mt-5 h-11 w-full border border-[#ff4081] px-5 font-bold text-[#ff4081] hover:bg-[#ff4081] hover:text-white"
            onClick={cancelConnection}
            type="button"
            variant="ghost"
          >
            Quitter
          </Button>
        </section>
      </main>
    )
  }

  const hostPlayerId = room.playerIds[0]
  const players: LobbyPlayer[] = room.playerIds.map((playerId) => ({
    avatar: room.playerInfoById[playerId]?.avatar ?? null,
    id: playerId,
    isHost: playerId === hostPlayerId,
    name: room.playerInfoById[playerId]?.name ?? 'Joueur',
  }))

  return (
    <Lobby
      currentPlayerId={room.localPlayerId}
      onQuit={quitRoom}
      players={players}
      roomCode={props.session.roomCode}
    />
  )
}

export function Play() {
  const [connectionPlayerId, setConnectionPlayerId] = useState<string | undefined>()
  const [session, setSession] = useState<RoomSession | null | undefined>(undefined)

  useEffect(() => {
    let active = true

    async function restoreSession() {
      const savedSession = await loadRoomSession()
      if (!active) return

      setSession(savedSession ?? null)
      if (savedSession?.role === 'guest') setConnectionPlayerId(savedSession.playerId)
    }

    void restoreSession()
    return () => {
      active = false
    }
  }, [])

  if (session === undefined) return null
  if (session === null) return <Navigate replace to="/" />

  const connectionMetadata = session.role === 'guest' && connectionPlayerId
    ? { playerId: connectionPlayerId }
    : undefined

  return (
    <PeerProvider
      connectionMetadata={connectionMetadata}
      role={session.role}
      roomCode={session.roomCode}
    >
      <ConnectedRoom onPlayerIdAssigned={setConnectionPlayerId} session={session} />
    </PeerProvider>
  )
}
