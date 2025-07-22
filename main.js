// main.js: Lightning + Character Controller Demo with Branching

const canvas = document.getElementById("display");
const ctx    = canvas.getContext("2d");
const W      = canvas.width, H = canvas.height;

// Persistence and spawn controls
const DECAY            = 0.82;
const BOLT_CHANCE      = 0.02;   // per-frame chance to spawn a new primary bolt
const BOLT_SPEED       = 35;     // pixels per frame (keep high for fast bolts)
const MAX_ACTIVE_BOLTS = 20;     // cap on simultaneous bolts

// Branching parameters
const BOLT_BRANCH_BASE  = 0.02;  // base per-step branch chance
const BRANCH_DECAY       = 2.5;   // branch chance attenuates with depth
const BRANCH_MIN_CHANCE  = 0.002; // minimum branch chance at max depth

// Zig-zag parameters
const SEGMENT_MIN_LENGTH = 10;
const SEGMENT_MAX_LENGTH = 30;
const MAX_KINK           = 2;
const KINK_CHANCE        = 0.1;

// brightness buffer
const buffer = new Float32Array(W * H);
const activeBolts = [];

// Bolt class with configurable parameters for branching
class Bolt {
  constructor({ x = Math.floor(Math.random() * W), y = 0, depth = 0, segmentLength = SEGMENT_MIN_LENGTH + Math.floor(Math.random() * (SEGMENT_MAX_LENGTH - SEGMENT_MIN_LENGTH + 1)), dxSegment = [-1, 0, 1][Math.floor(Math.random() * 3)] } = {}) {
    this.x = x;
    this.y = y;
    this.depth = depth;
    this.segmentLength = segmentLength;
    this.dxSegment = dxSegment;
  }

  step() {
    // occasionally add a big kink
    if (Math.random() < KINK_CHANCE) {
      this.x += Math.floor(Math.random() * (2 * MAX_KINK + 1)) - MAX_KINK;
    }
    // apply segment dx
    this.x += this.dxSegment;
    this.segmentLength--;
    if (this.segmentLength <= 0) {
      this.segmentLength = SEGMENT_MIN_LENGTH + Math.floor(Math.random() * (SEGMENT_MAX_LENGTH - SEGMENT_MIN_LENGTH + 1));
      this.dxSegment = [-1, 0, 1][Math.floor(Math.random() * 3)];
    }
    this.y++;
  }
}

// Global input state for character
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

// Lightning display manages buffer, bolts, and rendering
class LightningDisplay {
  constructor(ctx) {
    this.ctx = ctx;
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
      for (let step = 0; step < BOLT_SPEED; step++) {
        // draw pixel with depth-based dimming
        buffer[bolt.y * W + bolt.x] = 1 / (bolt.depth + 1);

        if (bolt.y >= H - 1) break;

        // compute branch chance based on depth and vertical progress
        const relativeY = bolt.y / H;
        let branchChance = BOLT_BRANCH_BASE * Math.exp(-BRANCH_DECAY * bolt.depth) * (1 - relativeY);
        branchChance = Math.max(branchChance, BRANCH_MIN_CHANCE);
        if (Math.random() < branchChance && activeBolts.length < MAX_ACTIVE_BOLTS) {
          // spawn a child branch at current position
          activeBolts.push(new Bolt({
            x: bolt.x,
            y: bolt.y,
            depth: bolt.depth + 1,
            segmentLength: bolt.segmentLength,
            dxSegment: bolt.dxSegment
          }));
        }

        // advance bolt one step
        bolt.step();
      }
      // remove finished
      if (bolt.y >= H - 1) {
        activeBolts.splice(i, 1);
      }
    }
  }

  render() {
    const img = this.ctx.createImageData(W, H);
    for (let i = 0; i < buffer.length; i++) {
      const v = Math.min(255, Math.floor(buffer[i] * 255));
      img.data[i*4+0] = v;
      img.data[i*4+1] = v;
      img.data[i*4+2] = v;
      img.data[i*4+3] = 255;
    }
    this.ctx.putImageData(img, 0, 0);
  }
}

// Simple character controller for left/right and jumping
class Character {
  constructor() {
    this.x = W / 2;
    this.y = H - 1;
    this.vy = 0;
    this.onGround = true;
    this.width = 3;
    this.height = 3;
  }

  handleInput() {
    if (keys.left)  this.x -= 6;
    if (keys.right) this.x += 6;
    if (keys.up && this.onGround) {
      this.vy = -8;
      this.onGround = false;
    }
    this.x = Math.max(0, Math.min(W - this.width, this.x));
  }

  update() {
    if (!this.onGround) this.vy += 0.5;
    this.y += this.vy;
    if (this.y >= H - this.height) {
      this.y = H - this.height;
      this.vy = 0;
      this.onGround = true;
    }
  }

  draw() {
    for (let dx = 0; dx < this.width; dx++) {
      for (let dy = 0; dy < this.height; dy++) {
        const px = Math.floor(this.x + dx);
        const py = Math.floor(this.y + dy);
        buffer[py * W + px] = 1;
      }
    }
  }
}

// Set up systems and start loop
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

setInterval(loop, 1000 / 30);
