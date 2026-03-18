import * as THREE from 'three';

let particleSystem = null;
let particleData = null;
let sceneRef = null;

// Per-mood particle configs
const CONFIGS = {
  zen: {
    count: 120, color: 0xa569bd, size: 0.06,
    spawnX: [-8, 8], spawnY: [-1, 7], spawnZ: [-6, 6],
    vx: [-0.003, 0.003], vy: [0.002, 0.006], vz: [-0.001, 0.001],
    life: [4, 10], behavior: 'rise',
  },
  focus: {
    count: 100, color: 0xf39c12, size: 0.08,
    spawnX: [-6, 6], spawnY: [0, 3], spawnZ: [-5, 5],
    vx: [-0.005, 0.005], vy: [0.004, 0.010], vz: [-0.002, 0.002],
    life: [3, 7], behavior: 'rise',
  },
  sleep: {
    count: 110, color: 0x5b9bd5, size: 0.07,
    spawnX: [-8, 8], spawnY: [1, 8], spawnZ: [-6, 6],
    vx: [-0.002, 0.002], vy: [-0.003, -0.001], vz: [-0.001, 0.001],
    life: [5, 12], behavior: 'fall',
  },
  water: {
    count: 100, color: 0x1abc9c, size: 0.09,
    spawnX: [-7, 7], spawnY: [-1, 2], spawnZ: [-5, 5],
    vx: [-0.001, 0.001], vy: [0.003, 0.007], vz: [-0.001, 0.001],
    life: [4, 9], behavior: 'rise',
  },
  cosmic: {
    count: 150, color: 0x85c1e9, size: 0.05,
    spawnX: [-9, 9], spawnY: [0, 7], spawnZ: [-7, 7],
    vx: [-0.004, 0.004], vy: [-0.002, 0.002], vz: [-0.002, 0.002],
    life: [6, 15], behavior: 'drift',
  },
  inferno: {
    count: 130, color: 0xe74c3c, size: 0.09,
    spawnX: [-6, 6], spawnY: [-1, 2], spawnZ: [-5, 5],
    vx: [-0.006, 0.006], vy: [0.008, 0.015], vz: [-0.002, 0.002],
    life: [1.5, 4], behavior: 'fire',
  },
};

function rnd(min, max) {
  return min + Math.random() * (max - min);
}

function spawnParticle(i, positions, velocities, lifetimes, cfg, randomY) {
  const idx = i * 3;
  positions[idx]     = rnd(cfg.spawnX[0], cfg.spawnX[1]);
  positions[idx + 2] = rnd(cfg.spawnZ[0], cfg.spawnZ[1]);

  if (randomY || cfg.behavior === 'drift') {
    positions[idx + 1] = rnd(cfg.spawnY[0], cfg.spawnY[1]);
  } else if (cfg.behavior === 'fall') {
    positions[idx + 1] = cfg.spawnY[1]; // start at top, fall down
  } else {
    positions[idx + 1] = cfg.spawnY[0]; // start at bottom, rise up
  }

  velocities[idx]     = rnd(cfg.vx[0], cfg.vx[1]);
  velocities[idx + 1] = rnd(cfg.vy[0], cfg.vy[1]);
  velocities[idx + 2] = rnd(cfg.vz[0], cfg.vz[1]);

  lifetimes[i] = randomY
    ? Math.random() * rnd(cfg.life[0], cfg.life[1])
    : rnd(cfg.life[0], cfg.life[1]);
}

export function initEffects(scene, mood) {
  disposeEffects();
  sceneRef = scene;

  const cfg = CONFIGS[mood] || CONFIGS.zen;
  const count = cfg.count;

  const positions  = new Float32Array(count * 3);
  const velocities = new Float32Array(count * 3);
  const lifetimes  = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    spawnParticle(i, positions, velocities, lifetimes, cfg, true);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const material = new THREE.PointsMaterial({
    color: cfg.color,
    size: cfg.size,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
  });

  particleSystem = new THREE.Points(geometry, material);
  scene.add(particleSystem);

  particleData = { positions, velocities, lifetimes, cfg };
}

export function updateEffects(delta) {
  if (!particleSystem || !particleData) return;

  const { positions, velocities, lifetimes, cfg } = particleData;
  const count = cfg.count;

  for (let i = 0; i < count; i++) {
    lifetimes[i] -= delta;

    if (lifetimes[i] <= 0) {
      spawnParticle(i, positions, velocities, lifetimes, cfg, false);
      continue;
    }

    const idx = i * 3;
    positions[idx]     += velocities[idx];
    positions[idx + 1] += velocities[idx + 1];
    positions[idx + 2] += velocities[idx + 2];

    // Behavior-specific motion tweaks
    if (cfg.behavior === 'fire') {
      // Accelerate upward, flicker horizontally
      velocities[idx + 1] += 0.0003;
      velocities[idx] += (Math.random() - 0.5) * 0.001;
    } else if (cfg.behavior === 'drift') {
      // Gentle random walk in all axes
      velocities[idx]     += (Math.random() - 0.5) * 0.0001;
      velocities[idx + 1] += (Math.random() - 0.5) * 0.0001;
      velocities[idx + 2] += (Math.random() - 0.5) * 0.0001;
    } else {
      // rise / fall: slight horizontal sway
      velocities[idx] += (Math.random() - 0.5) * 0.0002;
    }
  }

  particleSystem.geometry.attributes.position.needsUpdate = true;
}

export function disposeEffects() {
  if (particleSystem && sceneRef) {
    sceneRef.remove(particleSystem);
    particleSystem.geometry.dispose();
    particleSystem.material.dispose();
    particleSystem = null;
    particleData = null;
  }
}
