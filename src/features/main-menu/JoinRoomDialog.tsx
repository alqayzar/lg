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
  defaultRoomCode?: string
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
    if (!isOpen && props.defaultRoomCode) setRoomCode(props.defaultRoomCode)
  }, [isOpen, props.defaultRoomCode])

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
        className="cartoon-press h-13 rounded-2xl border-[var(--outline-color)] [--element-color:var(--paper)] text-sm font-black tracking-[0.05em] text-[var(--text-color)] uppercase hover:bg-[#fff8df]"
        disabled={props.disabled}
        onClick={openDialog}
        size="lg"
        type="button"
      >
        Rejoindre
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-[var(--text-color)]">{isScanning ? 'Scanner le QR code' : 'Rejoindre une partie'}</DialogTitle>
        </DialogHeader>
        {isScanning ? (
          <div className="space-y-4">
            <video autoPlay className="aspect-square w-full rounded-2xl border-4 border-[var(--outline-color)] bg-[var(--paper-muted)] object-cover" muted playsInline ref={videoRef} />
            {scanError && <p className="text-center text-sm font-bold text-[#963f34]" role="alert">{scanError}</p>}
            <Button
              className="cartoon-press h-12 w-full rounded-2xl border-[var(--outline-color)] [--element-color:var(--gold)] font-black text-[var(--text-color)] hover:bg-[#ffc95c]"
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
                 className="h-14 rounded-2xl border-4 border-[var(--outline-color)] bg-[var(--paper-muted)] px-4 pr-14 text-center font-mono text-base font-black tracking-[0.2em] text-[var(--text-color)] placeholder:font-sans placeholder:font-semibold placeholder:tracking-normal placeholder:text-[var(--muted-text-color)] focus-visible:ring-4 focus-visible:ring-[var(--cyan)]"
                maxLength={7}
                onChange={updateRoomCode}
                placeholder="ABC-123"
                spellCheck={false}
                type="text"
                value={roomCode}
              />
              <Button
                aria-label="Scanner un QR code"
                 className="absolute top-1/2 right-1.5 size-10 -translate-y-1/2 rounded-xl border-[var(--outline-color)] bg-[var(--cyan)] text-[var(--text-color)] hover:brightness-105"
                onClick={openScanner}
                size="icon"
                type="button"
              >
                <ScanLine aria-hidden="true" />
              </Button>
            </div>
            <Button
              className="cartoon-press h-12 w-full rounded-2xl border-[var(--outline-color)] [--element-color:var(--mint)] font-black tracking-[0.05em] text-[var(--text-color)] uppercase hover:bg-[#95e7df]"
              disabled={isJoining || !isRoomCode(roomCode)}
              type="submit"
            >
              {isJoining ? 'Connexion...' : 'Rejoindre'}
            </Button>
            {joinError && <p className="text-center text-sm font-bold text-[#963f34]" role="alert">{joinError}</p>}
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
