import { useEffect, useState, type ChangeEvent } from 'react'
import { Camera } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AvatarDialog } from './AvatarDialog'
import { useProfile } from './use-profile'

interface ProfileEditorProps {
  onNameValidityChange(isValid: boolean): void
}

export function ProfileEditor(props: ProfileEditorProps) {
  const [isAvatarDialogOpen, setIsAvatarDialogOpen] = useState(false)
  const profile = useProfile()
  const hasValidName = profile.name.trim().length > 0

  useEffect(() => {
    props.onNameValidityChange(hasValidName)
  }, [hasValidName, props.onNameValidityChange])

  function handleNameChange(event: ChangeEvent<HTMLInputElement>) {
    profile.updateName(event.target.value)
  }

  function openAvatarDialog() {
    setIsAvatarDialogOpen(true)
  }

  return (
    <div className="element-shadow flex w-full flex-col items-center gap-4 rounded-2xl border-2 border-[#08050f] [--element-color:#24212a] [--element-shadow-depth:8px] bg-[var(--element-color)] px-5 py-6">
      <Button
        aria-label="Choisir une photo de profil"
        className="cartoon-press cartoon-press-sm group relative size-[88px] overflow-hidden rounded-full border-2 border-[#08050f] [--element-color:#1d1a20] bg-[var(--element-color)] text-[2.2rem] hover:-translate-y-0.5"
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

      <AvatarDialog
        avatar={profile.avatar}
        onAvatarChange={profile.updateAvatar}
        onAvatarRemove={profile.removeAvatar}
        onOpenChange={setIsAvatarDialogOpen}
        open={isAvatarDialogOpen}
      />

      <Input
        aria-label="Pseudo"
        autoComplete="off"
        className="h-12 rounded-xl border-2 border-[#08050f] bg-[#16151d] px-4 text-base text-[#e7e0c8] placeholder:text-[#aaa59a] focus-visible:ring-2 focus-visible:ring-[#e6c65d]"
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
