import type { CSSProperties, ReactNode } from 'react';
import { Send } from 'lucide-react';
import { TinyFigure } from './TinyFigure';

/* ===========================================================================
   Diorama — toy instructional scenes built on real LuxrayKit screenshots.
   Each feature scene frames an actual app screen inside a phone on the diorama
   base, dims everything except the taught feature (spotlight), outlines that
   feature with a guidance reticle, and adds a tiny faceless figure performing
   the action. The feedback scene stays an abstract form (no screenshot).

   Screenshots ship in /assets/onboarding/ (the user's own captures, status bar
   cropped, downscaled to 500px-wide JPEG).
   =========================================================================== */

const SCREENS = {
  overview: '/assets/onboarding/overview.jpg',
  dex: '/assets/onboarding/dex.jpg',
  data: '/assets/onboarding/data.jpg',
  team: '/assets/onboarding/team.jpg',
} as const;

export type DioramaScene = 'environment' | 'dex' | 'detail' | 'team' | 'feedback';

const abs = (s: CSSProperties): CSSProperties => ({ position: 'absolute', ...s });

/* --- diorama base — a subtle lit "stage" the scene sits on ---------------- */
function Stage({ children, maxWidth = 332 }: { children: ReactNode; maxWidth?: number }) {
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', minHeight: 150, maxWidth, margin: '0 auto' }}>
      <div
        style={{
          position: 'absolute',
          left: '12%',
          right: '12%',
          bottom: '5%',
          height: '22%',
          borderRadius: '50%',
          background: 'radial-gradient(closest-side, rgb(108 140 255 / 0.14), rgb(255 255 255 / 0.035) 52%, transparent 78%)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: '18%',
          right: '18%',
          bottom: '9%',
          height: '8%',
          borderRadius: '50%',
          border: '1px solid rgb(108 140 255 / 0.18)',
        }}
      />
      {children}
    </div>
  );
}

/* --- guidance-focus reticle: faint full frame + bold corner brackets ------ */
function FocusReticle({ fx, fy, fw, fh, ring }: { fx: number; fy: number; fw: number; fh: number; ring: string }) {
  const glow = `color-mix(in srgb, ${ring} 42%, transparent)`;
  const box = abs({
    left: `${(fx - fw / 2) * 100}%`,
    top: `${(fy - fh / 2) * 100}%`,
    width: `${fw * 100}%`,
    height: `${fh * 100}%`,
  });
  const C = 11; // corner bracket length
  const W = 2.5; // bracket thickness
  const corner = (extra: CSSProperties): CSSProperties =>
    abs({ width: C, height: C, borderColor: ring, borderStyle: 'solid', borderWidth: 0, ...extra });
  return (
    <div style={box}>
      {/* soft pulsing glow + faint continuous frame */}
      <div
        className="lk-focus-pulse"
        style={
          {
            ...abs({ inset: -1 }),
            border: `1px solid color-mix(in srgb, ${ring} 55%, transparent)`,
            borderRadius: 9,
            boxShadow: `0 0 16px 3px ${glow}`,
            '--lk-glow': glow,
          } as CSSProperties
        }
      />
      {/* bold corner brackets read as a focus target */}
      <div style={corner({ top: -2, left: -2, borderTopWidth: W, borderLeftWidth: W, borderTopLeftRadius: 6 })} />
      <div style={corner({ top: -2, right: -2, borderTopWidth: W, borderRightWidth: W, borderTopRightRadius: 6 })} />
      <div style={corner({ bottom: -2, left: -2, borderBottomWidth: W, borderLeftWidth: W, borderBottomLeftRadius: 6 })} />
      <div style={corner({ bottom: -2, right: -2, borderBottomWidth: W, borderRightWidth: W, borderBottomRightRadius: 6 })} />
    </div>
  );
}

/* --- a real screenshot inside a phone, with a spotlight on `focus` -------- */
function ScreenPhone({
  img,
  focus,
  ring = 'var(--toy-blue)',
  tilt = 0,
  style = {},
}: {
  img: string;
  focus: [number, number, number?, number?];
  ring?: string;
  tilt?: number;
  style?: CSSProperties;
}) {
  const [fx, fy, fw = 0.9, fh = 0.12] = focus; // focus rect in image fraction
  return (
    <div
      style={{
        borderRadius: 20,
        background: '#000',
        border: '2px solid #2a2a32',
        boxShadow: 'var(--shadow-toy)',
        padding: 4,
        overflow: 'hidden',
        transform: tilt ? `rotate(${tilt}deg)` : undefined,
        ...style,
      }}
    >
      {/* inner frame locked to the screenshot's aspect ratio, so the reticle
         (positioned in image fractions) always sits on the real feature */}
      <div style={{ position: 'relative', height: '100%', aspectRatio: '500 / 1012', borderRadius: 16, overflow: 'hidden' }}>
        {/* the real screen — lifted a touch brighter so the product reads clearly */}
        <img
          src={img}
          alt=""
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            objectPosition: 'top center',
            display: 'block',
            filter: 'brightness(1.14) saturate(1.05)',
          }}
        />
        {/* spotlight: gently dim everything but the focus band */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: `radial-gradient(${fw * 120}% ${fh * 150}% at ${fx * 100}% ${fy * 100}%, transparent 0%, transparent 46%, rgb(8 8 9 / 0.38) 82%)`,
          }}
        />
        {/* guidance-focus reticle on the taught feature */}
        <FocusReticle fx={fx} fy={fy} fw={fw} fh={fh} ring={ring} />
      </div>
    </div>
  );
}

function Note({ style = {} }: { style?: CSSProperties }) {
  return (
    <div
      style={{
        width: 30,
        height: 36,
        borderRadius: 5,
        background: '#f1f1f5',
        boxShadow: 'var(--shadow-pop)',
        padding: 5,
        display: 'flex',
        flexDirection: 'column',
        gap: 3.5,
        ...style,
      }}
    >
      <div style={{ width: '68%', height: 3, borderRadius: 9, background: 'var(--toy-coral)' }} />
      <div style={{ width: '100%', height: 2.5, borderRadius: 9, background: '#c6c6d0' }} />
      <div style={{ width: '88%', height: 2.5, borderRadius: 9, background: '#c6c6d0' }} />
      <div style={{ width: '60%', height: 2.5, borderRadius: 9, background: '#c6c6d0' }} />
    </div>
  );
}

function Pillbar({ w = '100%', h = 8, c = '#26262b', style = {} }: { w?: number | string; h?: number; c?: string; style?: CSSProperties }) {
  return <div style={{ width: w, height: h, borderRadius: 99, background: c, ...style }} />;
}

/* --- little excitement sparkles (used on the celebratory scene) ----------- */
function Sparkles({ color = 'var(--toy-yellow)' }: { color?: string }) {
  const dot = (s: CSSProperties): CSSProperties => abs({ borderRadius: '50%', background: color, ...s });
  return (
    <>
      <span className="lk-spark" style={dot({ width: 7, height: 7, top: -16, left: 2 })} />
      <span className="lk-spark" style={{ ...dot({ width: 4, height: 4, top: -3, left: -12 }), animationDelay: '.55s' }} />
      <span className="lk-spark" style={{ ...dot({ width: 5, height: 5, top: -26, left: 20 }), animationDelay: '1.1s' }} />
    </>
  );
}

/* --- screenshot-driven feature scene -------------------------------------
   The real screen in a phone (inner frame locked to the screenshot aspect
   ratio so the highlight lands exactly), with a spotlight + guidance reticle
   on the taught feature, and a tiny figure that reacts to it. */
function FeatureScene({
  img,
  focus,
  ring = 'var(--toy-blue)',
  figureColor = 'var(--toy-coral)',
  figurePose = 'point',
  gaze = 'up',
  sparkle = false,
  figurePos = {},
}: {
  img: string;
  focus: [number, number, number?, number?];
  ring?: string;
  figureColor?: string;
  figurePose?: Parameters<typeof TinyFigure>[0]['pose'];
  gaze?: Parameters<typeof TinyFigure>[0]['gaze'];
  sparkle?: boolean;
  figurePos?: CSSProperties;
}) {
  return (
    <Stage>
      <ScreenPhone img={img} focus={focus} ring={ring} tilt={-3} style={abs({ left: '8%', top: '4%', height: '92%' })} />
      <div className="lk-fig-bob" style={abs({ right: '6%', bottom: '11%', ...figurePos })}>
        {sparkle && <Sparkles color={ring} />}
        <div className="lk-fig-sway">
          <TinyFigure pose={figurePose} flip gaze={gaze} color={figureColor} size={72} />
        </div>
      </div>
    </Stage>
  );
}

/* S1 — Environment: ranking board. Highlight the #1 ranking row. Figure cheers. */
function SceneEnvironment() {
  return (
    <FeatureScene img={SCREENS.overview} focus={[0.5, 0.42, 0.86, 0.09]} ring="var(--toy-yellow)" figurePose="cheer" gaze="up" sparkle />
  );
}

/* S2 — Dex / search: highlight the search field + tabs. Figure presents the search bar. */
function SceneDex() {
  return <FeatureScene img={SCREENS.dex} focus={[0.5, 0.28, 0.86, 0.12]} ring="var(--toy-blue)" figurePose="present" gaze="up" />;
}

/* S3 — Data: highlight the move usage-% rows. Figure studies the data. */
function SceneDetail() {
  return <FeatureScene img={SCREENS.data} focus={[0.5, 0.38, 0.88, 0.16]} ring="var(--toy-yellow)" figurePose="examine" gaze="fwd" />;
}

/* S4 — Team: highlight a team member card row. Figure reaches in to manage. */
function SceneTeam() {
  return <FeatureScene img={SCREENS.team} focus={[0.5, 0.58, 0.9, 0.2]} ring="var(--toy-mint)" figurePose="tap" gaze="fwd" />;
}

/* S5 — Feedback: a simple abstract feedback form + figure submitting a note. */
function SceneFeedback() {
  return (
    <Stage maxWidth={300}>
      <div
        style={abs({
          left: '30%',
          top: '7%',
          width: '42%',
          height: '78%',
          borderRadius: 20,
          background: '#000',
          border: '2px solid #2a2a32',
          boxShadow: 'var(--shadow-toy)',
          padding: 9,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        })}
      >
        <Pillbar w={40} h={4} c="#454552" />
        <div style={{ display: 'flex', gap: 4 }}>
          <div style={{ flex: 1, height: 14, borderRadius: 6, background: 'var(--toy-coral)', opacity: 0.9 }} />
          <div style={{ flex: 1, height: 14, borderRadius: 6, background: '#1c1c20' }} />
          <div style={{ flex: 1, height: 14, borderRadius: 6, background: '#1c1c20' }} />
        </div>
        <div style={{ flex: 1, borderRadius: 9, background: '#161616', border: '1px solid #26262b', padding: 7, display: 'flex', flexDirection: 'column', gap: 5 }}>
          <Pillbar w="90%" h={4} c="#2c2c33" />
          <Pillbar w="70%" h={4} c="#2c2c33" />
        </div>
        <div style={{ alignSelf: 'flex-end', display: 'grid', placeItems: 'center', width: 26, height: 22, borderRadius: 7, background: 'var(--toy-blue)' }}>
          <Send size={12} color="#fff" />
        </div>
      </div>
      <div style={abs({ left: '6%', bottom: '13%' })} className="lk-fig-bob">
        <Note style={{ position: 'absolute', top: -10, left: 4, zIndex: 2, transform: 'rotate(-8deg)' }} />
        <div className="lk-fig-sway">
          <TinyFigure pose="carry" gaze="up" color="var(--toy-coral)" size={70} />
        </div>
      </div>
    </Stage>
  );
}

const SCENES: Record<DioramaScene, () => ReactNode> = {
  environment: SceneEnvironment,
  dex: SceneDex,
  detail: SceneDetail,
  team: SceneTeam,
  feedback: SceneFeedback,
};

/** Diorama — renders one of the five instructional scenes. */
export function Diorama({ scene = 'environment', style = {} }: { scene?: DioramaScene; style?: CSSProperties }) {
  const Scene = SCENES[scene] ?? SceneEnvironment;
  return (
    <div style={{ width: '100%', height: '100%', ...style }}>
      <Scene />
    </div>
  );
}
