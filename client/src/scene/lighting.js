import * as THREE from 'three';

export function initLighting(scene) {
  const ambient = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambient);

  const pointLight = new THREE.PointLight(0xffffff, 1.5, 30);
  pointLight.position.set(0, 8, 6);
  scene.add(pointLight);
}
