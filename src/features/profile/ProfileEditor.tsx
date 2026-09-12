import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { Camera, Image } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useProfile } from './use-profile'

interface ProfileEditorProps {
  disabled?: boolean
  onNameValidityChange(isValid: boolean): void
}

export function ProfileEditor(props: ProfileEditorProps) {
  const [isAvatarDialogOpen, setIsAvatarDialogOpen] = useState(false)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const galleryInputRef = useRef<HTMLInputElement>(null)
  const profile = useProfile()
  const hasValidName = profile.isLoaded && profile.name.trim().length > 0

  useEffect(() => {
    props.onNameValidityChange(hasValidName)
  }, [hasValidName, props.onNameValidityChange])

  function handleNameChange(event: ChangeEvent<HTMLInputElement>) {
    profile.updateName(event.target.value)
  }

  function handleAvatarChange(event: ChangeEvent<HTMLInputElement>) {
    const nextAvatar = event.target.files?.[0]

    if (!nextAvatar || !nextAvatar.type.startsWith('image/')) {
      return
    }

    profile.updateAvatar(nextAvatar)
    setIsAvatarDialogOpen(false)
    event.target.value = ''
  }

  function openAvatarDialog() {
    setIsAvatarDialogOpen(true)
  }

  function openCameraPicker() {
    cameraInputRef.current?.click()
  }

  function openGalleryPicker() {
    galleryInputRef.current?.click()
  }

  return (
    <div className="flex w-full flex-col items-center gap-4 rounded-[20px] border border-[#1c1438] bg-[#130e25] px-5 py-6 shadow-[0_4px_24px_rgba(0,0,0,0.55)]">
      <Dialog open={isAvatarDialogOpen} onOpenChange={setIsAvatarDialogOpen}>
        <Button
          aria-label="Choisir une photo de profil"
          className="group relative size-[88px] overflow-hidden rounded-full border-2 border-dashed border-[#2d1f55] bg-[#1a1133] text-[2.2rem] transition-colors hover:border-solid hover:border-[#7c4dff]"
          disabled={props.disabled}
          onClick={openAvatarDialog}
          size="icon"
          type="button"
          variant="ghost"
        >
          {profile.avatarUrl ? (
            <img alt="Photo de profil" className="size-full object-cover" src={profile.avatarUrl} />
          ) : (
            <span aria-hidden="true">👤</span>
          )}
          <span className="absolute inset-0 grid place-items-center bg-black/55 text-xl opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
            <Camera aria-hidden="true" className="size-6" />
          </span>
        </Button>

        <DialogContent className="border-2 border-[#2d1f55] bg-[#11102b] p-6 text-[#f0e6ff] shadow-[0_0_28px_rgba(124,77,255,0.35)]">
          <DialogHeader>
            <DialogTitle className="text-[#f0e6ff]">Photo de profil</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <Button className="h-11 border-2 border-[#2d1f55] text-[#a08ab8] hover:border-[#7c4dff] hover:bg-transparent hover:text-[#f0e6ff]" onClick={openCameraPicker} type="button" variant="ghost">
              <Camera aria-hidden="true" /> Prendre une photo
            </Button>
            <Button className="h-11 border-2 border-[#2d1f55] text-[#a08ab8] hover:border-[#7c4dff] hover:bg-transparent hover:text-[#f0e6ff]" onClick={openGalleryPicker} type="button" variant="ghost">
              <Image aria-hidden="true" /> Choisir dans la galerie
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <input
        accept="image/*"
        capture="environment"
        className="sr-only"
        disabled={props.disabled}
        onChange={handleAvatarChange}
        ref={cameraInputRef}
        type="file"
      />
      <input
        accept="image/*"
        className="sr-only"
        disabled={props.disabled}
        onChange={handleAvatarChange}
        ref={galleryInputRef}
        type="file"
      />

      <Input
        aria-label="Pseudo"
        autoComplete="off"
        className="h-12 rounded-xl border-2 border-[#2d1f55] bg-[#1c1535] px-4 text-base text-[#f0e6ff] placeholder:text-[#4a3d6b] focus-visible:border-[#7c4dff] focus-visible:ring-[3px] focus-visible:ring-[#7c4dff]/20"
        disabled={props.disabled}
        maxLength={20}
        onChange={handleNameChange}
        placeholder="Ton pseudo..."
        required
        spellCheck={false}
        type="text"
        value={profile.name}
      />
    </div>
  )
}
