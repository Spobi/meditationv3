import * as THREE from 'three';
import { BOUNDS } from '../constants.js';

const SOUND_COOLDOWN = 45; // frames (~0.75s)
const MIN_SPEED      = 0.008; // kick balls that nearly stop back into motion

// Returns array of sound events: { idx, type: 'collision'|'bounce' }
export function updatePhysics(balls, frame, speed) {
  const soundEvents = [];

  balls.forEach((ball, i) => {
    if (ball.isDragged) return;

    if (speed > 0) {
      // No random wander — balls travel in straight lines between collisions.
      // If a ball nearly stops (e.g. after near-head-on exchange), kick it in a
      // fresh random direction so the scene stays alive without wobbling.
      if (ball.velocity.length() < MIN_SPEED * speed) {
        const angle = Math.random() * Math.PI * 2;
        const mag   = MIN_SPEED * 2 * speed;
        ball.velocity.set(Math.cos(angle) * mag, Math.sin(angle) * mag, 0);
      }

      // Speed cap scales with multiplier
      const maxSpeed = 0.04 * speed;
      if (ball.velocity.length() > maxSpeed) {
        ball.velocity.setLength(maxSpeed);
      }

      // Move — straight line
      ball.mesh.position.add(ball.velocity);

      // Negligible friction so balls maintain momentum between collisions
      ball.velocity.multiplyScalar(0.9998);
    }

    // Elastic wall bounce — use each ball's own radius so the surface hits the wall
    const p = ball.mesh.position;
    const v = ball.velocity;
    const r = ball.radius;
    let bounced = false;

    if (p.x >  BOUNDS.x - r)    { p.x =  BOUNDS.x - r;    v.x *= -1; bounced = true; }
    if (p.x < -BOUNDS.x + r)    { p.x = -BOUNDS.x + r;    v.x *= -1; bounced = true; }
    if (p.y >  BOUNDS.y[1] - r) { p.y =  BOUNDS.y[1] - r; v.y *= -1; bounced = true; }
    if (p.y <  BOUNDS.y[0] + r) { p.y =  BOUNDS.y[0] + r; v.y *= -1; bounced = true; }

    if (bounced && ball.velocity.length() > 0.008 && frame - ball.lastSoundFrame > SOUND_COOLDOWN) {
      soundEvents.push({ idx: i, type: 'bounce' });
      ball.lastSoundFrame = frame;
    }
  });

  // Ball-ball collisions — use per-ball radius for the contact threshold
  for (let i = 0; i < balls.length; i++) {
    for (let j = i + 1; j < balls.length; j++) {
      const ballA = balls[i];
      const ballB = balls[j];

      const diff    = ballA.mesh.position.clone().sub(ballB.mesh.position);
      const dist    = diff.length();
      const minDist = ballA.radius + ballB.radius;

      if (dist === 0) {
        ballA.mesh.position.x += 0.1;
        ballB.mesh.position.x -= 0.1;
        continue;
      }

      if (dist < minDist) {
        const overlap = minDist - dist;
        const axis    = diff.normalize();
        ballA.mesh.position.addScaledVector(axis,  overlap / 2);
        ballB.mesh.position.addScaledVector(axis, -overlap / 2);
        const relVel = ballA.velocity.dot(axis) - ballB.velocity.dot(axis);
        ballA.velocity.addScaledVector(axis, -relVel * 0.95);
        ballB.velocity.addScaledVector(axis,  relVel * 0.95);

        if (Math.abs(relVel) > 0.005) {
          if (frame - ballA.lastSoundFrame > SOUND_COOLDOWN) {
            soundEvents.push({ idx: i, type: 'collision' });
            ballA.lastSoundFrame = frame;
          }
          if (frame - ballB.lastSoundFrame > SOUND_COOLDOWN) {
            soundEvents.push({ idx: j, type: 'collision' });
            ballB.lastSoundFrame = frame;
          }
        }
      }
    }
  }

  return soundEvents;
}
