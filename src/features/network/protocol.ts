import { z } from 'zod'
import type { NetworkMessage } from './types'

const networkMessageSchema = z.object({
  id: z.string().min(1).max(128),
  payload: z.unknown(),
  sentAt: z.number().finite().nonnegative(),
  type: z.string().min(1).max(128),
  version: z.literal(1),
})

function createMessageId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function createNetworkMessage(type: string, payload: unknown): NetworkMessage {
  return {
    id: createMessageId(),
    payload,
    sentAt: Date.now(),
    type,
    version: 1,
  }
}

export function parseNetworkMessage(value: unknown): NetworkMessage | null {
  const result = networkMessageSchema.safeParse(value)
  return result.success ? result.data : null
}
