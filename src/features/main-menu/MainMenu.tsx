import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { useNetwork } from '@/features/network/NetworkProvider'
import { JoinRoomDialog } from './JoinRoomDialog'
import { ProfileEditor } from '@/features/profile/ProfileEditor'
import type { PlayerMetadata } from '@/features/profile/types'
import { loadProfile, saveProfile } from '@/lib/profile'
import { createRoomCode, roomCodeToPeerId } from '@/features/room/room-code'
import { clearRoomSession, saveRoomSession, type HostRoomSession } from '@/features/room/room-session'
import { createRoomToken } from '@/features/room/room-token'

const MAX_ROOM_CREATION_ATTEMPTS = 5

interface EntryAttempt {
  generation: number
  handedOff: boolean
  savedSession: HostRoomSession | null
  sessionId: number | null
}

export function MainMenu() {
  const [pendingEntry, setPendingEntry] = useState<'create' | 'join' | null>(null)
  const [creationError, setCreationError] = useState<string | null>(null)
  const [hasValidName, setHasValidName] = useState(false)
  const generation = useRef(0)
  const attemptRef = useRef<EntryAttempt | null>(null)
  const location = useLocation()
  const navigate = useNavigate()
  const { client } = useNetwork<PlayerMetadata>()

  useEffect(() => () => {
    generation.current += 1
    const attempt = attemptRef.current
    attemptRef.current = null
    if (attempt && !attempt.handedOff) {
      if (attempt.sessionId !== null && client.getSnapshot().sessionId === attempt.sessionId) client.close()
      if (attempt.savedSession) void clearRoomSession(attempt.savedSession.sessionKey).catch(() => {})
    }
  }, [client])

  async function enterRoom(guestRoomCode?: string) {
    if (attemptRef.current || !hasValidName) return
    const attempt: EntryAttempt = {
      generation: ++generation.current,
      handedOff: false,
      savedSession: null,
      sessionId: null,
    }
    attemptRef.current = attempt
    const isCurrent = () => attemptRef.current === attempt && generation.current === attempt.generation
    const ownsTransport = () => attempt.sessionId !== null && client.getSnapshot().sessionId === attempt.sessionId
    setPendingEntry(guestRoomCode ? 'join' : 'create')
    setCreationError(null)

    try {
      const profile = await loadProfile()
      if (!isCurrent()) return
      const name = profile?.name.trim()
      if (!name || name.length > 20) throw new Error('Choisissez un pseudo de 1 a 20 caracteres.')
      await saveProfile({ avatar: profile?.avatar ?? null, name })
      if (!isCurrent()) return

      if (guestRoomCode) {
        attempt.handedOff = true
        navigate(`/play?room=${guestRoomCode}`)
        return
      }

      for (let reservation = 0; reservation < MAX_ROOM_CREATION_ATTEMPTS; reservation += 1) {
        const roomCode = createRoomCode()
        const peerId = roomCodeToPeerId(roomCode)
        try {
          const opening = client.startHost(peerId)
          attempt.sessionId = client.getSnapshot().sessionId
          await opening
        } catch (error) {
          if (!isCurrent() || !ownsTransport()) return
          if (error instanceof Error && error.name === 'AbortError') throw error
          // A generated peer ID can already be reserved.
          continue
        }
        if (!isCurrent() || !ownsTransport()) return
        const session: HostRoomSession = {
          connectedPeerIds: [], peerId, role: 'host', roomCode, sessionKey: createRoomToken(),
        }
        attempt.savedSession = session
        await saveRoomSession(session, () => isCurrent() && ownsTransport())
        if (!isCurrent() || !ownsTransport()) return
        attempt.handedOff = true
        navigate('/play')
        return
      }
      throw new Error('Impossible de creer une partie. Reessayez dans un instant.')
    } catch (error) {
      if (isCurrent()) {
        setCreationError(error instanceof Error ? error.message : 'Impossible de preparer la partie.')
      }
    } finally {
      if (!attempt.handedOff) {
        // Never let completion of an obsolete attempt close a newer session.
        if (ownsTransport()) client.close()
        if (attempt.savedSession) {
          await clearRoomSession(attempt.savedSession.sessionKey).catch(() => {})
        }
        if (isCurrent()) {
          attemptRef.current = null
          setPendingEntry(null)
        }
      }
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

        <ProfileEditor disabled={pendingEntry !== null} onNameValidityChange={setHasValidName} />

        <div className="flex w-full gap-4">
          <Button
            className="h-12 flex-1 rounded-xl bg-[#00e5ff] text-sm font-bold tracking-[0.05em] text-[#0a0616] uppercase shadow-[0_4px_18px_rgba(0,229,255,0.35)] hover:bg-[#00e5ff] hover:shadow-[0_4px_26px_rgba(0,229,255,0.55)]"
            disabled={pendingEntry !== null || !hasValidName}
            onClick={() => { void enterRoom() }}
            size="lg"
            type="button"
          >
            {pendingEntry === 'create' ? 'Création...' : 'Créer'}
          </Button>
          <JoinRoomDialog disabled={pendingEntry !== null || !hasValidName} error={creationError} isJoining={pendingEntry === 'join'} onJoin={(roomCode) => { void enterRoom(roomCode) }} />
        </div>
        {creationError && <p className="-mt-4 text-center text-sm font-medium text-[#ff4081]" role="alert">{creationError}</p>}
        {!creationError && typeof location.state?.roomError === 'string' && <p className="-mt-4 text-center text-sm font-medium text-[#ff4081]" role="alert">{location.state.roomError}</p>}
      </section>
    </main>
  )
}
