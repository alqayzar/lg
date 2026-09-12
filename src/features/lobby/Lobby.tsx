import { LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { RoomState } from '@/features/room/room-controller'
import { PlayerGrid } from './PlayerGrid'
import { RoomCodeDialog } from './RoomCodeDialog'

interface LobbyProps extends RoomState {
  onQuit(): void
}

export function Lobby(props: LobbyProps) {
  const statusText = props.isLeaving ? 'Fermeture de la partie...'
    : props.status === 'loading' ? 'Chargement de la partie...'
      : props.status === 'reconnecting' || props.status === 'offline' ? 'Connexion interrompue. Reconnexion...'
        : props.status === 'starting' || props.status === 'connecting' ? 'Connexion a la partie...'
          : props.status === 'error' ? 'Connexion impossible.'
            : props.role === 'guest' && props.players.length === 0 ? 'Synchronisation des joueurs...'
              : null

  return (
    <main className="min-h-dvh bg-[#0d0a1a] text-[#f0e6ff]">
      <div className="h-[3px] bg-linear-to-r from-[#00e5ff] via-[#7c4dff] via-50% to-[#ff6d00]" />
      <header className="flex items-center justify-between gap-2 border-b border-[#1c1438] bg-[#090618] px-4 py-3 shadow-[0_2px_8px_rgba(0,0,0,0.4)]">
        {props.roomCode ? <RoomCodeDialog roomCode={props.roomCode} /> : <span className="text-sm font-bold">Loup Garou</span>}
        <Button
          className="h-9 border border-[#ff4081] px-3 text-sm font-bold text-[#ff4081] hover:bg-[#ff4081] hover:text-white"
          disabled={props.isLeaving}
          onClick={props.onQuit}
          type="button"
          variant="ghost"
        >
          <LogOut aria-hidden="true" /> {props.isLeaving ? 'Fermeture...' : 'Quitter'}
        </Button>
      </header>

      <section className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6">
        {statusText && <p className="mb-5 text-sm text-[#a08ab8]" role="status">{statusText}</p>}
        {props.error && <p className="mb-5 text-sm text-[#ff4081]" role="alert">{props.error}</p>}
        <div className="mb-5 flex items-baseline justify-between gap-4">
          <h1 className="text-2xl font-black tracking-tight text-[#f0e6ff]">{props.players.length} Joueurs</h1>
        </div>
        <PlayerGrid currentPeerId={props.currentPeerId} players={props.players} />
      </section>
    </main>
  )
}
