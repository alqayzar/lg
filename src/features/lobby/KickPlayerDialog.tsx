import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { LobbyPlayer } from './PlayerGrid'

interface KickPlayerDialogProps {
  onKick: (playerId: string) => Promise<void>
  onOpenChange: (isOpen: boolean) => void
  player: LobbyPlayer | null
}

export function KickPlayerDialog(props: KickPlayerDialogProps) {
  const [isKicking, setIsKicking] = useState(false)

  async function kickPlayer() {
    if (!props.player || isKicking) return
    setIsKicking(true)
    try {
      await props.onKick(props.player.id)
      props.onOpenChange(false)
    } finally {
      setIsKicking(false)
    }
  }

  return (
    <Dialog open={props.player !== null} onOpenChange={props.onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-[var(--text-color)]">{props.player?.name}</DialogTitle>
        </DialogHeader>
        <Button
          className="cartoon-press h-12 rounded-2xl border-[var(--outline-color)] [--element-color:var(--coral)] font-black text-[var(--text-color)] hover:bg-[#ff7885]"
          disabled={isKicking}
          onClick={kickPlayer}
          type="button"
        >
          {isKicking ? 'Expulsion...' : 'Expulser'}
        </Button>
      </DialogContent>
    </Dialog>
  )
}
