import type { CSSProperties } from 'react';

/*
 * Minimal-detail toy character used inside the onboarding dioramas. A circle
 * head, a rounded-capsule body and stroked limbs — no facial features beyond
 * two optional dot eyes, so meaning is carried entirely by the pose. Built on a
 * 64×104 viewBox; scale via the `size` (height in px) prop.
 */

type Pose =
  | 'stand'
  | 'point'
  | 'pointLow'
  | 'tap'
  | 'carry'
  | 'reach'
  | 'cheer'
  | 'hold'
  | 'present'
  | 'examine';

type Gaze = 'fwd' | 'up' | 'down';

// [leftArm path, rightArm path] — arms are stroked round-cap lines from the
// shoulder line (y≈46) outward.
const POSES: Record<Pose, [string, string]> = {
  stand: ['M22 48 Q16 60 18 70', 'M42 48 Q48 60 46 70'],
  point: ['M22 48 Q15 58 16 68', 'M42 46 Q58 40 70 36'], // right arm points up/out
  pointLow: ['M22 48 Q14 56 14 66', 'M42 48 Q56 52 66 56'], // right arm points out
  tap: ['M22 48 Q15 56 16 66', 'M42 47 Q58 49 71 50'], // right arm reaches forward to touch
  carry: ['M22 46 Q14 40 12 32', 'M42 46 Q50 40 52 32'], // both arms up holding
  reach: ['M22 47 Q12 44 6 50', 'M42 46 Q54 42 64 44'], // arms spread
  cheer: ['M22 46 Q12 34 10 22', 'M42 46 Q52 34 54 22'], // both arms up high
  hold: ['M22 48 Q18 56 26 60', 'M42 48 Q46 56 38 60'], // hands together front
  present: ['M22 48 Q17 59 19 69', 'M42 47 Q56 41 71 35'], // one arm sweeps out, "here"
  examine: ['M22 49 Q14 55 18 63', 'M42 48 Q45 42 35 39'], // hand to chin, curious
};

export function TinyFigure({
  pose = 'stand',
  color = 'var(--toy-blue)',
  size = 96,
  eyes = true,
  flip = false,
  gaze = 'fwd',
  style = {},
  className = '',
}: {
  pose?: Pose;
  color?: string;
  size?: number;
  eyes?: boolean;
  flip?: boolean;
  gaze?: Gaze;
  style?: CSSProperties;
  className?: string;
}) {
  const [la, ra] = POSES[pose] ?? POSES.stand;
  // shift the dot-eyes to suggest where the figure is looking (up at the screen)
  const eyeY = gaze === 'up' ? 18.5 : gaze === 'down' ? 25 : 22;
  const transform = [flip ? 'scaleX(-1)' : '', style.transform || ''].filter(Boolean).join(' ');
  return (
    <svg
      className={className}
      width={(size * 64) / 104}
      height={size}
      viewBox="0 0 64 104"
      fill="none"
      style={{ overflow: 'visible', display: 'block', ...style, transform: transform || undefined }}
      aria-hidden="true"
    >
      {/* contact shadow */}
      <ellipse cx="32" cy="99" rx="17" ry="4" fill="rgb(0 0 0 / 0.35)" />
      {/* legs */}
      <path d="M26 78 L24 96" stroke={color} strokeWidth="8" strokeLinecap="round" opacity="0.92" />
      <path d="M38 78 L40 96" stroke={color} strokeWidth="8" strokeLinecap="round" opacity="0.92" />
      {/* body capsule */}
      <rect x="20" y="40" width="24" height="44" rx="12" fill={color} />
      {/* arms */}
      <path d={la} stroke={color} strokeWidth="7" strokeLinecap="round" />
      <path d={ra} stroke={color} strokeWidth="7" strokeLinecap="round" />
      {/* head */}
      <circle cx="32" cy="22" r="15" fill={color} />
      {/* subtle face: two dots only */}
      {eyes && (
        <g fill="rgb(0 0 0 / 0.55)">
          <circle cx="27" cy={eyeY} r="1.8" />
          <circle cx="37" cy={eyeY} r="1.8" />
        </g>
      )}
    </svg>
  );
}
