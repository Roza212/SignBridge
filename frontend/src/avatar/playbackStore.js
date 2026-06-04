import { create } from 'zustand';

/**
 * Global bridge to the avatar animator.
 * Avatar registers its API on mount; useTranslator calls sign/stop/lowerArm/setSpeed.
 */
export const useAvatarPlaybackStore = create((set, get) => ({
  api:      null,
  setApi:   (api) => set({ api }),
  sign:     (word) => get().api?.sign?.(word)     ?? Promise.resolve(false),
  stop:     ()     => get().api?.stop?.(),
  lowerArm: ()     => get().api?.lowerArm?.()    ?? Promise.resolve(true),
  setSpeed: (s)    => get().api?.setSpeed?.(s),
}));
