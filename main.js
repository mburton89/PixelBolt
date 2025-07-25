// main.js: Infinite Lightning Platformer with Shrinking Platforms & Score Display

// Grab canvas and UI
document.title = "Lightning Platformer";
const canvas = document.getElementById("display");
const ctx = canvas.getContext("2d");
const W = canvas.width;
const H = canvas.height;
const scoreEl = document.getElementById("timer");
const messageEl = document.getElementById("message");

// Lightning parameters
const DECAY = 0.82;
const BOLT_CHANCE = 0.09;
const BOLT_SPEED = 25;
const MAX_ACTIVE_BOLTS = 25;
const BOLT_BRANCH_BASE = 0.02;
const BRANCH_DECAY = 2.5;
const BRANCH_MIN_CHANCE = 0.002;
const SEG_MIN_LEN = 10;
const SEG_MAX_LEN = 30;
const MAX_KINK = 2;
const KINK_CHANCE = 0.1;

// Frame buffer and bolt list
const buffer = new Float32Array(W * H);
let activeBolts = [];

// Sound effects
const jumpSound = new Audio('jump.wav');
jumpSound.preload = 'auto';
const thunderSounds = [ new Audio('thunder-0.wav') ];
thunderSounds[0].preload = 'auto';

// Game state
let score = 0;
let firstRoom = true;
let running = true;

// Input state
const keys = { left: false, right: false };
window.addEventListener("keydown", e => {
  if (e.code === "ArrowLeft") keys.left = true;
  if (e.code === "ArrowRight") keys.right = true;
});
window.addEventListener("keyup", e => {
  if (e.code === "ArrowLeft") keys.left = false;
  if (e.code === "ArrowRight") keys.right = false;
});

// Frame rate
let lastTime = 0;
const FRAME_INT = 1000 / 30;

// Utility
function rand(n) {
  return Math.floor(Math.random() * n);
}

// ----- Bolt Class -----
class Bolt {
  constructor({ x = rand(W), y = 0, depth = 0,
                segLen = SEG_MIN_LEN + rand(SEG_MAX_LEN - SEG_MIN_LEN),
                dx = [-1, 0, 1][rand(3)] } = {}) {
    this.x = x; this.y = y; this.depth = depth;
    this.segLen = segLen; this.dx = dx;
  }
  step() {
    if (Math.random() < KINK_CHANCE) this.x += rand(2 * MAX_KINK + 1) - MAX_KINK;
    this.x = Math.max(0, Math.min(W - 1, this.x + this.dx));
    if (--this.segLen <= 0) {
      this.segLen = SEG_MIN_LEN + rand(SEG_MAX_LEN - SEG_MIN_LEN);
      this.dx = [-1, 0, 1][rand(3)];
    }
    this.y++;
  }
}

// ------- Tree Class -------
class Tree {
  constructor(x, baseY) {
    this.pixels = [];
    const trunkHeight = 8, trunkWidth = 2;
    for (let dx = -Math.floor(trunkWidth/2); dx <= Math.floor(trunkWidth/2); dx++) {
      for (let dy = 0; dy < trunkHeight; dy++) {
        const px = x + dx, py = baseY - dy;
        if (px >= 0 && px < W && py >= 0 && py < H) this.pixels.push([px, py]);
      }
    }
    const radius = 6, centerY = baseY - trunkHeight;
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        if (dx*dx + dy*dy <= radius*radius) {
          const px = x + dx, py = centerY + dy;
          if (px >= 0 && px < W && py >= 0 && py < H) this.pixels.push([px, py]);
        }
      }
    }
  }
  checkAndLight(bx, by) {
    for (const [tx, ty] of this.pixels) {
      if (tx === bx && ty === by) {
        this.pixels.forEach(([lx, ly]) => buffer[ly * W + lx] = 1);
        return;
      }
    }
  }
}

// ------- Cloud Class -------
class Cloud {
  constructor(cx, cy) {
    this.pixels = [];
    const radii = [5, 7, 5], offsets = [-6, 0, 6];
    radii.forEach((r, i) => {
      const ox = offsets[i];
      for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
        if (dx*dx + dy*dy <= r*r) {
          const px = cx + ox + dx, py = cy + dy;
          if (px >= 0 && px < W && py >= 0 && py < H) this.pixels.push([px, py]);
        }
      }
    });
  }
  checkAndLight(bx, by) {
    for (const [cx, cy] of this.pixels) {
      if (cx === bx && cy === by) {
        this.pixels.forEach(([lx, ly]) => buffer[ly * W + lx] = 1);
        return;
      }
    }
  }
}

// ----- Platform Class -----
class Platform {
  constructor(x, y, w = 32, h = 6) {
    this.x = x; this.y = y; this.w = w; this.h = h;
    this.scored = false;
  }
  lightAt(bx, by) {
    if (by >= this.y - this.h + 1 && by <= this.y && bx >= this.x && bx < this.x + this.w) {
      for (let dx = 0; dx < this.w; dx++) {
        for (let dy = 0; dy < this.h; dy++) {
          const px = this.x + dx, py = this.y - dy;
          if (px >= 0 && px < W && py >= 0 && py < H) buffer[py * W + px] = 1;
        }
      }
    }
  }
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
    // set up scene elements
    this.trees = [];
    const treeCount = 4;
    for (let i = 0; i < treeCount; i++) {
      const x = Math.floor((i + 1) * W / (treeCount + 1));
      this.trees.push(new Tree(x, H - 1));
    }
    this.clouds = [];
    const cloudCount = 3;
    for (let i = 0; i < cloudCount; i++) {
      const cx = rand(W);
      const cy = Math.floor(H / 5);
      this.clouds.push(new Cloud(cx, cy));
    }
    this.platforms = [];
    this.nextWidth = 32;  // dynamic width starts at 32 after first room
    this.resetPlatforms(H - 1, null);
  }

  resetPlatforms(baseY = H - 1, playerX = null) {
    this.platforms = [];
    const minWidth = 6;

    // bottom platform
    let bw = firstRoom ? W : this.nextWidth;
    let bh = firstRoom ? 1 : 6;
    let bx = 0;
    if (!firstRoom && playerX != null) {
      const centerX = playerX + 1.5;
      bx = Math.round(centerX - bw / 2);
      bx = Math.max(0, Math.min(W - bw, bx));
    }
    const bottom = new Platform(bx, baseY, bw, bh);
    if (firstRoom) bottom.scored = true;
    this.platforms.push(bottom);

    // update nextWidth for subsequent rooms
    if (firstRoom) this.nextWidth = 32;
    else this.nextWidth = Math.max(this.nextWidth - 1, minWidth);

    // two platforms above at 60% and 30% heights
    let prev = this.nextWidth;
    [0.6, 0.3].forEach(frac => {
      const y = Math.floor(baseY * frac);
      const w = Math.max(prev - 1, minWidth);
      const h = 6;
      const minX = Math.floor(0.25 * W);
      const maxX = Math.floor(0.75 * W) - w;
      const x = rand(maxX - minX + 1) + minX;
      this.platforms.push(new Platform(x, y, w, h));
      prev = w;
    });
  }

  fade() {
    for (let i = 0; i < buffer.length; i++) buffer[i] *= DECAY;
  }

  spawnBolts() {
    if (activeBolts.length < MAX_ACTIVE_BOLTS && Math.random() < BOLT_CHANCE) {
      activeBolts.push(new Bolt());
    }
  }

  updateBolts() {
  for (let i = activeBolts.length - 1; i >= 0; i--) {
    const b = activeBolts[i];
    for (let s = 0; s < BOLT_SPEED; s++) {
      if (b.y >= H) break;
      // draw bolt pixel
      buffer[b.y * W + b.x] = 1 / (b.depth + 1);
      // light scene
      if (firstRoom) this.trees.forEach(t => t.checkAndLight(b.x, b.y));
      this.clouds.forEach(c => c.checkAndLight(b.x, b.y));
      this.platforms.forEach(p => {
        const pyStart = p.y - p.h + 1;
        if (b.y >= pyStart && b.y <= p.y && b.x >= p.x && b.x < p.x + p.w) {
          p.lightAt(b.x, b.y);
          // play thunder sound once per intersection
          const t = thunderSounds[0];
          if (t.paused) {
            t.playbackRate = 0.5 + Math.random() * 1.0;
            t.currentTime = 0;
            t.play();
          }
        }
      });
      // branching logic
      let bp = BOLT_BRANCH_BASE * Math.exp(-BRANCH_DECAY * b.depth) * (1 - b.y / H);
      bp = Math.max(bp, BRANCH_MIN_CHANCE);
      if (Math.random() < bp && activeBolts.length < MAX_ACTIVE_BOLTS) {
        activeBolts.push(new Bolt({ x: b.x, y: b.y, depth: b.depth + 1, segLen: b.segLen, dx: b.dx }));
      }
      b.step();
    }
    if (b.y >= H) activeBolts.splice(i, 1);
  }
}

  render() {
    if (firstRoom) {
      for (let x = 0; x < W; x++) buffer[(H - 1) * W + x] = 1;
    }
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
  constructor() { this.w = 3; this.h = 3; this.x = W / 2; this.y = 0; this.prevY = 0; this.vy = 0; }
  handleInput() { if (keys.left) this.x -= 7; if (keys.right) this.x += 7; this.x = Math.max(0, Math.min(W - this.w, this.x)); }
  update(display) {
    this.prevY = this.y; this.vy += 1; this.y += this.vy;
    let landed = null;
    display.platforms.forEach(p => { if (p.collides(this)) { landed = p; this.y = p.y - this.h; this.vy = -13.6;
        // play jump sound with random pitch
        jumpSound.playbackRate = 0.5 + Math.random() * 1.0; // randomize between 0.5x and 1.5x
        jumpSound.currentTime = 0;
        jumpSound.play(); } });
    if (landed && !landed.scored) { landed.scored = true; score++; scoreEl.textContent = `${score}`; }
    if (landed) {
      const topY = Math.min(...display.platforms.map(p => p.y));
      if (landed.y === topY) {
        firstRoom = false;
        const shift = H - landed.y - landed.h;
        display.platforms.forEach(p => p.y += shift);
        this.y += shift;
        buffer.fill(0); activeBolts = [];
        display.resetPlatforms(H - 1, this.x);
      }
    }
    if (!firstRoom && this.y >= H) {
      messageEl.innerHTML = `Game Over<br>Score: ${score}<br>Press Space to Restart`;
      messageEl.style.display = "block";
      running = false;
    }
  }
  draw() { for (let dx = 0; dx < this.w; dx++) for (let dy = 0; dy < this.h; dy++) {
      const px = (this.x + dx) | 0, py = (this.y + dy) | 0;
      if (px >= 0 && px < W && py >= 0 && py < H) buffer[py * W + px] = 1;
    } }
}

// ----- Init & Loop -----
const display = new LightningDisplay(ctx);
const player = new Character();
player.x = W / 2;
player.y = display.platforms[0].y - player.h;
messageEl.style.display = "none";
scoreEl.textContent = `0`;

// Restart on Space after game over
window.addEventListener('keydown', e => {
  if (e.code === 'Space' && !running) {
    // reset game state
    score = 0;
    firstRoom = true;
    running = true;
    messageEl.style.display = "none";
    scoreEl.textContent = `0`;
    buffer.fill(0);
    activeBolts = [];
    display.nextWidth = 32;
    display.resetPlatforms(H - 1, null);
    player.x = W / 2;
    player.y = display.platforms[0].y - player.h;
    player.vy = 0;
    player.prevY = player.y;
    requestAnimationFrame(loop);
  }
});

function loop(time) {
  if (!running) return;
  if (time - lastTime < FRAME_INT) return requestAnimationFrame(loop);
  lastTime = time;

  display.fade(); display.spawnBolts(); display.updateBolts();
  player.handleInput(); player.update(display); player.draw();
  display.render();
  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
