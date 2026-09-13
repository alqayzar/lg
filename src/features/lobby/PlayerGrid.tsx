import { Star, UserRound } from 'lucide-react'

export interface LobbyPlayer {
  avatar: string | null
  id: string
  isHost: boolean
  name: string
}

interface PlayerGridProps {
  currentPlayerId: string
  players: LobbyPlayer[]
}

export function PlayerGrid(props: PlayerGridProps) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(88px,100px))] justify-center gap-3">
      {props.players.map((player) => {
        return (
        <article
          className={`relative flex min-h-28 flex-col items-center justify-center gap-2 rounded-xl border-2 border-[#2d1f55] bg-[#1a1133] px-2 py-3 shadow-[0_0_14px_-4px_#7c4dff] ${player.id === props.currentPlayerId ? 'ring-2 ring-[#00e5ff] ring-offset-2 ring-offset-[#0d0a1a]' : ''}`}
          key={player.id}
        >
          {player.isHost && (
            <Star
              aria-label="Hôte"
              className="absolute -top-3 -right-2 size-6 fill-[#ffe57f] text-[#ffab40] drop-shadow-[0_0_5px_#ffe57f]"
            />
          )}
          <div className="grid size-14 place-items-center overflow-hidden rounded-full border-2 border-[#7c4dff] bg-[#130e25] text-[#a08ab8]">
            {player.avatar ? (
              <img alt="" className="size-full object-cover" src={player.avatar} />
            ) : (
              <UserRound aria-hidden="true" className="size-6" />
            )}
          </div>
          <p className="w-full break-words text-center text-xs font-semibold text-[#f0e6ff]">
            {player.name}
          </p>
        </article>
        )
      })}
    </div>
  )
}
