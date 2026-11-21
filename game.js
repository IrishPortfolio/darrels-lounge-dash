const canvas = document.getElementById("game-canvas");
const ctx = canvas.getContext("2d");

const hudEl = document.getElementById("hud");
const startScreenEl = document.getElementById("start-screen");
const quitScreenEl = document.getElementById("quit-screen");
const quitMessageEl = document.getElementById("quit-message");

const scoreEl = document.getElementById("score");
const timeEl = document.getElementById("time");
const heldFlavorEl = document.getElementById("held-flavor");

const playBtn = document.getElementById("play-btn");
const quitBtn = document.getElementById("quit-btn");
const reopenBtn = document.getElementById("reopen-btn");
const restartBtn = document.getElementById("restart-btn");
const menuBtn = document.getElementById("menu-btn");

// Logical game resolution scaled cleanly to full screen
const BASE_WIDTH = 1280;
const BASE_HEIGHT = 720;

const shopLogo = new Image();
let logoLoaded = false;
shopLogo.onload = () => {
    logoLoaded = true;
};
shopLogo.src = "assets/logo.jpg";

const FLAVORS = [
    { id: "Mint Ice", color: "#34d399", accent: "#a7f3d0" },
    { id: "Strawberry", color: "#fb7185", accent: "#fecdd3" },
    { id: "Mango", color: "#fbbf24", accent: "#fde68a" },
    { id: "Blueberry", color: "#60a5fa", accent: "#bfdbfe" }
];

const CUSTOMER_CLIPARTS = [
    { skin: "#f3c69f", skinShade: "#dfa77c", hair: "#27272a", shirt: "#8b5cf6", shirtShade: "#6d28d9", pants: "#1e293b" },
    { skin: "#e5b085", skinShade: "#c99165", hair: "#451a03", shirt: "#ec4899", shirtShade: "#be185d", pants: "#334155" },
    { skin: "#ffdfc2", skinShade: "#e8be98", hair: "#7c2d12", shirt: "#14b8a6", shirtShade: "#0f766e", pants: "#1e293b" },
    { skin: "#c98a5b", skinShade: "#ab6e41", hair: "#18181b", shirt: "#f97316", shirtShade: "#c2410c", pants: "#27272a" }
];

const CUSTOMER_SLOTS = [
    { x: 225, y: 175, width: 205, height: 155 },
    { x: 537, y: 175, width: 205, height: 155 },
    { x: 849, y: 175, width: 205, height: 155 }
];

const STATIONS = FLAVORS.map((flavor, index) => ({
    flavor: flavor.id,
    color: flavor.color,
    accent: flavor.accent,
    x: 160 + index * 250,
    y: 585,
    width: 210,
    height: 88
}));

let viewTransform = {
    scale: 1,
    offsetX: 0,
    offsetY: 0
};

let screenMode = "MENU"; // "MENU" | "PLAYING" | "QUIT"
let state = {};

function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const width = window.innerWidth;
    const height = window.innerHeight;

    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);

    const scale = Math.min(width / BASE_WIDTH, height / BASE_HEIGHT);
    const offsetX = (width - BASE_WIDTH * scale) / 2;
    const offsetY = (height - BASE_HEIGHT * scale) / 2;

    viewTransform = { scale, offsetX, offsetY, dpr };
}

function createInitialState() {
    return {
        score: 0,
        timeLeft: 60,
        gameOver: false,
        heldFlavor: null,
        customers: [null, null, null],
        spawnTimer: 0,
        lastTimestamp: performance.now(),
        seller: {
            name: "DARREL",
            x: 640,
            y: 445,
            targetX: 640,
            targetY: 445,
            speed: 440,
            isMoving: false,
            walkCycle: 0,
            facing: 1,
            pendingAction: null
        },
        floatingText: null
    };
}

function showScreen(mode) {
    screenMode = mode;

    hudEl.classList.toggle("hidden", mode !== "PLAYING");
    startScreenEl.classList.toggle("hidden", mode !== "MENU");
    quitScreenEl.classList.toggle("hidden", mode !== "QUIT");
}

function startNewGame() {
    state = createInitialState();
    spawnCustomerAtRandomSlot();
    updateHud();
    showScreen("PLAYING");
}

function openQuitScreen(customText) {
    quitMessageEl.textContent = customText;
    showScreen("QUIT");
}

function updateHud() {
    scoreEl.textContent = String(state.score ?? 0);
    timeEl.textContent = String(Math.max(0, Math.ceil(state.timeLeft ?? 60)));
    heldFlavorEl.textContent = state.heldFlavor ?? "None";
}

function spawnCustomerAtRandomSlot() {
    const emptyIndices = state.customers
        .map((slot, idx) => (slot === null ? idx : -1))
        .filter((idx) => idx !== -1);

    if (emptyIndices.length === 0) return;

    const chosenSlot = emptyIndices[Math.floor(Math.random() * emptyIndices.length)];
    const chosenFlavor = FLAVORS[Math.floor(Math.random() * FLAVORS.length)];
    const chosenClip = CUSTOMER_CLIPARTS[Math.floor(Math.random() * CUSTOMER_CLIPARTS.length)];

    state.customers[chosenSlot] = {
        slotIndex: chosenSlot,
        flavor: chosenFlavor.id,
        color: chosenFlavor.color,
        clip: chosenClip,
        patience: 15,
        maxPatience: 15
    };
}

function setFloatingMessage(text, x, y, color = "#f8fafc") {
    state.floatingText = { text, x, y, color, timer: 1.1 };
}

function getLogicalCoordinates(event) {
    const rect = canvas.getBoundingClientRect();
    const cssX = event.clientX - rect.left;
    const cssY = event.clientY - rect.top;

    return {
        x: (cssX - viewTransform.offsetX) / viewTransform.scale,
        y: (cssY - viewTransform.offsetY) / viewTransform.scale
    };
}

function isPointInside(px, py, box) {
    return (
        px >= box.x &&
        px <= box.x + box.width &&
        py >= box.y &&
        py <= box.y + box.height
    );
}

canvas.addEventListener("click", (event) => {
    if (screenMode !== "PLAYING" || state.gameOver) return;

    const { x, y } = getLogicalCoordinates(event);

    // 1. Tap a flavor station to walk there and pick up a flavor
    for (const station of STATIONS) {
        if (isPointInside(x, y, station)) {
            state.seller.targetX = station.x + station.width / 2;
            state.seller.targetY = station.y - 46;
            state.seller.pendingAction = {
                type: "PICK_FLAVOR",
                flavor: station.flavor
            };
            return;
        }
    }

    // 2. Tap a customer slot to walk to the service counter and serve
    for (let i = 0; i < CUSTOMER_SLOTS.length; i++) {
        const slot = CUSTOMER_SLOTS[i];
        if (isPointInside(x, y, slot)) {
            state.seller.targetX = slot.x + slot.width / 2;
            state.seller.targetY = 422;
            state.seller.pendingAction = {
                type: "SERVE_CUSTOMER",
                slotIndex: i
            };
            return;
        }
    }

    // 3. Tap anywhere on the shop floor to walk Darrel there
    state.seller.targetX = Math.max(120, Math.min(BASE_WIDTH - 120, x));
    state.seller.targetY = Math.max(405, Math.min(515, y));
    state.seller.pendingAction = null;
});

function executePendingAction() {
    const action = state.seller.pendingAction;
    if (!action) return;

    if (action.type === "PICK_FLAVOR") {
        state.heldFlavor = action.flavor;
        updateHud();
        setFloatingMessage(`Grabbed ${action.flavor}`, state.seller.x, state.seller.y - 62, "#fde047");
    }

    if (action.type === "SERVE_CUSTOMER") {
        const customer = state.customers[action.slotIndex];
        const slotPos = CUSTOMER_SLOTS[action.slotIndex];

        if (!customer) {
            setFloatingMessage("No customer here", slotPos.x + slotPos.width / 2, slotPos.y - 16, "#cbd5e1");
        } else if (!state.heldFlavor) {
            setFloatingMessage("Grab a flavor first!", slotPos.x + slotPos.width / 2, slotPos.y - 16, "#fbbf24");
        } else if (state.heldFlavor === customer.flavor) {
            state.score += 100;
            state.heldFlavor = null;
            state.customers[action.slotIndex] = null;
            updateHud();
            setFloatingMessage("+100 Served!", slotPos.x + slotPos.width / 2, slotPos.y - 16, "#4ade80");
        } else {
            state.score = Math.max(0, state.score - 25);
            customer.patience = Math.max(0, customer.patience - 2.5);
            updateHud();
            setFloatingMessage("Wrong flavor! -25", slotPos.x + slotPos.width / 2, slotPos.y - 16, "#f87171");
        }
    }

    state.seller.pendingAction = null;
}

function update(dt) {
    if (screenMode !== "PLAYING" || state.gameOver) return;

    state.timeLeft -= dt;
    if (state.timeLeft <= 0) {
        state.timeLeft = 0;
        state.gameOver = true;
        updateHud();
        return;
    }
    updateHud();

    state.spawnTimer += dt;
    if (state.spawnTimer >= 4.2) {
        state.spawnTimer = 0;
        spawnCustomerAtRandomSlot();
    }

    for (let i = 0; i < state.customers.length; i++) {
        const cust = state.customers[i];
        if (!cust) continue;
        cust.patience -= dt;
        if (cust.patience <= 0) {
            state.customers[i] = null;
            state.score = Math.max(0, state.score - 50);
            updateHud();
            const slotPos = CUSTOMER_SLOTS[i];
            setFloatingMessage("Customer left! -50", slotPos.x + slotPos.width / 2, slotPos.y - 16, "#fb7185");
        }
    }

    const dx = state.seller.targetX - state.seller.x;
    const dy = state.seller.targetY - state.seller.y;
    const distance = Math.hypot(dx, dy);

    if (distance > 3) {
        state.seller.isMoving = true;
        if (Math.abs(dx) > 1) {
            state.seller.facing = dx >= 0 ? 1 : -1;
        }
        const step = Math.min(distance, state.seller.speed * dt);
        state.seller.x += (dx / distance) * step;
        state.seller.y += (dy / distance) * step;
        state.seller.walkCycle += dt * 14;
    } else {
        state.seller.x = state.seller.targetX;
        state.seller.y = state.seller.targetY;
        state.seller.isMoving = false;
        state.seller.walkCycle = 0;
        if (state.seller.pendingAction) {
            executePendingAction();
        }
    }

    if (state.floatingText) {
        state.floatingText.y -= 28 * dt;
        state.floatingText.timer -= dt;
        if (state.floatingText.timer <= 0) {
            state.floatingText = null;
        }
    }
}

function drawLogoBadge(x, y, radius) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = "#111319";
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#d4af37";
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(x, y, radius - 3, 0, Math.PI * 2);
    ctx.clip();

    if (logoLoaded) {
        ctx.drawImage(shopLogo, x - radius, y - radius, radius * 2, radius * 2);
    } else {
        ctx.fillStyle = "#f3d27a";
        ctx.font = "bold 18px Georgia";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("DL", x, y);
    }
    ctx.restore();
}

function drawStoreBackdrop() {
    // Outer frame fill so full screen has zero gaps
    ctx.fillStyle = "#0b0e17";
    ctx.fillRect(0, 0, BASE_WIDTH, BASE_HEIGHT);

    // Back wall of store
    const wallGrad = ctx.createLinearGradient(0, 0, 0, 345);
    wallGrad.addColorStop(0, "#1c2235");
    wallGrad.addColorStop(1, "#141928");
    ctx.fillStyle = wallGrad;
    ctx.fillRect(0, 0, BASE_WIDTH, 345);

    // Shop header sign with logo
    ctx.fillStyle = "#10131d";
    ctx.beginPath();
    ctx.roundRect(450, 74, 380, 62, 14);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#d4af37";
    ctx.stroke();

    drawLogoBadge(486, 105, 22);

    ctx.fillStyle = "#f8fafc";
    ctx.font = "bold 19px Segoe UI";
    ctx.textAlign = "left";
    ctx.fillText("DARREL'S LOUNGE", 518, 102);

    ctx.fillStyle = "#e5c158";
    ctx.font = "600 11px Segoe UI";
    ctx.fillText("FLAVOR BAR & COUNTER", 518, 120);

    // Display shelves on left & right walls
    const shelfColors = ["#34d399", "#fb7185", "#fbbf24", "#60a5fa"];
    [85, 995].forEach((sx) => {
        ctx.fillStyle = "#2c354f";
        ctx.beginPath();
        ctx.roundRect(sx, 125, 200, 12, 4);
        ctx.fill();

        for (let b = 0; b < 4; b++) {
            const bx = sx + 22 + b * 42;
            ctx.fillStyle = shelfColors[b];
            ctx.beginPath();
            ctx.roundRect(bx, 96, 18, 28, 4);
            ctx.fill();

            ctx.fillStyle = "#e2e8f0";
            ctx.fillRect(bx + 5, 91, 8, 5);
        }
    });

    // Main shop floor
    const floorGrad = ctx.createLinearGradient(0, 345, 0, BASE_HEIGHT);
    floorGrad.addColorStop(0, "#191f30");
    floorGrad.addColorStop(1, "#111522");
    ctx.fillStyle = floorGrad;
    ctx.fillRect(0, 345, BASE_WIDTH, BASE_HEIGHT - 345);

    // Perspective floor planks
    ctx.strokeStyle = "rgba(148, 163, 184, 0.08)";
    ctx.lineWidth = 1;
    for (let x = 0; x <= BASE_WIDTH; x += 80) {
        ctx.beginPath();
        ctx.moveTo(x, 355);
        ctx.lineTo(x, BASE_HEIGHT);
        ctx.stroke();
    }

    // Service counter
    ctx.fillStyle = "#4b2e19";
    ctx.beginPath();
    ctx.roundRect(120, 340, BASE_WIDTH - 240, 34, 6);
    ctx.fill();

    ctx.fillStyle = "#8a5a36";
    ctx.beginPath();
    ctx.roundRect(114, 333, BASE_WIDTH - 228, 10, 5);
    ctx.fill();

    ctx.strokeStyle = "#2d1a0d";
    ctx.lineWidth = 2;
    ctx.strokeRect(114, 333, BASE_WIDTH - 228, 41);
}

function drawClipArtCustomer(cust, slot) {
    const cx = slot.x + slot.width / 2;
    const baseY = slot.y + 114;
    const clip = cust.clip;
    const isLowPatience = cust.patience / cust.maxPatience < 0.35;

    // Order speech bubble above customer
    ctx.fillStyle = "#0d121f";
    ctx.beginPath();
    ctx.roundRect(slot.x + 22, slot.y - 34, slot.width - 44, 30, 10);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = cust.color;
    ctx.stroke();

    ctx.fillStyle = cust.color;
    ctx.beginPath();
    ctx.arc(slot.x + 40, slot.y - 19, 6, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#f8fafc";
    ctx.font = "bold 13px Segoe UI";
    ctx.textAlign = "left";
    ctx.fillText(cust.flavor, slot.x + 54, slot.y - 14);

    // Ground shadow
    ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
    ctx.beginPath();
    ctx.ellipse(cx, baseY + 28, 22, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    // Clip-art legs & shoes
    ctx.strokeStyle = clip.pants;
    ctx.lineWidth = 7;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(cx - 8, baseY + 10);
    ctx.lineTo(cx - 8, baseY + 26);
    ctx.moveTo(cx + 8, baseY + 10);
    ctx.lineTo(cx + 8, baseY + 26);
    ctx.stroke();

    ctx.fillStyle = "#0f172a";
    ctx.beginPath();
    ctx.ellipse(cx - 9, baseY + 27, 7, 3.5, 0, 0, Math.PI * 2);
    ctx.ellipse(cx + 9, baseY + 27, 7, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Clip-art arms
    ctx.strokeStyle = clip.shirtShade;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(cx - 17, baseY - 12);
    ctx.lineTo(cx - 22, baseY + 4);
    ctx.moveTo(cx + 17, baseY - 12);
    ctx.lineTo(cx + 22, baseY + 4);
    ctx.stroke();

    ctx.fillStyle = clip.skin;
    ctx.beginPath();
    ctx.arc(cx - 22, baseY + 6, 4, 0, Math.PI * 2);
    ctx.arc(cx + 22, baseY + 6, 4, 0, Math.PI * 2);
    ctx.fill();

    // Clip-art torso
    ctx.fillStyle = clip.shirt;
    ctx.beginPath();
    ctx.roundRect(cx - 17, baseY - 18, 34, 28, 9);
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = clip.shirtShade;
    ctx.stroke();

    // Clip-art head with subtle shading
    ctx.fillStyle = clip.skin;
    ctx.beginPath();
    ctx.arc(cx, baseY - 34, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = clip.skinShade;
    ctx.stroke();

    // Clip-art hair
    ctx.fillStyle = clip.hair;
    ctx.beginPath();
    ctx.arc(cx, baseY - 38, 16.5, Math.PI * 0.95, Math.PI * 2.05);
    ctx.closePath();
    ctx.fill();

    // Eyes & expression
    ctx.fillStyle = "#0f172a";
    ctx.beginPath();
    ctx.arc(cx - 5.5, baseY - 33, 2.2, 0, Math.PI * 2);
    ctx.arc(cx + 5.5, baseY - 33, 2.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    if (isLowPatience) {
        // Worried mouth when patience is low
        ctx.arc(cx, baseY - 24, 4, Math.PI * 1.15, Math.PI * 1.85);
    } else {
        // Friendly smile
        ctx.arc(cx, baseY - 28, 4.5, Math.PI * 0.15, Math.PI * 0.85);
    }
    ctx.stroke();

    // Patience bar
    const barW = slot.width - 32;
    const barX = slot.x + 16;
    const barY = slot.y + 141;
    const ratio = Math.max(0, cust.patience / cust.maxPatience);

    ctx.fillStyle = "#090d16";
    ctx.beginPath();
    ctx.roundRect(barX, barY, barW, 9, 4);
    ctx.fill();

    ctx.fillStyle = ratio > 0.4 ? "#22c55e" : "#ef4444";
    ctx.beginPath();
    ctx.roundRect(barX, barY, barW * ratio, 9, 4);
    ctx.fill();
}

function drawClipArtDarrel(seller) {
    const bob = seller.isMoving ? Math.abs(Math.sin(seller.walkCycle)) * 4 : 0;
    const legSwing = seller.isMoving ? Math.sin(seller.walkCycle) * 10 : 0;
    const armSwing = seller.isMoving ? -Math.sin(seller.walkCycle) * 8 : 0;

    const x = seller.x;
    const y = seller.y - bob;

    // Shadow
    ctx.fillStyle = "rgba(0, 0, 0, 0.42)";
    ctx.beginPath();
    ctx.ellipse(seller.x, seller.y + 30, 24, 7, 0, 0, Math.PI * 2);
    ctx.fill();

    // Animated legs & shoes
    ctx.lineCap = "round";
    ctx.strokeStyle = "#1e293b";
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(x - 7, y + 10);
    ctx.lineTo(x - 7 + legSwing, seller.y + 27);
    ctx.moveTo(x + 7, y + 10);
    ctx.lineTo(x + 7 - legSwing, seller.y + 27);
    ctx.stroke();

    ctx.fillStyle = "#090d16";
    ctx.beginPath();
    ctx.ellipse(x - 7 + legSwing, seller.y + 28, 7.5, 4, 0, 0, Math.PI * 2);
    ctx.ellipse(x + 7 - legSwing, seller.y + 28, 7.5, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Left / back arm
    ctx.strokeStyle = "#0369a1";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(x - seller.facing * 16, y - 12);
    ctx.lineTo(x - seller.facing * 20 - armSwing * 0.5, y + 4);
    ctx.stroke();

    // Darrel's uniform shirt + gold trim
    ctx.fillStyle = "#0284c7";
    ctx.beginPath();
    ctx.roundRect(x - 18, y - 18, 36, 30, 9);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#eab308";
    ctx.stroke();

    // Head
    ctx.fillStyle = "#f5cfa0";
    ctx.beginPath();
    ctx.arc(x, y - 35, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "#dfa77c";
    ctx.stroke();

    // Cap & visor
    ctx.fillStyle = "#0f172a";
    ctx.beginPath();
    ctx.arc(x, y - 39, 16.5, Math.PI, Math.PI * 2);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#eab308";
    ctx.beginPath();
    ctx.roundRect(
        seller.facing === 1 ? x - 2 : x - 20,
        y - 41,
        22,
        5,
        2
    );
    ctx.fill();

    // Eyes
    const eyeOffset = seller.facing * 3.5;
    ctx.fillStyle = "#0f172a";
    ctx.beginPath();
    ctx.arc(x - 4 + eyeOffset, y - 34, 2.2, 0, Math.PI * 2);
    ctx.arc(x + 6 + eyeOffset, y - 34, 2.2, 0, Math.PI * 2);
    ctx.fill();

    // Friendly smile
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(x + eyeOffset * 0.6, y - 28, 4.5, Math.PI * 0.15, Math.PI * 0.85);
    ctx.stroke();

    // Front arm holding vape device if carrying one
    const handX = x + seller.facing * 22;
    const handY = y - 4 + armSwing * 0.4;

    ctx.strokeStyle = "#0ea5e9";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(x + seller.facing * 15, y - 12);
    ctx.lineTo(handX, handY);
    ctx.stroke();

    ctx.fillStyle = "#f5cfa0";
    ctx.beginPath();
    ctx.arc(handX, handY, 4.5, 0, Math.PI * 2);
    ctx.fill();

    if (state.heldFlavor) {
        const activeFlavor = FLAVORS.find((f) => f.id === state.heldFlavor);
        ctx.fillStyle = activeFlavor ? activeFlavor.color : "#38bdf8";
        ctx.beginPath();
        ctx.roundRect(handX - 6, handY - 14, 12, 22, 4);
        ctx.fill();

        ctx.fillStyle = "#f8fafc";
        ctx.fillRect(handX - 3.5, handY - 18, 7, 4);
    }

    // Name badge "DARREL" above character
    ctx.fillStyle = "rgba(15, 23, 42, 0.88)";
    ctx.beginPath();
    ctx.roundRect(x - 36, y - 74, 72, 20, 6);
    ctx.fill();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = "#eab308";
    ctx.stroke();

    ctx.fillStyle = "#fde047";
    ctx.font = "bold 11px Segoe UI";
    ctx.textAlign = "center";
    ctx.fillText(seller.name, x, y - 60);
}

function drawGameWorld() {
    drawStoreBackdrop();

    // Customer booths
    CUSTOMER_SLOTS.forEach((slot, idx) => {
        ctx.fillStyle = "rgba(10, 15, 28, 0.45)";
        ctx.beginPath();
        ctx.roundRect(slot.x, slot.y, slot.width, slot.height, 14);
        ctx.fill();

        ctx.lineWidth = 1.5;
        ctx.strokeStyle = "rgba(148, 163, 184, 0.25)";
        ctx.stroke();

        const cust = state.customers[idx];
        if (!cust) {
            ctx.fillStyle = "#64748b";
            ctx.font = "600 13px Segoe UI";
            ctx.textAlign = "center";
            ctx.fillText("Waiting Spot", slot.x + slot.width / 2, slot.y + slot.height / 2 + 4);
            return;
        }

        drawClipArtCustomer(cust, slot);
    });

    // Bottom flavor stations
    STATIONS.forEach((station) => {
        ctx.fillStyle = "#1a2033";
        ctx.beginPath();
        ctx.roundRect(station.x, station.y, station.width, station.height, 14);
        ctx.fill();

        ctx.lineWidth = 2.5;
        ctx.strokeStyle = station.color;
        ctx.stroke();

        // Device graphic
        ctx.fillStyle = station.color;
        ctx.beginPath();
        ctx.roundRect(station.x + 18, station.y + 22, 18, 44, 5);
        ctx.fill();

        ctx.fillStyle = station.accent;
        ctx.fillRect(station.x + 22, station.y + 17, 10, 5);

        ctx.fillStyle = "#f8fafc";
        ctx.font = "bold 16px Segoe UI";
        ctx.textAlign = "left";
        ctx.fillText(station.flavor, station.x + 48, station.y + 49);
    });

    // Darrel character
    drawClipArtDarrel(state.seller);

    // Floating status text
    if (state.floatingText) {
        ctx.fillStyle = state.floatingText.color;
        ctx.font = "bold 16px Segoe UI";
        ctx.textAlign = "center";
        ctx.fillText(state.floatingText.text, state.floatingText.x, state.floatingText.y);
    }

    // End-of-shift summary inside canvas
    if (state.gameOver) {
        ctx.fillStyle = "rgba(8, 11, 18, 0.86)";
        ctx.fillRect(0, 0, BASE_WIDTH, BASE_HEIGHT);

        drawLogoBadge(BASE_WIDTH / 2, BASE_HEIGHT / 2 - 105, 44);

        ctx.fillStyle = "#f8fafc";
        ctx.font = "bold 40px Segoe UI";
        ctx.textAlign = "center";
        ctx.fillText("Shift Complete!", BASE_WIDTH / 2, BASE_HEIGHT / 2 - 22);

        ctx.fillStyle = "#facc15";
        ctx.font = "bold 24px Segoe UI";
        ctx.fillText(`Final Score: ${state.score}`, BASE_WIDTH / 2, BASE_HEIGHT / 2 + 24);

        ctx.fillStyle = "#cbd5e1";
        ctx.font = "16px Segoe UI";
        ctx.fillText("Click Restart in the top bar to serve another shift.", BASE_WIDTH / 2, BASE_HEIGHT / 2 + 64);
    }
}

function render() {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.scale(viewTransform.dpr, viewTransform.dpr);
    ctx.translate(viewTransform.offsetX, viewTransform.offsetY);
    ctx.scale(viewTransform.scale, viewTransform.scale);

    if (screenMode === "PLAYING") {
        drawGameWorld();
    } else {
        // Subtle live store background behind Menu / Quit card
        ctx.globalAlpha = 0.35;
        drawStoreBackdrop();
        ctx.globalAlpha = 1;
    }

    ctx.restore();
}

function gameLoop(timestamp) {
    if (!state.lastTimestamp) {
        state.lastTimestamp = timestamp;
    }

    const dt = Math.min(0.05, (timestamp - state.lastTimestamp) / 1000);
    state.lastTimestamp = timestamp;

    update(dt);
    render();

    requestAnimationFrame(gameLoop);
}

// Button handlers
playBtn.addEventListener("click", startNewGame);
reopenBtn.addEventListener("click", startNewGame);
restartBtn.addEventListener("click", startNewGame);
menuBtn.addEventListener("click", () => showScreen("MENU"));

quitBtn.addEventListener("click", () => {
    window.close();
    openQuitScreen("You chose to quit. Browsers often block closing tabs opened automatically, so you can close this tab or click Play Again.");
});

window.addEventListener("resize", resizeCanvas);

// Initialize full-screen menu first
state = createInitialState();
resizeCanvas();
updateHud();
showScreen("MENU");
requestAnimationFrame(gameLoop);