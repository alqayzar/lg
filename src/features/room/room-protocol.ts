export interface PlayerInfo {
  avatar: string | null
  name: string
}

export type GuestRoomMessage =
  | { type: 'join'; knownPlayerIds: string[] }
  | { type: 'leave' }
  | { type: 'player-info'; player: PlayerInfo }
  | { type: 'room-closed-ack' }

export type HostRoomMessage =
  | { type: 'game-screen-config'; bottomElements: GameBottomElement[] }
  | { type: 'game-stop' }
  | { type: 'game-start' }
  | { type: 'joined'; playerId: string }
  | { type: 'kicked' }
  | { type: 'left' }
  | { type: 'player-info'; player: PlayerInfo; playerId: string }
  | { type: 'players-sync'; playerIds: string[] }
  | { type: 'room-closed' }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function parsePlayerInfo(value: unknown): PlayerInfo | null {
  if (!isRecord(value) || typeof value.name !== 'string') return null
  if (value.avatar !== null && typeof value.avatar !== 'string') return null
  return { avatar: value.avatar, name: value.name }
}

export function parseClaimedPlayerId(metadata: unknown): string | null {
  if (!isRecord(metadata)) return null
  return typeof metadata.playerId === 'string' ? metadata.playerId : null
}

export function parseGuestRoomMessage(message: unknown): GuestRoomMessage | null {
  if (!isRecord(message)) return null
  if (message.type === 'join') {
    if (!Array.isArray(message.knownPlayerIds) || !message.knownPlayerIds.every((playerId) => typeof playerId === 'string')) {
      return null
    }
    return { knownPlayerIds: message.knownPlayerIds, type: 'join' }
  }
  if (message.type === 'leave' || message.type === 'room-closed-ack') {
    return { type: message.type }
  }
  if (message.type === 'player-info') {
    const player = parsePlayerInfo(message.player)
    return player ? { type: 'player-info', player } : null
  }
  return null
}

export function parseHostRoomMessage(message: unknown): HostRoomMessage | null {
  if (!isRecord(message)) return null

  if (message.type === 'game-screen-config') {
    const bottomElements = parseGameBottomElements(message.bottomElements)
    return bottomElements ? { bottomElements, type: 'game-screen-config' } : null
  }
  if (message.type === 'game-start') return { type: 'game-start' }
  if (message.type === 'game-stop') return { type: 'game-stop' }
  if (message.type === 'kicked') return { type: 'kicked' }
  if (message.type === 'room-closed') return { type: 'room-closed' }
  if (message.type === 'left') return { type: 'left' }
  if (message.type === 'player-info' && typeof message.playerId === 'string') {
    const player = parsePlayerInfo(message.player)
    return player ? { type: 'player-info', player, playerId: message.playerId } : null
  }
  if (message.type === 'joined' && typeof message.playerId === 'string') {
    return { type: 'joined', playerId: message.playerId }
  }
  if (
    message.type === 'players-sync'
    && Array.isArray(message.playerIds)
    && message.playerIds.every((playerId) => typeof playerId === 'string')
  ) {
    return { type: 'players-sync', playerIds: message.playerIds }
  }

  return null
}
import { parseGameBottomElements, type GameBottomElement } from '@/features/play/game-screen-configuration'
