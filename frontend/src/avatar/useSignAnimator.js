import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { defaultPose } from '../lib/signLanguage/animations/defaultPose';
import * as alphabets from '../lib/signLanguage/animations/alphabets';
import * as words from '../lib/signLanguage/animations/words';

// Base nudge speed in radians per frame at 60 fps. Multiplied by the user's
// speed slider and scaled by delta time so playback is frame-rate independent.
const BASE_SPEED   = 0.10;
const TARGET_FPS   = 60;
const DEFAULT_PAUSE_MS = 350;

// Bone-name lookup that tolerates the common Mixamo aliases ("mixamorig:Hips"
// vs "mixamorigHips", numeric suffixes like "RightArm_03"). The synapZ-AI
// signs all use the bare "mixamorigRightArm"-style spelling, so we normalise.
const buildBoneIndex = (scene) => {
  const byName = {};
  scene?.traverse?.((node) => {
    if (!node?.isBone || !node.name) return;
    const raw = node.name;
    byName[raw] = node;
    const bare    = raw.replace(/_\d+$/, '');
    const noColon = bare.replace('mixamorig:', 'mixamorig');
    byName[bare]    = byName[bare]    || node;
    byName[noColon] = byName[noColon] || node;
    if (!noColon.startsWith('mixamorig')) {
      byName['mixamorig' + noColon] = byName['mixamorig' + noColon] || node;
    }
  });
  return byName;
};

export function useSignAnimator(scene) {
  // Single mutable controller object — kept in a ref so React renders don't
  // recreate it. The queue-based animation engine mutates this in place.
  const ctrl = useRef({
    pending:        false,
    paused:         false,
    pauseUntil:     0,
    animations:     [],   // FIFO of frames; see _step()
    characters:     [],   // legacy hook expected by some sign functions
    bones:          {},   // name → Three.Bone
    avatar:         null, // scene root (so signs can use getObjectByName)
    speedScale:     1,    // multiplied by BASE_SPEED
    animate:        () => {},
  });

  // ── Bone discovery ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!scene) return;
    ctrl.current.avatar = scene;
    ctrl.current.bones  = buildBoneIndex(scene);

    // Drop any in-flight animation when the model swaps
    ctrl.current.animations.length = 0;
    ctrl.current.pending = false;

    // Diagnostic — confirms which rig actually loaded
    const allBoneNames = Object.keys(ctrl.current.bones);
    const mixamoCount  = allBoneNames.filter((n) => n.startsWith('mixamorig')).length;
    const probe = ['mixamorigRightArm', 'mixamorigLeftForeArm', 'mixamorigRightHandIndex1'];
    const probeHits = probe.filter((n) => !!ctrl.current.bones[n]);
    // eslint-disable-next-line no-console
    console.log(
      '[SignAnimator] scene loaded — bones:', allBoneNames.length,
      '| mixamorig*:', mixamoCount,
      '| probe', probeHits.length + '/' + probe.length,
      probeHits,
    );

    // NOTE: deliberately NOT calling defaultPose() here. The synapZ-AI
    // defaultPose pushes the forearms to ±120° on local Y, which on this rig
    // produces a degenerate skin matrix and the SkinnedMesh vanishes. Leave
    // the avatar in its bind (T-pose) until the user triggers a sign or
    // explicitly calls lowerArm().
  }, [scene]);

  // ── Bone resolver ──────────────────────────────────────────────────────────
  // Prefer scene.getObjectByName() — this matches synapZ-AI's expectation
  // and falls back to the prebuilt lookup table for aliased Mixamo names.
  const _getBone = (name) => {
    const byScene = ctrl.current.avatar?.getObjectByName?.(name);
    return byScene || ctrl.current.bones[name] || null;
  };

  // ── Per-frame engine step ─────────────────────────────────────────────────
  // Each entry in ctrl.animations[0] is a 5-tuple [bone, action, axis, limit,
  // sign]. We nudge bone[action][axis] toward limit by `speed * dt`.
  // Tuples that have reached their limit are removed; once the inner array is
  // empty we shift the outer entry off and schedule a short pause.
  const _step = (deltaSeconds) => {
    const c = ctrl.current;
    if (!c.pending) return;

    if (c.paused) {
      if (performance.now() < c.pauseUntil) return;
      c.paused = false;
    }

    if (c.animations.length === 0) {
      c.pending = false;
      return;
    }

    const frame = c.animations[0];

    // ── Control entries ────────────────────────────────────────────────────
    // ['done', cb]  → fire callback, advance immediately
    // ['pause', ms] → block engine for ms
    if (frame[0] === 'done' && typeof frame[1] === 'function') {
      try { frame[1](); } catch { /* swallow — promise consumer is gone */ }
      c.animations.shift();
      return;
    }
    if (frame[0] === 'pause' && typeof frame[1] === 'number') {
      c.paused     = true;
      c.pauseUntil = performance.now() + frame[1];
      c.animations.shift();
      return;
    }

    // ── Tuple list ─────────────────────────────────────────────────────────
    const step = BASE_SPEED * c.speedScale * deltaSeconds * TARGET_FPS;

    for (let i = frame.length - 1; i >= 0; i--) {
      const tuple = frame[i];
      if (!Array.isArray(tuple) || tuple.length < 5) { frame.splice(i, 1); continue; }
      const [boneName, action, axis, limit, dir] = tuple;
      const bone = _getBone(boneName);
      if (!bone || !bone[action]) { frame.splice(i, 1); continue; }

      const target = bone[action];
      const current = target[axis];

      if (dir === '+') {
        if (current < limit) {
          target[axis] = Math.min(current + step, limit);
        } else {
          frame.splice(i, 1);
        }
      } else {
        if (current > limit) {
          target[axis] = Math.max(current - step, limit);
        } else {
          frame.splice(i, 1);
        }
      }

      // Defensive: if a tuple somehow drives the axis to NaN/Infinity,
      // snap back to 0 so the skin matrix doesn't blow up the whole mesh.
      if (!Number.isFinite(target[axis])) {
        // eslint-disable-next-line no-console
        console.warn('[SignAnimator] non-finite rotation on', boneName, axis, '→ reset to 0');
        target[axis] = 0;
        frame.splice(i, 1);
      }
    }

    if (frame.length === 0) {
      c.animations.shift();
      c.paused     = true;
      c.pauseUntil = performance.now() + DEFAULT_PAUSE_MS / Math.max(c.speedScale, 0.1);
    }
  };

  // animate() exists on ctrl so sign functions that check ref.pending can
  // restart the loop. With useFrame driving us, we just flip pending=true and
  // the next frame picks it up.
  ctrl.current.animate = () => { ctrl.current.pending = true; };

  useFrame((_, delta) => _step(Math.min(delta, 0.05)));

  // ── Public API ─────────────────────────────────────────────────────────────

  // Resolves once the queue drains past everything sign() just enqueued.
  const _waitForDrain = () =>
    new Promise((resolve) => {
      ctrl.current.animations.push(['done', () => resolve(true)]);
      if (!ctrl.current.pending) {
        ctrl.current.pending = true;
      }
    });

  const sign = useCallback(async (text) => {
    if (!text || !ctrl.current.avatar) return true;

    const trimmed = String(text).trim();
    if (!trimmed) return true;

    // splitIntoWords already runs upstream, but be defensive: handle spaces.
    const tokens = trimmed.split(/\s+/);
    for (const token of tokens) {
      const upper = token.toUpperCase().replace(/[^A-Z]/g, '');
      if (!upper) continue;

      const wordFn = words[upper];
      if (typeof wordFn === 'function') {
        wordFn(ctrl.current);
      } else {
        for (const ch of upper) {
          const letterFn = alphabets[ch];
          if (typeof letterFn === 'function') letterFn(ctrl.current);
        }
      }
    }

    return _waitForDrain();
  }, []);

  const stop = useCallback(() => {
    ctrl.current.animations.length = 0;
    ctrl.current.pending    = false;
    ctrl.current.paused     = false;
    ctrl.current.pauseUntil = 0;
  }, []);

  const lowerArm = useCallback(async () => {
    if (!ctrl.current.avatar) return true;
    defaultPose(ctrl.current);
    return _waitForDrain();
  }, []);

  const setSpeed = useCallback((s) => {
    ctrl.current.speedScale = Math.max(0.25, Number(s) || 1);
  }, []);

  return useMemo(
    () => ({ sign, stop, lowerArm, setSpeed }),
    [sign, stop, lowerArm, setSpeed],
  );
}
