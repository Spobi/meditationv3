import * as THREE from 'three';
import { MOODS, INSTRUMENTS, BOUNDS } from './constants.js';
import { initRenderer, initComposer } from './scene/renderer.js';
import { initCamera } from './scene/camera.js';
import { initLighting } from './scene/lighting.js';
import { initBalls, removeBall, updateBalls, updateBallColors } from './scene/balls.js';
import { initEffects, updateEffects, disposeEffects } from './scene/effects.js';
import { updatePhysics } from './physics/engine.js';
import { playNote, createReverb } from './audio/instruments.js';
import { MeditationAgent } from './audio/agentPlay.js';

// ─── App state ───────────────────────────────────────────────────────────────
const state = {
  mood: 'zen',
  instrument: 'sineBells',
  ballCount: 8,
  showNotes: false,
  duration: 3,       // seconds — note decay length
  speed: 1,          // 0 = paused, 1 = normal, up to 4 = fast
  agentEnabled: false,
  agentTempo: 0.7,   // < 1 = slower/meditative, > 1 = faster
};

const agent = new MeditationAgent();

// ─── Module-level refs ────────────────────────────────────────────────────────
let scene, renderer, camera, composer;
let cubeCamera = null, cubeRenderTarget = null;
let balls = [];
let audioCtx = null, masterGain = null;
let frame = 0, lastTime = 0;

// ─── Drag state ───────────────────────────────────────────────────────────────
const raycaster = new THREE.Raycaster();
const dragPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
const dragPoint = new THREE.Vector3();
let draggedIndex = -1;
let prevPointerX = 0, prevPointerY = 0;
let pointerDeltaX = 0, pointerDeltaY = 0;

// ─── Splash → audio unlock → scene init ──────────────────────────────────────
document.getElementById('splash').addEventListener('pointerdown', () => {
  // Audio unlock MUST happen synchronously here — no await before this
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  audioCtx.resume();
  masterGain = audioCtx.createGain();
  masterGain.gain.value = 0.7;
  masterGain.connect(audioCtx.destination);

  // Reverb — parallel wet path from masterGain → convolver → destination.
  // All instruments connect to masterGain so they all get reverb automatically.
  try {
    const reverb = createReverb(audioCtx);     // 2.8s synthetic IR
    const reverbWet = audioCtx.createGain();
    reverbWet.gain.value = 0.38;               // wet mix — present but not swampy
    masterGain.connect(reverb);
    reverb.connect(reverbWet);
    reverbWet.connect(audioCtx.destination);
  } catch (e) { console.warn('reverb setup failed', e); }

  document.getElementById('splash').style.display = 'none';

  // Kick off async scene init — audio is already unlocked
  initScene().catch(showError);
}, { once: true });

// ─── Scene init ───────────────────────────────────────────────────────────────
async function initScene() {
  scene = new THREE.Scene();

  const canvas = document.getElementById('three-canvas');
  renderer = initRenderer(canvas);
  camera = initCamera();

  try { initLighting(scene); } catch (e) { console.warn('lighting failed', e); }
  try { applyBackground(state.mood); } catch (e) { console.warn('background failed', e); }

  // Balls — non-negotiable
  balls = initBalls(scene, state.mood, state.ballCount);

  // CubeCamera — renders the scene into a live cube map so balls reflect each other.
  // Lights are not visible objects in Three.js, so they won't appear as bright spots.
  try {
    cubeRenderTarget = new THREE.WebGLCubeRenderTarget(256, {
      generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter,
    });
    cubeCamera = new THREE.CubeCamera(0.1, 50, cubeRenderTarget);
    cubeCamera.position.set(0, 3, 0);
    scene.add(cubeCamera);
    applyEnvMap(balls);
  } catch (e) { console.warn('cube camera failed', e); }

  try { initEffects(scene, state.mood); } catch (e) { console.warn('effects failed', e); }

  try {
    composer = initComposer(renderer, scene, camera, MOODS[state.mood].bloomStrength);
  } catch (e) { console.warn('bloom failed', e); }

  setupPointerEvents();
  setupUI();

  frame = 0;
  requestAnimationFrame(loop);
}

// ─── Background + fog ─────────────────────────────────────────────────────────
function applyBackground(moodKey) {
  const mood = MOODS[moodKey];
  scene.background = new THREE.Color(mood.bgColor);
  scene.fog = new THREE.FogExp2(mood.fogColor, 0.035);
}

// ─── Animation loop ───────────────────────────────────────────────────────────
function loop(timestamp) {
  requestAnimationFrame(loop);

  const delta = Math.min((timestamp - lastTime) / 1000, 0.05);
  lastTime = timestamp;
  frame++;

  const soundEvents = updatePhysics(balls, frame, state.speed);
  soundEvents.forEach(({ idx, type }) => {
    // Collision sounds at 65% of tap volume
    const vol = type === 'collision' ? 0.65 : 0.40;
    const dur = state.duration * (type === 'collision' ? 0.4 : 0.25);
    playNote(audioCtx, masterGain, balls[idx].noteIndex, state.instrument, dur, vol);
  });

  // Refresh cube map every 3 frames — balls reflect each other's current positions
  if (cubeCamera && frame % 3 === 0) {
    cubeCamera.update(renderer, scene);
  }

  updateEffects(delta);
  updateBalls(balls, timestamp, camera, renderer, state.showNotes);

  if (composer) composer.render();
  else renderer.render(scene, camera);
}

// ─── Raycasting ───────────────────────────────────────────────────────────────
function getHitBall(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width)  *  2 - 1;
  const y = ((event.clientY - rect.top)  / rect.height) * -2 + 1;
  raycaster.setFromCamera(new THREE.Vector2(x, y), camera);
  const meshes = balls.map(b => b.mesh);
  const hits = raycaster.intersectObjects(meshes);
  if (!hits.length) return -1;
  return balls.findIndex(b => b.mesh === hits[0].object);
}

// ─── Pointer events ───────────────────────────────────────────────────────────
function setupPointerEvents() {
  const canvas = renderer.domElement;

  canvas.addEventListener('pointerdown', e => {
    const idx = getHitBall(e);
    console.log('[click] hit index:', idx, '| audioCtx state:', audioCtx?.state);
    if (idx === -1) return;

    // Play sound — the core product
    playNote(audioCtx, masterGain, balls[idx].noteIndex, state.instrument, state.duration);
    balls[idx].pulseTime = performance.now();

    // Start drag
    draggedIndex = idx;
    balls[idx].isDragged = true;
    dragPlane.constant = -balls[idx].mesh.position.z;

    prevPointerX = e.clientX;
    prevPointerY = e.clientY;
    pointerDeltaX = 0;
    pointerDeltaY = 0;

    canvas.setPointerCapture(e.pointerId);
  });

  canvas.addEventListener('pointermove', e => {
    if (draggedIndex === -1) return;

    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width)  *  2 - 1;
    const y = ((e.clientY - rect.top)  / rect.height) * -2 + 1;

    raycaster.setFromCamera({ x, y }, camera);
    raycaster.ray.intersectPlane(dragPlane, dragPoint);

    const ball = balls[draggedIndex];
    ball.mesh.position.x = dragPoint.x;
    ball.mesh.position.y = Math.max(BOUNDS.y[0], Math.min(BOUNDS.y[1], dragPoint.y));

    pointerDeltaX = e.clientX - prevPointerX;
    pointerDeltaY = e.clientY - prevPointerY;
    prevPointerX = e.clientX;
    prevPointerY = e.clientY;
  });

  canvas.addEventListener('pointerup', () => {
    if (draggedIndex === -1) return;

    // Apply throw velocity from last pointer delta, capped at max speed
    const ball = balls[draggedIndex];
    const s = 0.01;
    ball.velocity.x = Math.max(-0.04, Math.min(0.04,  pointerDeltaX * s));
    ball.velocity.y = Math.max(-0.04, Math.min(0.04, -pointerDeltaY * s));
    // preserve Z velocity

    ball.isDragged = false;
    draggedIndex = -1;
  });
}

// ─── UI ───────────────────────────────────────────────────────────────────────
function setupUI() {
  // Panel toggle
  document.getElementById('panel-toggle').addEventListener('click', () => {
    document.getElementById('panel').classList.toggle('open');
  });

  // Mood pills
  const moodContainer = document.getElementById('mood-pills');
  Object.entries(MOODS).forEach(([key, mood]) => {
    const pill = document.createElement('button');
    pill.className = 'pill' + (key === state.mood ? ' active' : '');
    pill.textContent = mood.label;
    pill.addEventListener('click', () => {
      state.mood = key;
      moodContainer.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      applyMood(key);
    });
    moodContainer.appendChild(pill);
  });

  // Instrument pills
  const instContainer = document.getElementById('instrument-pills');
  Object.entries(INSTRUMENTS).forEach(([key, inst]) => {
    const pill = document.createElement('button');
    pill.className = 'pill' + (key === state.instrument ? ' active' : '');
    pill.textContent = inst.label;
    pill.addEventListener('click', () => {
      state.instrument = key;
      instContainer.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
    });
    instContainer.appendChild(pill);
  });

  // Ball count slider
  const slider  = document.getElementById('ball-count');
  const display = document.getElementById('ball-count-display');
  slider.addEventListener('input', () => {
    const n = parseInt(slider.value);
    display.textContent = n;
    setBallCount(n);
  });

  // Speed slider
  const speedSlider  = document.getElementById('ball-speed');
  const speedDisplay = document.getElementById('ball-speed-display');
  speedSlider.addEventListener('input', () => {
    state.speed = parseFloat(speedSlider.value);
    speedDisplay.textContent = state.speed === 0 ? 'Paused' : state.speed.toFixed(1) + 'x';
  });

  // Note duration slider
  const durSlider  = document.getElementById('note-duration');
  const durDisplay = document.getElementById('note-duration-display');
  durSlider.addEventListener('input', () => {
    state.duration = parseFloat(durSlider.value);
    durDisplay.textContent = state.duration.toFixed(1) + 's';
  });

  // Note labels toggle
  document.getElementById('show-notes').addEventListener('change', e => {
    state.showNotes = e.target.checked;
  });

  // Agent play toggle
  document.getElementById('agent-enabled').addEventListener('change', e => {
    state.agentEnabled = e.target.checked;
    if (state.agentEnabled) {
      agent.start(degree => {
        const idx = degree % balls.length;
        playNote(audioCtx, masterGain, balls[idx].noteIndex, state.instrument, state.duration);
        balls[idx].pulseTime = performance.now();
      }, state.agentTempo);
    } else {
      agent.stop();
    }
  });

  // Agent tempo slider
  const agentTempoSlider  = document.getElementById('agent-tempo');
  const agentTempoDisplay = document.getElementById('agent-tempo-display');
  agentTempoSlider.addEventListener('input', () => {
    state.agentTempo = parseFloat(agentTempoSlider.value);
    agentTempoDisplay.textContent = state.agentTempo.toFixed(1) + '×';
    agent.setTempo(state.agentTempo);
  });
}

// ─── Mood switch ──────────────────────────────────────────────────────────────
function applyMood(moodKey) {
  const mood = MOODS[moodKey];

  try { applyBackground(moodKey); } catch (e) { console.warn('bg failed', e); }
  try { updateBallColors(balls, moodKey); } catch (e) { console.warn('ball color failed', e); }
  try { initEffects(scene, moodKey); } catch (e) { console.warn('effects failed', e); }

  // Recreate composer with new bloom strength
  if (composer) {
    try {
      composer.dispose();
      composer = initComposer(renderer, scene, camera, mood.bloomStrength);
    } catch (e) { console.warn('bloom update failed', e); }
  }
}

// ─── Env map helpers ──────────────────────────────────────────────────────────
function applyEnvMap(balls) {
  if (!cubeRenderTarget) return;
  balls.forEach(ball => {
    ball.mesh.material.envMap = cubeRenderTarget.texture;
    ball.mesh.material.needsUpdate = true;
  });
}

// ─── Ball count change ────────────────────────────────────────────────────────
function setBallCount(newCount) {
  balls.forEach(ball => removeBall(scene, ball));
  balls = initBalls(scene, state.mood, newCount);
  applyEnvMap(balls);
  state.ballCount = newCount;
}

// ─── Window resize ────────────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  if (composer) composer.setSize(window.innerWidth, window.innerHeight);
});

// ─── Error display ────────────────────────────────────────────────────────────
function showError(err) {
  const div = document.createElement('div');
  div.style.cssText = 'position:fixed;inset:0;padding:20px;background:#c0392b;color:#fff;z-index:9999;font-family:monospace;white-space:pre-wrap;overflow:auto;';
  div.textContent = 'Startup error:\n\n' + (err?.stack || err);
  document.body.appendChild(div);
}
