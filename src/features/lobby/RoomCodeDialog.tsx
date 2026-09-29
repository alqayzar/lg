import { useState } from 'react'
import { Check, Copy, Link } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
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
  const [hasCopiedJoinLink, setHasCopiedJoinLink] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const joinUrl = new URL('join', new URL(import.meta.env.BASE_URL, window.location.origin))
  joinUrl.searchParams.set('room', props.roomCode)

  function handleOpenChange(nextIsOpen: boolean) {
    setIsOpen(nextIsOpen)

    if (!nextIsOpen) {
      setHasCopiedRoomCode(false)
      setHasCopiedJoinLink(false)
    }
  }

  function openDialog() {
    setIsOpen(true)
  }

  async function copyRoomCode() {
    try {
      await navigator.clipboard.writeText(props.roomCode)
      setHasCopiedRoomCode(true)
      handleOpenChange(false)
    } catch {
      setHasCopiedRoomCode(false)
    }
  }

  async function copyJoinLink() {
    try {
      await navigator.clipboard.writeText(joinUrl.toString())
      setHasCopiedJoinLink(true)
      handleOpenChange(false)
    } catch {
      setHasCopiedJoinLink(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <Button
        aria-label="Afficher le code de la partie"
        className="cartoon-press cartoon-press-sm h-10 rounded-full border-[var(--outline-color)] [--element-color:var(--cyan)] px-4 text-sm font-black text-[var(--text-color)] hover:bg-[#a1e7f0]"
        onClick={openDialog}
        type="button"
        variant="ghost"
      >
        Inviter
      </Button>
      <DialogContent className="gap-2">
        <DialogHeader>
          <DialogTitle className="text-[var(--text-color)]">Code du salon</DialogTitle>
        </DialogHeader>
        <p className="rounded-2xl border-4 border-[var(--outline-color)] bg-[var(--cyan)] px-4 py-3 text-center font-mono text-xl font-black tracking-[0.2em] text-[var(--text-color)]">
          {props.roomCode}
        </p>
        <div className="w-full rounded-2xl border-4 border-[var(--outline-color)] bg-white p-3">
          <QRCodeSVG className="h-auto w-full" bgColor="#ffffff" fgColor="#151515" size={256} value={joinUrl.toString()} />
        </div>
        <Button
          className="cartoon-press h-12 rounded-2xl border-[var(--outline-color)] [--element-color:var(--mint)] font-black text-[var(--text-color)] hover:bg-[#95e7df]"
          onClick={copyRoomCode}
          type="button"
        >
          {hasCopiedRoomCode ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          {hasCopiedRoomCode ? 'Code copié' : 'Copier le code'}
        </Button>
        <Button
          className="cartoon-press h-12 rounded-2xl border-[var(--outline-color)] [--element-color:var(--gold)] font-black text-[var(--text-color)] hover:bg-[#ffc95c]"
          onClick={copyJoinLink}
          type="button"
        >
          {hasCopiedJoinLink ? <Check aria-hidden="true" /> : <Link aria-hidden="true" />}
          {hasCopiedJoinLink ? 'Lien copié' : 'Copier le lien'}
        </Button>
      </DialogContent>
    </Dialog>
  )
}
