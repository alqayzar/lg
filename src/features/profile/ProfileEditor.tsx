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
    <div className="element-shadow flex w-full flex-col items-center gap-5 rounded-3xl border-4 border-[var(--outline-color)] [--element-color:var(--paper)] [--element-shadow-depth:7px] px-5 py-6">
      <Button
        aria-label="Choisir une photo de profil"
        className="profile-avatar-button cartoon-press cartoon-press-sm group relative size-24 overflow-hidden border-[var(--outline-color)] [--element-color:var(--cyan)] text-[2.2rem]"
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
        <span className="absolute inset-0 grid place-items-center bg-[var(--outline-color)]/65 text-xl text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
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
        className="h-13 rounded-2xl border-4 border-[var(--outline-color)] bg-[var(--paper-muted)] px-4 text-center text-base font-bold text-[var(--text-color)] placeholder:text-[var(--muted-text-color)] focus-visible:ring-4 focus-visible:ring-[var(--cyan)]"
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
