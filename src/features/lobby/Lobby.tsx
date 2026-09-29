import { LogOut } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { AppLogo } from '@/components/AppLogo'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { PlayerGrid, type LobbyPlayer } from './PlayerGrid'
import { KickPlayerDialog } from './KickPlayerDialog'
import { RoomCodeDialog } from './RoomCodeDialog'

interface LobbyProps {
  currentPlayerId: string
  onCurrentPlayerClick: () => void
  onKickPlayer?: (playerId: string) => Promise<void>
  onQuit: () => Promise<void>
  onStart: () => void
  players: LobbyPlayer[]
  roomCode: string
}

export type { LobbyPlayer }

export function Lobby(props: LobbyProps) {
  const [isQuitDialogOpen, setIsQuitDialogOpen] = useState(false)
  const [isQuitting, setIsQuitting] = useState(false)
  const [selectedPlayer, setSelectedPlayer] = useState<LobbyPlayer | null>(null)
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

  function openQuitDialog() {
    setIsQuitDialogOpen(true)
  }

  function selectPlayer(player: LobbyPlayer) {
    if (player.isHost || !props.onKickPlayer) return
    setSelectedPlayer(player)
  }

  return (
    <main className="flex h-dvh flex-col overflow-hidden bg-[var(--canvas)] text-[var(--canvas-foreground)]">
      <header className="flex items-center justify-between gap-3 border-b-4 border-[var(--outline-color)] bg-[var(--canvas)] px-4 py-3">
        <AppLogo className="size-10 shrink-0" />
        <div className="flex items-center gap-3">
          <Button
            className="cartoon-press cartoon-press-sm h-10 rounded-full border-[var(--outline-color)] [--element-color:var(--paper)] px-4 text-sm font-black text-[var(--text-color)] hover:bg-[#fff8df]"
            disabled={isQuitting}
            onClick={openQuitDialog}
            type="button"
            variant="ghost"
          >
            <LogOut aria-hidden="true" /> {isQuitting ? 'Fermeture...' : 'Quitter'}
          </Button>
        </div>
      </header>

      <section className="mx-auto flex min-h-0 w-full max-w-2xl flex-1 flex-col py-2">
        <div className="my-2 flex items-end justify-between gap-4 px-4 sm:px-6">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--canvas-muted)]">Salon</p>
            <h1 className="text-3xl font-black tracking-[-0.04em] text-[var(--canvas-foreground)]">{props.players.length} joueurs</h1>
          </div>
          <RoomCodeDialog roomCode={props.roomCode} />
        </div>
        <PlayerGrid currentPlayerId={props.currentPlayerId} onCurrentPlayerClick={props.onCurrentPlayerClick} onPlayerClick={isHost ? selectPlayer : undefined} players={props.players} />
      </section>
      {isHost && (
        <section aria-label="Commandes du salon" className="grid grid-cols-2 gap-3 border-t-4 border-[var(--outline-color)] bg-[var(--canvas)] px-4 py-3">
          <Button
            className="cartoon-press h-13 rounded-2xl border-[var(--outline-color)] [--element-color:var(--gold)] font-black text-[var(--text-color)] hover:bg-[#ffc95c]"
            type="button"
          >
            Paramètre
          </Button>
          <Button
            className="cartoon-press h-13 rounded-2xl border-[var(--outline-color)] [--element-color:var(--mint)] font-black text-[var(--text-color)] hover:bg-[#95e7df]"
            onClick={props.onStart}
            type="button"
          >
            Lancer
          </Button>
        </section>
      )}
      <Dialog open={isQuitDialogOpen} onOpenChange={setIsQuitDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-[var(--text-color)]">Quitter le salon ?</DialogTitle>
            <DialogDescription className="text-center font-medium text-[var(--muted-text-color)]">Cette action vous fera quitter la partie.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <Button
              className="cartoon-press h-12 rounded-2xl border-[var(--outline-color)] [--element-color:var(--paper-muted)] font-black text-[var(--text-color)] hover:bg-white"
              disabled={isQuitting}
              onClick={() => setIsQuitDialogOpen(false)}
              type="button"
              variant="ghost"
            >
              Annuler
            </Button>
            <Button
              className="cartoon-press h-12 rounded-2xl border-[var(--outline-color)] [--element-color:var(--coral)] font-black text-[var(--text-color)] hover:bg-[#ff7885]"
              disabled={isQuitting}
              onClick={quitRoom}
              type="button"
            >
              {isQuitting ? 'Fermeture...' : 'Quitter'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {props.onKickPlayer && (
        <KickPlayerDialog
          onKick={props.onKickPlayer}
          onOpenChange={(isOpen) => !isOpen && setSelectedPlayer(null)}
          player={selectedPlayer}
        />
      )}
    </main>
  )
}
