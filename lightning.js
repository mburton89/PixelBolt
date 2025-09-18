// lightning.js: Smooth Lightning Effect with Brighter Bolts and Screen Flash

// Grab canvas
document.title = "Lightning Effect";
const canvas = document.getElementById("display");
const ctx = canvas.getContext("2d");
const W = canvas.width;
const H = canvas.height;

// Lightning parameters
const DECAY = 0.82;
const BOLT_CHANCE = 0.02;
const BOLT_SPEED = 35;
const MAX_ACTIVE_BOLTS = 25;
const BOLT_BRANCH_BASE = 0.02;
const BRANCH_DECAY = 2.5;
const BRANCH_MIN_CHANCE = 0.002;
const SEG_MIN_LEN = 10;
const SEG_MAX_LEN = 30;
const MAX_KINK = 4;
const KINK_CHANCE = 0.1;

// Bolt list and flash state
let activeBolts = [];
let flashOpacity = 0;
let flashDecay = 0.1;

// Frame rate
let lastTime = 0;
const FRAME_INT = 1000 / 30;

// Utility
function rand(n) {
  return Math.floor(Math.random() * n);
}

// Bolt Class
class Bolt {
  constructor({ x = rand(W), y = 0, depth = 0,
                segLen = SEG_MIN_LEN + rand(SEG_MAX_LEN - SEG_MIN_LEN),
                dx = [-1, 0, 1][rand(3)] } = {}) {
    this.x = x;
    this.y = y;
    this.depth = depth;
    this.segLen = segLen;
    this.dx = dx;
    this.path = [{ x, y }]; // Store path for smooth lines
  }
  step() {
    if (Math.random() < KINK_CHANCE) this.x += rand(2 * MAX_KINK + 1) - MAX_KINK;
    this.x = Math.max(0, Math.min(W - 1, this.x + this.dx));
    if (--this.segLen <= 0) {
      this.segLen = SEG_MIN_LEN + rand(SEG_MAX_LEN - SEG_MIN_LEN);
      this.dx = [-1, 0, 1][rand(3)];
    }
    this.y++;
    this.path.push({ x: this.x, y: this.y }); // Add new position to path
  }
}

// Lightning Display Class
class LightningDisplay {
  constructor(ctx) {
    this.ctx = ctx;
  }

  fade() {
    // Fade canvas with semi-transparent black
    this.ctx.fillStyle = `rgba(0, 0, 0, ${1 - DECAY})`;
    this.ctx.fillRect(0, 0, W, H);
    // Fade flash effect
    if (flashOpacity > 0) {
      this.ctx.fillStyle = `rgba(255, 255, 255, ${flashOpacity})`;
      this.ctx.fillRect(0, 0, W, H);
      flashOpacity -= flashDecay;
      if (flashOpacity < 0) flashOpacity = 0;
    }
  }

  spawnBolts() {
    if (activeBolts.length < MAX_ACTIVE_BOLTS && Math.random() < BOLT_CHANCE) {
      activeBolts.push(new Bolt());
      flashOpacity = 0.3; // Trigger flash on new bolt
    }
  }

  updateBolts() {
    for (let i = activeBolts.length - 1; i >= 0; i--) {
      const b = activeBolts[i];
      for (let s = 0; s < BOLT_SPEED; s++) {
        if (b.y >= H) {
          flashOpacity = 0.3; // Trigger flash when bolt hits bottom
          break;
        }
        // Branching logic
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
    this.ctx.strokeStyle = 'white';
    this.ctx.lineWidth = 1; // Bolder lines for brightness
    this.ctx.shadowColor = 'white';
    this.ctx.shadowBlur = 5; // Glow effect for brighter bolts
    activeBolts.forEach(bolt => {
      this.ctx.beginPath();
      this.ctx.moveTo(bolt.path[0].x, bolt.path[0].y);
      for (let i = 1; i < bolt.path.length; i++) {
        this.ctx.lineTo(bolt.path[i].x, bolt.path[i].y);
      }
      // Increase base opacity for brighter bolts
      this.ctx.globalAlpha = Math.min(1, 0.5 / (bolt.depth + 0.5));
      this.ctx.stroke();
    });
    this.ctx.globalAlpha = 1; // Reset alpha
    this.ctx.shadowBlur = 0; // Reset glow
  }
}

// Init & Loop
const display = new LightningDisplay(ctx);

function loop(time) {
  if (time - lastTime < FRAME_INT) return requestAnimationFrame(loop);
  lastTime = time;

  display.fade();
  display.spawnBolts();
  display.updateBolts();
  display.render();
  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);