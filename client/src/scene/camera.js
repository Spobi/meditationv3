import * as THREE from 'three';

export function initCamera() {
  const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 4, 14);
  camera.lookAt(0, 3, 0);
  return camera;
}
