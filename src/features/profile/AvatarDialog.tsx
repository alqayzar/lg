import { lazy, Suspense, useRef, useState, type ChangeEvent } from 'react'
import { Camera, Image, Smile, Trash2 } from 'lucide-react'
import type { EmojiClickData, EmojiStyle, Theme } from 'emoji-picker-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { compressAvatarImage } from '@/lib/avatar-image'
import { createEmojiImage } from '@/lib/emoji-image'
import type { ProfileAvatar } from '@/lib/profile'

interface AvatarDialogProps {
  avatar: ProfileAvatar
  onAvatarChange: (avatar: Blob) => void
  onAvatarRemove: () => void
  onOpenChange: (open: boolean) => void
  open: boolean
}

const EmojiPicker = lazy(() => import('emoji-picker-react'))

export function AvatarDialog(props: AvatarDialogProps) {
  const [avatarError, setAvatarError] = useState<string | null>(null)
  const [isCompressingAvatar, setIsCompressingAvatar] = useState(false)
  const [isEmojiDialogOpen, setIsEmojiDialogOpen] = useState(false)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const galleryInputRef = useRef<HTMLInputElement>(null)

  async function handleAvatarChange(event: ChangeEvent<HTMLInputElement>) {
    const nextAvatar = event.target.files?.[0]
    if (!nextAvatar || !nextAvatar.type.startsWith('image/')) return

    setIsCompressingAvatar(true)
    setAvatarError(null)
    try {
      props.onAvatarChange(await compressAvatarImage(nextAvatar))
      props.onOpenChange(false)
    } catch {
      setAvatarError('Impossible de compresser cette image. Réessayez avec une autre photo.')
    } finally {
      setIsCompressingAvatar(false)
      event.target.value = ''
    }
  }

  function handleOpenChange(open: boolean) {
    if (!open) setIsEmojiDialogOpen(false)
    props.onOpenChange(open)
  }

  function openCameraPicker() {
    cameraInputRef.current?.click()
  }

  function openEmojiPicker() {
    setIsEmojiDialogOpen(true)
  }

  function openGalleryPicker() {
    galleryInputRef.current?.click()
  }

  function removeAvatar() {
    props.onAvatarRemove()
    props.onOpenChange(false)
  }

  async function selectEmoji(emoji: EmojiClickData) {
    try {
      setIsCompressingAvatar(true)
      setAvatarError(null)
      props.onAvatarChange(await createEmojiImage(emoji.emoji))
      setIsEmojiDialogOpen(false)
      props.onOpenChange(false)
    } catch {
      setAvatarError('Impossible de créer cette image emoji. Réessayez avec un autre emoji.')
    } finally {
      setIsCompressingAvatar(false)
    }
  }

  return (
    <Dialog open={props.open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-[var(--text-color)]">Photo de profil</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <Button className="cartoon-press cartoon-press-sm h-12 rounded-2xl border-[var(--outline-color)] [--element-color:var(--paper-muted)] font-bold text-[var(--text-color)] hover:bg-white" disabled={isCompressingAvatar} onClick={openCameraPicker} type="button" variant="ghost">
            <Camera aria-hidden="true" /> {isCompressingAvatar ? 'Compression...' : 'Prendre une photo'}
          </Button>
          <Button className="cartoon-press cartoon-press-sm h-12 rounded-2xl border-[var(--outline-color)] [--element-color:var(--paper-muted)] font-bold text-[var(--text-color)] hover:bg-white" disabled={isCompressingAvatar} onClick={openGalleryPicker} type="button" variant="ghost">
            <Image aria-hidden="true" /> {isCompressingAvatar ? 'Compression...' : 'Choisir dans la galerie'}
          </Button>
        <Button className="cartoon-press h-12 rounded-2xl border-[var(--outline-color)] [--element-color:var(--gold)] font-black text-[var(--text-color)] hover:bg-[#ffc95c]" disabled={isCompressingAvatar} onClick={openEmojiPicker} type="button">
            <Smile aria-hidden="true" /> Utiliser un emoji
          </Button>
          {props.avatar && (
            <Button className="cartoon-press h-12 rounded-2xl border-[var(--outline-color)] [--element-color:var(--coral)] font-black text-[var(--text-color)] hover:bg-[#ff7885]" disabled={isCompressingAvatar} onClick={removeAvatar} type="button">
              <Trash2 aria-hidden="true" /> Supprimer l'image
            </Button>
          )}
          {avatarError && <p className="text-center text-sm font-bold text-[#963f34]" role="alert">{avatarError}</p>}
        </div>
      </DialogContent>

      <Dialog open={isEmojiDialogOpen} onOpenChange={setIsEmojiDialogOpen}>
        <DialogContent className="!flex h-[calc(100dvh-2rem)] max-h-[calc(100dvh-2rem)] flex-col sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[var(--text-color)]">Choisir un emoji</DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-hidden rounded-2xl border-4 border-[var(--outline-color)]">
            <Suspense fallback={<div className="grid size-full place-items-center bg-[var(--paper-muted)] text-sm font-bold text-[var(--muted-text-color)]">Chargement des emojis...</div>}>
              <EmojiPicker emojiStyle={'native' as EmojiStyle} height="100%" onEmojiClick={selectEmoji} theme={'light' as Theme} width="100%" />
            </Suspense>
          </div>
        </DialogContent>
      </Dialog>

      <input accept="image/*" capture="environment" className="sr-only" onChange={handleAvatarChange} ref={cameraInputRef} type="file" />
      <input accept="image/*" className="sr-only" onChange={handleAvatarChange} ref={galleryInputRef} type="file" />
    </Dialog>
  )
}
