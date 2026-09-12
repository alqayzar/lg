// @vitest-environment jsdom
import { StrictMode } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ProfileEditor } from '@/features/profile/ProfileEditor'

const storage = vi.hoisted(() => ({ loadProfile: vi.fn(), saveProfile: vi.fn(async () => {}) }))
vi.mock('@/lib/profile', () => storage)
afterEach(() => { cleanup(); vi.clearAllMocks() })

it('edits and caches the profile without a network provider or wire announcement', async () => {
  storage.loadProfile.mockResolvedValue({ name: 'Alice', avatar: null })
  const onValidity = vi.fn()
  render(<StrictMode><ProfileEditor onNameValidityChange={onValidity} /></StrictMode>)
  await waitFor(() => expect((screen.getByRole('textbox', { name: 'Pseudo' }) as HTMLInputElement).value).toBe('Alice'))
  fireEvent.change(screen.getByRole('textbox', { name: 'Pseudo' }), { target: { value: 'Bob' } })
  expect(storage.saveProfile).toHaveBeenCalledWith({ name: 'Bob', avatar: null })
  expect(onValidity).toHaveBeenLastCalledWith(true)
  fireEvent.change(screen.getByRole('textbox', { name: 'Pseudo' }), { target: { value: '  ' } })
  expect(onValidity).toHaveBeenLastCalledWith(false)
})
