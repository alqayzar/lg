import { useState } from 'react'
import { LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AppLogo } from '@/components/AppLogo'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { PlayerGrid, type LobbyPlayer } from '@/features/lobby/PlayerGrid'
import { GameBottomElements } from './GameBottomElements'

interface GameScreenProps {
  currentPlayerId: string
  onQuit: () => Promise<void>
  players: LobbyPlayer[]
}

export function GameScreen(props: GameScreenProps) {
  const [isQuitDialogOpen, setIsQuitDialogOpen] = useState(false)
  const [isQuitting, setIsQuitting] = useState(false)

  async function quitGame() {
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

  return (
    <main className="flex h-dvh flex-col overflow-hidden bg-[var(--canvas)] text-[var(--canvas-foreground)]">
      <header className="flex items-center justify-between border-b-4 border-[var(--outline-color)] bg-[var(--canvas)] px-4 py-3">
        <AppLogo className="size-10 shrink-0" />
        <Button
          className="cartoon-press cartoon-press-sm h-10 rounded-full border-[var(--outline-color)] [--element-color:var(--paper)] px-4 text-sm font-black text-[var(--text-color)] hover:bg-[#fff8df]"
          disabled={isQuitting}
          onClick={openQuitDialog}
          type="button"
          variant="ghost"
        >
          <LogOut aria-hidden="true" /> {isQuitting ? 'Fermeture...' : 'Quitter'}
        </Button>
      </header>
      <section className="flex min-h-0 w-full max-w-2xl flex-1 flex-col">
        <PlayerGrid currentPlayerId={props.currentPlayerId} players={props.players} />
      </section>
      <GameBottomElements />
      <Dialog open={isQuitDialogOpen} onOpenChange={setIsQuitDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-[var(--text-color)]">Quitter la partie ?</DialogTitle>
            <DialogDescription className="text-center font-medium text-[var(--muted-text-color)]">Cette action quittera la partie en cours.</DialogDescription>
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
              onClick={quitGame}
              type="button"
            >
              {isQuitting ? 'Fermeture...' : 'Quitter'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  )
}
