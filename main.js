// main.js: Lightning + Character Controller Demo with Trees and Clouds

const canvas = document.getElementById("display");
const ctx    = canvas.getContext("2d");
const W      = canvas.width, H = canvas.height;

// Persistence and spawn controls
const DECAY            = 0.82;
const BOLT_CHANCE      = 0.02;   // per-frame chance to spawn a new primary bolt
const BOLT_SPEED       = 35;     // pixels per frame
const MAX_ACTIVE_BOLTS = 20;     // cap on simultaneous bolts

// Branching parameters
const BOLT_BRANCH_BASE = 0.02;
const BRANCH_DECAY      = 2.5;
const BRANCH_MIN_CHANCE = 0.002;

// Zig-zag parameters
const SEGMENT_MIN_LENGTH = 10;
const SEGMENT_MAX_LENGTH = 30;
const MAX_KINK           = 2;
const KINK_CHANCE        = 0.1;

// brightness buffer (0.0 to 1.0)
const buffer = new Float32Array(W * H);
const activeBolts = [];

// Input state for character
const keys = { left: false, right: false, up: false };
window.addEventListener('keydown', e => {
  if (e.code === 'ArrowLeft')  keys.left = true;
  if (e.code === 'ArrowRight') keys.right = true;
  if (e.code === 'Space')      keys.up = true;
});
window.addEventListener('keyup', e => {
  if (e.code === 'ArrowLeft')  keys.left = false;
  if (e.code === 'ArrowRight') keys.right = false;
  if (e.code === 'Space')      keys.up = false;
});

/**
 * Class representing a falling lightning bolt.
 */
class Bolt {
  constructor({ x = Math.floor(Math.random() * W), y = 0, depth = 0,
                segmentLength = SEGMENT_MIN_LENGTH + Math.floor(Math.random() * (SEGMENT_MAX_LENGTH - SEGMENT_MIN_LENGTH + 1)),
                dxSegment = [-1,0,1][Math.floor(Math.random() * 3)] } = {}) {
    this.x = x;
    this.y = y;
    this.depth = depth;
    this.segmentLength = segmentLength;
    this.dxSegment = dxSegment;
  }

  step() {
    if (Math.random() < KINK_CHANCE) {
      this.x += Math.floor(Math.random() * (2 * MAX_KINK + 1)) - MAX_KINK;
    }
    this.x += this.dxSegment;
    this.segmentLength--;
    if (this.segmentLength <= 0) {
      this.segmentLength = SEGMENT_MIN_LENGTH + Math.floor(Math.random() * (SEGMENT_MAX_LENGTH - SEGMENT_MIN_LENGTH + 1));
      this.dxSegment = [-1,0,1][Math.floor(Math.random() * 3)];
    }
    this.y++;
  }
}

/**
 * Class representing a simple tree outline.
 * Generates trunk and circular foliage pixel mask.
 */
class Tree {
  constructor(x, baseY) {
    this.pixels = [];
    const trunkHeight = 10;
    const trunkWidth = 2;
    for (let dx = -Math.floor(trunkWidth/2); dx <= Math.floor(trunkWidth/2); dx++) {
      for (let dy = 0; dy < trunkHeight; dy++) {
        const px = x + dx;
        const py = baseY - dy;
        if (px >= 0 && px < W && py >= 0 && py < H) {
          this.pixels.push([px,py]);
        }
      }
    }
    const radius = 8;
    const centerY = baseY - trunkHeight;
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        if (dx*dx + dy*dy <= radius*radius) {
          const px = x + dx;
          const py = centerY + dy;
          if (px >= 0 && px < W && py >= 0 && py < H) {
            this.pixels.push([px,py]);
          }
        }
      }
    }
  }

  checkAndLight(bx, by) {
    for (const [tx,ty] of this.pixels) {
      if (tx === bx && ty === by) {
        for (const [lx,ly] of this.pixels) {
          buffer[ly*W + lx] = 1;
        }
        return;
      }
    }
  }
}

/**
 * Class representing a simple cloud blob.
 * Generates overlapping circles pixel mask.
 */
class Cloud {
  constructor(cx, cy) {
    this.pixels = [];
    const radii = [6, 8, 6];
    const offsets = [-8, 0, 8];
    radii.forEach((r, i) => {
      const ox = offsets[i];
      for (let dx = -r; dx <= r; dx++) {
        for (let dy = -r; dy <= r; dy++) {
          if (dx*dx + dy*dy <= r*r) {
            const px = cx + ox + dx;
            const py = cy + dy;
            if (px >= 0 && px < W && py >= 0 && py < H) {
              this.pixels.push([px,py]);
            }
          }
        }
      }
    });
  }

  checkAndLight(bx, by) {
    for (const [cx,cy] of this.pixels) {
      if (cx === bx && cy === by) {
        for (const [lx,ly] of this.pixels) {
          buffer[ly*W + lx] = 1;
        }
        return;
      }
    }
  }
}

/**
 * Display manager: fading, bolt lifecycle, and rendering.
 */
class LightningDisplay {
  constructor(ctx) {
    this.ctx = ctx;
    this.trees = [];
    this.clouds = [];
    const treeCount = 5;
    for (let i = 0; i < treeCount; i++) {
      const x = Math.floor((i+1) * W/(treeCount+1));
      this.trees.push(new Tree(x, H-1));
    }
    const cloudCount = 3;
    for (let i = 0; i < cloudCount; i++) {
      const cx = Math.floor(Math.random() * W);
      const cy = Math.floor(Math.random() * H/4) + 5;
      this.clouds.push(new Cloud(cx, cy));
    }
  }

  fade() {
    for (let i = 0; i < buffer.length; i++) {
      buffer[i] *= DECAY;
    }
  }

  spawn() {
    if (activeBolts.length < MAX_ACTIVE_BOLTS && Math.random() < BOLT_CHANCE) {
      activeBolts.push(new Bolt());
    }
  }

  updateBolts() {
    for (let i = activeBolts.length - 1; i >= 0; i--) {
      const bolt = activeBolts[i];
      for (let s = 0; s < BOLT_SPEED; s++) {
        buffer[bolt.y * W + bolt.x] = 1 / (bolt.depth + 1);
        this.trees.forEach(tree  => tree.checkAndLight(bolt.x, bolt.y));
        this.clouds.forEach(cloud => cloud.checkAndLight(bolt.x, bolt.y));
        if (bolt.y >= H - 1) break;
        const relativeY = bolt.y / H;
        let branchChance = BOLT_BRANCH_BASE * Math.exp(-BRANCH_DECAY * bolt.depth) * (1 - relativeY);
        branchChance = Math.max(branchChance, BRANCH_MIN_CHANCE);
        if (Math.random() < branchChance && activeBolts.length < MAX_ACTIVE_BOLTS) {
          activeBolts.push(new Bolt({ x: bolt.x, y: bolt.y, depth: bolt.depth+1, segmentLength: bolt.segmentLength, dxSegment: bolt.dxSegment }));
        }
        bolt.step();
      }
      if (bolt.y >= H - 1) activeBolts.splice(i,1);
    }
  }

  render() {
    const img = this.ctx.createImageData(W, H);
    for (let i = 0; i < buffer.length; i++) {
      const v = Math.min(255, Math.floor(buffer[i] * 255));
      img.data[i*4]   = v;
      img.data[i*4+1] = v;
      img.data[i*4+2] = v;
      img.data[i*4+3] = 255;
    }
    this.ctx.putImageData(img, 0, 0);
  }
}

/**
 * Simple character controller for left/right and jumping.
 */
class Character {
  constructor() {
    this.x = W/2;
    this.y = H-1;
    this.vy = 0;
    this.onGround = true;
    this.width = 3;
    this.height = 3;
  }

  handleInput() {
    if (keys.left)  this.x -= 10;
    if (keys.right) this.x += 10;
    if (keys.up && this.onGround) {
      this.vy = -8;
      this.onGround = false;
    }
    this.x = Math.max(0, Math.min(W-this.width, this.x));
  }

  update() {
    if (!this.onGround) this.vy += 0.5;
    this.y += this.vy;
    if (this.y >= H-this.height) {
      this.y = H-this.height;
      this.vy = 0;
      this.onGround = true;
    }
  }

  draw() {
    for (let dx = 0; dx < this.width; dx++) {
      for (let dy = 0; dy < this.height; dy++) {
        buffer[(this.y+dy)*W + (this.x+dx)] = 1;
      }
    }
  }
}

// Instantiate systems and start animation
const display = new LightningDisplay(ctx);
const player  = new Character();

function loop() {
  display.fade();
  display.spawn();
  display.updateBolts();

  player.handleInput();
  player.update();
  player.draw();

  display.render();
}

setInterval(loop, 1000/30);
