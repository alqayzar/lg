import { useState, type ChangeEvent } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { normalizeRoomCode } from '@/features/room/room-code'

interface JoinRoomDialogProps {
  disabled: boolean
  error?: string | null
  isJoining?: boolean
  onJoin(roomCode: string): void
}

export function JoinRoomDialog(props: JoinRoomDialogProps) {
  const [codeInput, setCodeInput] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const roomCode = normalizeRoomCode(codeInput)

  function openDialog() {
    setIsOpen(true)
  }

  function handleCodeChange(event: ChangeEvent<HTMLInputElement>) {
    setCodeInput(event.target.value.toUpperCase())
  }

  function joinRoom() {
    if (roomCode && !props.disabled) {
      props.onJoin(roomCode)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <Button
        className="h-12 flex-1 rounded-xl bg-[#c6ff00] text-sm font-bold tracking-[0.05em] text-[#0a0616] uppercase shadow-[0_4px_18px_rgba(198,255,0,0.35)] hover:bg-[#c6ff00] hover:shadow-[0_4px_26px_rgba(198,255,0,0.55)]"
        disabled={props.disabled}
        onClick={openDialog}
        size="lg"
        type="button"
      >
        Rejoindre
      </Button>
      <DialogContent className="border-2 border-[#2d1f55] bg-[#11102b] p-6 text-[#f0e6ff] shadow-[0_0_28px_rgba(124,77,255,0.35)]">
        <DialogHeader>
          <DialogTitle className="text-[#f0e6ff]">Rejoindre une partie</DialogTitle>
        </DialogHeader>
        <Input
          aria-label="Code de la partie"
          autoCapitalize="characters"
          autoComplete="off"
          className="h-12 rounded-xl border-2 border-[#2d1f55] bg-[#1c1535] px-4 font-mono text-base font-bold tracking-[0.2em] text-[#f0e6ff] placeholder:font-sans placeholder:font-normal placeholder:tracking-normal placeholder:text-[#4a3d6b] focus-visible:border-[#7c4dff] focus-visible:ring-[3px] focus-visible:ring-[#7c4dff]/20"
          disabled={props.disabled}
          maxLength={7}
          onChange={handleCodeChange}
          placeholder="ABC-123"
          spellCheck={false}
          type="text"
          value={codeInput}
        />
        <Button
          className="h-11 bg-[#7c4dff] font-bold tracking-[0.05em] text-[#f0e6ff] uppercase shadow-[0_4px_18px_rgba(124,77,255,0.4)] hover:bg-[#651fff]"
          disabled={!roomCode || props.disabled}
          onClick={joinRoom}
          type="button"
        >
          {props.isJoining ? 'Preparation...' : 'Rejoindre'}
        </Button>
        {props.error && <p className="text-sm font-medium text-[#ff4081]" role="alert">{props.error}</p>}
      </DialogContent>
    </Dialog>
  )
}
