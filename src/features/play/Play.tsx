import { useEffect, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Lobby, type LobbyPlayer } from '@/features/lobby/Lobby'
import { PeerProvider } from '@/features/peer/PeerProvider'
import { AvatarDialog } from '@/features/profile/AvatarDialog'
import { GameScreen } from './GameScreen'
import { GameScreenProvider } from './GameScreenProvider'
import type { GameBottomAction } from './game-screen-configuration'
import { useProfile } from '@/features/profile/use-profile'
import type { ProfileAvatar } from '@/lib/profile'
import {
  clearRoomSession,
  loadRoomSession,
  saveLastGuestRoomCode,
  type RoomSession,
} from '@/features/room/room-session'
import { useRoomPlayers } from '@/features/room/use-room-players'

interface ConnectedRoomProps {
  onPlayerIdAssigned: (playerId: string) => void
  session: RoomSession
}

function useAvatarDataUrl(avatar: ProfileAvatar): string | null {
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
  const [isAvatarDialogOpen, setIsAvatarDialogOpen] = useState(false)
  const location = useLocation()
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

  useEffect(() => {
    if (room.gameStarted && location.pathname !== '/play') {
      navigate('/play')
    }
    if (!room.gameStarted && location.pathname === '/play') {
      navigate('/room')
    }
  }, [location.pathname, navigate, room.gameStarted])

  async function quitRoom() {
    if (props.session.role === 'guest') {
      try {
        await saveLastGuestRoomCode(props.session.roomCode)
      } catch {
        // Leaving the room must still work if local persistence is unavailable.
      }
    }

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

  function openAvatarDialog() {
    setIsAvatarDialogOpen(true)
  }

  function startGame() {
    room.setBottomElements([
      {
        action: 'first-button',
        color: 'cyan',
        id: 'first-button',
        title: 'First button',
        type: 'button'
      },
      {
        action: 'second-button',
        color: 'yellow',
        id: 'second-button',
        title: 'Second button',
        type: 'button'
      },
    ]);
    room.startGame();
  }

  function logBottomAction(action: GameBottomAction) {
    const element = room.bottomElements.find((element) => element.id === action.elementId);
    if (element?.type === 'button') console.log(element.title);
  }

  async function returnToLobby() {
    room.returnToLobby()
    navigate('/room')
  }

  if (room.status !== 'connected' || !room.localPlayerId) {
    return (
      <main className="grid min-h-dvh place-items-center bg-[var(--canvas)] px-5 text-[var(--text-color)]">
        <section className="element-shadow w-full max-w-sm rounded-3xl border-4 border-[var(--outline-color)] [--element-color:var(--paper)] [--element-shadow-depth:7px] p-6 text-center">
          <h1 className="text-xl font-black">
            {room.status === 'error' ? 'Connexion impossible' : 'Connexion à la partie...'}
          </h1>
          {room.error && <p className="mt-3 text-sm font-bold text-[#963f34]" role="alert">{room.error.message}</p>}
          <Button
            className="cartoon-press mt-5 h-12 w-full rounded-2xl border-[var(--outline-color)] [--element-color:var(--coral)] px-5 font-black text-[var(--text-color)] hover:bg-[#ff7885]"
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
  const isHost = room.localPlayerId === hostPlayerId

  return (
    <GameScreenProvider bottomElements={room.bottomElements} onBottomAction={logBottomAction} setBottomElements={room.setBottomElements}>
      {location.pathname === '/play' ? (
        <GameScreen
          currentPlayerId={room.localPlayerId}
          onQuit={isHost ? returnToLobby : quitRoom}
          players={players}
        />
      ) : (
        <>
          <AvatarDialog
            avatar={profile.avatar}
            onAvatarChange={profile.updateAvatar}
            onAvatarRemove={profile.removeAvatar}
            onOpenChange={setIsAvatarDialogOpen}
            open={isAvatarDialogOpen}
          />
          <Lobby
            currentPlayerId={room.localPlayerId}
            onCurrentPlayerClick={openAvatarDialog}
            onKickPlayer={isHost ? room.kickPlayer : undefined}
            onQuit={quitRoom}
            onStart={startGame}
            players={players}
            roomCode={props.session.roomCode}
          />
        </>
      )}
    </GameScreenProvider>
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
