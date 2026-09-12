import { useSearchParams } from 'react-router-dom'
import { Lobby } from '@/features/lobby/Lobby'
import { useRoomPlayers } from '@/features/room/use-room-players'

export function Play() {
  const [searchParams] = useSearchParams()
  const room = useRoomPlayers(searchParams.get('room'))

  return <Lobby {...room} />
}
