import { Star, UserRound } from 'lucide-react'

export interface LobbyPlayer {
  avatar: string | null
  id: string
  isHost: boolean
  name: string
}

interface PlayerGridProps {
  currentPlayerId: string
  onCurrentPlayerClick: () => void
  players: LobbyPlayer[]
}

export function PlayerGrid(props: PlayerGridProps) {
  function handleCurrentPlayerKeyDown(event: React.KeyboardEvent<HTMLElement>) {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    props.onCurrentPlayerClick()
  }

  return (
    <div className="grid flex-1 content-start grid-cols-[repeat(auto-fill,minmax(88px,100px))] justify-center gap-3">
      {props.players.map((player) => {
        const isCurrentPlayer = player.id === props.currentPlayerId
        return (
        <article
          aria-label={isCurrentPlayer ? 'Modifier votre image de profil' : undefined}
          className={`element-shadow relative flex min-h-28 flex-col items-center justify-center gap-2 rounded-xl border-2 border-[#08050f] [--element-color:#24212a] bg-[var(--element-color)] px-2 py-3 ${isCurrentPlayer ? 'cursor-pointer outline-2 outline-[#73cbd1] outline-offset-2' : ''}`}
          key={player.id}
          onClick={isCurrentPlayer ? props.onCurrentPlayerClick : undefined}
          onKeyDown={isCurrentPlayer ? handleCurrentPlayerKeyDown : undefined}
          role={isCurrentPlayer ? 'button' : undefined}
          tabIndex={isCurrentPlayer ? 0 : undefined}
        >
          {player.isHost && (
            <Star
              aria-label="Hôte"
              className="absolute -top-3 -right-2 size-6 fill-[#ffe57f] text-[#08050f]"
            />
          )}
          <div className="grid size-14 place-items-center overflow-hidden rounded-full border-2 border-[#08050f] bg-[#16151d] text-[#aaa59a]">
            {player.avatar ? (
              <img alt="" className="size-full object-cover" src={player.avatar} />
            ) : (
              <UserRound aria-hidden="true" className="size-6" />
            )}
          </div>
          <p className="w-full break-words text-center text-xs font-semibold text-[#e7e0c8]">
            {player.name}
          </p>
        </article>
        )
      })}
    </div>
  )
}
