import * as THREE from 'three';
import { MOODS, NOTE_NAMES, BALL_RADIUS } from '../constants.js';

// Shared glow texture — created once
let glowTexture = null;

function getGlowTexture() {
  if (glowTexture) return glowTexture;
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255,255,255,0.9)');
  gradient.addColorStop(0.35, 'rgba(255,255,255,0.3)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  glowTexture = new THREE.CanvasTexture(canvas);
  return glowTexture;
}

function getInitialPositions(count) {
  const positions = [];
  const cols = Math.ceil(Math.sqrt(count));
  for (let i = 0; i < count; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    positions.push(new THREE.Vector3(
      (col / (cols - 1 || 1)) * 10 - 5,
      2 + Math.random() * 2,
      0  // all in the same plane for frequent collisions
    ));
  }
  return positions;
}

export function initBalls(scene, moodKey, count) {
  const mood = MOODS[moodKey];
  const positions = getInitialPositions(count);
  const labelsContainer = document.getElementById('labels');

  return positions.map((pos, i) => {
    const color = new THREE.Color(mood.colors[i % mood.colors.length]);

    // Each ball gets a random radius within ±30% of the base
    const radius = BALL_RADIUS * (0.7 + Math.random() * 0.6);

    const geometry = new THREE.SphereGeometry(radius, 32, 32);
    const material = new THREE.MeshStandardMaterial({
      color,
      emissive: new THREE.Color(0xffffff), // neutral white — all balls pulse equally
      emissiveIntensity: 0.04,             // barely there at rest; jumps on click
      metalness: 0.82,
      roughness: 0.12,
      envMapIntensity: 0.7,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(pos);
    scene.add(mesh);

    // Glow sprite — visual only, not raycasted
    const spriteMat = new THREE.SpriteMaterial({
      map: getGlowTexture(),
      color,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      opacity: 0.38,
    });
    const glow = new THREE.Sprite(spriteMat);
    const glowSize = radius * 4;
    glow.scale.set(glowSize, glowSize, 1);
    glow.position.copy(pos);
    scene.add(glow);

    // DOM label
    const label = document.createElement('div');
    label.className = 'ball-label';
    label.textContent = NOTE_NAMES[i % NOTE_NAMES.length];
    labelsContainer.appendChild(label);

    // Linear initial velocity — random direction, consistent speed
    const angle = Math.random() * Math.PI * 2;
    const mag   = 0.015 + Math.random() * 0.012;

    return {
      mesh,
      glow,
      label,
      radius,
      velocity: new THREE.Vector3(Math.cos(angle) * mag, Math.sin(angle) * mag, 0),
      noteIndex: i % 8,
      pulseTime: -9999,
      isDragged: false,
      lastSoundFrame: 0,
    };
  });
}

export function removeBall(scene, ball) {
  scene.remove(ball.mesh);
  scene.remove(ball.glow);
  ball.mesh.geometry.dispose();
  ball.mesh.material.dispose();
  ball.glow.material.dispose();
  if (ball.label && ball.label.parentNode) {
    ball.label.parentNode.removeChild(ball.label);
  }
}

export function updateBallColors(balls, moodKey) {
  const mood = MOODS[moodKey];
  balls.forEach((ball, i) => {
    const color = new THREE.Color(mood.colors[i % mood.colors.length]);
    ball.mesh.material.color.set(color);
    // emissive stays white — keeps pulse brightness consistent across all ball colors
    ball.glow.material.color.set(color);
  });
}

export function updateBalls(balls, timestamp, camera, renderer, showNotes) {
  balls.forEach(ball => {
    // Sync glow to mesh
    ball.glow.position.copy(ball.mesh.position);

    // Pulse: white flash decays from 1.0 back to 0.04 over 0.5s
    const t = (timestamp - ball.pulseTime) / 1000;
    ball.mesh.material.emissiveIntensity = t < 0.5
      ? 1.0 - (t / 0.5) * 0.96
      : 0.04;

    // Note label positioning
    if (ball.label) {
      if (showNotes) {
        const proj = ball.mesh.position.clone().project(camera);
        const x = (proj.x + 1) / 2 * renderer.domElement.clientWidth;
        const y = (-proj.y + 1) / 2 * renderer.domElement.clientHeight;
        ball.label.style.left = x + 'px';
        ball.label.style.top = y + 'px';
        ball.label.classList.add('visible');
      } else {
        ball.label.classList.remove('visible');
      }
    }
  });
}
