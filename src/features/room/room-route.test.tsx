// @vitest-environment jsdom
import { StrictMode } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Play } from '@/features/play/Play'
import { MainMenu } from '@/features/main-menu/MainMenu'
import type { Profile } from '@/lib/profile'
import type { RoomEntry } from './room-session'
import { ROOM_MESSAGE } from './room-protocol'
import { FakeRoomClient, deferred } from './room-test-client'

const mocks = vi.hoisted(() => ({
  client: null as unknown as FakeRoomClient,
  loadProfile: vi.fn(),
  saveProfile: vi.fn(),
  resolveRoomEntry: vi.fn(),
  saveRoomSession: vi.fn(),
  clearRoomSession: vi.fn(),
  updateRoomSessionPeers: vi.fn(),
  isCurrentHostSession: vi.fn(),
  releaseHost: vi.fn(),
}))

vi.mock('@/features/network/NetworkProvider', () => ({ useNetwork: () => ({ client: mocks.client }) }))
vi.mock('@/lib/profile', () => ({ loadProfile: mocks.loadProfile, saveProfile: mocks.saveProfile }))
vi.mock('./room-session', () => ({
  resolveRoomEntry: mocks.resolveRoomEntry,
  saveRoomSession: mocks.saveRoomSession,
  clearRoomSession: mocks.clearRoomSession,
  updateRoomSessionPeers: mocks.updateRoomSessionPeers,
  claimHostRoom: async () => mocks.releaseHost,
  isCurrentHostSession: mocks.isCurrentHostSession,
}))
vi.mock('@/features/profile/ProfileEditor', () => ({
  ProfileEditor: (props: { onNameValidityChange(valid: boolean): void; disabled?: boolean }) => (
    <button disabled={props.disabled} onClick={() => props.onNameValidityChange(true)}>Valid profile</button>
  ),
}))

function guest(roomCode = 'ABC-234'): RoomEntry {
  return { role: 'guest', hostPeerId: `lg-${roomCode}`, roomCode }
}
function host(): RoomEntry {
  return {
    role: 'host', hostPeerId: 'lg-ABC-234', roomCode: 'ABC-234',
    session: { role: 'host', roomCode: 'ABC-234', peerId: 'lg-ABC-234', connectedPeerIds: ['saved-zombie'], sessionKey: 'saved' },
  }
}

function Navigation() {
  const navigate = useNavigate()
  return <>
    <button onClick={() => navigate(-1)}>Back</button>
    <button onClick={() => navigate('/play?room=DEF-567')}>Other room</button>
    <button onClick={() => navigate('/elsewhere')}>Elsewhere</button>
  </>
}

function renderRoutes(entry = '/play?room=ABC-234', mainMenu = false) {
  return render(
    <StrictMode>
      <MemoryRouter initialEntries={entry === '/' ? ['/'] : ['/', entry]}>
        <Navigation />
        <Routes>
          <Route path="/" element={mainMenu ? <MainMenu /> : <h1>Menu</h1>} />
          <Route path="/play" element={<Play />} />
          <Route path="/elsewhere" element={<h1>Elsewhere page</h1>} />
        </Routes>
      </MemoryRouter>
    </StrictMode>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.client = new FakeRoomClient()
  mocks.loadProfile.mockReset().mockResolvedValue({ name: ' Alice ', avatar: null })
  mocks.saveProfile.mockReset().mockResolvedValue(undefined)
  mocks.resolveRoomEntry.mockReset().mockImplementation(async (room: string | null) => room === null ? host() : guest(room))
  mocks.saveRoomSession.mockReset().mockResolvedValue(undefined)
  mocks.clearRoomSession.mockReset().mockResolvedValue(undefined)
  mocks.updateRoomSessionPeers.mockReset().mockResolvedValue(undefined)
  mocks.isCurrentHostSession.mockReset().mockResolvedValue(true)
})
afterEach(() => { cleanup(); vi.useRealTimers() })

describe('room route ownership', () => {
  it('starts once under StrictMode and Back terminates the transport and subscription', async () => {
    renderRoutes()
    await waitFor(() => expect(mocks.client.joinHost).toHaveBeenCalledOnce())
    expect(mocks.client.joinHost).toHaveBeenCalledWith('lg-ABC-234')
    act(() => { mocks.client.open('lg-ABC-234') })
    expect(mocks.client.listeners.size).toBe(1)
    act(() => { mocks.client.emit({ type: 'connections-change' }); mocks.client.emit({ type: 'status', status: 'connected' }) })
    expect(mocks.client.joinHost).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.getByRole('heading', { name: 'Menu' })).toBeTruthy()
    expect(mocks.client.getSnapshot().status).toBe('closed')
    expect(mocks.client.listeners.size).toBe(0)
    expect(mocks.clearRoomSession).not.toHaveBeenCalled()
    expect(mocks.saveRoomSession).not.toHaveBeenCalled()
    expect(mocks.updateRoomSessionPeers).not.toHaveBeenCalled()
  })

  it('does not let obsolete session loads overwrite a new URL or restart its client', async () => {
    const obsolete = deferred<RoomEntry>()
    mocks.resolveRoomEntry.mockImplementation((room: string) => room === 'ABC-234' ? obsolete.promise : Promise.resolve(guest(room)))
    renderRoutes()
    expect(screen.getByRole('status').textContent).toContain('Chargement')
    fireEvent.click(screen.getByRole('button', { name: 'Other room' }))
    await waitFor(() => expect(mocks.client.joinHost).toHaveBeenCalledWith('lg-DEF-567'))
    const sessionId = mocks.client.getSnapshot().sessionId
    await act(async () => { obsolete.resolve(host()) })
    expect(mocks.client.joinHost).toHaveBeenCalledOnce()
    expect(mocks.client.resumeHost).not.toHaveBeenCalled()
    expect(mocks.client.getSnapshot().sessionId).toBe(sessionId)
    expect(screen.getByRole('button', { name: 'Afficher le code de la partie' }).textContent).toBe('DEF-567')
  })

  it('cancels profile loading on unmount before any transport start', async () => {
    const profile = deferred<Profile>()
    mocks.loadProfile.mockReturnValue(profile.promise)
    const view = renderRoutes()
    view.unmount()
    await act(async () => { profile.resolve({ name: 'Late', avatar: null }) })
    expect(mocks.client.joinHost).not.toHaveBeenCalled()
    expect(mocks.client.resumeHost).not.toHaveBeenCalled()
    expect(mocks.client.setLocalMetadata).not.toHaveBeenCalled()
  })

  it('quitting during profile loading clears the resolved host session and never starts it later', async () => {
    const profile = deferred<Profile>()
    mocks.loadProfile.mockReturnValue(profile.promise)
    mocks.clearRoomSession.mockImplementation(async () => { expect(mocks.client.getSnapshot().status).toBe('closed') })
    renderRoutes('/play')
    fireEvent.click(screen.getByRole('button', { name: 'Quitter' }))
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Menu' })).toBeTruthy())
    expect(mocks.clearRoomSession).toHaveBeenCalledExactlyOnceWith('saved')
    await act(async () => { profile.resolve({ name: 'Late', avatar: null }) })
    expect(mocks.client.resumeHost).not.toHaveBeenCalled()
  })

  it('quitting a guest while loading never clears a saved host room', async () => {
    const profile = deferred<Profile>()
    mocks.loadProfile.mockReturnValue(profile.promise)
    renderRoutes()
    fireEvent.click(screen.getByRole('button', { name: 'Quitter' }))
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Menu' })).toBeTruthy())
    await act(async () => { profile.resolve({ name: 'Late', avatar: null }) })
    expect(mocks.clearRoomSession).not.toHaveBeenCalled()
    expect(mocks.client.joinHost).not.toHaveBeenCalled()
  })

  it('does not overwrite a transport session that changed during profile loading', async () => {
    const profile = deferred<Profile>()
    mocks.loadProfile.mockReturnValue(profile.promise)
    renderRoutes()
    mocks.client.resumeHost('new-session')
    const sessionId = mocks.client.getSnapshot().sessionId
    await act(async () => { profile.resolve({ name: 'Late', avatar: null }) })
    expect(screen.getByRole('alert').textContent).toContain('session')
    expect(mocks.client.getSnapshot().sessionId).toBe(sessionId)
    expect(mocks.client.joinHost).not.toHaveBeenCalled()
  })

  it('does not restore a host room that was cleared while entry was loading', async () => {
    mocks.isCurrentHostSession.mockResolvedValue(false)
    renderRoutes('/play')
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('fermee'))
    expect(mocks.client.resumeHost).not.toHaveBeenCalled()
    expect(mocks.updateRoomSessionPeers).not.toHaveBeenCalled()
  })

  it('restores only live host players and does not close the room on ordinary unmount', async () => {
    renderRoutes('/play')
    await waitFor(() => expect(mocks.client.resumeHost).toHaveBeenCalledOnce())
    expect(screen.getByText('Alice')).toBeTruthy()
    expect(screen.queryByText('saved-zombie')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(mocks.client.getSnapshot().status).toBe('closed')
    expect(mocks.client.sent.some((message) => message.type === ROOM_MESSAGE.roomClose)).toBe(false)
    expect(mocks.clearRoomSession).not.toHaveBeenCalled()
    expect(mocks.releaseHost).toHaveBeenCalledOnce()
  })

  it('closes the guest client before navigating after a matching quit ACK', async () => {
    renderRoutes()
    await waitFor(() => expect(mocks.client.joinHost).toHaveBeenCalledOnce())
    act(() => { mocks.client.open('lg-ABC-234') })
    fireEvent.click(screen.getByRole('button', { name: 'Quitter' }))
    expect((screen.getByRole('button', { name: 'Fermeture...' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.queryByRole('heading', { name: 'Menu' })).toBeNull()
    const request = mocks.client.sent.find((message) => message.type === ROOM_MESSAGE.playerLeave)!.payload
    await act(async () => { mocks.client.receive('lg-ABC-234', ROOM_MESSAGE.playerLeft, request) })
    expect(screen.getByRole('heading', { name: 'Menu' })).toBeTruthy()
    expect(mocks.client.getSnapshot().status).toBe('closed')
    expect(mocks.client.listeners.size).toBe(0)
  })

  it('shows load errors without starting or silently falling back to another room', async () => {
    mocks.resolveRoomEntry.mockRejectedValue(new Error('Invalid room'))
    renderRoutes('/play?room=bad')
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Invalid room'))
    expect(mocks.client.joinHost).not.toHaveBeenCalled()
    expect(mocks.client.resumeHost).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Quitter' }))
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Menu' })).toBeTruthy())
  })
})

describe('single-flight menu entry', () => {
  it('reserves once, saves a trimmed profile and hands transport ownership to the room', async () => {
    mocks.saveRoomSession.mockImplementation(async (session) => {
      mocks.resolveRoomEntry.mockResolvedValue({ role: 'host', hostPeerId: session.peerId, roomCode: session.roomCode, session })
    })
    renderRoutes('/', true)
    fireEvent.click(screen.getByRole('button', { name: 'Valid profile' }))
    const create = screen.getByRole('button', { name: 'Créer' })
    act(() => { create.click(); create.click() })
    await waitFor(() => expect(mocks.saveRoomSession).toHaveBeenCalledOnce())
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Valid profile' })).toBeNull())
    expect(mocks.client.startHost).toHaveBeenCalledOnce()
    expect(mocks.saveProfile).toHaveBeenCalledWith({ name: 'Alice', avatar: null })
    expect(mocks.clearRoomSession).not.toHaveBeenCalled()
  })

  it('cancels a delayed profile load when leaving the menu', async () => {
    const profile = deferred<Profile>()
    mocks.loadProfile.mockReturnValue(profile.promise)
    renderRoutes('/', true)
    fireEvent.click(screen.getByRole('button', { name: 'Valid profile' }))
    fireEvent.click(screen.getByRole('button', { name: 'Créer' }))
    expect((screen.getByRole('button', { name: 'Rejoindre' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Elsewhere' }))
    await act(async () => { profile.resolve({ name: 'Late', avatar: null }) })
    expect(screen.getByRole('heading', { name: 'Elsewhere page' })).toBeTruthy()
    expect(mocks.client.startHost).not.toHaveBeenCalled()
    expect(mocks.saveProfile).not.toHaveBeenCalled()
    expect(mocks.saveRoomSession).not.toHaveBeenCalled()
  })

  it('does not retry an obsolete reservation or close a newer transport from its finally block', async () => {
    const reservation = deferred<string>()
    mocks.client.startHost.mockImplementationOnce((peerId) => {
      mocks.client.resumeHost(peerId)
      return reservation.promise
    })
    renderRoutes('/', true)
    fireEvent.click(screen.getByRole('button', { name: 'Valid profile' }))
    fireEvent.click(screen.getByRole('button', { name: 'Créer' }))
    await waitFor(() => expect(mocks.client.startHost).toHaveBeenCalledOnce())
    fireEvent.click(screen.getByRole('button', { name: 'Elsewhere' }))
    mocks.client.resumeHost('new-session')
    const sessionId = mocks.client.getSnapshot().sessionId
    await act(async () => { reservation.reject(new Error('Late reservation failure')) })
    expect(mocks.client.getSnapshot().sessionId).toBe(sessionId)
    expect(mocks.client.getSnapshot().localPeerId).toBe('new-session')
    expect(mocks.client.startHost).toHaveBeenCalledOnce()
    expect(mocks.saveRoomSession).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: 'Elsewhere page' })).toBeTruthy()
  })

  it('clears a canceled creation even when its storage write finishes after unmount', async () => {
    const saving = deferred<void>()
    mocks.saveRoomSession.mockReturnValue(saving.promise)
    renderRoutes('/', true)
    fireEvent.click(screen.getByRole('button', { name: 'Valid profile' }))
    fireEvent.click(screen.getByRole('button', { name: 'Créer' }))
    await waitFor(() => expect(mocks.saveRoomSession).toHaveBeenCalledOnce())
    const [session, isCurrent] = mocks.saveRoomSession.mock.calls[0]
    fireEvent.click(screen.getByRole('button', { name: 'Elsewhere' }))
    expect(isCurrent()).toBe(false)
    await act(async () => { saving.resolve() })
    expect(mocks.clearRoomSession).toHaveBeenCalledWith(session.sessionKey)
    expect(mocks.client.getSnapshot().status).toBe('closed')
    expect(screen.getByRole('heading', { name: 'Elsewhere page' })).toBeTruthy()
  })

  it('joins in a single flight and never persists guest room state', async () => {
    const saving = deferred<void>()
    mocks.saveProfile.mockReturnValue(saving.promise)
    renderRoutes('/', true)
    fireEvent.click(screen.getByRole('button', { name: 'Valid profile' }))
    fireEvent.click(screen.getByRole('button', { name: 'Rejoindre' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Code de la partie' }), { target: { value: 'DEF-567' } })
    const join = screen.getAllByRole('button', { name: 'Rejoindre' }).at(-1)!
    act(() => { join.click(); join.click() })
    await waitFor(() => expect(mocks.saveProfile).toHaveBeenCalledOnce())
    expect((screen.getByRole('button', { name: 'Preparation...' }) as HTMLButtonElement).disabled).toBe(true)
    await act(async () => { saving.resolve() })
    await waitFor(() => expect(mocks.client.joinHost).toHaveBeenCalledWith('lg-DEF-567'))
    expect(mocks.client.startHost).not.toHaveBeenCalled()
    expect(mocks.saveRoomSession).not.toHaveBeenCalled()
    expect(mocks.updateRoomSessionPeers).not.toHaveBeenCalled()
    expect(mocks.clearRoomSession).not.toHaveBeenCalled()
  })

  it('shows join failures inside the still-open dialog', async () => {
    mocks.saveProfile.mockRejectedValue(new Error('Profile save failed'))
    renderRoutes('/', true)
    fireEvent.click(screen.getByRole('button', { name: 'Valid profile' }))
    fireEvent.click(screen.getByRole('button', { name: 'Rejoindre' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Code de la partie' }), { target: { value: 'DEF-567' } })
    fireEvent.click(screen.getAllByRole('button', { name: 'Rejoindre' }).at(-1)!)
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Profile save failed'))
    expect(mocks.client.joinHost).not.toHaveBeenCalled()
  })

  it('rejects a blank persisted profile rather than registering a fallback name', async () => {
    mocks.loadProfile.mockResolvedValue({ name: '   ', avatar: null })
    renderRoutes('/', true)
    fireEvent.click(screen.getByRole('button', { name: 'Valid profile' }))
    fireEvent.click(screen.getByRole('button', { name: 'Créer' }))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('pseudo'))
    expect(mocks.saveProfile).not.toHaveBeenCalled()
    expect(mocks.client.startHost).not.toHaveBeenCalled()
  })
})
