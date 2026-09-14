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
  const joinUrl = new URL('/join', window.location.origin)
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
        className="cartoon-press cartoon-press-sm h-9 border-2 border-[#08050f] [--element-color:#73cbd1] bg-[var(--element-color)] px-3 font-mono text-sm font-bold tracking-[0.2em] text-[#16120d] hover:bg-[#98dde0]"
        onClick={openDialog}
        type="button"
        variant="ghost"
      >
        {props.roomCode}
      </Button>
      <DialogContent className="element-shadow border-2 border-[#08050f] [--element-color:#24212a] [--element-shadow-depth:8px] bg-[var(--element-color)] p-6 text-[#e7e0c8]">
        <DialogHeader>
          <DialogTitle className="text-[#e7e0c8] uppercase">Room Code</DialogTitle>
        </DialogHeader>
        <p className="rounded-xl border-2 border-[#08050f] bg-[#16151d] px-4 py-3 text-center font-mono text-xl font-bold tracking-[0.2em] text-[#73cbd1]">
          {props.roomCode}
        </p>
        <div className="element-shadow w-full rounded-xl border-2 border-[#08050f] [--element-color:#e7e0c8] [--element-shadow-depth:4px] bg-[var(--element-color)] p-3">
          <QRCodeSVG className="h-auto w-full" bgColor="#e7e0c8" fgColor="#16120d" size={256} value={joinUrl.toString()} />
        </div>
        <Button
          className="cartoon-press h-11 border-2 border-[#08050f] [--element-color:#73cbd1] bg-[var(--element-color)] font-bold tracking-[0.05em] text-[#16120d] uppercase hover:bg-[#98dde0]"
          onClick={copyRoomCode}
          type="button"
        >
          {hasCopiedRoomCode ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          {hasCopiedRoomCode ? 'Code copié' : 'Copier le code'}
        </Button>
        <Button
          className="cartoon-press h-11 border-2 border-[#08050f] [--element-color:#e6c65d] bg-[var(--element-color)] font-bold tracking-[0.05em] text-[#16120d] uppercase hover:bg-[#f0d97d]"
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
