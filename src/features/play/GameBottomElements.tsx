import { Button } from '@/components/ui/button'
import { useGameScreen } from './GameScreenProvider'
import type { GameBottomButtonElement, GameBottomTextElement } from './game-screen-configuration'

const buttonColorClasses: Record<GameBottomButtonElement['color'], string> = {
  cyan: '[--element-color:var(--cyan)]',
  dark: '[--element-color:#151515] text-white',
  orange: '[--element-color:var(--coral)]',
  red: '[--element-color:var(--coral)]',
  yellow: '[--element-color:var(--gold)]',
}

const textToneClasses: Record<NonNullable<GameBottomTextElement['tone']>, string> = {
  default: 'text-[var(--text-color)]',
  muted: 'text-[var(--muted-text-color)]',
  warning: 'text-[#963f34]',
}

interface GameBottomButtonProps {
  element: GameBottomButtonElement
}

function GameBottomButton(props: GameBottomButtonProps) {
  const { onBottomAction } = useGameScreen()

  function handleClick() {
    onBottomAction({ action: props.element.action, elementId: props.element.id })
  }

  return (
    <Button
      className={`cartoon-press h-12 rounded-2xl border-[var(--outline-color)] px-4 font-black text-[var(--text-color)] ${buttonColorClasses[props.element.color]}`}
      disabled={props.element.disabled}
      onClick={handleClick}
      type="button"
    >
      {props.element.title}
    </Button>
  )
}

interface GameBottomTextProps {
  element: GameBottomTextElement
}

function GameBottomText(props: GameBottomTextProps) {
  return <p className={`text-center text-sm font-bold ${textToneClasses[props.element.tone ?? 'default']}`}>{props.element.text}</p>
}

export function GameBottomElements() {
  const { bottomElements } = useGameScreen()
  if (bottomElements.length === 0) return null

  return (
    <section aria-label="Commandes de la partie" className="grid gap-3 border-t-4 border-[var(--outline-color)] bg-[var(--canvas)] px-4 py-3">
      {bottomElements.map((element) => element.type === 'button'
        ? <GameBottomButton element={element} key={element.id} />
        : <GameBottomText element={element} key={element.id} />)}
    </section>
  )
}
