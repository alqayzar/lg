// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { prepareRoomProfile } from './room-profile'
import { MAX_AVATAR_BYTES, parsePlayerInfo, parsePlayerList } from './room-protocol'

afterEach(() => { vi.restoreAllMocks() })

describe('wire profile preparation', () => {
  it('converts an avatar exactly once and only includes the validated wire fields', async () => {
    const read = vi.spyOn(FileReader.prototype, 'readAsDataURL')
    const profile = await prepareRoomProfile({ name: ' Alice ', avatar: new Blob(['avatar'], { type: 'image/png' }) })
    expect(profile).toEqual({ name: 'Alice', avatarUrl: 'data:image/png;base64,YXZhdGFy' })
    expect(read).toHaveBeenCalledOnce()
    expect(profile).not.toHaveProperty('avatarDataUrl')
  })

  it('rejects invalid or excessive avatars before conversion', async () => {
    const read = vi.spyOn(FileReader.prototype, 'readAsDataURL')
    await expect(prepareRoomProfile({ name: 'Alice', avatar: new Blob(['bad'], { type: 'text/plain' }) })).rejects.toThrow('invalide')
    const oversized = new Blob([], { type: 'image/png' })
    vi.spyOn(oversized, 'size', 'get').mockReturnValue(MAX_AVATAR_BYTES + 1)
    await expect(prepareRoomProfile({ name: 'Alice', avatar: oversized })).rejects.toThrow('volumineuse')
    expect(read).not.toHaveBeenCalled()
  })

  it('requires a nonblank, bounded name and supports no avatar', async () => {
    await expect(prepareRoomProfile({ name: '  ', avatar: null })).rejects.toThrow('pseudo')
    await expect(prepareRoomProfile({ name: 'x'.repeat(21), avatar: null })).rejects.toThrow('pseudo')
    await expect(prepareRoomProfile(undefined)).rejects.toThrow('pseudo')
    expect(await prepareRoomProfile({ name: ' Alice ', avatar: null })).toEqual({ name: 'Alice', avatarUrl: null })
  })

  it('rejects blob/remote URLs, invalid payloads and duplicate membership', () => {
    expect(parsePlayerInfo({ metadata: { name: 'Alice', avatarUrl: 'blob:local-avatar' } })).toBeNull()
    expect(parsePlayerInfo({ metadata: { name: 'Alice', avatarUrl: 'https://example.com/avatar.png' } })).toBeNull()
    expect(parsePlayerInfo({ metadata: { name: 'Alice', avatarUrl: 'data:image/png;invalid' } })).toBeNull()
    expect(parsePlayerList({ epoch: 'epoch', revision: 1, players: [{ peerId: 'same', isHost: true }, { peerId: 'same', isHost: false }] })).toBeNull()
  })
})
