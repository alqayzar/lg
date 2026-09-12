import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface RoomCodeDialogProps {
  roomCode: string
}

export function RoomCodeDialog(props: RoomCodeDialogProps) {
  const [hasCopiedRoomCode, setHasCopiedRoomCode] = useState(false)
  const [isOpen, setIsOpen] = useState(false)

  function handleOpenChange(nextIsOpen: boolean) {
    setIsOpen(nextIsOpen)

    if (!nextIsOpen) {
      setHasCopiedRoomCode(false)
    }
  }

  function openDialog() {
    setIsOpen(true)
  }

  async function copyRoomCode() {
    try {
      await navigator.clipboard.writeText(props.roomCode)
      setHasCopiedRoomCode(true)
    } catch {
      setHasCopiedRoomCode(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <Button
        aria-label="Afficher le code de la partie"
        className="h-9 border border-[#00e5ff]/35 bg-[#00e5ff]/5 px-3 font-mono text-sm font-bold tracking-[0.2em] text-[#00e5ff] hover:bg-[#00e5ff]/10 hover:text-[#00e5ff]"
        onClick={openDialog}
        type="button"
        variant="ghost"
      >
        {props.roomCode}
      </Button>
      <DialogContent className="border-2 border-[#2d1f55] bg-[#11102b] p-6 text-[#f0e6ff] shadow-[0_0_28px_rgba(124,77,255,0.35)]">
        <DialogHeader>
          <DialogTitle className="text-[#f0e6ff] uppercase">Room Code</DialogTitle>
        </DialogHeader>
        <p className="rounded-xl border border-[#00e5ff]/35 bg-[#00e5ff]/5 px-4 py-3 text-center font-mono text-xl font-bold tracking-[0.2em] text-[#00e5ff]">
          {props.roomCode}
        </p>
        <Button
          className="h-11 bg-[#00e5ff] font-bold tracking-[0.05em] text-[#0a0616] uppercase hover:bg-[#00e5ff]"
          onClick={copyRoomCode}
          type="button"
        >
          {hasCopiedRoomCode ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          {hasCopiedRoomCode ? 'Code copié' : 'Copier le code'}
        </Button>
      </DialogContent>
    </Dialog>
  )
}
