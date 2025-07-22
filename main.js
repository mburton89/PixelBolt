const canvas = document.getElementById("display");
const ctx    = canvas.getContext("2d");
const W      = canvas.width, H = canvas.height;

// Persistence and spawn controls
const DECAY            = 0.82;
const BOLT_CHANCE      = 0.02;   // per-frame chance to spawn a new bolt
const BOLT_SPEED       = 35;      // pixels per frame
const MAX_ACTIVE_BOLTS = 15;     // cap on simultaneous bolts

// Branching parameters
const BOLT_BRANCH_BASE = 0.05;  // base per-step branch chance
const BRANCH_DECAY      = 1.5;   // branch chance attenuates with depth
const BRANCH_MIN_CHANCE = 0.005; // minimum branch chance at max depth

// Zig-zag segmentation and kinks
const SEGMENT_MIN_LENGTH = 10;
const SEGMENT_MAX_LENGTH = 20;
const MAX_KINK           = 2;     // max extra horizontal jump
const KINK_CHANCE        = 0.1;   // chance per step for a big kink

// brightness buffer
const buffer = new Float32Array(W * H);
// list of "in-flight" bolts
const activeBolts = [];

function setPixel(x, y, intensity = 1) {
  buffer[y * W + x] = Math.max(buffer[y * W + x], intensity);
}

function fade() {
  for (let i = 0; i < buffer.length; i++) {
    buffer[i] *= DECAY;
  }
}

function update() {
  const img = ctx.createImageData(W, H);
  const d   = img.data;
  for (let i = 0; i < buffer.length; i++) {
    const v = Math.min(255, Math.floor(buffer[i] * 255));
    d[i*4 + 0] = v;
    d[i*4 + 1] = v;
    d[i*4 + 2] = v;
    d[i*4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

// Initialize a new bolt with segment and depth info
function spawnLightning() {
  if (activeBolts.length >= MAX_ACTIVE_BOLTS) return;
  const startX = Math.floor(Math.random() * W);
  activeBolts.push({
    x: startX,
    y: 0,
    depth: 0,
    segmentLength: SEGMENT_MIN_LENGTH + Math.floor(Math.random() * (SEGMENT_MAX_LENGTH - SEGMENT_MIN_LENGTH + 1)),
    dxSegment: [-1, 0, 1][Math.floor(Math.random() * 3)]
  });
}

function updateBolts() {
  for (let i = activeBolts.length - 1; i >= 0; i--) {
    const bolt = activeBolts[i];
    // Determine branch chance for this bolt
    const relativeY = bolt.y / H;
    let branchChance = BOLT_BRANCH_BASE * Math.exp(-BRANCH_DECAY * bolt.depth) * (1 - relativeY);
    branchChance = Math.max(branchChance, BRANCH_MIN_CHANCE);

    for (let step = 0; step < BOLT_SPEED; step++) {
      // Draw current pixel (dims with depth)
      const intensity = 1 / (bolt.depth + 1);
      setPixel(bolt.x, bolt.y, intensity);

      // Possibly branch
      if (Math.random() < branchChance && activeBolts.length < MAX_ACTIVE_BOLTS) {
        activeBolts.push({
          x: bolt.x,
          y: bolt.y,
          depth: bolt.depth + 1,
          segmentLength: SEGMENT_MIN_LENGTH + Math.floor(Math.random() * (SEGMENT_MAX_LENGTH - SEGMENT_MIN_LENGTH + 1)),
          dxSegment: [-1, 0, 1][Math.floor(Math.random() * 3)]
        });
      }

      if (bolt.y >= H - 1) break;

      // Zig-zag via segment dx
      bolt.x += bolt.dxSegment;
      // Possibly add a larger kink
      if (Math.random() < KINK_CHANCE) {
        bolt.x += (Math.floor(Math.random() * (2 * MAX_KINK + 1)) - MAX_KINK);
      }
      // Clamp
      bolt.x = Math.max(0, Math.min(W - 1, bolt.x));
      bolt.y++;

      // Segment counter
      bolt.segmentLength--;
      if (bolt.segmentLength <= 0) {
        bolt.segmentLength = SEGMENT_MIN_LENGTH + Math.floor(Math.random() * (SEGMENT_MAX_LENGTH - SEGMENT_MIN_LENGTH + 1));
        bolt.dxSegment = [-1, 0, 1][Math.floor(Math.random() * 3)];
      }
    }

    // Remove finished bolts
    if (bolt.y >= H - 1) {
      activeBolts.splice(i, 1);
    }
  }
}

function loop() {
  fade();

  if (Math.random() < BOLT_CHANCE) spawnLightning();

  updateBolts();
  update();
}

setInterval(loop, 1000 / 30);
