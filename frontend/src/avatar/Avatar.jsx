import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, useGLTF } from '@react-three/drei';
import { Box3, Vector3 } from 'three';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { useAvatarPlaybackStore } from './playbackStore';
import { useSignAnimator } from './useSignAnimator';
import { useAvatarModelStore } from './avatarModelStore';

const LOCAL_MODEL = '/model.glb';

const ANGLE_LIMITS = {
  minPolarAngle:  Math.PI / 2.6,  // ~69° — headroom to look up
  maxPolarAngle:  Math.PI / 1.65, // ~109° — look slightly below level
  minAzimuthAngle: -Math.PI / 6,  // −30° left
  maxAzimuthAngle:  Math.PI / 6,  // +30° right
};

const computeFraming = (scene) => {
  const box = new Box3().setFromObject(scene);
  const size = new Vector3();
  box.getSize(size);

  // Box3.setFromObject is unreliable for SkinnedMesh: it uses pre-skin
  // geometry bounds, which on Mixamo bots come back at ~1.6 cm because the
  // Armature node scales the mesh down by 0.01. Treat anything outside a
  // human-height range as bogus and fall back to a known-good framing.
  const reportedHeight = size.y;
  const valid = Number.isFinite(reportedHeight) && reportedHeight > 0.5 && reportedHeight < 5;
  const height  = valid ? reportedHeight : 1.8;
  const offsetY = valid ? -box.min.y     : 0;

  return {
    offsetY,
    // Frame from mid-chest up — signs happen in this region
    cameraPosition: [0, height * 0.75, height * 1.05],
    orbitTarget:    [0, height * 0.68, 0],
    minDistance:    height * 0.50,
    maxDistance:    height * 1.6,
  };
};

/* ─── AvatarRig ──────────────────────────────────────────────────────────── */

const AvatarRig = ({ modelUrl, onAnimatorReady, onFraming }) => {
  const { scene: cachedScene } = useGLTF(modelUrl);

  // useGLTF returns a single cached Object3D shared across every consumer.
  // Mounting that exact instance in two Canvases (or remounting under
  // StrictMode) detaches it from the first scene tree and leaves the
  // embedded canvas empty. SkeletonUtils.clone gives each consumer an
  // independent rig (mesh + bones + bindings) that can live anywhere.
  const scene = useMemo(() => cloneSkeleton(cachedScene), [cachedScene]);

  // Fixed framing for Mixamo xbot/ybot (~1.7 m tall, feet at origin).
  // Skipping Box3-based auto-framing — for SkinnedMesh it reports the
  // pre-skin geometry bounds (cm units under a 0.01 armature scale on this
  // rig), which translates to a sub-centimeter "avatar" and a camera
  // positioned millimeters from the origin.
  const framing = useMemo(() => ({
    offsetY:        0,
    cameraPosition: [0, 1.45, 2.05],
    orbitTarget:    [0, 1.35, 0],
    minDistance:    1.2,
    maxDistance:    3.5,
  }), []);

  useEffect(() => { onFraming?.(framing); }, [framing, onFraming]);

  useEffect(() => {
    scene.traverse((child) => {
      if (child.isSkinnedMesh) {
        // Critical: skinned-mesh bounding box is stamped at bind time, so
        // extreme sign poses drift outside it and the avatar disappears.
        child.frustumCulled = false;
        if (child.material) {
          child.material.roughness = Math.min(child.material.roughness ?? 0.8, 0.85);
        }
      }
    });
  }, [scene]);

  const animator = useSignAnimator(scene);

  useEffect(() => {
    onAnimatorReady?.(animator);
  }, [animator, onAnimatorReady]);

  return <primitive object={scene} />;
};

/* ─── Avatar ────────────────────────────────────────────────────────────── */

const Avatar = forwardRef((_, ref) => {
  const [webglReady] = useState(() => {
    if (typeof document === 'undefined') return true;
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  });

  const cameraRef = useRef(null);
  const orbitRef  = useRef(null);
  const [framing, setFraming] = useState(null);

  const setApi    = useAvatarPlaybackStore((state) => state.setApi);
  const storedUrl = useAvatarModelStore((s) => s.modelUrl);
  const modelUrl  = storedUrl ?? LOCAL_MODEL;

  useEffect(() => {
    useGLTF.preload(modelUrl);
  }, [modelUrl]);

  const handleAnimatorReady = useCallback((api) => setApi(api), [setApi]);

  // DIAGNOSTIC: do not re-aim the camera after first paint. The Canvas's
  // own `camera` prop sets the initial position and we let it stay there.
  // (If the avatar becomes visible after this change, the framing useEffect
  // or OrbitControls.target sync was knocking the camera off the avatar.)

  const zoomIn = useCallback(() => {
    if (!cameraRef.current || !framing) return;
    cameraRef.current.position.z = Math.max(
      framing.minDistance,
      cameraRef.current.position.z - 0.2,
    );
    cameraRef.current.updateProjectionMatrix();
    orbitRef.current?.update();
  }, [framing]);

  const zoomOut = useCallback(() => {
    if (!cameraRef.current || !framing) return;
    cameraRef.current.position.z = Math.min(
      framing.maxDistance,
      cameraRef.current.position.z + 0.2,
    );
    cameraRef.current.updateProjectionMatrix();
    orbitRef.current?.update();
  }, [framing]);

  const resetView = useCallback(() => {
    if (!cameraRef.current || !framing) return;
    cameraRef.current.position.set(...framing.cameraPosition);
    cameraRef.current.updateProjectionMatrix();
    if (orbitRef.current) {
      orbitRef.current.target.set(...framing.orbitTarget);
      orbitRef.current.update();
    }
  }, [framing]);

  useImperativeHandle(ref, () => ({ zoomIn, zoomOut, resetView }), [zoomIn, zoomOut, resetView]);

  if (!webglReady) {
    return (
      <div className="w-full h-full min-h-112.5 rounded-xl bg-slate-100 flex items-center justify-center p-6 text-center text-slate-600">
        WebGL is not supported in this browser. Please update your browser or
        use a device with WebGL enabled.
      </div>
    );
  }

  return (
    <div
      className="w-full h-full min-h-112.5 rounded-xl overflow-hidden absolute inset-0"
      style={{ background: 'linear-gradient(170deg, #d8e3ee 0%, #e8eef0 45%, #dde8e0 100%)' }}
    >
      {/* Transparent canvas so the CSS gradient background shows through */}
      <Canvas
        camera={{ position: [0, 1.4, 2], fov: 30, near: 0.1, far: 100 }}
        gl={{ alpha: true, antialias: true }}
        onCreated={({ camera, gl }) => {
          cameraRef.current = camera;
          gl.setClearColor(0x000000, 0); // fully transparent clear
          gl.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        }}
      >
        {/* Three-point studio lighting */}
        <ambientLight intensity={0.45} />

        {/* Key light — warm, front-right, slightly above */}
        <directionalLight
          position={[2.0, 3.5, 3.0]}
          intensity={1.15}
          color="#fff8f0"
        />

        {/* Fill light — cool, front-left, softer */}
        <directionalLight
          position={[-1.8, 2.5, 2.5]}
          intensity={0.55}
          color="#f0f6ff"
        />

        {/* Rim/back light — separates avatar from background */}
        <directionalLight
          position={[0, 3.5, -2.5]}
          intensity={0.30}
          color="#ffffff"
        />

        <AvatarRig
          key={modelUrl}
          modelUrl={modelUrl}
          onAnimatorReady={handleAnimatorReady}
          onFraming={setFraming}
        />

        <OrbitControls
          ref={orbitRef}
          enablePan={false}
          enableZoom
          minDistance={framing?.minDistance ?? 1.2}
          maxDistance={framing?.maxDistance ?? 3.5}
          minPolarAngle={ANGLE_LIMITS.minPolarAngle}
          maxPolarAngle={ANGLE_LIMITS.maxPolarAngle}
          minAzimuthAngle={ANGLE_LIMITS.minAzimuthAngle}
          maxAzimuthAngle={ANGLE_LIMITS.maxAzimuthAngle}
          target={framing?.orbitTarget ?? [0, 1.35, 0]}
        />
      </Canvas>
    </div>
  );
});

Avatar.displayName = 'Avatar';
useGLTF.preload(LOCAL_MODEL);

export default Avatar;
