# Inner Weather — Custom Effect Authoring Guide

Inner Weather lets you write your own **typography animations** without touching the source code.  
Add them inside the app: `Type tab → + Custom effect`.

Each user has their own slot — effects are saved per-browser in `localStorage`, so on Vercel every visitor gets their own private studio.

---

## 1. What you are authoring

A **custom effect** is a tiny JavaScript function that runs **once per spawned word, per frame**, and tells Inner Weather how that word should look right now.

Your function receives two arguments:

```js
function (word, ctx) {
  // ...
  return { alpha, dx, dy, scale, rot };
}
```

You write **only the body** in the textarea — the function shell is wrapped for you.

---

## 2. `word` — the spawn being rendered

Each visible word on screen is a `word` object. Useful fields:

| field   | type   | meaning |
|---------|--------|---------|
| `text`  | string | the rendered phrase, e.g. `"breathe"` or `"輕呼吸"` |
| `x, y`  | number | center position (canvas pixels) — modify via `dx/dy` instead of writing here |
| `size`  | number | font size in pixels |
| `color` | string | CSS color string |
| `born`  | number | spawn time, in seconds |
| `life`  | number | total lifetime, in seconds |
| `phase` | number | per-spawn random phase `0..2π` — use to **desynchronize** your effect across words |
| `align` | string | `"left" | "center" | "right"` |
| `vx, vy`| number | velocity (used by `rain` / `drift` — usually 0) |

You **may mutate** `vx`, `vy` and other fields, but don't reassign `x`, `y`, `size`, etc. — use the return-value `dx/dy/scale` overrides.

---

## 3. `ctx` — global animation state

| field     | type   | meaning |
|-----------|--------|---------|
| `t`       | number | seconds since page load |
| `sp`      | number | the **Speed slider** value (multiply your time-based math by this) |
| `dts`     | number | delta-time since last frame, in seconds |
| `amp`     | number | reserved (currently always `1`) |
| `spread`  | number | character/word phase-spread, `0..1` |
| `W, H`    | number | canvas size in CSS px |
| `CX, CY`  | number | canvas center |

Always multiply time-derived oscillations by `ctx.sp` so the **Speed** slider continues to work.

---

## 4. What to return

Return an object with any subset of these keys (all optional):

| key     | type   | default | effect |
|---------|--------|---------|--------|
| `alpha` | 0..1   | `1`     | multiplied into the spawn's existing fade — return `< 1` to dim it |
| `dx`    | px     | `0`     | horizontal offset from the spawn's anchor |
| `dy`    | px     | `0`     | vertical offset |
| `scale` | number | `1`     | size multiplier (use for pulse / pop) |
| `rot`   | radians| `0`     | rotation around the anchor |

> Skip a key to leave that aspect alone.

---

## 5. Examples

### Soft breathing — opacity only

```js
return {
  alpha: 0.5 + 0.5 * Math.sin(ctx.t * 2 * ctx.sp + word.phase)
};
```

### Sine wave bobbing

```js
return {
  dy: Math.sin(ctx.t * 1.6 * ctx.sp + word.phase) * word.size * 0.12
};
```

### Spiral around the canvas center

```js
const a = ctx.t * 0.6 * ctx.sp + word.phase;
const r = 80 + 40 * Math.sin(ctx.t * 0.4 * ctx.sp + word.phase);
return {
  dx: Math.cos(a) * r,
  dy: Math.sin(a) * r,
  rot: a * 0.5
};
```

### Jitter glitch

```js
const j = (Math.random() - 0.5) * word.size * 0.12;
return {
  dx: j,
  dy: (Math.random() - 0.5) * word.size * 0.08,
  alpha: 0.6 + Math.random() * 0.4
};
```

### Pulse + slow drift

```js
const scale = 1 + 0.25 * Math.sin(ctx.t * 3 * ctx.sp + word.phase);
return {
  scale,
  dy: -ctx.t * 8 * ctx.sp,      // float up
  alpha: 0.7
};
```

### Age-aware pop-in (use the spawn's `life` and start time)

```js
const age = ctx.t - word.born;
const t01 = age / word.life;
const easeOut = 1 - Math.pow(1 - Math.min(1, t01 * 4), 3);
return {
  scale: 0.4 + 0.6 * easeOut,
  alpha: easeOut
};
```

---

## 6. Tips

- **Always include `word.phase`** somewhere in your math, otherwise every word will move in lockstep.
- **Multiply time by `ctx.sp`** so the global Speed slider keeps working.
- If your effect is mostly position-based, set `dx/dy` and **don't** also mutate `word.x` — pick one source of truth.
- Compile errors land in the browser console; runtime errors are logged once per effect (so you don't get flooded).
- Returning `null` / `undefined` means "use the default behavior" (basically static text).
- Saved effects appear at the bottom of the **Animation** grid in the Type tab — pick them like any built-in.
- Use **Export all** in Compose to back up your effects + presets to a JSON file you can re-import later or share.

---

## 7. Limits & safety

- Your code runs in **your own browser only** — Inner Weather has no backend. It's not sent anywhere unless you explicitly export the JSON.
- Each effect is compiled with `new Function(body)` — treat it like the JS console: don't paste untrusted code from strangers.
- Heavy effects can drop the frame rate. If a custom effect tanks performance, switch animation to a built-in and delete it.

---

Have fun. Most VJ-style behaviors are just **two trig functions and a phase offset**.
