import { LogOut } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { PlayerGrid, type LobbyPlayer } from './PlayerGrid'
import { RoomCodeDialog } from './RoomCodeDialog'

interface LobbyProps {
  currentPlayerId: string
  onCurrentPlayerClick: () => void
  onQuit: () => Promise<void>
  players: LobbyPlayer[]
  roomCode: string
}

export type { LobbyPlayer }

export function Lobby(props: LobbyProps) {
  const [isQuitting, setIsQuitting] = useState(false)
  const isHost = props.players.some((player) => player.id === props.currentPlayerId && player.isHost)

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
    <main className="flex min-h-dvh flex-col bg-[#14131d] text-[#e7e0c8]">
      <div className="h-2 bg-[#e6c65d]" />
      <header className="element-shadow flex items-center justify-between gap-2 border-b-2 border-[#08050f] [--element-color:#24212a] bg-[var(--element-color)] px-4 py-3">
        <RoomCodeDialog roomCode={props.roomCode} />
        <Button
          className="cartoon-press cartoon-press-sm h-9 border-2 border-[#08050f] [--element-color:#c95045] bg-[var(--element-color)] px-3 text-sm font-bold text-[#16120d] hover:bg-[#df675c]"
          disabled={isQuitting}
          onClick={quitRoom}
          type="button"
          variant="ghost"
        >
          <LogOut aria-hidden="true" /> {isQuitting ? 'Fermeture...' : 'Quitter'}
        </Button>
      </header>

      <section className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 py-8 sm:px-6">
        <div className="mb-5 flex items-baseline justify-between gap-4">
          <h1 className="text-2xl font-black tracking-tight uppercase text-[#e7e0c8]">{props.players.length} Joueurs</h1>
        </div>
        <PlayerGrid currentPlayerId={props.currentPlayerId} onCurrentPlayerClick={props.onCurrentPlayerClick} players={props.players} />
        {isHost && (
          <div className="grid grid-cols-2 gap-3">
            <Button className="uppercase cartoon-press h-12 border-2 border-[#08050f] [--element-color:#e6c65d] bg-[var(--element-color)] font-bold text-[#16120d] hover:bg-[#f0d97d]" type="button">
              Paramètre
            </Button>
            <Button className="uppercase cartoon-press h-12 border-2 border-[#08050f] [--element-color:#73cbd1] bg-[var(--element-color)] font-bold text-[#16120d] hover:bg-[#91dce0]" type="button">
              Lancer
            </Button>
          </div>
        )}
      </section>
    </main>
  )
}
