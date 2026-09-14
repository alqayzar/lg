import { useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { JoinRoomDialog } from './JoinRoomDialog'
import { ProfileEditor } from '@/features/profile/ProfileEditor'
import { loadProfile, saveProfile } from '@/lib/profile'
import { createRoomCode, isRoomCode, normalizeRoomCode } from '@/features/room/room-code'
import { loadRoomSession, saveRoomSession } from '@/features/room/room-session'

export function MainMenu() {
  const [isCreatingRoom, setIsCreatingRoom] = useState(false)
  const [isJoiningRoom, setIsJoiningRoom] = useState(false)
  const [creationError, setCreationError] = useState<string | null>(null)
  const [hasValidName, setHasValidName] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const roomCode = normalizeRoomCode(searchParams.get('room') ?? '')
  const isInvitation = location.pathname === '/join'
  const hasValidRoomCode = isRoomCode(roomCode)

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
        assignedPlayerIds: [],
        playerId: crypto.randomUUID(),
        role: 'host',
        roomCode: createRoomCode(),
      })
      navigate('/play')
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
    await saveRoomSession({ ...(playerId ? { playerId } : {}), role: 'guest', roomCode })
    navigate('/play')
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
    <main className="relative grid min-h-dvh place-items-center overflow-hidden bg-[#14131d] px-4 py-4 text-[#e7e0c8]">
      <div className="absolute inset-x-0 top-0 h-2 bg-[#e6c65d]" />

      <section className="relative flex w-full max-w-[340px] flex-col items-center gap-8">
        <header className="text-center">
          <h1 className="text-[2.6rem] leading-none font-black tracking-[-0.02em] text-[#e7e0c8]">
            <span aria-hidden="true">🐺 </span>Loup Garou
          </h1>
          <p className="mt-2 text-xs font-semibold uppercase tracking-[0.15em] text-[#aaa59a]">
            Qui se cache parmi vous ?
          </p>
        </header>

        <ProfileEditor onNameValidityChange={setHasValidName} />

        {isInvitation ? (
          <Button
            className="cartoon-press h-12 w-full rounded-xl border-2 border-[#08050f] [--element-color:#df6542] bg-[var(--element-color)] text-sm font-bold tracking-[0.05em] text-[#16120d] uppercase hover:bg-[#ee7e57]"
            disabled={isJoiningRoom || !hasValidName || !hasValidRoomCode}
            onClick={joinInvitation}
            size="lg"
            type="button"
          >
            {isJoiningRoom ? 'Connexion...' : `Rejoindre ${roomCode}`}
          </Button>
        ) : (
          <div className="flex w-full gap-4">
            <Button
              className="cartoon-press h-12 flex-1 rounded-xl border-2 border-[#08050f] [--element-color:#73cbd1] bg-[var(--element-color)] text-sm font-bold tracking-[0.05em] text-[#16120d] uppercase hover:bg-[#98dde0]"
              disabled={isCreatingRoom || !hasValidName}
              onClick={createRoom}
              size="lg"
              type="button"
            >
              {isCreatingRoom ? 'Création...' : 'Créer'}
            </Button>
            <JoinRoomDialog disabled={!hasValidName} onJoin={joinRoom} />
          </div>
        )}
        {creationError && <p className="-mt-4 text-center text-sm font-medium text-[#ff4081]" role="alert">{creationError}</p>}
      </section>
    </main>
  )
}
