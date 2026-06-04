// Drives the avatar's arms back to a relaxed A-pose. Queued like any other
// sign function — the engine processes it as an ordinary tuple list.
export const defaultPose = (ref) => {
  const animations = [
    ['mixamorigNeck',         'rotation', 'x',  Math.PI / 12,  '+'],
    ['mixamorigLeftArm',      'rotation', 'z', -Math.PI / 3,   '-'],
    ['mixamorigLeftForeArm',  'rotation', 'y', -Math.PI / 1.5, '-'],
    ['mixamorigRightArm',     'rotation', 'z',  Math.PI / 3,   '+'],
    ['mixamorigRightForeArm', 'rotation', 'y',  Math.PI / 1.5, '+'],
  ];

  ref.animations.push(animations);

  if (ref.pending === false) {
    ref.pending = true;
    ref.animate();
  }
};

export default defaultPose;
