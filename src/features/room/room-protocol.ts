import { z } from 'zod'
import type { PlayerMetadata } from '@/features/profile/types'

export const ROOM_MESSAGE = {
  getInfos: 'get-infos',
  playerLeave: 'player-leave',
  playerLeft: 'player-left',
  playerInfo: 'player-info',
  playerList: 'player-list',
  roomClose: 'room-close',
  roomClosed: 'room-closed',
} as const

export interface RoomPlayer {
  isHost: boolean
  metadata: PlayerMetadata
  peerId: string
}

export const MAX_AVATAR_BYTES = 7_000_000

const identifier = z.string().min(1).max(128)
const revision = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const playerMetadataSchema = z.object({
  avatarUrl: z.string().max(10_000_000).regex(/^data:image\/[a-zA-Z0-9.+-]+;base64,[a-zA-Z0-9+/]+={0,2}$/).nullable(),
  name: z.string().trim().min(1).max(20),
})

export type RegisteredPlayerMetadata = z.infer<typeof playerMetadataSchema>

const playerListSchema = z.object({
  epoch: identifier,
  revision,
  requestId: identifier.optional(),
  players: z.array(z.object({ isHost: z.boolean(), peerId: identifier })).max(256),
}).refine(({ players }) => new Set(players.map((player) => player.peerId)).size === players.length)

const playerInfoSchema = z.object({
  epoch: identifier.optional(),
  revision: revision.optional(),
  isHost: z.boolean().optional(),
  metadata: playerMetadataSchema,
  peerId: identifier.optional(),
})

const requestSchema = z.object({ requestId: identifier, epoch: identifier.optional() })

export function parsePlayerMetadata(value: unknown): RegisteredPlayerMetadata | null {
  const result = playerMetadataSchema.safeParse(value)
  return result.success ? result.data : null
}

export function parsePlayerInfo(value: unknown) {
  const result = playerInfoSchema.safeParse(value)
  return result.success ? result.data : null
}

export function parsePlayerList(value: unknown) {
  const result = playerListSchema.safeParse(value)
  return result.success ? result.data : null
}

export function parseRoomRequest(value: unknown) {
  const result = requestSchema.safeParse(value)
  return result.success ? result.data : null
}
