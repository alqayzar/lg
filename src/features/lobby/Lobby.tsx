import { LogOut } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { PlayerGrid, type LobbyPlayer } from './PlayerGrid'
import { RoomCodeDialog } from './RoomCodeDialog'

interface LobbyProps {
  currentPlayerId: string
  onQuit: () => Promise<void>
  players: LobbyPlayer[]
  roomCode: string
}

export type { LobbyPlayer }

export function Lobby(props: LobbyProps) {
  const [isQuitting, setIsQuitting] = useState(false)

  async function quitRoom() {
    if (isQuitting) return
    setIsQuitting(true)
    try {
      await props.onQuit()
    } finally {
      setIsQuitting(false)
    }
  }

  return (
    <main className="min-h-dvh bg-[#0d0a1a] text-[#f0e6ff]">
      <div className="h-[3px] bg-linear-to-r from-[#00e5ff] via-[#7c4dff] via-50% to-[#ff6d00]" />
      <header className="flex items-center justify-between gap-2 border-b border-[#1c1438] bg-[#090618] px-4 py-3 shadow-[0_2px_8px_rgba(0,0,0,0.4)]">
        <RoomCodeDialog roomCode={props.roomCode} />
        <Button
          className="h-9 border border-[#ff4081] px-3 text-sm font-bold text-[#ff4081] hover:bg-[#ff4081] hover:text-white"
          disabled={isQuitting}
          onClick={quitRoom}
          type="button"
          variant="ghost"
        >
          <LogOut aria-hidden="true" /> {isQuitting ? 'Fermeture...' : 'Quitter'}
        </Button>
      </header>

      <section className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6">
        <div className="mb-5 flex items-baseline justify-between gap-4">
          <h1 className="text-2xl font-black tracking-tight text-[#f0e6ff]">{props.players.length} Joueurs</h1>
        </div>
        <PlayerGrid currentPlayerId={props.currentPlayerId} players={props.players} />
      </section>
    </main>
  )
}
