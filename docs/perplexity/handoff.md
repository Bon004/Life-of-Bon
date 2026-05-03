# StoryForge — Perplexity Handoff
## Session: 2026-05-02 | Particle Orb Fix — Flat Disc → True 3D Sphere

*This file is the live current-session context. For stable project reference, see `context.md` in this same folder.*

---

## Snapshot

| | |
|---|---|
| **Session date** | 2026-05-02 |
| **Focus** | Fix the V1 Particle Orb in `Sage Sidebar.html` — currently renders as a flat disc, should be a 3D sphere |
| **Code changed** | Not yet — plan written, awaiting Perplexity review |
| **Files touched** | plan file only |
| **context.md version** | Last updated: 2026-05-02 |
| **Top questions** | 1. Is the rotation matrix order (Y spin → X tilt) correct for the intended "globe from slightly above" look? 2. Is a `fov` of `size * 3` a good perspective depth, or will it look too foreshortened/flat? 3. Any concerns with depth-sorting 520 particles every frame via `.sort()` — performance risk on canvas? |

---

## Changes Since Last Session

- **Previous session (2026-05-01):** Constellation animations, Sage editor context fix, voice mic fixes, 3 chat bug fixes — all uncommitted
- **This session:** User noticed that V1 (Particle Orb) in the `Sage Sidebar.html` design mockup renders as a flat disc, not a 3D sphere. Plan written to fix it.

---

## Plan / What We're Doing

**Goal:** Rewrite the `ParticleOrb` canvas component in `Sage Sidebar.html` so it renders a convincing 3D rotating sphere of particles — like the Perplexity orb — instead of the flat ellipse it currently produces.

---

### Root Cause (confirmed from code)

The current `ParticleOrb` in `Sage Sidebar.html` has five compounding bugs:

| Bug | Location | Effect |
|-----|---------|--------|
| Y squash `* 0.55` at init | `y: cy + rr * Math.sin(phi) * Math.sin(theta) * 0.55` | Collapses sphere into flat disc at rest |
| Y drift squash | `dy = Math.sin(p.angle) * 0.18` (vs dx = 0.3) | Particles move mostly horizontally — reinforces disc |
| No rotation matrix | Particles drift randomly in 2D, no axis of rotation | No sense of volume or spin |
| No perspective projection | All particles render at same size regardless of Z | Back and front look identical |
| No depth sorting | `pts.forEach` draws in array order, not Z order | Back particles randomly overdraw front |

---

### Fix: True 3D Sphere with Perspective Projection

**Strategy:** Replace the current random-drift Cartesian system with a proper spherical coordinate system. Each particle has a fixed position on the sphere surface (theta/phi angles). A global Y-axis rotation spins the sphere each frame. A fixed X-axis tilt of ~17° makes the top of the sphere visible (so it reads as a globe, not a ring). Perspective projection scales near-particles larger than far-particles.

---

### Step-by-Step Implementation

**Step 1 — Particle storage (spherical angles, not Cartesian)**

```js
const pts = Array.from({ length: NUM }, () => ({
  theta: Math.random() * Math.PI * 2,          // longitude
  phi: Math.acos(2 * Math.random() - 1),       // latitude (uniform sphere distribution)
  speed: (Math.random() - 0.5) * 0.0006,       // individual slow drift on theta
  size: 0.7 + Math.random() * 1.1,
}));
```

No `x/y/z` stored at init — they're computed per-frame from the angles.

---

**Step 2 — Global rotation state**

```js
let rotY = 0;                   // Y-axis rotation accumulator
const TILT_X = 0.3;             // ~17° tilt so top of sphere is visible
const ROT_SPEED = 0.004;        // revolution speed
```

---

**Step 3 — Per-frame: spherical → 3D → rotate → tilt → perspective**

```js
rotY += ROT_SPEED;

// Project each particle to screen
pts.forEach(p => {
  p.theta += p.speed;   // individual drift

  // Spherical → 3D Cartesian
  const x3 = r * Math.sin(p.phi) * Math.cos(p.theta);
  const y3 = r * Math.cos(p.phi);
  const z3 = r * Math.sin(p.phi) * Math.sin(p.theta);

  // Y-axis rotation (spin)
  const x4 =  x3 * Math.cos(rotY) - z3 * Math.sin(rotY);
  const y4 =  y3;
  const z4 =  x3 * Math.sin(rotY) + z3 * Math.cos(rotY);

  // X-axis tilt (fixed, so we see top of sphere)
  p.sx_3d = x4;
  p.sy_3d = y4 * Math.cos(TILT_X) - z4 * Math.sin(TILT_X);
  p.sz    = y4 * Math.sin(TILT_X) + z4 * Math.cos(TILT_X);

  // Perspective projection
  const fov   = size * 3;
  const scale = fov / (fov + p.sz);
  p.sx    = cx + p.sx_3d * scale;
  p.sy    = cy + p.sy_3d * scale;
  p.scale = scale;    // for size + alpha
});
```

---

**Step 4 — Depth sort**

```js
pts.sort((a, b) => a.sz - b.sz);   // back to front
```

Back particles drawn first, front particles on top. Gives correct occlusion.

---

**Step 5 — Draw with depth-based visual weight**

```js
pts.forEach(p => {
  // Normalised depth: 0 = far back, 1 = closest
  const depth = (p.scale - (fov / (fov + r))) / ((fov / (fov - r)) - (fov / (fov + r)));
  const alpha  = 0.25 + depth * 0.65;              // back: 25% → front: 90%
  const dotR   = p.size * (0.6 + depth * 0.4);     // back: smaller → front: larger
  const bright = Math.round(180 + depth * 60);

  ctx.beginPath();
  ctx.arc(p.sx, p.sy, dotR, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(${bright}, ${bright + 5}, 240, ${alpha})`;
  ctx.fill();
});
```

---

**Step 6 — Ambient glow (unchanged from current)**

The radial gradient glow behind the orb stays exactly as-is — it's fine and provides the soft halo.

---

### What stays the same

- Canvas DPR scaling, size/cx/cy setup — unchanged
- Ambient glow radial gradient — unchanged
- Particle count (520) — unchanged
- `cancelAnimationFrame` cleanup — unchanged

---

### Files changed

| File | Change |
|------|--------|
| `Sage Sidebar.html` | Rewrite `ParticleOrb` `useEffect` body — Steps 1–5 above replace the current init + draw logic |

No other files touched.

---

## Current Project State

- **Last commit:** `a0e4975` — voice mic: text preservation + 10s inactivity timer
- **Uncommitted changes:** `app.js`, `index.html`, `style.css`, `CLAUDE.md`, session report (all from 2026-05-01)
- **Active sprint:** Particle Orb fix — plan ready, awaiting Perplexity review

---

## Open Decisions

- **Rotation order:** The plan applies Y-axis rotation first, then a fixed X-axis tilt. Alternative: apply a combined rotation matrix or use quaternions. Is the simpler two-matrix approach good enough, or will gimbal-lock cause visible snapping at any angle?
- **FOV depth value:** `size * 3` is a moderate perspective depth. Too small = extreme fisheye distortion; too large = flat orthographic look (back to disc). Is 3× a good default, or should we tune it?
- **Depth sort cost:** `.sort()` on 520 particles every frame at 60fps. On modern desktop this is negligible. Worth flagging if this design is ever used on mobile.

---

## Risks / Unknowns

- **After Y rotation + X tilt, the tilt formula may be slightly wrong.** The current plan applies the X tilt to `(x4, y4, z4)` — the post-Y-rotation frame. This is correct for a "tilt toward viewer" effect, but the exact formula for `sy_3d`/`sz` uses a simplified rotation that assumes we're rotating around world X after world Y. Perplexity should confirm whether this produces the intended tilt or creates a drift artifact.
- **The ambient glow is centred at `(cx, cy)` with a fixed radius.** As the sphere rotates, the particle cloud stays centred, so the glow remains correct. No issue here.
- **Individual `speed` drift on `theta`:** With very slow speeds (±0.0006), individual stars will appear to move slightly within the sphere as it rotates. This gives organic life. If it looks noisy, speed can be set to 0 for a rigid sphere.

---

## What We Want From You (Perplexity)

1. **Rotation matrix order** — Is applying Y-rotation then a fixed X-axis tilt (in the Y-rotated frame) the correct way to produce a "globe tilted toward viewer" look, or should the tilt be applied in world space before the Y rotation? Will the current order cause any visible drift or wobble?
2. **FOV value** — Is `fov = size * 3` a reasonable perspective depth for a ~160px canvas orb? What range gives the most convincing sphere without excessive fisheye distortion?
3. **Depth normalization formula** — The `depth` calculation in Step 5 uses `(p.scale - minScale) / (maxScale - minScale)`. Is this the right way to get a linear 0–1 depth from the perspective scale value, or is there a simpler expression?
4. **Performance: `.sort()` on 520 items per frame** — Any concern about this on lower-end hardware? If yes, what's the recommended mitigation (insertion sort? skip sorting every Nth frame)?

---

## Next Likely Steps

- Get Perplexity review + any corrections to the rotation matrix or FOV
- Delegate implementation to ui-agent
- Open `Sage Sidebar.html` in browser and verify V1 looks like a 3D sphere
- If approved, port the same logic to `app.js` `renderOrb()` (separate decision)
- Commit all pending changes

---

*Generated by Claude Code | StoryForge | 2026-05-02*
