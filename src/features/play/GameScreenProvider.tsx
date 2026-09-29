import { createContext, useContext, type ReactNode } from 'react'
import type { GameBottomAction, GameBottomElement } from './game-screen-configuration'

interface GameScreenContextValue {
  bottomElements: GameBottomElement[]
  onBottomAction: (action: GameBottomAction) => void
  setBottomElements: (elements: GameBottomElement[]) => void
}

interface GameScreenProviderProps {
  bottomElements: GameBottomElement[]
  children: ReactNode
  onBottomAction?: (action: GameBottomAction) => void
  setBottomElements: (elements: GameBottomElement[]) => void
}

const GameScreenContext = createContext<GameScreenContextValue | null>(null)
const noOp = () => {}

export function GameScreenProvider(props: GameScreenProviderProps) {
  return (
    <GameScreenContext.Provider value={{
      bottomElements: props.bottomElements,
      onBottomAction: props.onBottomAction ?? noOp,
      setBottomElements: props.setBottomElements,
    }}>
      {props.children}
    </GameScreenContext.Provider>
  )
}

export function useGameScreen() {
  const context = useContext(GameScreenContext)
  if (!context) throw new Error('useGameScreen must be used within GameScreenProvider.')
  return context
}
