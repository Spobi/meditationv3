# Meditative Drift — Product Specification

**Version:** 3.1 (Final Pre-Build Review)
**Status:** In Development
**Stack:** Three.js + Vite + Node/Express
**Port:** 5004 (dev server)

---

## Core Philosophy

**Simple code that works beats complex code that doesn't.**

The app has one job: floating balls you can click to make music. Everything else is secondary. If the balls don't appear or clicking doesn't play sound, the app has failed. Every technical decision should be made in favor of reliability over cleverness.

---

## What The App Is

A full-screen meditative experience with 8 glowing spheres that slowly drift around a 3D space and collide with each other. Each mood has its own color palette, background, and a unique ambient particle effect (like fire, but unique per mood — different colors, shapes, movement speeds). All effects move very slowly to feel calming and meditative.

**The one rule:** clicking a ball must always play a sound. This is the entire product. Everything else is decoration.

---

## Tech Stack

| Layer | Technology |
|---|---|
| 3D Renderer | Three.js (ES module import via CDN or npm) |
| Bundler | Vite (port 5004) |
| Audio | Web Audio API |
| Backend | Node.js + Express (static serving only for now) |

---

## Project Structure

```
meditative-drift/
├── client/
│   ├── index.html
│   ├── styles/
│   │   └── main.css
│   └── src/
│       ├── main.js              App entry — init, animation loop
│       ├── constants.js         Moods, scales, colors
│       ├── scene/
│       │   ├── renderer.js      WebGLRenderer + optional bloom
│       │   ├── camera.js        Static PerspectiveCamera
│       │   ├── lighting.js      Simple ambient + point lights
│       │   ├── balls.js         Sphere meshes + click detection
│       │   └── effects.js       Per-mood ambient particle effects
│       ├── physics/
│       │   └── engine.js        Simple 3D drift + ball-ball collision
│       └── audio/
│           ├── context.js       AudioContext init + iOS unlock
│           └── instruments.js   Note synthesis functions
├── server/
│   └── index.js                 Express static server
├── vite.config.js
└── package.json
```

---

## Rendering

### Camera

Static camera — never moves. User never orbits or zooms.

| Setting | Value |
|---|---|
| Type | PerspectiveCamera |
| FOV | 50° |
| Position | (0, 4, 14) |
| LookAt | (0, 3, 0) |
| Near / Far | 0.1 / 100 |

### Renderer

**Build order: plain renderer first, bloom last.**

Start with `renderer.render(scene, camera)` directly. Do not wire up EffectComposer until balls are visible, clicking works, physics works, and particles work. Bloom is purely visual polish — it is the final step, never the first.

```js
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // cap at 2 — ratio 3+ tanks performance
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);
```

Only add EffectComposer after everything else is confirmed working. When you do, **always include OutputPass as the final pass** — without it the color space conversion is skipped and the output looks washed out or overexposed:

```js
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'; // required — do not omit

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.8, 0.4, 0.2));
composer.addPass(new OutputPass()); // must be last
```

If bloom causes any issues, remove it permanently. The app looks fine without it.

### Window Resize

Always handle resize or the camera aspect ratio becomes permanently wrong after any window resize:

```js
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  if (composer) composer.setSize(window.innerWidth, window.innerHeight);
});
```

### Balls

**Build order: MeshBasicMaterial first, upgrade after.**

Start every ball with `MeshBasicMaterial({ color: ... })`. It ignores lights, envMaps, and everything else — balls will always be visible. Once you confirm balls appear on screen and clicking plays sound, upgrade to `MeshStandardMaterial`. If you start with Standard and balls are invisible, you won't know if it's the material, the lights, or the envMap that's broken.

8 spheres by default. Once upgraded, each is a `SphereGeometry` with `MeshStandardMaterial`.

| Property | Value |
|---|---|
| Radius | 0.6 |
| Segments | 32 (not 64 — no need for high poly) |
| metalness | 0.3 |
| roughness | 0.5 |
| color | Per-mood palette color |
| emissive | Same color at low intensity (0.15) |
| emissiveIntensity | 0.15 at rest, pulses to 1.0 on click |

**Do not use high metalness + envMapIntensity as the primary visual.** Balls should be colorful and visible regardless of environment map state. Metalness/roughness values should be moderate so balls look good even if PMREMGenerator fails.

Each ball gets a simple additive glow sprite (radial gradient canvas texture, SpriteMaterial with AdditiveBlending) to make it look luminous. Glow sprites are purely visual — they must not be included in the raycaster mesh list or they'll interfere with click detection.

### Ball Initial Positions

**Balls must start spread apart — never at the origin.** If multiple balls start at (0,0,0) the collision code divides by zero and physics breaks permanently on frame one.

Spread balls evenly in a grid across the bounds on init:

```js
function getInitialPositions(count) {
  const positions = [];
  const cols = Math.ceil(Math.sqrt(count));
  for (let i = 0; i < count; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    positions.push(new THREE.Vector3(
      (col / (cols - 1 || 1)) * 10 - 5,        // spread across X
      2 + Math.random() * 2,                     // random Y between 2–4
      (row / (Math.ceil(count / cols) - 1 || 1)) * 6 - 3  // spread across Z
    ));
  }
  return positions;
}
```

### Lighting

```js
// Ambient light — fills the scene so balls are always visible
const ambient = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambient);

// One point light — gives depth and softly highlights balls
const pointLight = new THREE.PointLight(0xffffff, 1.5, 30);
pointLight.position.set(0, 8, 6);
scene.add(pointLight);
```

No shadow maps. No DirectionalLight with shadow camera. Shadows add complexity and fragility. The point light + ambient is enough to make balls look 3D and beautiful.

### Background

Each mood sets `scene.background` to a solid `THREE.Color` and `scene.fog` to a `FogExp2` with matching color. That's it — no HDR skyboxes, no PMREMGenerator dependency for background visuals.

If an environment map improves the look, use `RoomEnvironment` as a static one-time setup and never regenerate it. Keep it in a try/catch and accept gracefully if it fails.

---

## Per-Mood Ambient Effects

Each mood has a unique ambient particle system — like fire, but visually distinct per mood. All effects move very slowly and are mesmerizing to watch. These are purely decorative and **must not interfere with ball clicking or audio**.

These are implemented as `THREE.Points` with a `BufferGeometry` and `PointsMaterial` using `AdditiveBlending`. Each particle has a position, velocity, and lifetime. On each frame, positions update and particles that expire get recycled.

| Mood | Effect Name | Color | Shape/Behavior |
|---|---|---|---|
| Zen Bells 🔔 | Violet Wisps | Purple/lavender | Thin rising wisps, curl gently, very slow |
| Deep Focus 🧘 | Ember Glow | Amber/gold | Rising embers, drift sideways like incense smoke |
| Sleep Drift 🌙 | Blue Mist | Deep blue/silver | Float slowly downward like falling snowflakes |
| Water Drops 💧 | Teal Bubbles | Teal/cyan | Rise upward slowly like underwater bubbles |
| Cosmic Calm 🌌 | Star Drift | White/silver/indigo | Drift in slow arcs like stars in a nebula |
| Inferno 🔥 | Fire Sparks | Orange/red/yellow | Classic fire — rise fast, flicker, disappear at top |

**Implementation rules:**
- Each system: 80–150 particles max
- Particle size: 0.05–0.15 world units
- Movement speed: very slow (0.002–0.015 units/frame depending on mood)
- Spawn area: full scene volume, spread around and behind balls
- Particles recycle when they leave bounds or lifetime expires
- All use `AdditiveBlending` for soft glowing look
- Effect is initialized once per mood change in `effects.js`

**Critical: every particle PointsMaterial must set `depthWrite: false`.** Without it, particles write to the depth buffer and occlude each other, creating a harsh choppy look instead of soft glow. Always:

```js
new THREE.PointsMaterial({
  color: 0xff6600,
  size: 0.1,
  blending: THREE.AdditiveBlending,
  depthWrite: false,   // required — do not omit
  transparent: true,
})
```

---

## Physics

Simple, readable 3D drift. No complex wander state machine, no spring forces, no elaborate drag system.

### Ball Movement

Each ball has a `velocity` (THREE.Vector3). Every frame:
1. Add a tiny random nudge to velocity (wander)
2. Apply velocity to position
3. Apply friction (0.995) — very gentle slowdown
4. Bounce off axis-aligned bounds

```js
// frame is a counter incremented once per animation loop tick — define it at the top of main.js:
// let frame = 0;
// In the loop: frame++;

// Wander: tiny random push every N frames
if (frame % 120 === 0) {  // every 2 seconds at 60fps
  ball.velocity.add(new THREE.Vector3(
    (Math.random() - 0.5) * 0.02,
    (Math.random() - 0.5) * 0.01,
    (Math.random() - 0.5) * 0.02
  ));
}

// Speed cap — keep it slow and meditative
const maxSpeed = 0.04;
if (ball.velocity.length() > maxSpeed) {
  ball.velocity.setLength(maxSpeed);
}
```

### Bounds

```js
const BOUNDS = { x: 7, y: [0.8, 5.5], z: 5 };
// Bounce: if position.x > BOUNDS.x → velocity.x *= -0.7 (soft bounce)
```

### Ball-Ball Collision

Simple sphere-sphere test. When two balls overlap:
1. Push them apart so they're exactly touching (no overlap)
2. Exchange velocity components along the collision axis

```js
// For each pair (i, j):
const diff = ballA.position.clone().sub(ballB.position);
const dist = diff.length();

// Guard: if balls are exactly at the same position, dist=0 and normalize()
// returns NaN, breaking all physics. Push them apart by a fixed amount instead.
if (dist === 0) {
  ballA.position.x += 0.1;
  ballB.position.x -= 0.1;
  return;
}

if (dist < BALL_RADIUS * 2) {
  // Separate
  const overlap = BALL_RADIUS * 2 - dist;
  const axis = diff.normalize(); // normalize() mutates diff in place and returns it
  ballA.position.addScaledVector(axis, overlap / 2);
  ballB.position.addScaledVector(axis, -overlap / 2);
  // Exchange velocity along axis
  const relVel = ballA.velocity.dot(axis) - ballB.velocity.dot(axis);
  ballA.velocity.addScaledVector(axis, -relVel * 0.8);
  ballB.velocity.addScaledVector(axis, relVel * 0.8);
}
```

### Dragging

Click and drag moves a ball. On release, the ball carries the pointer velocity (capped at max speed).

**There is no ground mesh in the scene.** Use a virtual `THREE.Plane` for drag intersection — do not try to intersect a scene object:

```js
const dragPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0); // plane facing camera
const dragPoint = new THREE.Vector3();

// onPointerDown: find hit ball, record dragging index
// onPointerMove:
raycaster.setFromCamera(pointer, camera);
raycaster.ray.intersectPlane(dragPlane, dragPoint);
// dragPlane should be positioned at the ball's Z depth:
dragPlane.constant = -ball.position.z;
draggedBall.position.x = dragPoint.x;
draggedBall.position.y = dragPoint.y;

// onPointerUp: compute velocity from last two pointer positions, cap it, end drag
```

---

## Audio

### AudioContext Init

iOS requires a user gesture to start audio. The splash screen ("Tap to Begin") handles this.

**Critical iOS rule: `audioCtx.resume()` must be called synchronously inside the user gesture handler.** If you `await` anything before calling it — even a single promise — the browser considers the gesture "consumed" and silently blocks audio. Create the context and call resume() first, then do everything else.

```js
// CORRECT — resume() called synchronously inside the gesture
splashEl.addEventListener('pointerdown', async () => {
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  audioCtx.resume(); // synchronous — do NOT await before this line
  masterGain = audioCtx.createGain();
  masterGain.gain.value = 0.7;
  masterGain.connect(audioCtx.destination);
  hideSplash();
  await finishSceneInit(); // async work happens after audio is unlocked
});
```

```js
// WRONG — awaiting before resume() breaks iOS audio silently
splashEl.addEventListener('pointerdown', async () => {
  await somethingAsync(); // this consumes the gesture — resume() will be blocked
  audioCtx = new AudioContext();
  audioCtx.resume(); // too late on iOS
});
```

### Click → Sound (THE CRITICAL PATH)

**This must always work. No exceptions.**

When a ball is clicked:
1. Raycast from pointer → find ball
2. Play note for that ball's index
3. Pulse ball's emissiveIntensity

```js
function playNote(ballIndex) {
  const freq = SCALE[ballIndex % SCALE.length];
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.5, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 3);
  osc.connect(gain);
  gain.connect(masterGain);
  osc.start();
  osc.stop(audioCtx.currentTime + 3);
}
```

Instruments are variations on this pattern — different oscillator types, envelope shapes, and harmonics. Keep each instrument function self-contained and simple.

### Scale

C-major pentatonic: always harmonious, always safe.

```js
const SCALE = [261.63, 293.66, 329.63, 392.00, 440.00, 523.25, 587.33, 659.25]; // C4–E5
```

### Instruments (5 total)

| Instrument | Type | Character |
|---|---|---|
| Sine Bells | Sine oscillator | Clean, pure, long decay |
| Himalayan Bowl | 3 detuned sines | Warm, complex, long sustain |
| Crystal Bowl | Sine + 2nd harmonic | Bright, ethereal |
| Marimba | Triangle + bandpass | Warm, percussive, short decay |
| Hang Drum | Sine with freq slide | Breathy metallic |

---

## Moods

6 moods. Each mood defines: background color, fog color, ball color palette (4–5 colors), particle effect config, bloom strength.

```js
const MOODS = {
  zen:    { bgColor: '#0d0820', fogColor: '#1a0f3a', colors: ['#9b59b6','#8e44ad','#a569bd','#7d3c98','#c39bd3'], bloomStrength: 0.8 },
  focus:  { bgColor: '#1a0d00', fogColor: '#2d1800', colors: ['#f39c12','#e67e22','#f1c40f','#d4ac0d','#fad7a0'], bloomStrength: 0.7 },
  sleep:  { bgColor: '#020510', fogColor: '#05091a', colors: ['#1a3a6b','#2e4a8a','#4a6fa5','#7fb3d3','#aed6f1'], bloomStrength: 0.5 },
  water:  { bgColor: '#001a1a', fogColor: '#002222', colors: ['#1abc9c','#17a589','#48c9b0','#76d7c4','#a3e4d7'], bloomStrength: 0.8 },
  cosmic: { bgColor: '#020008', fogColor: '#080015', colors: ['#5b2c8d','#7d3c98','#2980b9','#85c1e9','#d7bde2'], bloomStrength: 1.0 },
  inferno:{ bgColor: '#100000', fogColor: '#1a0000', colors: ['#e74c3c','#c0392b','#e67e22','#f39c12','#f1948a'], bloomStrength: 1.5 }
};
```

---

## UI

### Splash Screen

Full-screen overlay on load. One button: "Tap to Begin" (or tap anywhere). Fades out after first tap. This is required for iOS AudioContext unlock.

**The splash div must be in `index.html` as static HTML — not injected by JavaScript.** If it's created via JS, there's a blank white flash while the bundle loads. Put it directly in the HTML so it's visible immediately:

```html
<!-- index.html -->
<div id="splash">
  <h1>Meditative Drift</h1>
  <p>Tap anywhere to begin</p>
</div>
<canvas id="three-canvas"></canvas>
```

JS only hides it after the tap — it never creates it.

### Required CSS

Without these styles the canvas won't fill the screen, the body will have an 8px default margin creating a white border, and mobile will scroll instead of dragging balls:

```css
* { margin: 0; padding: 0; box-sizing: border-box; }

html, body {
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #000;
}

canvas {
  position: fixed;
  inset: 0;
  display: block;
  touch-action: none; /* prevents mobile scroll/zoom while dragging balls */
}

#splash {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: #000;
  color: #fff;
  z-index: 10;
  cursor: pointer;
  user-select: none;
}
```

### Mood Selector

Pill buttons across the top (or side). Tapping a mood changes: background, fog, ball colors, particle effect, bloom strength. All changes are instant.

### Instrument Selector

Pill buttons. Tapping changes the synth used for all ball clicks.

### Ball Count

Simple slider, 3–12 balls. Changing adds or removes balls smoothly.

### Control Panel

Simple side drawer (right side, toggle with ☰). Contains:
- Mood pills
- Instrument pills
- Ball count slider
- Show/hide note labels toggle

That's it. No sequencer, no profiles, no publishing, no recording in v3.0.

---

## Interaction

### Raycaster Hit Detection

```js
function getHitBall(event, balls) {
  const rect = canvas.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera({ x, y }, camera);
  const meshes = balls.map(b => b.mesh);
  const hits = raycaster.intersectObjects(meshes);
  if (!hits.length) return -1;
  return balls.findIndex(b => b.mesh === hits[0].object);
}
```

### Pointer Events

```
pointerdown → find hit ball → play sound + start drag
pointermove → if dragging, move ball
pointerup   → end drag (apply throw velocity)
```

Only `pointerdown` on a ball triggers sound. Dragging is silent. Releasing after a drag also silent (no accidental double-play).

---

## Init Sequence (main.js)

The splash tap triggers audio unlock synchronously, then kicks off scene init. These are two separate steps — do not combine them into one async function or iOS audio breaks.

```js
// Step 1: splash tap handler — audio MUST be unlocked here, synchronously
document.getElementById('splash').addEventListener('pointerdown', () => {
  // Audio unlock is synchronous — no await before this
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  audioCtx.resume();
  masterGain = audioCtx.createGain();
  masterGain.gain.value = 0.7;
  masterGain.connect(audioCtx.destination);

  // Hide splash
  document.getElementById('splash').style.display = 'none';

  // Now kick off the rest of init (can be async from here)
  initScene().catch(showError);
}, { once: true }); // once:true auto-removes the listener after first tap

// Step 2: scene init — audio is already unlocked before this runs
async function initScene() {
  scene = new THREE.Scene();
  renderer = initRenderer();
  camera = initCamera();

  try { initLighting(scene); } catch(e) { console.warn('lighting failed', e); }
  try { initBackground(scene, state.mood); } catch(e) { console.warn('background failed', e); }

  balls = initBalls(scene, state.mood, state.ballCount); // non-negotiable

  try { initEffects(scene, state.mood); } catch(e) { console.warn('effects failed', e); }

  setupPointerEvents(); // non-negotiable
  setupUI();

  frame = 0;
  requestAnimationFrame(loop);
}

function showError(err) {
  const div = document.createElement('div');
  div.style.cssText = 'position:fixed;inset:0;padding:20px;background:#c0392b;color:#fff;z-index:9999;font-family:monospace;white-space:pre-wrap;overflow:auto;';
  div.textContent = 'Startup error:\n\n' + (err?.stack || err);
  document.body.appendChild(div);
}
```

**Each module init is isolated.** Lighting, background, and effects each have their own try/catch so a failure in any one of them doesn't prevent balls from rendering or clicking from working.

---

## Animation Loop

```js
function loop(timestamp) {
  requestAnimationFrame(loop);

  const delta = Math.min((timestamp - lastTime) / 1000, 0.05);
  lastTime = timestamp;

  updatePhysics(balls, delta);   // drift + collisions
  updateEffects(delta);          // ambient particles
  updateBalls(timestamp);        // pulse animations

  if (composer) composer.render();
  else renderer.render(scene, camera);
}
```

---

## Build Approach

### Start from a clean slate

Delete `client/src` entirely before writing any new code. Do not refactor the existing files — the old module interdependencies will drag complexity in even if you only touch one file. A blank directory takes less time than untangling what's already there.

The server (`server/index.js`) can stay as-is — it just serves static files and doesn't need to change.

### Write one file first, then split into modules

Module import errors in Vite are completely silent — a typo in an import path gives you `undefined` with no error message, and you'll spend an hour wondering why a function doesn't exist. Avoid this by writing the entire app as a single `main.js` first (~200 lines):

- Scene, camera, renderer
- Lights
- Balls (MeshBasicMaterial)
- Click → sound
- Physics loop

Prove that works end-to-end. Then split into modules (`balls.js`, `physics/engine.js`, etc.). Splitting is fast once the logic is correct. Debugging silent import failures while also debugging logic is painful.

### Build order checklist

Follow this exact order. Do not move to the next step until the current step works:

1. Blank canvas renders (no errors in console)
2. One colored ball visible on screen
3. Click on ball logs "hit" to console
4. Click on ball plays a sine wave sound
5. 8 balls visible, each plays its own note
6. Balls drift slowly on their own
7. Balls bounce off each other
8. Splash screen → tap → balls appear and audio works
9. Mood switching changes ball colors and background
10. Instrument switching changes the sound
11. Ambient particle effects added per mood
12. Upgrade MeshBasicMaterial → MeshStandardMaterial
13. Add bloom (EffectComposer) as the final step

---

## Simplicity Rules

These rules govern every implementation decision:

1. **Balls visible = success.** `MeshBasicMaterial` with a color is better than `MeshStandardMaterial` that depends on envMap. Start simple, add complexity only if stable.

2. **Audio plays = success.** The sine oscillator above works everywhere. Add instrument variety only after the basic click-to-sound works.

3. **No feature is worth a crash.** Wrap each feature init in try/catch. The core (balls + audio) must work even if particles, bloom, labels, etc. all fail.

4. **Don't abstract prematurely.** Three similar `if` statements are fine. Extract a helper only when you'd write the same code a 4th time.

5. **No performance tiers in v3.0.** Use sensible fixed values (32 segments, 80 particles). Skip performance detection entirely.

6. **No server features in v3.0.** The Express server only serves static files. No database, no API, no recording upload. Add these later when the core works.

---

## Vite Config

```js
import { defineConfig } from 'vite';

export default defineConfig({
  root: 'client',
  server: { port: 5004 },
  build: { outDir: '../dist', emptyOutDir: true }
});
```

---

## Non-Goals (v3.0)

The following are explicitly out of scope until the core experience is stable:

- Song recording and publishing
- Step sequencer / agent auto-play
- Saved profiles
- Breathing guide / focus timer
- Chord system (per-ball chord picker)
- Sustained press-and-hold notes
- Motion trails behind balls
- Shadow maps
- Performance tier detection
- Real-time inter-ball reflections
- Mobile-specific optimizations
- PWA / offline support

---

## Changelog

### v3.1 (2026-03-18) — Final Pre-Build Review

Fixed 9 implementation bugs found in final spec review:
- Fixed init sequence: audio unlock is now synchronous in splash handler, separate from async scene init
- Added `frame` counter definition to physics wander code
- Added zero-distance guard to ball-ball collision (prevents NaN from divide-by-zero)
- Added initial ball position spread function (prevents all balls starting at origin)
- Added required canvas/body CSS (position:fixed, touch-action:none, margin reset)
- Added `renderer.setSize()` and `setPixelRatio()` to renderer setup
- Added window resize handler (camera aspect + renderer + composer)
- Replaced "ground plane intersection" drag with virtual `THREE.Plane` (no ground mesh exists)
- Added `OutputPass` to EffectComposer setup (required for correct color space with bloom)

### v3.0 (2026-03-18) — Simplification Rewrite

Complete spec rewrite. Stripped all non-essential features to focus on the core loop: visible balls, click-to-play audio, slow 3D drift, collision physics, unique per-mood ambient effects. Simplified material approach to avoid envMap dependency. Reduced scope to make the implementation reliable before adding complexity.

### v2.2 (2026-03-18)

3D physics, stability fixes, RoomEnvironment as guaranteed base env map, init robustness with try/catch isolation.

### v2.1 (2026-03-18)

Desktop-first pass, reduced throw multiplier, vertical backdrop plane, camera repositioning, PCFSoftShadowMap.
