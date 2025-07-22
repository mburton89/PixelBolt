// main.js: Lightning + Character Controller Demo with House, Trees, Clouds, and Platforms

const canvas = document.getElementById("display");
const ctx    = canvas.getContext("2d");
const W = canvas.width, H = canvas.height;

// Persistence and spawn controls
const DECAY            = 0.82;
const BOLT_CHANCE      = 0.02;
const BOLT_SPEED       = 35;
const MAX_ACTIVE_BOLTS = 20;

// Branching parameters
const BOLT_BRANCH_BASE  = 0.02;
const BRANCH_DECAY       = 2.5;
const BRANCH_MIN_CHANCE  = 0.002;

// Zig-zag parameters
const SEGMENT_MIN_LENGTH = 10;
const SEGMENT_MAX_LENGTH = 30;
const MAX_KINK           = 2;
const KINK_CHANCE        = 0.1;

// Frame buffer for all pixels (lightning, house, trees, clouds, character, platforms)
const buffer = new Float32Array(W * H);
const activeBolts = [];

// Input state
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

// ------- Bolt Class -------
class Bolt {
  constructor({ x = Math.floor(Math.random() * W), y = 0, depth = 0,
                segmentLength = SEGMENT_MIN_LENGTH + Math.floor(Math.random() * (SEGMENT_MAX_LENGTH - SEGMENT_MIN_LENGTH + 1)),
                dxSegment = [-1, 0, 1][Math.floor(Math.random() * 3)] } = {}) {
    this.x = x; this.y = y; this.depth = depth;
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
      this.dxSegment = [-1, 0, 1][Math.floor(Math.random() * 3)];
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
        if (px>=0 && px<W && py>=0 && py<H) this.pixels.push([px,py]);
      }
    }
    const radius = 6, centerY = baseY - trunkHeight;
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        if (dx*dx + dy*dy <= radius*radius) {
          const px = x + dx, py = centerY + dy;
          if (px>=0 && px<W && py>=0 && py<H) this.pixels.push([px,py]);
        }
      }
    }
  }
  checkAndLight(bx, by) {
    for (const [tx,ty] of this.pixels) if (tx===bx && ty===by) {
      for (const [lx,ly] of this.pixels) buffer[ly*W + lx] = 1;
      return;
    }
  }
}

// ------- Cloud Class -------
class Cloud {
  constructor(cx, cy) {
    this.pixels = [];
    const radii = [5,7,5], offsets = [-6,0,6];
    radii.forEach((r,i) => {
      const ox = offsets[i];
      for (let dx=-r; dx<=r; dx++) for (let dy=-r; dy<=r; dy++) {
        if (dx*dx+dy*dy <= r*r) {
          const px = cx + ox + dx, py = cy + dy;
          if (px>=0 && px<W && py>=0 && py<H) this.pixels.push([px,py]);
        }
      }
    });
  }
  checkAndLight(bx, by) {
    for (const [cx,cy] of this.pixels) if (cx===bx && cy===by) {
      for (const [lx,ly] of this.pixels) buffer[ly*W + lx] = 1;
      return;
    }
  }
}

// ------- Platform Class -------
class Platform {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.w = 30; this.h = 5;
    this.pixels = [];
    for (let dx=0; dx<this.w; dx++) for (let dy=0; dy<this.h; dy++) {
      const px = x + dx, py = y + dy;
      if (px>=0 && px<W && py>=0 && py<H) this.pixels.push([px,py]);
    }
  }
  checkAndLight(bx, by) {
    for (const [tx,ty] of this.pixels) if (tx===bx && ty===by) {
      for (const [lx,ly] of this.pixels) buffer[ly*W + lx] = 1;
      return;
    }
  }
}

// ------- House Class -------
class House {
  constructor(x, y) {
    this.pixels = [];
    const w = 20, h = 12;
    for (let dx=0; dx<w; dx++) for (let dy=0; dy<h; dy++) {
      const px = x+dx, py = y-dy;
      if (px>=0 && px<W && py>=0 && py<H) this.pixels.push([px,py]);
    }
    for (let dy=0; dy<Math.floor(h/2); dy++) {
      const rowW = w-2*dy, startX = x+dy, rowY = y-h-dy;
      for (let dx=0; dx<rowW; dx++) {
        const px = startX+dx, py = rowY;
        if (px>=0 && px<W && py>=0 && py<H) this.pixels.push([px,py]);
      }
    }
  }
  checkAndLight(bx, by) {
    for (const [tx,ty] of this.pixels) if (tx===bx && ty===by) {
      for (const [lx,ly] of this.pixels) buffer[ly*W + lx] = 1;
      return;
    }
  }
}

// ------- Display Manager -------
class LightningDisplay {
  constructor(ctx) {
    this.ctx = ctx;
    this.house = new House(W-30, H-1);
    this.trees = [];
    this.clouds = [];
    this.platforms = [];
    const treeCount = 4;
    for (let i=0; i<treeCount; i++) {
      const x = Math.floor((i+1)*W/(treeCount+1));
      this.trees.push(new Tree(x, H-1));
    }
    const cloudCount = 3;
    for (let i=0; i<cloudCount; i++) {
      const cx = Math.floor(Math.random()*W), cy = Math.floor(H/5);
      this.clouds.push(new Cloud(cx, cy));
    }
    const levels = [0.25, 0.5, 0.75];
    levels.forEach(frac => {
      const y = Math.floor(H * frac);
      const x = Math.floor(Math.random() * (W - 3));
      this.platforms.push(new Platform(x, y));
    });
  }

  fade() {
    for (let i=0; i<buffer.length; i++) buffer[i] *= DECAY;
  }

  spawn() {
    if (activeBolts.length < MAX_ACTIVE_BOLTS && Math.random()<BOLT_CHANCE)
      activeBolts.push(new Bolt());
  }

  updateBolts() {
    for (let i=activeBolts.length-1; i>=0; i--) {
      const bolt = activeBolts[i];
      for (let s=0; s<BOLT_SPEED; s++) {
        buffer[bolt.y*W + bolt.x] = 1/(bolt.depth+1);
        this.trees.forEach(t => t.checkAndLight(bolt.x, bolt.y));
        this.clouds.forEach(c => c.checkAndLight(bolt.x, bolt.y));
        this.house.checkAndLight(bolt.x, bolt.y);
        this.platforms.forEach(p => p.checkAndLight(bolt.x, bolt.y));
        if (bolt.y >= H-1) break;
        let bc = BOLT_BRANCH_BASE * Math.exp(-BRANCH_DECAY * bolt.depth) * (1 - bolt.y / H);
        bc = Math.max(bc, BRANCH_MIN_CHANCE);
        if (Math.random()<bc && activeBolts.length<MAX_ACTIVE_BOLTS) {
          activeBolts.push(new Bolt({ x:bolt.x, y:bolt.y, depth:bolt.depth+1,
            segmentLength:bolt.segmentLength, dxSegment:bolt.dxSegment }));
        }
        bolt.step();
      }
      if (bolt.y >= H-1) activeBolts.splice(i,1);
    }
  }

  render() {
    const img = this.ctx.createImageData(W,H);
    for (let i=0; i<buffer.length; i++) {
      const v = Math.min(255, Math.floor(buffer[i]*255));
      img.data[i*4] = v; img.data[i*4+1] = v; img.data[i*4+2] = v; img.data[i*4+3] = 255;
    }
    this.ctx.putImageData(img,0,0);
  }
}

// ------- Character -------
class Character {
  constructor() {
    this.x = W/2;
    this.y = H-1;
    this.vy = 0;
    this.onGround = true;
    this.w = 3;
    this.h = 3;
  }

  handleInput() {
    if (keys.left)  this.x -= 8;
    if (keys.right) this.x += 8;
    if (keys.up && this.onGround) {
      this.vy = -10;
      this.onGround = false;
    }
    this.x = Math.max(0, Math.min(W - this.w, this.x));
  }

  update(display) {
    const prevY = this.y;
    if (!this.onGround) this.vy += 0.5;
    this.y += this.vy;
    this.onGround = false;
    // ground collision
    if (this.y >= H - this.h) {
      this.y = H - this.h;
      this.vy = 0;
      this.onGround = true;
    }
    // platform collision
    display.platforms.forEach(p => {
      if (this.vy > 0 &&
          this.x + this.w > p.x && this.x < p.x + p.w &&
          prevY + this.h <= p.y && this.y + this.h >= p.y) {
        this.y = p.y - this.h;
        this.vy = 0;
        this.onGround = true;
      }
    });
  }

  draw() {
    for (let dx = 0; dx < this.w; dx++) {
      for (let dy = 0; dy < this.h; dy++) {
        const px = Math.floor(this.x + dx), py = Math.floor(this.y + dy);
        buffer[py * W + px] = 1;
      }
    }
  }
}

// ------- Main Loop -------
const display = new LightningDisplay(ctx);
const player  = new Character();

function loop() {
  display.fade();
  display.spawn();
  display.updateBolts();
  player.handleInput();
  player.update(display);
  player.draw();
  display.render();
}

setInterval(loop, 1000 / 30);
