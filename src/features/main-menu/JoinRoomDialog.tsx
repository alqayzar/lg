import { useEffect, useRef, useState } from 'react'
import { ScanLine } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { isRoomCode, normalizeRoomCode } from '@/features/room/room-code'

interface JoinRoomDialogProps {
  disabled: boolean
  onJoin: (roomCode: string) => Promise<void>
}

export function JoinRoomDialog(props: JoinRoomDialogProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isJoining, setIsJoining] = useState(false)
  const [isScanning, setIsScanning] = useState(false)
  const [joinError, setJoinError] = useState<string | null>(null)
  const [roomCode, setRoomCode] = useState('')
  const [scanError, setScanError] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (!isScanning || !videoRef.current) return
    const video = videoRef.current as HTMLVideoElement

    let isActive = true
    let hasScanned = false
    let stopScanner: (() => void) | undefined

    async function startScanner() {
      try {
        const { BrowserQRCodeReader } = await import('@zxing/browser')
        if (!isActive) return
        const reader = new BrowserQRCodeReader()
        const controls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: 'environment' } } },
          video,
          (result) => {
            if (!result || hasScanned) return

            const scannedRoomCode = getRoomCodeFromQr(result.getText())
            if (!scannedRoomCode) {
              setScanError('Ce QR code ne contient pas de code de partie valide.')
              return
            }

            hasScanned = true
            setRoomCode(scannedRoomCode)
            setIsScanning(false)
          },
        )
        if (!isActive) {
          controls.stop()
          return
        }
        stopScanner = controls.stop.bind(controls)
      } catch {
        if (isActive) setScanError('Impossible d’accéder à la caméra.')
      }
    }

    void startScanner()
    return () => {
      isActive = false
      stopScanner?.()
    }
  }, [isScanning])

  function openDialog() {
    setIsOpen(true)
  }

  function handleOpenChange(nextIsOpen: boolean) {
    setIsOpen(nextIsOpen)
    if (!nextIsOpen) setIsScanning(false)
  }

  async function joinRoom(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isJoining || !isRoomCode(roomCode)) return

    setIsJoining(true)
    setJoinError(null)
    try {
      await props.onJoin(roomCode)
    } catch {
      setJoinError('Impossible de rejoindre la partie. Réessayez dans un instant.')
      setIsJoining(false)
    }
  }

  function updateRoomCode(event: React.ChangeEvent<HTMLInputElement>) {
    setRoomCode(normalizeRoomCode(event.target.value))
  }

  function openScanner() {
    setScanError(null)
    setIsScanning(true)
  }

  function closeScanner() {
    setIsScanning(false)
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <Button
        className="cartoon-press h-12 flex-1 rounded-xl border-2 border-[#08050f] [--element-color:#e6c65d] bg-[var(--element-color)] text-sm font-bold tracking-[0.05em] text-[#16120d] uppercase hover:bg-[#f0d97d]"
        disabled={props.disabled}
        onClick={openDialog}
        size="lg"
        type="button"
      >
        Rejoindre
      </Button>
      <DialogContent className="element-shadow border-2 border-[#08050f] [--element-color:#24212a] [--element-shadow-depth:8px] bg-[var(--element-color)] p-6 text-[#e7e0c8]">
        <DialogHeader>
          <DialogTitle className="text-[#e7e0c8]">{isScanning ? 'Scanner le QR code' : 'Rejoindre une partie'}</DialogTitle>
        </DialogHeader>
        {isScanning ? (
          <div className="space-y-4">
            <video autoPlay className="aspect-square w-full rounded-xl border-2 border-[#08050f] bg-[#16151d] object-cover" muted playsInline ref={videoRef} />
            {scanError && <p className="text-center text-sm font-medium text-[#df6542]" role="alert">{scanError}</p>}
            <Button
              className="cartoon-press h-11 w-full border-2 border-[#08050f] [--element-color:#e6c65d] bg-[var(--element-color)] font-bold text-[#16120d] hover:bg-[#f0d97d]"
              onClick={closeScanner}
              type="button"
            >
              Annuler
            </Button>
          </div>
        ) : (
          <form className="space-y-4" onSubmit={joinRoom}>
            <div className="relative">
              <Input
                aria-label="Code de la partie"
                autoCapitalize="characters"
                autoComplete="off"
                className="h-12 rounded-xl border-2 border-[#08050f] bg-[#16151d] px-4 pr-12 text-center font-mono text-base font-bold tracking-[0.2em] text-[#e7e0c8] placeholder:font-sans placeholder:font-normal placeholder:tracking-normal placeholder:text-[#aaa59a] focus-visible:ring-2 focus-visible:ring-[#e6c65d]"
                maxLength={7}
                onChange={updateRoomCode}
                placeholder="ABC-123"
                spellCheck={false}
                type="text"
                value={roomCode}
              />
              <Button
                aria-label="Scanner un QR code"
                className="element-shadow absolute top-1/2 right-1 size-10 -translate-y-1/2 border-2 border-[#08050f] [--element-color:#73cbd1] [--element-shadow-depth:2px] bg-[var(--element-color)] text-[#16120d] hover:bg-[#98dde0]"
                onClick={openScanner}
                size="icon"
                type="button"
              >
                <ScanLine aria-hidden="true" />
              </Button>
            </div>
            <Button
              className="cartoon-press h-11 w-full border-2 border-[#08050f] [--element-color:#df6542] bg-[var(--element-color)] font-bold tracking-[0.05em] text-[#16120d] uppercase hover:bg-[#ee7e57]"
              disabled={isJoining || !isRoomCode(roomCode)}
              type="submit"
            >
              {isJoining ? 'Connexion...' : 'Rejoindre'}
            </Button>
            {joinError && <p className="text-center text-sm font-medium text-[#df6542]" role="alert">{joinError}</p>}
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

function getRoomCodeFromQr(value: string): string | null {
  try {
    const url = new URL(value, window.location.origin)
    const roomCode = normalizeRoomCode(url.searchParams.get('room') ?? '')
    return isRoomCode(roomCode) ? roomCode : null
  } catch {
    return null
  }
}
