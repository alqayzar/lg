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
      <DialogContent className="element-shadow border-2 border-[#08050f] [--element-color:#24212a] [--element-shadow-depth:8px] bg-[var(--element-color)] p-6 text-[#e7e0c8]">
        <DialogHeader>
          <DialogTitle className="text-[#e7e0c8]">Photo de profil</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <Button className="uppercase cartoon-press cartoon-press-sm h-11 border-2 border-[#08050f] [--element-color:#16151d] bg-[var(--element-color)] text-[#e7e0c8] hover:bg-[#37323a]" disabled={isCompressingAvatar} onClick={openCameraPicker} type="button" variant="ghost">
            <Camera aria-hidden="true" /> {isCompressingAvatar ? 'Compression...' : 'Prendre une photo'}
          </Button>
          <Button className="uppercase cartoon-press cartoon-press-sm h-11 border-2 border-[#08050f] [--element-color:#16151d] bg-[var(--element-color)] text-[#e7e0c8] hover:bg-[#37323a]" disabled={isCompressingAvatar} onClick={openGalleryPicker} type="button" variant="ghost">
            <Image aria-hidden="true" /> {isCompressingAvatar ? 'Compression...' : 'Choisir dans la galerie'}
          </Button>
        <Button className="uppercase cartoon-press h-11 border-2 border-[#08050f] [--element-color:#e6c65d] bg-[var(--element-color)] font-bold text-[#16120d] hover:bg-[#f0d97d]" disabled={isCompressingAvatar} onClick={openEmojiPicker} type="button">
            <Smile aria-hidden="true" /> Utiliser un emoji
          </Button>
          {props.avatar && (
            <Button className="uppercase cartoon-press h-11 border-2 border-[#08050f] [--element-color:#c95045] bg-[var(--element-color)] font-bold text-[#16120d] hover:bg-[#df675c]" disabled={isCompressingAvatar} onClick={removeAvatar} type="button">
              <Trash2 aria-hidden="true" /> Supprimer l'image
            </Button>
          )}
          {avatarError && <p className="text-center text-sm font-medium text-[#df6542]" role="alert">{avatarError}</p>}
        </div>
      </DialogContent>

      <Dialog open={isEmojiDialogOpen} onOpenChange={setIsEmojiDialogOpen}>
        <DialogContent className="!flex h-[calc(100dvh-2rem)] max-h-[calc(100dvh-2rem)] flex-col bg-[#24212a] p-6 text-[#e7e0c8] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[#e7e0c8]">Choisir un emoji</DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-hidden rounded-xl border-2 border-[#08050f]">
            <Suspense fallback={<div className="grid size-full place-items-center bg-[#16151d] text-sm font-bold text-[#aaa59a]">Chargement des emojis...</div>}>
              <EmojiPicker emojiStyle={'native' as EmojiStyle} height="100%" onEmojiClick={selectEmoji} theme={'dark' as Theme} width="100%" />
            </Suspense>
          </div>
        </DialogContent>
      </Dialog>

      <input accept="image/*" capture="environment" className="sr-only" onChange={handleAvatarChange} ref={cameraInputRef} type="file" />
      <input accept="image/*" className="sr-only" onChange={handleAvatarChange} ref={galleryInputRef} type="file" />
    </Dialog>
  )
}
