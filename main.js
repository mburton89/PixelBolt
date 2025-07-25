// main.js: Infinite Lightning Platformer with Fractal Lightning & Platform Lighting

// Grab canvas and UI
document.title = "Lightning Platformer";
const canvas  = document.getElementById("display");
const ctx     = canvas.getContext("2d");
const W       = canvas.width;
const H       = canvas.height;
const scoreEl = document.getElementById('timer');

// Lightning parameters
const DECAY            = 0.82;
const BOLT_CHANCE      = 0.03;    // spawn probability per frame
const BOLT_SPEED       = 25;
const MAX_ACTIVE_BOLTS = 25;      // allow multiple simultaneous bolts
const BOLT_BRANCH_BASE = 0.02;
const BRANCH_DECAY      = 2.5;
const BRANCH_MIN_CHANCE = 0.002;
const SEG_MIN_LEN       = 10;
const SEG_MAX_LEN       = 30;
const MAX_KINK          = 2;
const KINK_CHANCE       = 0.1;

// Frame buffer and bolt list
const buffer = new Float32Array(W * H);
let activeBolts = [];

// Score
let score = 0;

// Input state
const keys = { left: false, right: false };
window.addEventListener('keydown', e => {
  if (e.code === 'ArrowLeft') keys.left = true;
  if (e.code === 'ArrowRight') keys.right = true;
});
window.addEventListener('keyup', e => {
  if (e.code === 'ArrowLeft') keys.left = false;
  if (e.code === 'ArrowRight') keys.right = false;
});

// Frame rate control
let lastTime = 0;
const FRAME_INT = 1000 / 30;

// Utility
function rand(n) {
  return Math.floor(Math.random() * n);
}

// ----- Bolt Class -----
class Bolt {
  constructor(x = rand(W), y = 0, depth = 0,
              segLen = SEG_MIN_LEN + rand(SEG_MAX_LEN - SEG_MIN_LEN),
              dx = [-1, 0, 1][rand(3)]) {
    this.x = x;
    this.y = y;
    this.depth = depth;
    this.segLen = segLen;
    this.dx = dx;
  }

  step() {
    if (Math.random() < KINK_CHANCE) {
      this.x += rand(2 * MAX_KINK + 1) - MAX_KINK;
    }
    // bias movement
    this.x = Math.max(0, Math.min(W - 1, this.x + this.dx));
    if (--this.segLen <= 0) {
      this.segLen = SEG_MIN_LEN + rand(SEG_MAX_LEN - SEG_MIN_LEN);
      this.dx = [-1, 0, 1][rand(3)];
    }
    this.y++;
  }
}

// ----- Platform Class -----
class Platform {
  constructor(x, y, w = 32, h = 6) {
    this.x = x;
    this.y = y;
    this.w = w;
    this.h = h;
  }
  // highlight entire platform block when hit
  lightAt(bx, by) {
    if (by >= this.y - this.h + 1 && by <= this.y && bx >= this.x && bx < this.x + this.w) {
      for (let dx = 0; dx < this.w; dx++) {
        for (let dy = 0; dy < this.h; dy++) {
          const px = this.x + dx;
          const py = this.y - dy;
          if (px >= 0 && px < W && py >= 0 && py < H) {
            buffer[py * W + px] = 1;
          }
        }
      }
    }
  }
  // collision check for player landing
  collides(player) {
    return player.vy > 0 &&
      player.x + player.w > this.x && player.x < this.x + this.w &&
      player.prevY + player.h <= this.y && player.y + player.h >= this.y;
  }
}

// ----- Lightning Display -----
class LightningDisplay {
  constructor(ctx) {
    this.ctx = ctx;
    this.platforms = [];
    this.resetPlatforms();
  }

  resetPlatforms(baseY = H - 1) {
    this.platforms = [];
    const specs = [ {f:1.0, w:W}, {f:0.6, w:32}, {f:0.3, w:32} ];
    specs.forEach(spec => {
      const y = Math.floor(baseY * spec.f);
      const pw = spec.w;
      let x = 0;
      if (spec.f !== 1.0) {
        const minX = Math.floor(0.25 * W);
        const maxX = Math.floor(0.75 * W) - pw;
        x = rand(maxX - minX + 1) + minX;
      }
      this.platforms.push(new Platform(x, y, pw, 6));
    });
  }

  fade() {
    for (let i = 0; i < buffer.length; i++) {
      buffer[i] *= DECAY;
    }
  }

  spawnBolts() {
    if (activeBolts.length < MAX_ACTIVE_BOLTS && Math.random() < BOLT_CHANCE) {
      activeBolts.push(new Bolt());
    }
  }

  updateBolts() {
    activeBolts.forEach((b, idx) => {
      for (let s = 0; s < BOLT_SPEED; s++) {
        if (b.y >= H) break;
        // draw main channel
        buffer[b.y * W + b.x] = 1 / (b.depth + 1);
        // light platforms under bolt
        this.platforms.forEach(p => p.lightAt(b.x, b.y));
        // expose scene etc if needed...
        // branching logic
        let branchProb = BOLT_BRANCH_BASE * Math.exp(-BRANCH_DECAY * b.depth) * (1 - b.y / H);
        branchProb = Math.max(branchProb, BRANCH_MIN_CHANCE);
        if (Math.random() < branchProb && activeBolts.length < MAX_ACTIVE_BOLTS) {
          activeBolts.push(new Bolt(b.x, b.y, b.depth + 1, b.segLen, b.dx));
        }
        b.step();
      }
      if (b.y >= H) activeBolts.splice(idx, 1);
    });
  }

  render() {
    const img = this.ctx.createImageData(W, H);
    for (let i = 0; i < buffer.length; i++) {
      const v = Math.min(255, Math.floor(buffer[i] * 255));
      img.data[4 * i] = v;
      img.data[4 * i + 1] = v;
      img.data[4 * i + 2] = v;
      img.data[4 * i + 3] = 255;
    }
    this.ctx.putImageData(img, 0, 0);
  }
}

// ----- Character Class -----
class Character {
  constructor() {
    this.w = 3;
    this.h = 3;
    this.x = W / 2;
    this.y = 0;
    this.prevY = 0;
    this.vy = 0;
  }

  handleInput() {
    if (keys.left) this.x -= 4;
    if (keys.right) this.x += 4;
    this.x = Math.max(0, Math.min(W - this.w, this.x));
  }

  update(display) {
    this.prevY = this.y;
    this.vy += 1;
    this.y += this.vy;
    let landed = null;
    display.platforms.forEach(p => {
      if (p.collides(this)) {
        landed = p;
        this.y = p.y - this.h;
        this.vy = -13.5;
      }
    });
    if (landed) {
      score++;
      scoreEl.textContent = score;
      const topY = Math.min(...display.platforms.map(p => p.y));
      if (landed.y === topY) {
        const shift = H - landed.y - landed.h;
        display.platforms.forEach(p => p.y += shift);
        this.y += shift;
        buffer.fill(0);
        activeBolts = [];
        display.resetPlatforms(landed.y);
      }
    }
  }

  draw() {
    for (let dx = 0; dx < this.w; dx++) {
      for (let dy = 0; dy < this.h; dy++) {
        const px = (this.x + dx) | 0;
        const py = (this.y + dy) | 0;
        if (px >= 0 && px < W && py >= 0 && py < H) {
          buffer[py * W + px] = 1;
        }
      }
    }
  }
}

// ----- Initialization & Loop -----
const display = new LightningDisplay(ctx);
const player = new Character();
player.y = display.platforms[0].y - player.h;
scoreEl.textContent = score;

function loop(time) {
  if (time - lastTime < FRAME_INT) return requestAnimationFrame(loop);
  lastTime = time;
  display.fade();
  display.spawnBolts();
  display.updateBolts();
  player.handleInput();
  player.update(display);
  player.draw();
  display.render();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
