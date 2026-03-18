// Meditative agent — improvises slow melodies on the pentatonic scale.
// Phrase-based: 4–7 notes with a gentle contour, then a breath rest between phrases.
// Inter-note gap always ≥ 300ms per audio design spec.

export class MeditationAgent {
  constructor() {
    this.active    = false;
    this._timerId  = null;
    this._degree   = 3;      // current scale position (0–7), starts on G4
    this._phrase   = [];
    this._idx      = 0;
    this._tempo    = 0.7;    // < 1 = slower/more meditative, > 1 = faster
    this._onNote   = null;
  }

  start(onNote, tempo) {
    if (this.active) return;
    this.active   = true;
    this._onNote  = onNote;
    this._tempo   = tempo ?? this._tempo;
    this._buildPhrase();
    this._next();
  }

  stop() {
    this.active = false;
    clearTimeout(this._timerId);
    this._timerId = null;
  }

  setTempo(t) {
    this._tempo = t;
  }

  // ─── Phrase generation ───────────────────────────────────────────────────────
  // Phrases move mostly stepwise (sounds melodic) with occasional leaps and
  // repeats (adds rhythmic interest). Direction gives each phrase an arc shape.
  _buildPhrase() {
    const len = 4 + Math.floor(Math.random() * 4); // 4–7 notes
    const dir = Math.random() < 0.5 ? 1 : -1;      // ascending or descending arc
    this._phrase = [];
    let d = this._degree;

    for (let i = 0; i < len; i++) {
      this._phrase.push(d);
      const r = Math.random();
      if      (r < 0.38) d += dir;        // step in arc direction
      else if (r < 0.58) d += 0;          // repeat — rhythmic anchor
      else if (r < 0.73) d -= dir;        // step back — creates a wave
      else if (r < 0.88) d += dir * 2;    // small leap for colour
      else               d -= dir;        // contrary motion for resolution
      d = Math.max(0, Math.min(7, d));
    }

    this._degree = d; // carry end position into next phrase for continuity
    this._idx    = 0;
  }

  // ─── Scheduling ──────────────────────────────────────────────────────────────
  _next() {
    if (!this.active) return;

    if (this._idx >= this._phrase.length) {
      // Breath rest between phrases: 1.5–4s (scaled by tempo)
      const rest = Math.round((1500 + Math.random() * 2500) / this._tempo);
      this._buildPhrase();
      this._timerId = setTimeout(() => this._next(), rest);
      return;
    }

    const degree = this._phrase[this._idx++];
    this._onNote(degree);

    // Inter-note gap: 500–1400ms, scaled by tempo, never below 300ms
    const gap = Math.max(300, Math.round((500 + Math.random() * 900) / this._tempo));
    this._timerId = setTimeout(() => this._next(), gap);
  }
}
