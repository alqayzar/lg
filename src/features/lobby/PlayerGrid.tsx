import { Star, UserRound } from 'lucide-react'

export interface LobbyPlayer {
  avatar: string | null
  id: string
  isHost: boolean
  name: string
}

interface PlayerGridProps {
  currentPlayerId: string
  onCurrentPlayerClick?: () => void
  onPlayerClick?: (player: LobbyPlayer) => void
  players: LobbyPlayer[]
}

export function PlayerGrid(props: PlayerGridProps) {
  function handlePlayerClick(player: LobbyPlayer) {
    if (player.id === props.currentPlayerId) {
      props.onCurrentPlayerClick?.()
      return
    }
    props.onPlayerClick?.(player)
  }

  function handlePlayerKeyDown(event: React.KeyboardEvent<HTMLElement>, player: LobbyPlayer) {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    handlePlayerClick(player)
  }

  return (
    <div className="grid min-h-0 flex-1 content-start grid-cols-3 gap-3 overflow-x-hidden px-4 py-6 sm:px-6 overflow-y-auto sm:grid-cols-[repeat(auto-fill,minmax(104px,1fr))]">
      {props.players.map((player) => {
        const isCurrentPlayer = player.id === props.currentPlayerId
        const canEditCurrentPlayer = isCurrentPlayer && props.onCurrentPlayerClick !== undefined
        const canManagePlayer = !isCurrentPlayer && !player.isHost && props.onPlayerClick !== undefined
        const canInteract = canEditCurrentPlayer || canManagePlayer
        return (
        <article
          aria-label={canEditCurrentPlayer ? 'Modifier votre image de profil' : canManagePlayer ? `Gérer ${player.name}` : undefined}
          className={`element-shadow relative flex aspect-square flex-col items-center justify-center gap-1 rounded-none border-4 border-[var(--outline-color)] [--element-color:var(--paper)] p-2 transition-transform ${isCurrentPlayer ? 'outline-4 outline-[var(--cyan)] outline-offset-2' : ''} ${canInteract ? 'cursor-pointer hover:-translate-y-1' : ''}`}
          key={player.id}
          onClick={canInteract ? () => handlePlayerClick(player) : undefined}
          onKeyDown={canInteract ? (event) => handlePlayerKeyDown(event, player) : undefined}
          role={canInteract ? 'button' : undefined}
          tabIndex={canInteract ? 0 : undefined}
        >
          {player.isHost && (
            <Star
              aria-label="Hôte"
              className="absolute -top-2 -right-1 size-4 fill-[var(--gold)] text-[var(--text-color)]"
            />
          )}
          <div className="grid size-14 place-items-center overflow-hidden rounded-full border-4 border-[var(--outline-color)] bg-[var(--cyan)] text-[var(--text-color)] sm:size-16">
            {player.avatar ? (
              <img alt="" className="size-full object-cover" src={player.avatar} />
            ) : (
              <UserRound aria-hidden="true" className="size-5 sm:size-6" />
            )}
          </div>
          <p className="w-full break-words text-center text-[0.65rem] font-black leading-tight text-[var(--text-color)] sm:text-xs">
            {player.name}
          </p>
        </article>
        )
      })}
    </div>
  )
}
