import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { JoinRoomDialog } from './JoinRoomDialog'
import { ProfileEditor } from '@/features/profile/ProfileEditor'
import { loadProfile, saveProfile } from '@/lib/profile'
import { createRoomCode } from '@/features/room/room-code'
import { saveRoomSession } from '@/features/room/room-session'

export function MainMenu() {
  const [isCreatingRoom, setIsCreatingRoom] = useState(false)
  const [creationError, setCreationError] = useState<string | null>(null)
  const [hasValidName, setHasValidName] = useState(false)
  const navigate = useNavigate()

  async function saveRegisteredProfile(): Promise<boolean> {
    try {
      const profile = await loadProfile()
      await saveProfile({
        avatar: profile?.avatar ?? null,
        name: profile?.name.trim() || 'Joueur',
      })
      return true
    } catch {
      setCreationError('Impossible d’enregistrer votre profil. Réessayez dans un instant.')
      return false
    }
  }

  async function createRoom() {
    if (isCreatingRoom || !hasValidName) {
      return
    }

    setIsCreatingRoom(true)
    setCreationError(null)

    if (!await saveRegisteredProfile()) {
      setIsCreatingRoom(false)
      return
    }

    try {
      await saveRoomSession({ roomCode: createRoomCode() })
      navigate('/play')
    } catch {
      setCreationError('Impossible d’enregistrer la partie. Réessayez dans un instant.')
      setIsCreatingRoom(false)
    }
  }

  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden bg-[#0d0a1a] px-4 py-4 text-[#f0e6ff] before:pointer-events-none before:absolute before:inset-0 before:bg-[radial-gradient(ellipse_55%_40%_at_15%_25%,rgba(124,77,255,0.10),transparent_70%),radial-gradient(ellipse_40%_55%_at_85%_75%,rgba(0,229,255,0.06),transparent_70%)]">
      <div className="absolute inset-x-0 top-0 h-[3px] bg-linear-to-r from-[#00e5ff] via-[#7c4dff] via-50% to-[#ff6d00]" />

      <section className="relative flex w-full max-w-[340px] flex-col items-center gap-8">
        <header className="text-center">
          <h1 className="text-[2.6rem] leading-none font-black tracking-[-0.02em] text-[#f0e6ff] drop-shadow-[0_0_40px_rgba(124,77,255,0.5)]">
            <span aria-hidden="true">🐺 </span>Loup Garou
          </h1>
          <p className="mt-2 text-xs font-semibold uppercase tracking-[0.15em] text-[#a08ab8]">
            Qui se cache parmi vous ?
          </p>
        </header>

        <ProfileEditor onNameValidityChange={setHasValidName} />

        <div className="flex w-full gap-4">
          <Button
            className="h-12 flex-1 rounded-xl bg-[#00e5ff] text-sm font-bold tracking-[0.05em] text-[#0a0616] uppercase shadow-[0_4px_18px_rgba(0,229,255,0.35)] hover:bg-[#00e5ff] hover:shadow-[0_4px_26px_rgba(0,229,255,0.55)]"
            disabled={isCreatingRoom || !hasValidName}
            onClick={createRoom}
            size="lg"
            type="button"
          >
            {isCreatingRoom ? 'Création...' : 'Créer'}
          </Button>
          <JoinRoomDialog disabled={!hasValidName} />
        </div>
        {creationError && <p className="-mt-4 text-center text-sm font-medium text-[#ff4081]" role="alert">{creationError}</p>}
      </section>
    </main>
  )
}
