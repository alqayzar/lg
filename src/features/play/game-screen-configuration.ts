export type GameBottomElement = GameBottomTextElement | GameBottomButtonElement

export interface GameBottomAction {
  action: string
  elementId: string
}

export interface GameBottomTextElement {
  id: string
  text: string
  tone?: 'default' | 'muted' | 'warning'
  type: 'text'
}

export interface GameBottomButtonElement {
  action: string
  color: 'cyan' | 'yellow' | 'red' | 'orange' | 'dark'
  disabled?: boolean
  id: string
  title: string
  type: 'button'
}

export function parseGameBottomElements(value: unknown): GameBottomElement[] | null {
  if (!Array.isArray(value)) return null

  const elements: GameBottomElement[] = []
  const elementIds = new Set<string>()
  for (const element of value) {
    if (typeof element !== 'object' || element === null) return null
    const value = element as Record<string, unknown>
    if (typeof value.id !== 'string' || elementIds.has(value.id)) return null
    elementIds.add(value.id)

    if (value.type === 'text' && typeof value.text === 'string') {
      if (value.tone !== undefined && value.tone !== 'default' && value.tone !== 'muted' && value.tone !== 'warning') return null
      elements.push({ id: value.id, text: value.text, ...(value.tone ? { tone: value.tone } : {}), type: 'text' })
      continue
    }

    if (
      value.type === 'button'
      && typeof value.action === 'string'
      && typeof value.title === 'string'
      && (value.color === 'cyan' || value.color === 'yellow' || value.color === 'red' || value.color === 'orange' || value.color === 'dark')
      && (value.disabled === undefined || typeof value.disabled === 'boolean')
    ) {
      elements.push({
        action: value.action,
        color: value.color,
        ...(value.disabled !== undefined ? { disabled: value.disabled } : {}),
        id: value.id,
        title: value.title,
        type: 'button',
      })
      continue
    }

    return null
  }

  return elements
}
