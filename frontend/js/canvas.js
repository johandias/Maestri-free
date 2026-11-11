/**
 * Infinite Canvas Engine for Maestri Desktop (v2.0)
 * Features Verlet Physics Ropes (tactile cables with gravity, inertia, Catmull-Rom SVG curvature),
 * magnetic anchor pin ports, scissor-cut severance, dynamic transmission pulses,
 * pan, zoom, and live context connections.
 */

// --- VERLET PHYSICS PARAMETERS (Official Maestri Parity) ---
const SEGMENT_COUNT = 20;
const POINT_COUNT = SEGMENT_COUNT + 1; // 21 points
const GRAVITY_Y = 1600;
const FIXED_DT = 1 / 60;
const DAMPING = 0.965;
const SLACK_FACTOR = 1.05;
const CONSTRAINT_ITERATIONS = 8;
const OBSTACLE_PADDING = 20;
const OBSTACLE_CORNER_ZONE = OBSTACLE_PADDING * 1.5;
const OBSTACLE_BLEND = 0.4;
const SLEEP_THRESHOLD = 0.5;

function f(val) {
  return Number.isFinite(val) ? val.toFixed(2) : "0.00";
}

/**
 * Calculates initial natural parabolic sag points between start and end pins.
 * sagAmount = Math.max(span * 0.12, 20)
 */
function staticRopePoints(start, end) {
  const span = Math.hypot(end.x - start.x, end.y - start.y);
  const sagAmount = Math.max(span * 0.12, 20);
  const points = [];
  for (let i = 0; i < POINT_COUNT; i++) {
    const t = i / (POINT_COUNT - 1);
    const sag = sagAmount * 4 * t * (1 - t);
    points.push({
      x: start.x + (end.x - start.x) * t,
      y: start.y + (end.y - start.y) * t + sag
    });
  }
  return points;
}

/**
 * Converts array of 21 points into a silky smooth Catmull-Rom cubic Bezier path for SVG.
 * ('M x y C cp1x cp1y, cp2x cp2y, p2x p2y')
 */
function buildSmoothPath(points) {
  if (!points || points.length < 2) return "";
  const first = points[0];
  if (!first) return "";
  let path = `M ${f(first.x)} ${f(first.y)}`;
  for (let i = 1; i < points.length; i++) {
    const p0 = points[Math.max(i - 2, 0)];
    const p1 = points[i - 1];
    const p2 = points[i];
    const p3 = points[Math.min(i + 1, points.length - 1)];
    if (!p0 || !p1 || !p2 || !p3) continue;
    const cp1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const cp2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    path += ` C ${f(cp1.x)} ${f(cp1.y)}, ${f(cp2.x)} ${f(cp2.y)}, ${f(p2.x)} ${f(p2.y)}`;
  }
  return path;
}

/**
 * Detects obstacle bounding boxes and pushes cable points out with rounded corner zones.
 */
function pushOutOfObstacles(point, obstacles) {
  for (const rect of obstacles) {
    const minX = rect.x - OBSTACLE_PADDING;
    const maxX = rect.x + rect.width + OBSTACLE_PADDING;
    const minY = rect.y - OBSTACLE_PADDING;
    const maxY = rect.y + rect.height + OBSTACLE_PADDING;

    if (point.x < minX || point.x > maxX || point.y < minY || point.y > maxY) continue;

    const toLeft = point.x - minX;
    const toRight = maxX - point.x;
    const toTop = point.y - minY;
    const toBottom = maxY - point.y;

    const nearLeft = toLeft < OBSTACLE_CORNER_ZONE;
    const nearRight = toRight < OBSTACLE_CORNER_ZONE;
    const nearTop = toTop < OBSTACLE_CORNER_ZONE;
    const nearBottom = toBottom < OBSTACLE_CORNER_ZONE;

    let targetX = point.x;
    let targetY = point.y;

    if ((nearLeft || nearRight) && (nearTop || nearBottom)) {
      const cornerX = nearLeft ? minX : maxX;
      const cornerY = nearTop ? minY : maxY;
      const dx = point.x - cornerX;
      const dy = point.y - cornerY;
      const dist = Math.hypot(dx, dy);
      if (dist > 1e-3) {
        targetX = cornerX + (dx / dist) * OBSTACLE_PADDING;
        targetY = cornerY + (dy / dist) * OBSTACLE_PADDING;
      }
    } else {
      const minDist = Math.min(toLeft, toRight, toTop, toBottom);
      if (minDist === toLeft) targetX = minX;
      else if (minDist === toRight) targetX = maxX;
      else if (minDist === toTop) targetY = minY;
      else targetY = maxY;
    }

    point.x += (targetX - point.x) * OBSTACLE_BLEND;
    point.y += (targetY - point.y) * OBSTACLE_BLEND;
  }
}

/**
 * Returns midpoints of the 4 borders of a node frame.
 */
function edgeMidpoints(frame) {
  const minX = frame.x;
  const maxX = frame.x + frame.width;
  const minY = frame.y;
  const maxY = frame.y + frame.height;
  const midX = frame.x + frame.width / 2;
  const midY = frame.y + frame.height / 2;
  return [
    { x: midX, y: minY, side: "top" },
    { x: midX, y: maxY, side: "bottom" },
    { x: minX, y: midY, side: "left" },
    { x: maxX, y: midY, side: "right" }
  ];
}

/**
 * Computes closest facing magnetic anchor pins between two node bounding boxes.
 */
function closestEdgePins(a, b) {
  let bestStart = { x: a.x + a.width / 2, y: a.y + a.height / 2, side: "top" };
  let bestEnd = { x: b.x + b.width / 2, y: b.y + b.height / 2, side: "top" };
  let bestDistance = Infinity;

  const pointsA = edgeMidpoints(a);
  const pointsB = edgeMidpoints(b);

  for (const pointA of pointsA) {
    for (const pointB of pointsB) {
      const distance = Math.hypot(pointA.x - pointB.x, pointA.y - pointB.y);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestStart = pointA;
        bestEnd = pointB;
      }
    }
  }
  return { start: bestStart, end: bestEnd };
}

/**
 * Verlet Physics Rope Simulation Class
 */
class Rope {
  constructor(start, end, restoredPoints = null) {
    this.pinStart = { ...start };
    this.pinEnd = { ...end };
    this.points = restoredPoints?.length === POINT_COUNT ? restoredPoints.map(p => ({ ...p })) : staticRopePoints(start, end);
    this.prev = this.points.map(p => ({ ...p }));
    this.lastMovement = 0;
    this.isSleeping = false;
    this.sleepFrames = 0;
  }

  snapTo(start, end) {
    this.pinStart = { ...start };
    this.pinEnd = { ...end };
    this.points = staticRopePoints(start, end);
    this.prev = this.points.map(p => ({ ...p }));
    this.lastMovement = 0;
    this.isSleeping = false;
    this.sleepFrames = 0;
  }

  setPins(start, end) {
    const moved = Math.hypot(this.pinStart.x - start.x, this.pinStart.y - start.y) > 0.05 ||
                  Math.hypot(this.pinEnd.x - end.x, this.pinEnd.y - end.y) > 0.05;
    this.pinStart = { ...start };
    this.pinEnd = { ...end };
    if (moved) {
      this.wakeUp();
    }
  }

  wakeUp() {
    this.isSleeping = false;
    this.sleepFrames = 0;
  }

  step(dt = FIXED_DT, obstacles = []) {
    if (this.isSleeping) return 0;

    const points = this.points;
    const prev = this.prev;
    const count = points.length;
    const gravity = GRAVITY_Y * dt * dt;

    // 1. Position & velocity update via Verlet integration
    for (let i = 1; i < count - 1; i++) {
      const current = points[i];
      const previous = prev[i];
      if (!current || !previous) continue;

      const vx = (current.x - previous.x) * DAMPING;
      const vy = (current.y - previous.y) * DAMPING;

      prev[i] = { x: current.x, y: current.y };
      points[i] = {
        x: current.x + vx,
        y: current.y + vy + gravity
      };
    }

    // Pin ends
    points[0] = { ...this.pinStart };
    prev[0] = { ...this.pinStart };
    const last = count - 1;
    if (last >= 0) {
      points[last] = { ...this.pinEnd };
      prev[last] = { ...this.pinEnd };
    }

    const chordLength = Math.hypot(this.pinEnd.x - this.pinStart.x, this.pinEnd.y - this.pinStart.y);
    const targetLength = Math.max(chordLength * SLACK_FACTOR, 40) / SEGMENT_COUNT;

    // 2. Constraint relaxation iterations
    for (let iteration = 0; iteration < CONSTRAINT_ITERATIONS; iteration++) {
      for (let i = 0; i < count - 1; i++) {
        const a = points[i];
        const b = points[i + 1];
        if (!a || !b) continue;

        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const distance = Math.hypot(dx, dy);
        if (distance < 1e-3) continue;

        const diff = (distance - targetLength) / distance * 0.5;
        const offsetX = dx * diff;
        const offsetY = dy * diff;

        if (i !== 0) {
          a.x += offsetX;
          a.y += offsetY;
        }
        if (i + 1 !== last) {
          b.x -= offsetX;
          b.y -= offsetY;
        }
      }

      // Obstacle deflection
      if (obstacles && obstacles.length > 0) {
        for (let i = 1; i < count - 1; i++) {
          const point = points[i];
          if (point) pushOutOfObstacles(point, obstacles);
        }
      }

      // Re-pin ends to prevent drift
      points[0] = { ...this.pinStart };
      if (last >= 0) points[last] = { ...this.pinEnd };
    }

    // 3. Sleep detection via accumulated movement
    let movement = 0;
    for (let i = 1; i < count - 1; i++) {
      const p = points[i];
      const pr = prev[i];
      if (!p || !pr) continue;
      movement += Math.abs(p.x - pr.x) + Math.abs(p.y - pr.y);
    }
    this.lastMovement = movement;

    if (movement < SLEEP_THRESHOLD) {
      this.sleepFrames++;
      if (this.sleepFrames > 12) {
        this.isSleeping = true;
      }
    } else {
      this.sleepFrames = 0;
      this.isSleeping = false;
    }

    return movement;
  }
}

class MaestriCanvas {
  constructor(containerId, worldId, svgLayerId) {
    this.container = document.getElementById(containerId);
    this.world = document.getElementById(worldId);
    this.svgLayer = document.getElementById(svgLayerId);

    this.panX = 200;
    this.panY = 100;
    this.zoom = 1.0;
    this.minZoom = 0.25;
    this.maxZoom = 2.5;

    this.isPanning = false;
    this.panStartX = 0;
    this.panStartY = 0;

    this.activeDragNode = null;
    this.dragOffsetX = 0;
    this.dragOffsetY = 0;
    this.dragStartMouseX = 0;
    this.dragStartMouseY = 0;
    this.dragInitialPositions = new Map();

    this.selectedNodeId = null;
    this.selectedNodeIds = new Set();
    this.isMarqueeSelecting = false;
    this.marqueeStartX = 0;
    this.marqueeStartY = 0;
    this.marqueeCurrentX = 0;
    this.marqueeCurrentY = 0;
    this.isConnecting = false;
    this.connectSourceId = null;

    this.activeTool = "select"; // 'select', 'hand', 'connect', 'terminal', 'diagram', 'note'
    this.pendingPlacement = null; // type of node to place on click

    this.nodes = [];
    this.edges = [];

    // Verlet Physics Rope Management
    this.ropes = new Map(); // edgeId -> Rope instance
    this.isPhysicsLoopRunning = false;
    this.physicsRaf = null;

    this._initEvents();
    this.updateTransform();
  }

  _initEvents() {
    // Panning is enabled by middle click (scroll wheel) or Space+click or Hand tool
    this.container.addEventListener("mousedown", (e) => {
      const isMiddleClick = (e.button === 1);
      const isSpaceDrag = (e.spaceKey || this.isSpacePressed);
      const isHandTool = (this.activeTool === "hand");

      if (isMiddleClick || isSpaceDrag || isHandTool) {
        this.isPanning = true;
        this.panStartX = e.clientX - this.panX;
        this.panStartY = e.clientY - this.panY;
        this.container.classList.add("panning");
        e.preventDefault();
        return;
      }

      // If left click on background
      const isCanvasBg = (
        e.target === this.container ||
        e.target === this.world ||
        e.target.tagName === "svg" ||
        e.target.id === "canvas-world" ||
        e.target.id === "svg-layer" ||
        e.target.classList?.contains("edge-hit-area") ||
        e.target.classList?.contains("edge-path")
      );

      if (e.button === 0 && isCanvasBg) {
        if (this.isConnecting) {
          this.cancelConnect();
          return;
        }

        // Delimit area for new terminal
        if (this.pendingPlacement === "terminal") {
          this.isDelimiting = true;
          this.delimitStartX = (e.clientX - this.panX) / this.zoom;
          this.delimitStartY = (e.clientY - this.panY) / this.zoom;
          this.delimitCurrentX = this.delimitStartX;
          this.delimitCurrentY = this.delimitStartY;
          this._ensureDelimitBox();
          this._updateDelimitBox();
          e.preventDefault();
          return;
        } else if (this.pendingPlacement) {
          const mouseX = (e.clientX - this.panX) / this.zoom;
          const mouseY = (e.clientY - this.panY) / this.zoom;
          this.handlePlacementAt(this.pendingPlacement, mouseX, mouseY);
          this.setPendingPlacement(null);
          return;
        }

        // Área de Delimitação & Seleção Múltipla de Elementos (Marquee Selection)
        if (!e.shiftKey) {
          this.clearSelection();
        }
        this.isMarqueeSelecting = true;
        this.marqueeStartX = (e.clientX - this.panX) / this.zoom;
        this.marqueeStartY = (e.clientY - this.panY) / this.zoom;
        this.marqueeCurrentX = this.marqueeStartX;
        this.marqueeCurrentY = this.marqueeStartY;
        this._ensureMarqueeBox();
        this._updateMarqueeBox();
        e.preventDefault();
      }
    });

    // Space key detection
    window.addEventListener("keydown", (e) => {
      if (e.code === "Space" && !["input", "textarea"].includes(document.activeElement.tagName.toLowerCase())) {
        this.isSpacePressed = true;
        this.container.classList.add("panning");
      }
    });

    window.addEventListener("keyup", (e) => {
      if (e.code === "Space") {
        this.isSpacePressed = false;
        if (!this.isPanning) {
          this.container.classList.remove("panning");
        }
      }
    });

    window.addEventListener("mousemove", (e) => {
      if (this.isPanning) {
        this.panX = e.clientX - this.panStartX;
        this.panY = e.clientY - this.panStartY;
        this.updateTransform();
      } else if (this.isDelimiting) {
        this.delimitCurrentX = (e.clientX - this.panX) / this.zoom;
        this.delimitCurrentY = (e.clientY - this.panY) / this.zoom;
        this._updateDelimitBox();
      } else if (this.isMarqueeSelecting) {
        this.marqueeCurrentX = (e.clientX - this.panX) / this.zoom;
        this.marqueeCurrentY = (e.clientY - this.panY) / this.zoom;
        this._updateMarqueeBox();
        this._highlightNodesInMarquee(e.shiftKey);
      } else if (this.activeDragNode) {
        const mouseX = (e.clientX - this.panX) / this.zoom;
        const mouseY = (e.clientY - this.panY) / this.zoom;

        if (this.dragInitialPositions.size > 1 && this.dragInitialPositions.has(this.activeDragNode.id)) {
          // Arrastar seleção múltipla em bloco
          const dx = Math.round(mouseX - this.dragStartMouseX);
          const dy = Math.round(mouseY - this.dragStartMouseY);

          for (const [id, initPos] of this.dragInitialPositions.entries()) {
            const el = document.getElementById(id);
            const nodeObj = this.nodes.find(n => n.id === id);
            if (el && nodeObj) {
              const nx = initPos.x + dx;
              const ny = initPos.y + dy;
              el.style.left = `${nx}px`;
              el.style.top = `${ny}px`;
              nodeObj.x = nx;
              nodeObj.y = ny;
            }
          }
        } else {
          // Arrastar nó único individual
          const newX = Math.round(mouseX - this.dragOffsetX);
          const newY = Math.round(mouseY - this.dragOffsetY);

          this.activeDragNode.style.left = `${newX}px`;
          this.activeDragNode.style.top = `${newY}px`;

          const nodeObj = this.nodes.find(n => n.id === this.activeDragNode.id);
          if (nodeObj) {
            nodeObj.x = newX;
            nodeObj.y = newY;
          }
        }

        this.wakeRopes();
      }

      // Live tactile cable preview while connecting
      if (this.isConnecting && this.connectSourceId) {
        const mouseX = (e.clientX - this.panX) / this.zoom;
        const mouseY = (e.clientY - this.panY) / this.zoom;
        this.updateConnectionPreview(mouseX, mouseY);
      }
    });

    window.addEventListener("mouseup", (e) => {
      if (this.isPanning) {
        this.isPanning = false;
        this.container.classList.remove("panning");
        if (window.MaestriApp) {
          window.MaestriApp.triggerAutoSave();
        }
      }

      if (this.isDelimiting) {
        this.isDelimiting = false;
        const x1 = Math.min(this.delimitStartX, this.delimitCurrentX);
        const y1 = Math.min(this.delimitStartY, this.delimitCurrentY);
        const rawW = Math.abs(this.delimitCurrentX - this.delimitStartX);
        const rawH = Math.abs(this.delimitCurrentY - this.delimitStartY);

        this._removeDelimitBox();
        this.setPendingPlacement(null);
        if (this.activeTool === "terminal") {
          this.activeTool = "select";
          if (window.MaestriApp) window.MaestriApp.setToolActive("select");
        }

        const width = rawW > 140 ? Math.round(rawW) : 520;
        const height = rawH > 100 ? Math.round(rawH) : 320;
        const x = Math.round(x1);
        const y = Math.round(y1);

        if (window.MaestriApp) {
          window.MaestriApp.openTerminalModalAt(x, y, width, height);
        }
        return;
      }

      if (this.isMarqueeSelecting) {
        this.isMarqueeSelecting = false;
        const dist = Math.hypot(this.marqueeCurrentX - this.marqueeStartX, this.marqueeCurrentY - this.marqueeStartY);
        this._removeMarqueeBox();
        if (dist < 6 && !e.shiftKey) {
          this.clearSelection();
        } else {
          this._finalizeMarqueeSelection();
        }
        return;
      }

      if (this.activeDragNode) {
        this.activeDragNode = null;
        this.dragInitialPositions.clear();
        if (window.MaestriApp) {
          window.MaestriApp.triggerAutoSave();
        }
      }
    });

    // Zoom via wheel - strictly ignore when scrolling inside terminal or other scrollable components
    this.container.addEventListener("wheel", (e) => {
      if (
        e.target.closest(".term-body") ||
        e.target.closest(".xterm") ||
        e.target.closest(".floating-sidebar") ||
        e.target.closest(".modal-window") ||
        e.target.closest(".note-node") ||
        e.target.closest(".portal-frame") ||
        e.target.closest(".orch-target-list")
      ) {
        return;
      }

      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.08 : 0.92;
      const newZoom = Math.min(Math.max(this.zoom * zoomFactor, this.minZoom), this.maxZoom);

      const mouseX = e.clientX;
      const mouseY = e.clientY;
      this.panX = mouseX - (mouseX - this.panX) * (newZoom / this.zoom);
      this.panY = mouseY - (mouseY - this.panY) * (newZoom / this.zoom);
      this.zoom = newZoom;

      this.updateTransform();
      this.wakeRopes();
      if (window.MaestriApp) {
        window.MaestriApp.triggerAutoSave();
      }
    }, { passive: false });

    // Context Menu for Infinite Canvas Background
    this.container.addEventListener("contextmenu", (e) => {
      if (this.isDelimiting || this.isConnecting) return;
      if (
        e.target.closest(".canvas-node") ||
        e.target.closest(".floating-sidebar") ||
        e.target.closest(".modal-overlay") ||
        e.target.closest(".top-toolbar") ||
        e.target.closest("#custom-context-menu")
      ) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      if (window.MaestriApp?.contextMenu) {
        window.MaestriApp.contextMenu.showForCanvas(e);
      }
    });

    this._bindSecondaryAndPrompterEvents();
  }

  _ensureDelimitBox() {
    let box = document.getElementById("canvas-delimit-box");
    if (!box) {
      box = document.createElement("div");
      box.id = "canvas-delimit-box";
      box.className = "canvas-delimit-box";
      box.innerHTML = `<span class="delimit-dimensions">0 × 0 px</span>`;
      this.world.appendChild(box);
    }
  }

  _updateDelimitBox() {
    const box = document.getElementById("canvas-delimit-box");
    if (!box) return;
    const x = Math.min(this.delimitStartX, this.delimitCurrentX);
    const y = Math.min(this.delimitStartY, this.delimitCurrentY);
    const w = Math.abs(this.delimitCurrentX - this.delimitStartX);
    const h = Math.abs(this.delimitCurrentY - this.delimitStartY);

    box.style.left = `${Math.round(x)}px`;
    box.style.top = `${Math.round(y)}px`;
    box.style.width = `${Math.round(w)}px`;
    box.style.height = `${Math.round(h)}px`;

    const dimLabel = box.querySelector(".delimit-dimensions");
    if (dimLabel) {
      dimLabel.textContent = `${Math.round(w)} × ${Math.round(h)} px`;
    }
  }

  _removeDelimitBox() {
    const box = document.getElementById("canvas-delimit-box");
    if (box) box.remove();
  }

  setPendingPlacement(type) {
    this.pendingPlacement = type;
    if (type) {
      this.container.classList.add("placing");
      if (window.MaestriApp) {
        window.MaestriApp.showToast(`Clique em qualquer lugar do canvas para posicionar ${type.toUpperCase()}`);
      }
    } else {
      this.container.classList.remove("placing");
    }
  }

  handlePlacementAt(type, x, y) {
    if (!window.MaestriApp) return;
    if (type === "terminal") {
      window.MaestriApp.openTerminalModalAt(x, y);
    } else if (type === "diagram") {
      window.MaestriApp.createDiagramNodeAt(x, y);
    } else if (type === "note") {
      window.MaestriApp.createNoteNodeAt(x, y);
    } else if (type === "portal") {
      window.MaestriApp.createPortalNodeAt(x, y);
    } else if (type === "text") {
      window.MaestriApp.createTextAnnotationAt(x, y);
    }
  }

  updateTransform() {
    this.world.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.zoom})`;
    const zoomText = document.getElementById("zoom-level-text");
    if (zoomText) {
      zoomText.textContent = `${Math.round(this.zoom * 100)}%`;
    }
  }

  setZoom(delta) {
    const newZoom = Math.min(Math.max(this.zoom + delta, this.minZoom), this.maxZoom);
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;
    this.panX = centerX - (centerX - this.panX) * (newZoom / this.zoom);
    this.panY = centerY - (centerY - this.panY) * (newZoom / this.zoom);
    this.zoom = newZoom;
    this.updateTransform();
    this.wakeRopes();
    if (window.MaestriApp) window.MaestriApp.triggerAutoSave();
  }

  resetZoom() {
    this.zoom = 1.0;
    this.updateTransform();
    this.wakeRopes();
    if (window.MaestriApp) window.MaestriApp.triggerAutoSave();
  }

  fitView(targetNodeEl = null) {
    // If a specific node element is provided, fit that node to view
    if (targetNodeEl) {
      const nodeData = this.nodes.find(n => n.id === targetNodeEl.id);
      if (!nodeData) return;

      const nodeWidth = nodeData.width || targetNodeEl.offsetWidth || 520;
      const nodeHeight = nodeData.height || targetNodeEl.offsetHeight || 320;

      const padding = 60;
      const targetWidth = nodeWidth + padding * 2;
      const targetHeight = nodeHeight + padding * 2;

      const scaleX = window.innerWidth / targetWidth;
      const scaleY = window.innerHeight / targetHeight;
      const newZoom = Math.min(Math.max(Math.min(scaleX, scaleY), this.minZoom), 1.5);

      // Center the node
      this.panX = (window.innerWidth - targetWidth * newZoom) / 2 - (nodeData.x - padding) * newZoom;
      this.panY = (window.innerHeight - targetHeight * newZoom) / 2 - (nodeData.y - padding) * newZoom;
      this.zoom = newZoom;
      this.updateTransform();
      this.wakeRopes();
      if (window.MaestriApp) window.MaestriApp.triggerAutoSave();
      return;
    }

    // Original fitView for all nodes
    if (this.nodes.length === 0) {
      this.panX = 200;
      this.panY = 100;
      this.zoom = 1.0;
      this.updateTransform();
      this.wakeRopes();
      if (window.MaestriApp) window.MaestriApp.triggerAutoSave();
      return;
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    this.nodes.forEach(n => {
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + (n.width || 200));
      maxY = Math.max(maxY, n.y + (n.height || 150));
    });

    const padding = 80;
    const width = maxX - minX + padding * 2;
    const height = maxY - minY + padding * 2;

    const scaleX = window.innerWidth / width;
    const scaleY = window.innerHeight / height;
    this.zoom = Math.min(Math.max(Math.min(scaleX, scaleY), this.minZoom), 1.2);

    this.panX = (window.innerWidth - width * this.zoom) / 2 - (minX - padding) * this.zoom;
    this.panY = (window.innerHeight - height * this.zoom) / 2 - (minY - padding) * this.zoom;
    this.updateTransform();
    this.wakeRopes();
    if (window.MaestriApp) window.MaestriApp.triggerAutoSave();
  }

  /**
   * Ensures tactile magnetic anchor ports (pins) exist on all 4 borders of the node.
   */
  _ensureNodePins(el, nodeData) {
    if (!el.querySelector(".node-pin")) {
      const sides = ["top", "right", "bottom", "left"];
      sides.forEach(side => {
        const pin = document.createElement("div");
        pin.className = `node-pin pin-${side}`;
        pin.setAttribute("data-side", side);
        pin.setAttribute("data-node-id", nodeData.id);
        pin.title = `Porta Magnética (${side.toUpperCase()})`;

        pin.addEventListener("mousedown", (e) => {
          e.stopPropagation();
        });

        pin.addEventListener("click", (e) => {
          e.stopPropagation();
          e.preventDefault();
          if (this.isConnecting) {
            this.handleConnectClick(nodeData.id);
          } else {
            if (window.MaestriApp) {
              window.MaestriApp.startConnect(nodeData.id);
            }
          }
        });

        el.appendChild(pin);
      });
    }
  }

  registerNodeElement(el, nodeData) {
    this._ensureNodePins(el, nodeData);

    el.addEventListener("mousedown", (e) => {
      // If currently in connecting mode, clicking anywhere on this target node completes the connection!
      if (this.isConnecting) {
        e.stopPropagation();
        e.preventDefault();
        this.handleConnectClick(nodeData.id);
        return;
      }

      // Exclude header interactive elements from starting drag
      const isHeaderInteractive = e.target.closest(
        ".terminal-header-modern, " +
        ".window-dots-modern, " +
        ".window-dot, " +
        ".preset-badge, " +
        ".status-indicator, " +
        ".terminal-title-wrapper, " +
        ".terminal-title-display, " +
        ".terminal-title-input, " +
        ".edit-title-btn, " +
        ".terminal-action-bar, " +
        ".action-btn"
      );

      if (["input", "button", "textarea", "select"].includes(e.target.tagName.toLowerCase()) || isHeaderInteractive) {
        return;
      }
      if (e.target.closest(".term-body") || e.target.closest(".portal-frame") || e.target.closest(".terminal-body-modern")) {
        this.selectNode(nodeData.id, e.shiftKey);
        return;
      }

      e.stopPropagation();

      const isAlreadySelected = this.selectedNodeIds.has(nodeData.id);

      if (e.shiftKey) {
        this.selectNode(nodeData.id, true);
      } else {
        if (!isAlreadySelected) {
          this.selectNode(nodeData.id, false);
        }
      }

      this.activeDragNode = el;
      const mouseX = (e.clientX - this.panX) / this.zoom;
      const mouseY = (e.clientY - this.panY) / this.zoom;
      this.dragStartMouseX = mouseX;
      this.dragStartMouseY = mouseY;
      this.dragOffsetX = mouseX - el.offsetLeft;
      this.dragOffsetY = mouseY - el.offsetTop;

      // Armazena posições iniciais para movimentação de múltiplos nós em bloco
      this.dragInitialPositions.clear();
      if (this.selectedNodeIds.size > 1 && this.selectedNodeIds.has(nodeData.id)) {
        this.selectedNodeIds.forEach(id => {
          const n = this.nodes.find(item => item.id === id);
          if (n) {
            this.dragInitialPositions.set(id, { x: n.x, y: n.y });
          }
        });
      }
    });

    // Resize observer to update node dimensions and wake rope simulation smoothly
    if (window.ResizeObserver) {
      let saveTimer = null;
      const ro = new ResizeObserver(() => {
        const nodeObj = this.nodes.find(n => n.id === nodeData.id);
        if (nodeObj && (el.offsetWidth !== nodeObj.width || el.offsetHeight !== nodeObj.height)) {
          nodeObj.width = el.offsetWidth;
          nodeObj.height = el.offsetHeight;

          this.wakeRopes();

          if (window.MaestriApp) {
            if (nodeObj.type === "terminal") {
              window.MaestriApp.termController.resizeTerminal(nodeData.id, true);
            }
            clearTimeout(saveTimer);
            saveTimer = setTimeout(() => {
              window.MaestriApp.triggerAutoSave();
            }, 800);
          }
        }
      });
      ro.observe(el);
    }
  }

  selectNode(nodeId, isMulti = false) {
    if (!isMulti) {
      this.clearSelection();
      this.selectedNodeId = nodeId;
      this.selectedNodeIds.add(nodeId);
    } else {
      if (this.selectedNodeIds.has(nodeId)) {
        this.deselectNode(nodeId);
        return;
      } else {
        this.selectedNodeIds.add(nodeId);
        this.selectedNodeId = nodeId;
      }
    }

    try {
      localStorage.setItem("maestri_last_active_node", nodeId);
    } catch (e) {}

    const el = document.getElementById(nodeId);
    if (el) {
      el.classList.add("selected");
    }

    // Official Maestri Parity: Reveal Secondary Action Bar & Floating Prompter
    this._showSecondaryBar(nodeId);
    this._showFloatingPrompter(nodeId, el);

    if (this.selectedNodeIds.size === 1) {
      if (el) this.showContextBar(el, nodeId);
    } else if (this.selectedNodeIds.size > 1) {
      this.showMultiContextBar();
    }
  }

  deselectNode(nodeId) {
    this.selectedNodeIds.delete(nodeId);
    const el = document.getElementById(nodeId);
    if (el) el.classList.remove("selected");
    if (this.selectedNodeId === nodeId) {
      this.selectedNodeId = this.selectedNodeIds.size > 0 ? Array.from(this.selectedNodeIds)[0] : null;
    }
    if (this.selectedNodeIds.size === 1) {
      const remaining = document.getElementById(this.selectedNodeId);
      if (remaining) {
        this.showContextBar(remaining, this.selectedNodeId);
        this._showFloatingPrompter(this.selectedNodeId, remaining);
      }
    } else if (this.selectedNodeIds.size > 1) {
      this.showMultiContextBar();
    } else {
      this.clearSelection();
    }
  }

  clearSelection() {
    this.selectedNodeId = null;
    this.selectedNodeIds.clear();
    document.querySelectorAll(".canvas-node.selected").forEach(el => el.classList.remove("selected"));
    const bar = document.getElementById("node-context-bar");
    if (bar) bar.remove();

    // Official Maestri Parity: Hide Secondary Action Bar & Floating Prompter
    this._hideSecondaryBar();
    this._hideFloatingPrompter();
  }

  _showSecondaryBar(nodeId) {
    const secBar = document.getElementById("node-secondary-action-bar");
    if (secBar) secBar.classList.remove("hidden");
  }

  _hideSecondaryBar() {
    const secBar = document.getElementById("node-secondary-action-bar");
    if (secBar) secBar.classList.add("hidden");
  }

  _showFloatingPrompter(nodeId, nodeEl) {
    const prompter = document.getElementById("canvas-floating-prompter");
    if (!prompter || !nodeEl) return;

    const node = this.nodes.find(n => n.id === nodeId);
    const title = node?.title || nodeId;

    prompter.classList.remove("hidden");
    const input = document.getElementById("prompter-input");
    if (input) {
      input.placeholder = `Mensagem para ${title}. @ para mencionar • Esc para fechar`;
    }

    if (prompter.parentNode !== nodeEl) {
      nodeEl.appendChild(prompter);
    }
  }

  _hideFloatingPrompter() {
    const prompter = document.getElementById("canvas-floating-prompter");
    if (!prompter) return;
    prompter.classList.add("hidden");
    if (prompter.parentNode !== document.body) {
      document.body.appendChild(prompter);
    }
  }

  _bindSecondaryAndPrompterEvents() {
    // Secondary Action Bar buttons
    document.getElementById("sec-btn-edit")?.addEventListener("click", (e) => {
      e.stopPropagation();
      if (this.selectedNodeId && window.MaestriApp) {
        window.MaestriApp.startRenameNode(this.selectedNodeId);
      }
    });

    document.getElementById("sec-btn-binder")?.addEventListener("click", (e) => {
      e.stopPropagation();
      if (this.selectedNodeId && window.MaestriApp) {
        const node = this.nodes.find(n => n.id === this.selectedNodeId);
        if (node?.type === "note") {
          window.MaestriApp.focusNode(this.selectedNodeId);
        } else {
          window.MaestriApp.showToast(`Fichário conectado ao nó ${node?.title || this.selectedNodeId}`);
        }
      }
    });

    document.getElementById("sec-btn-view")?.addEventListener("click", (e) => {
      e.stopPropagation();
      if (this.selectedNodeId && window.MaestriApp) {
        window.MaestriApp.focusNode(this.selectedNodeId);
      }
    });

    document.getElementById("sec-btn-color")?.addEventListener("click", (e) => {
      e.stopPropagation();
      if (this.selectedNodeId && window.MaestriApp) {
        window.MaestriApp.toggleOrchestrator(this.selectedNodeId);
      }
    });

    document.getElementById("sec-btn-reload")?.addEventListener("click", (e) => {
      e.stopPropagation();
      if (this.selectedNodeId && window.MaestriApp) {
        window.MaestriApp.showToast("Recarregando sessão do nó...");
        if (window.MaestriApp.terminalManager) {
          const t = window.MaestriApp.terminalManager.terminals[this.selectedNodeId];
          if (t && t.ws) {
            t.ws.send(JSON.stringify({ type: "input", data: "\x0c" }));
          }
        }
      }
    });

    document.getElementById("sec-btn-delete")?.addEventListener("click", (e) => {
      e.stopPropagation();
      if (this.selectedNodeId && window.MaestriApp) {
        window.MaestriApp.deleteNode(this.selectedNodeId);
      }
    });

    // Floating Prompter events
    const prompter = document.getElementById("canvas-floating-prompter");
    if (prompter) {
      prompter.addEventListener("mousedown", (e) => {
        e.stopPropagation();
      });
      prompter.addEventListener("click", (e) => {
        e.stopPropagation();
      });
    }

    const prompterInput = document.getElementById("prompter-input");
    const prompterSendBtn = document.getElementById("prompter-btn-send");

    const doSend = () => {
      if (!prompterInput) return;
      const msg = prompterInput.value.trim();
      if (!msg || !this.selectedNodeId) return;

      const node = this.nodes.find(n => n.id === this.selectedNodeId);
      const termItem = window.MaestriApp?.terminalManager?.terminals[this.selectedNodeId];

      if (termItem && termItem.ws && termItem.ws.readyState === WebSocket.OPEN) {
        termItem.ws.send(JSON.stringify({ type: "input", data: msg + "\r" }));
        if (window.MaestriApp) window.MaestriApp.showToast(`Ordem enviada para ${node?.title || "terminal"}: "${msg}"`);
      } else {
        fetch('/api/terminal/send-text', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: this.selectedNodeId, text: msg })
        }).catch(console.warn);
        if (window.MaestriApp) window.MaestriApp.showToast(`Mensagem para ${node?.title || "nó"}: "${msg}"`);
      }

      this.wakeRopes();
      prompterInput.value = "";
    };

    if (prompterSendBtn) {
      prompterSendBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        doSend();
      });
    }

    if (prompterInput) {
      prompterInput.addEventListener("keydown", (e) => {
        e.stopPropagation();
        if (e.key === "Enter") {
          e.preventDefault();
          doSend();
        } else if (e.key === "Escape") {
          e.preventDefault();
          this.clearSelection();
        }
      });
    }

    document.getElementById("prompter-btn-attach")?.addEventListener("click", (e) => {
      e.stopPropagation();
      if (window.MaestriApp) {
        window.MaestriApp.showToast("Anexo: selecione um arquivo ou adicione anotação de contexto.");
      }
    });

    // Mini Dock HUD events
    document.getElementById("btn-hud-layers")?.addEventListener("click", (e) => {
      e.stopPropagation();
      if (window.MaestriApp) {
        window.MaestriApp.showToast("Camadas: todas as conexões e nós visíveis");
      }
    });

    document.getElementById("btn-hud-minimap")?.addEventListener("click", (e) => {
      e.stopPropagation();
      if (window.MaestriApp) {
        window.MaestriApp.showToast("Minimapa alternado");
      }
    });
  }

  _ensureMarqueeBox() {
    let box = document.getElementById("canvas-marquee-box");
    if (!box) {
      box = document.createElement("div");
      box.id = "canvas-marquee-box";
      box.className = "canvas-marquee-box";
      box.innerHTML = `<span class="marquee-count-badge" style="display:none;">0 nós</span>`;
      this.world.appendChild(box);
    }
  }

  _updateMarqueeBox() {
    const box = document.getElementById("canvas-marquee-box");
    if (!box) return;
    const x = Math.min(this.marqueeStartX, this.marqueeCurrentX);
    const y = Math.min(this.marqueeStartY, this.marqueeCurrentY);
    const w = Math.abs(this.marqueeCurrentX - this.marqueeStartX);
    const h = Math.abs(this.marqueeCurrentY - this.marqueeStartY);

    box.style.left = `${Math.round(x)}px`;
    box.style.top = `${Math.round(y)}px`;
    box.style.width = `${Math.round(w)}px`;
    box.style.height = `${Math.round(h)}px`;
  }

  _highlightNodesInMarquee(isAdditive = false) {
    const x1 = Math.min(this.marqueeStartX, this.marqueeCurrentX);
    const y1 = Math.min(this.marqueeStartY, this.marqueeCurrentY);
    const x2 = Math.max(this.marqueeStartX, this.marqueeCurrentX);
    const y2 = Math.max(this.marqueeStartY, this.marqueeCurrentY);

    let count = 0;
    this.nodes.forEach(node => {
      const el = document.getElementById(node.id);
      if (!el) return;
      const w = node.width || el.offsetWidth || 520;
      const h = node.height || el.offsetHeight || 320;
      const intersects = !(node.x > x2 || (node.x + w) < x1 || node.y > y2 || (node.y + h) < y1);

      if (intersects) {
        el.classList.add("selected");
        count++;
      } else if (!isAdditive || !this.selectedNodeIds.has(node.id)) {
        el.classList.remove("selected");
      }
    });

    const box = document.getElementById("canvas-marquee-box");
    const badge = box?.querySelector(".marquee-count-badge");
    if (badge) {
      badge.textContent = `${count} nó${count === 1 ? '' : 's'}`;
      badge.style.display = count > 0 ? "inline-flex" : "none";
    }
  }

  _finalizeMarqueeSelection() {
    const x1 = Math.min(this.marqueeStartX, this.marqueeCurrentX);
    const y1 = Math.min(this.marqueeStartY, this.marqueeCurrentY);
    const x2 = Math.max(this.marqueeStartX, this.marqueeCurrentX);
    const y2 = Math.max(this.marqueeStartY, this.marqueeCurrentY);

    this.nodes.forEach(node => {
      const el = document.getElementById(node.id);
      if (!el) return;
      const w = node.width || el.offsetWidth || 520;
      const h = node.height || el.offsetHeight || 320;
      const intersects = !(node.x > x2 || (node.x + w) < x1 || node.y > y2 || (node.y + h) < y1);

      if (intersects) {
        this.selectedNodeIds.add(node.id);
        el.classList.add("selected");
      }
    });

    if (this.selectedNodeIds.size === 1) {
      const singleId = Array.from(this.selectedNodeIds)[0];
      this.selectedNodeId = singleId;
      const el = document.getElementById(singleId);
      if (el) this.showContextBar(el, singleId);
    } else if (this.selectedNodeIds.size > 1) {
      this.selectedNodeId = null;
      this.showMultiContextBar();
    }
  }

  _removeMarqueeBox() {
    const box = document.getElementById("canvas-marquee-box");
    if (box) box.remove();
  }

  showMultiContextBar() {
    const existing = document.getElementById("node-context-bar");
    if (existing) existing.remove();

    if (this.selectedNodeIds.size <= 1) return;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    this.selectedNodeIds.forEach(id => {
      const n = this.nodes.find(item => item.id === id);
      const el = document.getElementById(id);
      if (n) {
        const w = n.width || el?.offsetWidth || 520;
        const h = n.height || el?.offsetHeight || 320;
        minX = Math.min(minX, n.x);
        minY = Math.min(minY, n.y);
        maxX = Math.max(maxX, n.x + w);
        maxY = Math.max(maxY, n.y + h);
      }
    });

    const bar = document.createElement("div");
    bar.id = "node-context-bar";
    bar.className = "node-context-bar multi-selection-bar";
    bar.style.position = "absolute";
    bar.style.left = `${Math.round((minX + maxX) / 2)}px`;
    bar.style.top = `${Math.round(minY - 48)}px`;
    bar.style.transform = "translateX(-50%)";

    bar.innerHTML = `
      <span class="multi-count-pill">${this.selectedNodeIds.size} Nós Selecionados</span>
      <button class="context-btn" title="Conectar nós selecionados em sequência" onclick="window.MaestriApp.connectSelectedChain()">
        <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
      </button>
      <button class="context-btn danger" title="Excluir todos os nós selecionados" onclick="window.MaestriApp.deleteSelectedNodes()">
        <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7c-1 0-2-1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
      </button>
      <button class="context-btn" title="Desmarcar seleção (Esc)" onclick="window.MaestriApp.canvas.clearSelection()">
        <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
      </button>
    `;
    this.world.appendChild(bar);
  }

  selectAllNodes() {
    this.clearSelection();
    this.nodes.forEach(n => {
      this.selectedNodeIds.add(n.id);
      const el = document.getElementById(n.id);
      if (el) el.classList.add("selected");
    });
    if (this.selectedNodeIds.size === 1) {
      this.selectedNodeId = Array.from(this.selectedNodeIds)[0];
      const el = document.getElementById(this.selectedNodeId);
      if (el) this.showContextBar(el, this.selectedNodeId);
    } else if (this.selectedNodeIds.size > 1) {
      this.showMultiContextBar();
    }
  }

  showContextBar(nodeEl, nodeId) {
    const existing = document.getElementById("node-context-bar");
    if (existing) existing.remove();

    const node = this.nodes.find(n => n.id === nodeId);
    const isOrch = node?.is_orchestrator;

    const bar = document.createElement("div");
    bar.id = "node-context-bar";
    bar.className = "node-context-bar";
    bar.innerHTML = `
      <button class="context-btn ${isOrch ? 'active-orch' : ''}" title="${isOrch ? 'Remover função de Chefe' : 'Tornar Chefe / Orquestrador'}" onclick="window.MaestriApp.toggleOrchestrator('${nodeId}')">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="${isOrch ? '#eab308' : 'none'}" stroke="${isOrch ? '#eab308' : 'currentColor'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7zm3 16h14"></path>
        </svg>
      </button>
      <button class="context-btn" title="Conectar a outro nó (Compartilhar dados)" onclick="window.MaestriApp.startConnect('${nodeId}')">
        <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
      </button>
      <button class="context-btn" title="Enviar Saída para Nós Conectados" onclick="window.MaestriApp.broadcastFromNode('${nodeId}')">
        <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path d="m22 2-7 20-4-9-9-4Z"></path><path d="M22 2 11 13"></path></svg>
      </button>
      <button class="context-btn" title="Desconectar todas as ligações deste nó" onclick="window.MaestriApp.disconnectNode('${nodeId}')">
        <svg width="15" height="15" fill="none" stroke="#ef4444" stroke-width="2" viewBox="0 0 24 24"><path d="M18.36 6.64a9 9 0 1 1-12.73 0"></path><line x1="12" y1="2" x2="12" y2="12"></line></svg>
      </button>
      <button class="context-btn" title="Duplicar" onclick="window.MaestriApp.duplicateNode('${nodeId}')">
        <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
      </button>
      <button class="context-btn danger" title="Excluir" onclick="window.MaestriApp.deleteNode('${nodeId}')">
        <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
      </button>
    `;
    nodeEl.appendChild(bar);
  }

  handleConnectClick(targetId) {
    this.removeConnectionPreview();
    if (this.connectSourceId && this.connectSourceId !== targetId) {
      const alreadyConnected = this.edges.some(e => e.from === this.connectSourceId && e.to === targetId);
      if (!alreadyConnected) {
        const sourceNode = this.nodes.find(n => n.id === this.connectSourceId);
        const isOrch = sourceNode?.is_orchestrator;

        this.edges.push({
          id: `edge_${Date.now()}`,
          from: this.connectSourceId,
          to: targetId,
          style: isOrch ? "orchestrator" : "dashed",
          color: isOrch ? "#eab308" : "#38bdf8"
        });
        this.renderEdges();
        if (window.MaestriApp) {
          window.MaestriApp.showToast(`Nós conectados com sucesso!`);
          window.MaestriApp.updateAllConnectionStatus();
          window.MaestriApp.triggerAutoSave();
        }
      } else {
        if (window.MaestriApp) window.MaestriApp.showToast("Estes nós já estão conectados.");
      }
    }
    this.cancelConnect();
  }

  cancelConnect() {
    this.isConnecting = false;
    this.connectSourceId = null;
    this.container.classList.remove("connecting");
    document.querySelectorAll(".connecting-source").forEach(el => el.classList.remove("connecting-source"));
    this.removeConnectionPreview();
  }

  /**
   * Updates live tactile preview cable extending from source node to current cursor position.
   */
  updateConnectionPreview(targetX, targetY) {
    const sourceNode = this.nodes.find(n => n.id === this.connectSourceId);
    const sourceEl = document.getElementById(this.connectSourceId);
    if (!sourceNode && !sourceEl) return;

    const sourceRect = {
      x: sourceNode ? sourceNode.x : sourceEl.offsetLeft,
      y: sourceNode ? sourceNode.y : sourceEl.offsetTop,
      width: sourceNode?.width || sourceEl.offsetWidth || 200,
      height: sourceNode?.height || sourceEl.offsetHeight || 150
    };

    const targetFrame = { x: targetX - 5, y: targetY - 5, width: 10, height: 10 };
    const { start } = closestEdgePins(sourceRect, targetFrame);
    const end = { x: targetX, y: targetY };

    const pts = staticRopePoints(start, end);
    const d = buildSmoothPath(pts);

    let previewEl = document.getElementById("canvas-edge-preview");
    if (!previewEl) {
      previewEl = document.createElementNS("http://www.w3.org/2000/svg", "path");
      previewEl.setAttribute("id", "canvas-edge-preview");
      previewEl.setAttribute("class", "edge-preview-path");
      this.svgLayer.appendChild(previewEl);
    }
    previewEl.setAttribute("d", d);
  }

  removeConnectionPreview() {
    const previewEl = document.getElementById("canvas-edge-preview");
    if (previewEl) previewEl.remove();
  }

  /**
   * Cuts a cable connection with tactile scissor animation and severs the edge.
   */
  cutEdge(edgeId) {
    const g = document.getElementById(`edge_group_${edgeId}`);
    if (g) {
      g.classList.add("edge-cutting");
    }
    setTimeout(() => {
      if (window.MaestriApp) {
        window.MaestriApp.deleteEdge(edgeId);
      } else {
        this.edges = this.edges.filter(e => e.id !== edgeId);
        this.renderEdges();
      }
    }, 160);
  }

  /**
   * Wakes all active ropes and kicks off the 60fps physics simulation loop.
   */
  wakeRopes() {
    this.ropes.forEach(rope => rope.wakeUp());
    this.startPhysicsLoop();
  }

  startPhysicsLoop() {
    if (this.isPhysicsLoopRunning) return;
    this.isPhysicsLoopRunning = true;
    this._runPhysicsLoop();
  }

  _runPhysicsLoop() {
    if (!this.isPhysicsLoopRunning) return;

    const activeCount = this.stepPhysics();

    if (activeCount > 0) {
      this.physicsRaf = requestAnimationFrame(() => this._runPhysicsLoop());
    } else {
      // Settle down to save 100% CPU when movement falls below SLEEP_THRESHOLD
      this.isPhysicsLoopRunning = false;
      this.physicsRaf = null;
    }
  }

  /**
   * Advances the Verlet integration for all ropes, resolves constraints,
   * detects obstacle collisions, animates transmission pulses, and updates SVG path 'd'.
   */
  stepPhysics() {
    if (this.edges.length === 0) {
      this.isPhysicsLoopRunning = false;
      return 0;
    }

    // Collect bounding boxes of all nodes
    const nodeFrames = new Map();
    for (const node of this.nodes) {
      const el = document.getElementById(node.id);
      nodeFrames.set(node.id, {
        id: node.id,
        x: node.x !== undefined ? node.x : (el ? el.offsetLeft : 0),
        y: node.y !== undefined ? node.y : (el ? el.offsetTop : 0),
        width: node.width !== undefined ? node.width : (el ? el.offsetWidth : 200),
        height: node.height !== undefined ? node.height : (el ? el.offsetHeight : 150)
      });
    }

    const pluggedPins = new Set();
    let activeRopes = 0;
    const now = performance.now();

    for (const edge of this.edges) {
      const rope = this.ropes.get(edge.id);
      if (!rope) continue;

      const frameA = nodeFrames.get(edge.from);
      const frameB = nodeFrames.get(edge.to);
      if (!frameA || !frameB) continue;

      const { start, end } = closestEdgePins(frameA, frameB);
      rope.setPins(start, end);

      const isOrch = (edge.style === "orchestrator" || edge.color === "#eab308");
      pluggedPins.add(`${edge.from}_${start.side}${isOrch ? '_orch' : ''}`);
      pluggedPins.add(`${edge.to}_${end.side}${isOrch ? '_orch' : ''}`);

      // Obstacles for this rope: all other nodes on the canvas
      const obstacles = [];
      for (const [id, frame] of nodeFrames) {
        if (id !== edge.from && id !== edge.to) {
          obstacles.push(frame);
        }
      }

      // Step physics
      rope.step(FIXED_DT, obstacles);

      if (!rope.isSleeping) {
        activeRopes++;
      }

      const isTransmitting = (edge.visualState === "dispatching" || edge.isCommunicating);
      const isProcessing = (edge.visualState === "processing");
      if (isTransmitting || isProcessing) {
        activeRopes++; // keep simulation loop awake for energetic data pulse
      }

      // Redraw SVG path 'd' using Catmull-Rom cubic Bezier spline
      const d = buildSmoothPath(rope.points);
      const pathEl = document.getElementById(`edge_path_${edge.id}`);
      const hitEl = document.getElementById(`edge_hit_${edge.id}`);
      const badgeEl = document.getElementById(`edge_badge_${edge.id}`);
      const photonEl = document.getElementById(`edge_photon_${edge.id}`);

      if (pathEl) pathEl.setAttribute("d", d);
      if (hitEl) hitEl.setAttribute("d", d);

      // Midpoint badge at point 10 (middle of the 21 points)
      if (badgeEl && rope.points.length > 10) {
        const mid = rope.points[10];
        badgeEl.setAttribute("transform", `translate(${f(mid.x)}, ${f(mid.y)})`);
      }

      // Dynamic Energy Photon Pulse
      if (photonEl) {
        if (isTransmitting || isProcessing) {
          photonEl.style.display = "block";
          const speed = isTransmitting ? 850 : 1100;
          const t = (now % speed) / speed;
          const segFloat = t * SEGMENT_COUNT;
          const segIdx = Math.min(Math.floor(segFloat), SEGMENT_COUNT - 1);
          const segT = segFloat - segIdx;
          const pA = rope.points[segIdx];
          const pB = rope.points[segIdx + 1];
          const px = pA.x + (pB.x - pA.x) * segT;
          const py = pA.y + (pB.y - pA.y) * segT;
          photonEl.setAttribute("cx", f(px));
          photonEl.setAttribute("cy", f(py));
          photonEl.setAttribute("fill", isTransmitting ? "#f59e0b" : "#10b981");
        } else {
          photonEl.style.display = "none";
        }
      }
    }

    // Update illuminated plugged status on magnetic anchor pins
    document.querySelectorAll(".node-pin").forEach(pin => {
      const nid = pin.getAttribute("data-node-id");
      const side = pin.getAttribute("data-side");
      const isPlugged = pluggedPins.has(`${nid}_${side}`) || pluggedPins.has(`${nid}_${side}_orch`);
      const isOrchPlugged = pluggedPins.has(`${nid}_${side}_orch`);

      pin.classList.toggle("plugged", isPlugged);
      pin.classList.toggle("orch", isOrchPlugged);
    });

    return activeRopes;
  }

  /**
   * Reconciles DOM SVG groups with active edge connections and synchronizes Rope physics instances.
   */
  renderEdges() {
    const currentEdgeIds = new Set(this.edges.map(e => e.id));

    // Remove deleted ropes & SVG elements
    for (const [id, _rope] of this.ropes) {
      if (!currentEdgeIds.has(id)) {
        this.ropes.delete(id);
        const g = document.getElementById(`edge_group_${id}`);
        if (g) g.remove();
      }
    }

    this.edges.forEach(edge => {
      const fromNode = this.nodes.find(n => n.id === edge.from);
      const toNode = this.nodes.find(n => n.id === edge.to);
      const fromEl = document.getElementById(edge.from);
      const toEl = document.getElementById(edge.to);

      if ((!fromNode && !fromEl) || (!toNode && !toEl)) return;

      const frameA = {
        x: fromNode ? fromNode.x : fromEl.offsetLeft,
        y: fromNode ? fromNode.y : fromEl.offsetTop,
        width: fromNode?.width || fromEl.offsetWidth || 200,
        height: fromNode?.height || fromEl.offsetHeight || 150
      };
      const frameB = {
        x: toNode ? toNode.x : toEl.offsetLeft,
        y: toNode ? toNode.y : toEl.offsetTop,
        width: toNode?.width || toEl.offsetWidth || 200,
        height: toNode?.height || toEl.offsetHeight || 150
      };

      const { start, end } = closestEdgePins(frameA, frameB);

      // Create or update Rope instance
      let rope = this.ropes.get(edge.id);
      if (!rope) {
        rope = new Rope(start, end);
        this.ropes.set(edge.id, rope);
      } else {
        rope.setPins(start, end);
      }

      // Ensure SVG DOM structure
      let g = document.getElementById(`edge_group_${edge.id}`);
      if (!g) {
        g = document.createElementNS("http://www.w3.org/2000/svg", "g");
        g.setAttribute("class", "edge-group");
        g.setAttribute("id", `edge_group_${edge.id}`);
        g.setAttribute("data-edge-id", edge.id);

        const hitArea = document.createElementNS("http://www.w3.org/2000/svg", "path");
        hitArea.setAttribute("id", `edge_hit_${edge.id}`);
        hitArea.setAttribute("class", "edge-hit-area");
        g.appendChild(hitArea);

        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("id", `edge_path_${edge.id}`);
        g.appendChild(path);

        const photon = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        photon.setAttribute("id", `edge_photon_${edge.id}`);
        photon.setAttribute("class", "edge-photon");
        photon.setAttribute("r", "5");
        photon.style.display = "none";
        g.appendChild(photon);

        // Tactile Scissor Cut Badge
        const delBadge = document.createElementNS("http://www.w3.org/2000/svg", "g");
        delBadge.setAttribute("id", `edge_badge_${edge.id}`);
        delBadge.setAttribute("class", "edge-del-badge");
        delBadge.innerHTML = `
          <circle r="13" class="edge-del-circle" />
          <g transform="translate(-7, -7) scale(0.58)">
            <svg class="edge-scissor-svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f87171" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="6" cy="6" r="3"/>
              <circle cx="6" cy="18" r="3"/>
              <line x1="20" y1="4" x2="8.12" y2="15.88"/>
              <line x1="14.47" y1="14.48" x2="20" y2="20"/>
              <line x1="8.12" y1="8.12" x2="12" y2="12"/>
            </svg>
          </g>
          <title>Cortar conexão (Tesoura)</title>
        `;

        delBadge.addEventListener("click", (e) => {
          e.stopPropagation();
          this.cutEdge(edge.id);
        });

        g.appendChild(delBadge);
        this.svgLayer.appendChild(g);
      }

      // Visual styling, states & arrowheads
      const isTransmitting = (edge.visualState === "dispatching" || edge.isCommunicating);
      const isProcessing = (edge.visualState === "processing");
      const isOrch = (edge.style === "orchestrator" || edge.color === "#eab308");
      const isObserverEdge = (fromNode && fromNode.is_controllable === false) || (toNode && toNode.is_controllable === false);

      let pathClass = `edge-path ${edge.style || "solid"}`;
      let strokeColor = edge.color || "#64748b";
      let markerId = "arrowhead";

      if (isTransmitting) {
        pathClass += " edge-order-transmitting";
        strokeColor = "#f59e0b";
        markerId = "arrowhead-transmitting";
      } else if (isProcessing) {
        pathClass += " edge-order-processing";
        strokeColor = "#10b981";
        markerId = "arrowhead-processing";
      } else if (isObserverEdge) {
        pathClass += " edge-observer-feed";
        strokeColor = "#06b6d4";
        markerId = "arrowhead-cyan";
      } else if (isOrch || strokeColor === "#eab308") {
        markerId = "arrowhead-orch";
        strokeColor = "#eab308";
      } else if (strokeColor === "#a855f7") {
        markerId = "arrowhead-purple";
      } else if (strokeColor === "#3b82f6") {
        markerId = "arrowhead-blue";
      } else {
        markerId = "arrowhead";
      }

      const pathEl = document.getElementById(`edge_path_${edge.id}`);
      if (pathEl) {
        pathEl.setAttribute("class", pathClass);
        pathEl.setAttribute("stroke", strokeColor);
        pathEl.setAttribute("marker-end", `url(#${markerId})`);
      }
    });

    this.wakeRopes();
  }
}

// Exports for browser and Node.js testing environments
if (typeof window !== "undefined") {
  window.SEGMENT_COUNT = SEGMENT_COUNT;
  window.POINT_COUNT = POINT_COUNT;
  window.GRAVITY_Y = GRAVITY_Y;
  window.FIXED_DT = FIXED_DT;
  window.DAMPING = DAMPING;
  window.SLACK_FACTOR = SLACK_FACTOR;
  window.CONSTRAINT_ITERATIONS = CONSTRAINT_ITERATIONS;
  window.OBSTACLE_PADDING = OBSTACLE_PADDING;
  window.OBSTACLE_CORNER_ZONE = OBSTACLE_CORNER_ZONE;
  window.OBSTACLE_BLEND = OBSTACLE_BLEND;
  window.SLEEP_THRESHOLD = SLEEP_THRESHOLD;
  window.staticRopePoints = staticRopePoints;
  window.buildSmoothPath = buildSmoothPath;
  window.pushOutOfObstacles = pushOutOfObstacles;
  window.edgeMidpoints = edgeMidpoints;
  window.closestEdgePins = closestEdgePins;
  window.Rope = Rope;
  window.MaestriCanvas = MaestriCanvas;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    SEGMENT_COUNT,
    POINT_COUNT,
    GRAVITY_Y,
    FIXED_DT,
    DAMPING,
    SLACK_FACTOR,
    CONSTRAINT_ITERATIONS,
    OBSTACLE_PADDING,
    OBSTACLE_CORNER_ZONE,
    OBSTACLE_BLEND,
    SLEEP_THRESHOLD,
    staticRopePoints,
    buildSmoothPath,
    pushOutOfObstacles,
    edgeMidpoints,
    closestEdgePins,
    Rope,
    MaestriCanvas
  };
}
