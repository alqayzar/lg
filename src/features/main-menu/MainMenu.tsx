import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { AppLogo } from '@/components/AppLogo'
import { JoinRoomDialog } from './JoinRoomDialog'
import { ProfileEditor } from '@/features/profile/ProfileEditor'
import { loadProfile, saveProfile } from '@/lib/profile'
import { createRoomCode, isRoomCode, normalizeRoomCode } from '@/features/room/room-code'
import { loadLastGuestRoomCode, loadRoomSession, saveRoomSession } from '@/features/room/room-session'

export function MainMenu() {
  const [isCreatingRoom, setIsCreatingRoom] = useState(false)
  const [isJoiningRoom, setIsJoiningRoom] = useState(false)
  const [lastGuestRoomCode, setLastGuestRoomCode] = useState<string | undefined>()
  const [creationError, setCreationError] = useState<string | null>(null)
  const [hasValidName, setHasValidName] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const roomCode = normalizeRoomCode(searchParams.get('room') ?? '')
  const isInvitation = location.pathname === '/join'
  const hasValidRoomCode = isRoomCode(roomCode)

  useEffect(() => {
    let active = true
    void loadLastGuestRoomCode().then((savedRoomCode) => {
      if (active) setLastGuestRoomCode(savedRoomCode)
    })
    return () => {
      active = false
    }
  }, [])

  async function saveRegisteredProfile(): Promise<void> {
    const profile = await loadProfile()
    await saveProfile({
      avatar: profile?.avatar ?? null,
      name: profile?.name.trim() || 'Joueur',
    })
  }

  async function createRoom() {
    if (isCreatingRoom || !hasValidName) {
      return
    }

    setIsCreatingRoom(true)
    setCreationError(null)

    try {
      await saveRegisteredProfile()
      await saveRoomSession({
        gameStarted: false,
        assignedPlayerIds: [],
        playerId: crypto.randomUUID(),
        role: 'host',
        roomCode: createRoomCode(),
      })
        navigate('/room')
    } catch {
      setCreationError('Impossible d’enregistrer la partie. Réessayez dans un instant.')
      setIsCreatingRoom(false)
    }
  }

  async function joinRoom(roomCode: string) {
    await saveRegisteredProfile()
    const existingSession = await loadRoomSession()
    const playerId = existingSession?.role === 'guest' && existingSession.roomCode === roomCode
      ? existingSession.playerId
      : undefined
    await saveRoomSession({ ...(playerId ? { playerId } : {}), gameStarted: false, role: 'guest', roomCode })
    navigate('/room')
  }

  async function joinInvitation() {
    if (isJoiningRoom || !hasValidName || !hasValidRoomCode) return

    setIsJoiningRoom(true)
    setCreationError(null)
    try {
      await joinRoom(roomCode)
    } catch {
      setCreationError('Impossible de rejoindre la partie. Réessayez dans un instant.')
      setIsJoiningRoom(false)
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-[var(--canvas)] px-5 py-8 text-[var(--canvas-foreground)]">
      <section className="flex w-full max-w-[380px] flex-col items-center gap-6">
        <header className="text-center">
          <AppLogo className="mx-auto mb-3 size-20" />
          <h1 className="text-[2.55rem] leading-none font-black tracking-[-0.045em] text-[var(--canvas-foreground)]">
            Loup Garou
          </h1>
          <p className="mt-2 text-xs font-bold uppercase tracking-[0.18em] text-[var(--canvas-muted)]">
            Qui se cache parmi vous ?
          </p>
        </header>

        <ProfileEditor onNameValidityChange={setHasValidName} />

        {isInvitation ? (
          <Button
            className="cartoon-press h-13 w-full rounded-2xl border-[var(--outline-color)] [--element-color:var(--coral)] text-sm font-black tracking-[0.05em] text-[var(--text-color)] uppercase hover:bg-[#ff7885]"
            disabled={isJoiningRoom || !hasValidName || !hasValidRoomCode}
            onClick={joinInvitation}
            size="lg"
            type="button"
          >
            {isJoiningRoom ? 'Connexion...' : `Rejoindre ${roomCode}`}
          </Button>
        ) : (
          <div className="grid w-full grid-cols-2 gap-3">
            <Button
              className="cartoon-press h-13 rounded-2xl border-[var(--outline-color)] [--element-color:var(--mint)] text-sm font-black tracking-[0.05em] text-[var(--text-color)] uppercase hover:bg-[#95e7df]"
              disabled={isCreatingRoom || !hasValidName}
              onClick={createRoom}
              size="lg"
              type="button"
            >
              {isCreatingRoom ? 'Création...' : 'Créer'}
            </Button>
            <JoinRoomDialog defaultRoomCode={lastGuestRoomCode} disabled={!hasValidName} onJoin={joinRoom} />
          </div>
        )}
        {creationError && <p className="text-center text-sm font-bold text-[#963f34]" role="alert">{creationError}</p>}
      </section>
    </main>
  )
}
