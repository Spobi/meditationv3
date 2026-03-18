// C-major pentatonic: C4 through E5
export const SCALE = [261.63, 293.66, 329.63, 392.00, 440.00, 523.25, 587.33, 659.25];

export const NOTE_NAMES = ['C4', 'D4', 'E4', 'G4', 'A4', 'C5', 'D5', 'E5'];

export const MOODS = {
  zen:    { label: 'Zen Bells 🔔',   bgColor: '#0d0820', fogColor: '#1a0f3a', colors: ['#9b59b6','#8e44ad','#a569bd','#7d3c98','#c39bd3'], bloomStrength: 0.8 },
  focus:  { label: 'Deep Focus 🧘',  bgColor: '#1a0d00', fogColor: '#2d1800', colors: ['#f39c12','#e67e22','#f1c40f','#d4ac0d','#fad7a0'], bloomStrength: 0.7 },
  sleep:  { label: 'Sleep Drift 🌙', bgColor: '#020510', fogColor: '#05091a', colors: ['#1a3a6b','#2e4a8a','#4a6fa5','#7fb3d3','#aed6f1'], bloomStrength: 0.5 },
  water:  { label: 'Water Drops 💧', bgColor: '#001a1a', fogColor: '#002222', colors: ['#1abc9c','#17a589','#48c9b0','#76d7c4','#a3e4d7'], bloomStrength: 0.8 },
  cosmic: { label: 'Cosmic Calm 🌌', bgColor: '#020008', fogColor: '#080015', colors: ['#5b2c8d','#7d3c98','#2980b9','#85c1e9','#d7bde2'], bloomStrength: 1.0 },
  inferno:{ label: 'Inferno 🔥',     bgColor: '#100000', fogColor: '#1a0000', colors: ['#e74c3c','#c0392b','#e67e22','#f39c12','#f1948a'], bloomStrength: 1.5 },
};

export const INSTRUMENTS = {
  sineBells:    { label: 'Sine Bells' },
  himalayanBowl:{ label: 'Himalayan Bowl' },
  crystalBowl:  { label: 'Crystal Bowl' },
  marimba:      { label: 'Marimba' },
  hangDrum:     { label: 'Hang Drum' },
};

export const BOUNDS = { x: 7, y: [0.8, 5.5], z: 5 };
export const BALL_RADIUS = 0.99; // 0.6 × 1.65
