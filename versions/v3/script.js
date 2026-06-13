let selectedLevel = 1;
let currentLevelId = 1;
let maxUnlockedLevel = parseInt(localStorage.getItem('snakeEscapeUnlocked')) || 1;

let currentLevel = null;
let snakes = [];
let obstacles = [];
let animatingSnakes = new Set();
let animationFrameId;

let isAutoPlayMode = false;
let autoPlayTimeout = null;

let maxLives = 3;
let currentLives = 3;

const TILE = 40;

// DOM Elements
const screens = {
    start: document.getElementById('start-screen'),
    game: document.getElementById('game-screen')
};
const levelTitleEl = document.getElementById('current-level-title');
const levelNumberDisplay = document.getElementById('level-number-display');
const lockWarning = document.getElementById('lock-warning');
const livesContainer = document.getElementById('lives-container');

const svgMap = {
    rocks: document.getElementById('svg-rocks'),
    snakes: document.getElementById('svg-snakes')
};
const gameSvg = document.getElementById('game-svg');
const gridBg = document.getElementById('grid-bg');
const boardWrapper = document.getElementById('board-wrapper');

function init() {
    selectedLevel = maxUnlockedLevel;
    updateLevelDisplay();
}

function updateLevelDisplay() {
    levelNumberDisplay.innerText = selectedLevel;
    if (selectedLevel > maxUnlockedLevel) {
        lockWarning.style.opacity = '1';
    } else {
        lockWarning.style.opacity = '0';
    }
}

function changeLevel(delta) {
    let newLevel = selectedLevel + delta;
    if (newLevel < 1) newLevel = 1;
    if (newLevel > 99) newLevel = 99;
    selectedLevel = newLevel;
    updateLevelDisplay();
}

function showScreen(name) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[name].classList.add('active');
}

function goHome() {
    cancelAnimationFrame(animationFrameId);
    isAutoPlayMode = false;
    clearTimeout(autoPlayTimeout);
    init();
    showScreen('start');
}

function getDifficulty(lvl) {
    // lvl: 1 to 99
    // cols: 10 at lvl 1, 100 at lvl 99
    const cols = Math.floor(10 + ((lvl - 1) / 98) * 90); 
    
    // snakes: 3 at lvl 1, 30 at lvl 10, ~500 at lvl 99
    let numSnakes;
    if (lvl <= 10) {
        numSnakes = Math.floor(3 + ((lvl - 1) / 9) * 27);
    } else {
        numSnakes = Math.floor(30 + ((lvl - 10) / 89) * 470);
    }
    numSnakes = Math.max(numSnakes, lvl, 3); // Ensure at least 3, and at least 'level'
    
    // rocks
    const numRocks = Math.floor((lvl - 1) * (30 / 98));
    
    // lives: 3 at lvl 1, 9 at lvl 99
    const lives = Math.floor(3 + ((lvl - 1) / 98) * 6);
    
    // shapes: only for level >= 15
    const shapes = ['none', 'heart', 'diamond', 'plus', 'circle'];
    let shapeType = 'none';
    if (lvl >= 15) {
        shapeType = shapes[Math.floor(Math.random() * shapes.length)];
        // Sometimes just do 'none' anyway
        if (Math.random() < 0.3) shapeType = 'none';
    }
    
    return { cols, rows: cols, numSnakes, numRocks, lives, shapeType };
}

function isInsideShape(x, y, cols, rows, shapeType) {
    if (shapeType === 'none') return true;
    
    const nx = (x / (cols - 1)) * 2 - 1; // -1 to 1
    const ny = (y / (rows - 1)) * 2 - 1; // -1 to 1
    
    if (shapeType === 'diamond') {
        return Math.abs(nx) + Math.abs(ny) <= 0.9;
    } else if (shapeType === 'plus') {
        return Math.abs(nx) < 0.35 || Math.abs(ny) < 0.35;
    } else if (shapeType === 'circle') {
        return nx*nx + ny*ny <= 0.8;
    } else if (shapeType === 'heart') {
        // Simplified heart composed of two circles and a triangle
        // Shift ny up slightly so heart is centered
        const py = ny + 0.2;
        const leftCircle = Math.pow(nx + 0.4, 2) + Math.pow(py + 0.4, 2) <= 0.25;
        const rightCircle = Math.pow(nx - 0.4, 2) + Math.pow(py + 0.4, 2) <= 0.25;
        const bottomTriangle = (py > -0.4) && (py < Math.abs(nx) * -2 + 1.2);
        return leftCircle || rightCircle || bottomTriangle;
    }
    return true;
}

function startSelectedLevel() {
    if (selectedLevel > maxUnlockedLevel) return;
    isAutoPlayMode = false;
    clearTimeout(autoPlayTimeout);
    startLevel(selectedLevel);
}

function startAutoPlay() {
    isAutoPlayMode = true;
    startLevel(selectedLevel);
}

function updateLivesDisplay() {
    livesContainer.innerHTML = '';
    for(let i=0; i<maxLives; i++) {
        const heart = document.createElement('div');
        heart.innerText = '❤️';
        heart.className = 'heart';
        if (i >= currentLives) {
            heart.classList.add('lost');
        } else {
            heart.classList.add('pop');
        }
        livesContainer.appendChild(heart);
    }
}

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playErrorSound() {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(150, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(10, audioCtx.currentTime + 0.15);
    
    gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    osc.start();
    osc.stop(audioCtx.currentTime + 0.15);
}

function loseLife() {
    if (currentLives > 0) {
        currentLives--;
        updateLivesDisplay();
        
        if (currentLives === 0) {
            setTimeout(() => {
                alert("Keine Leben mehr! Das Level startet neu.");
                restartLevel();
            }, 500);
        }
    }
}

function startLevel(id) {
    cancelAnimationFrame(animationFrameId);
    animatingSnakes.clear();
    
    currentLevelId = id;
    const diff = getDifficulty(id);
    
    maxLives = diff.lives;
    currentLives = maxLives;
    updateLivesDisplay();
    
    let attempts = 0;
    const minSnakesRequired = Math.max(3, id);
    do {
        currentLevel = generateRandomLevel(diff.cols, diff.rows, diff.numSnakes, diff.numRocks, diff.shapeType);
        attempts++;
        if (attempts > 5) {
            // Fallback to no shape mask to ensure we have enough room
            currentLevel = generateRandomLevel(diff.cols, diff.rows, diff.numSnakes, diff.numRocks, 'none');
        }
    } while (currentLevel.snakes.length < minSnakesRequired && attempts < 10);
    
    levelTitleEl.innerText = `Level ${id}`;
    snakes = currentLevel.snakes;
    obstacles = currentLevel.obstacles;
    
    const w = currentLevel.cols * TILE;
    const h = currentLevel.rows * TILE;
    gameSvg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    
    const maxW = window.innerWidth - 20;
    const maxH = window.innerHeight - 150;
    const scale = Math.min(maxW / w, maxH / h);
    boardWrapper.style.width = `${w * scale}px`;
    boardWrapper.style.height = `${h * scale}px`;
    
    drawBackground();
    drawObstacles();
    drawSnakes();
    
    showScreen('game');
    animationFrameId = requestAnimationFrame(animationLoop);
    
    if (isAutoPlayMode) {
        clearTimeout(autoPlayTimeout);
        autoPlayTimeout = setTimeout(autoPlayNextMove, 1000);
    }
}

function generateRandomLevel(cols, rows, numSnakes, numRocks, shapeType) {
    const grid = Array.from({length: cols}, () => Array(rows).fill(false));
    const generatedSnakes = [];
    const generatedObstacles = [];
    const colors = ['green', 'red', 'blue', 'yellow', 'purple'];
    
    // Mask cells outside the shape
    for(let x=0; x<cols; x++) {
        for(let y=0; y<rows; y++) {
            if (!isInsideShape(x, y, cols, rows, shapeType)) {
                grid[x][y] = true; // Block cells outside shape
            }
        }
    }
    
    let placedRocks = 0;
    let attempts = 0;
    const rockStyles = ['rock-brown', 'rock-gray', 'rock-mossy'];
    while(placedRocks < numRocks && attempts < numRocks * 5) {
        const rx = Math.floor(Math.random() * cols);
        const ry = Math.floor(Math.random() * rows);
        if (!grid[rx][ry]) {
            grid[rx][ry] = true;
            const rStyle = rockStyles[Math.floor(Math.random() * rockStyles.length)];
            generatedObstacles.push({ t: 'rock', style: rStyle, x: rx, y: ry });
            placedRocks++;
        }
        attempts++;
    }
    
    let idCounter = 1;
    for(let i=0; i<numSnakes; i++) {
        const validHeads = [];
        for(let x=0; x<cols; x++) {
            for(let y=0; y<rows; y++) {
                if (grid[x][y]) continue;
                
                for(let d=0; d<4; d++) {
                    const dx = d === 1 ? 1 : d === 3 ? -1 : 0;
                    const dy = d === 2 ? 1 : d === 0 ? -1 : 0;
                    let clear = true;
                    let cx = x + dx, cy = y + dy;
                    
                    while(cx >= 0 && cx < cols && cy >= 0 && cy < rows) {
                        if (grid[cx][cy]) {
                            clear = false; break;
                        }
                        cx += dx; cy += dy;
                    }
                    if (clear) {
                        validHeads.push({x, y, d});
                    }
                }
            }
        }
        
        if (validHeads.length === 0) break;
        
        const head = validHeads[Math.floor(Math.random() * validHeads.length)];
        const body = [{x: head.x, y: head.y}];
        grid[head.x][head.y] = true;
        
        // Calculate escape ray and mark it temporarily
        const dx = head.d === 1 ? 1 : head.d === 3 ? -1 : 0;
        const dy = head.d === 2 ? 1 : head.d === 0 ? -1 : 0;
        let ex = head.x + dx, ey = head.y + dy;
        const escapeRay = [];
        while(ex >= 0 && ex < cols && ey >= 0 && ey < rows) {
            if (!grid[ex][ey]) {
                grid[ex][ey] = true;
                escapeRay.push({x: ex, y: ey});
            }
            ex += dx; ey += dy;
        }
        
        const len = Math.floor(Math.random() * 4) + 2; 
        let cx = head.x, cy = head.y;
        for(let step=1; step<len; step++) {
            const neighbors = [
                {x: cx+1, y: cy}, {x: cx-1, y: cy},
                {x: cx, y: cy+1}, {x: cx, y: cy-1}
            ].filter(n => n.x >= 0 && n.x < cols && n.y >= 0 && n.y < rows && !grid[n.x][n.y]);
            
            if (neighbors.length === 0) break;
            const next = neighbors[Math.floor(Math.random() * neighbors.length)];
            body.unshift(next);
            grid[next.x][next.y] = true;
            cx = next.x; cy = next.y;
        }
        
        // Unmark escape ray
        escapeRay.forEach(pt => grid[pt.x][pt.y] = false);
        
        // Assign color (avoid same colors nearby)
        const usedColors = new Set();
        for (const other of generatedSnakes) {
            let minDist = Infinity;
            for (const p1 of body) {
                for (const p2 of other.p) {
                    const dist = Math.abs(p1.x - p2.x) + Math.abs(p1.y - p2.y);
                    if (dist < minDist) minDist = dist;
                }
            }
            if (minDist <= 2) usedColors.add(other.c);
        }
        const availableColors = colors.filter(c => !usedColors.has(c));
        const finalColor = availableColors.length > 0 ? 
            availableColors[Math.floor(Math.random() * availableColors.length)] : 
            colors[Math.floor(Math.random() * colors.length)];
        
        generatedSnakes.push({
            id: idCounter++,
            c: finalColor,
            d: head.d,
            p: body
        });
    }
    
    // Clear out the shape mask blocks so they render empty
    for(let x=0; x<cols; x++) {
        for(let y=0; y<rows; y++) {
            if (!isInsideShape(x, y, cols, rows, shapeType)) {
                grid[x][y] = false; 
            }
        }
    }
    
    return {
        cols, rows,
        snakes: generatedSnakes,
        obstacles: generatedObstacles
    };
}

function drawBackground() {
    gridBg.innerHTML = '';
    let dots = '';
    for(let x=0; x<=currentLevel.cols; x++) {
        for(let y=0; y<=currentLevel.rows; y++) {
            dots += `<circle cx="${x*TILE}" cy="${y*TILE}" r="2" fill="rgba(255,255,255,0.2)"/>`;
        }
    }
    const bgSvg = `<svg width="100%" height="100%" viewBox="0 0 ${currentLevel.cols*TILE} ${currentLevel.rows*TILE}" style="position:absolute;z-index:1;">${dots}</svg>`;
    gridBg.innerHTML = bgSvg;
}

function drawObstacles() {
    const svgNS = "http://www.w3.org/2000/svg";
    svgMap.rocks.innerHTML = '';
    
    obstacles.forEach(obs => {
        if (obs.t === 'rock') {
            const rect = document.createElementNS(svgNS, 'rect');
            rect.setAttribute('x', obs.x * TILE + 4);
            rect.setAttribute('y', obs.y * TILE + 4);
            rect.setAttribute('width', TILE - 8);
            rect.setAttribute('height', TILE - 8);
            rect.setAttribute('class', `rock-rect ${obs.style || 'rock-brown'}`);
            svgMap.rocks.appendChild(rect);
        }
    });
}

function drawSnakes() {
    const svgNS = "http://www.w3.org/2000/svg";
    svgMap.snakes.innerHTML = '';
    
    snakes.forEach(snake => {
        const g = document.createElementNS(svgNS, 'g');
        g.id = `snake-${snake.id}`;
        g.setAttribute('class', 'snake-group');
        g.style.color = `var(--snake-${snake.c})`;
        g.style.animationDelay = `-${Math.random() * 4}s`;
        
        if (!animatingSnakes.has(snake.id)) {
            g.onclick = () => handleSnakeClick(snake);
        }
        
        // Body Path
        const path = document.createElementNS(svgNS, 'path');
        let dStr = '';
        snake.p.forEach((pt, i) => {
            const px = pt.x * TILE + TILE/2;
            const py = pt.y * TILE + TILE/2;
            dStr += i === 0 ? `M ${px} ${py} ` : `L ${px} ${py} `;
        });
        path.setAttribute('d', dStr);
        path.setAttribute('class', 'snake-body');
        path.style.stroke = `var(--snake-${snake.c})`;
        path.style.strokeWidth = TILE * 0.6;
        
        // Head
        const headPt = snake.p[snake.p.length - 1];
        
        // Offset head forward by 40% of a tile so it sits IN FRONT of the body
        const dx = snake.d === 1 ? 1 : snake.d === 3 ? -1 : 0;
        const dy = snake.d === 2 ? 1 : snake.d === 0 ? -1 : 0;
        const isSingle = snake.p.length === 1;
        const offsetMultiplier = isSingle ? 0 : 0.4;
        
        const hx = headPt.x * TILE + TILE/2 + (dx * TILE * offsetMultiplier);
        const hy = headPt.y * TILE + TILE/2 + (dy * TILE * offsetMultiplier);
        
        const headG = document.createElementNS(svgNS, 'g');
        headG.style.setProperty('--base-translate', `translate(${hx}px, ${hy}px)`);
        headG.style.setProperty('--base-rotate', `rotate(${snake.d * 90}deg)`);
        headG.style.transform = `var(--base-translate) var(--base-rotate)`;
        headG.setAttribute('class', 'snake-head');
        headG.style.color = `var(--snake-${snake.c})`;
        
        // Beautiful organic snake head (pointing UP at 0 deg)
        const headShape = document.createElementNS(svgNS, 'path');
        headShape.setAttribute('d', `M -10 10 C -15 0, -12 -14, 0 -15 C 12 -14, 15 0, 10 10 C 5 15, -5 15, -10 10 Z`);
        headShape.style.fill = 'currentColor';
        
        // Snake Tongue (red, forked)
        const tongue = document.createElementNS(svgNS, 'path');
        tongue.setAttribute('d', `M 0 -15 L 0 -22 M 0 -22 L -3 -26 M 0 -22 L 3 -26`);
        tongue.style.stroke = 'red';
        tongue.style.strokeWidth = '2';
        tongue.style.fill = 'none';
        
        // Eyes (near tip)
        const eye1 = document.createElementNS(svgNS, 'circle');
        eye1.setAttribute('cx', '-4'); eye1.setAttribute('cy', '-5'); eye1.setAttribute('r', '2.5');
        eye1.setAttribute('class', 'snake-eye');
        const eye2 = document.createElementNS(svgNS, 'circle');
        eye2.setAttribute('cx', '4'); eye2.setAttribute('cy', '-5'); eye2.setAttribute('r', '2.5');
        eye2.setAttribute('class', 'snake-eye');
        
        headG.appendChild(tongue);
        headG.appendChild(headShape);
        headG.appendChild(eye1);
        headG.appendChild(eye2);
        
        g.appendChild(path);
        g.appendChild(headG);
        svgMap.snakes.appendChild(g);
    });
}

function handleSnakeClick(snake) {
    if (animatingSnakes.has(snake.id)) return;
    
    const head = snake.p[snake.p.length - 1];
    const dx = snake.d === 1 ? 1 : snake.d === 3 ? -1 : 0;
    const dy = snake.d === 2 ? 1 : snake.d === 0 ? -1 : 0;
    
    let cx = head.x;
    let cy = head.y;
    let blocked = false;
    
    while(true) {
        cx += dx;
        cy += dy;
        
        if (cx < 0 || cx >= currentLevel.cols || cy < 0 || cy >= currentLevel.rows) {
            break; 
        }
        
        for (const other of snakes) {
            if (other.id === snake.id) continue;
            if (other.p.some(pt => pt.x === cx && pt.y === cy)) {
                blocked = true; break;
            }
        }
        if (blocked) break;
        
        const obs = obstacles.find(o => o.x === cx && o.y === cy);
        if (obs && obs.t === 'rock') {
            blocked = true; break;
        }
    }
    
    if (blocked) {
        playErrorSound();
        const g = document.getElementById(`snake-${snake.id}`);
        g.classList.add('wiggle');
        setTimeout(() => g.classList.remove('wiggle'), 300);
        loseLife(); // Deduct life on mistake
    } else {
        animatingSnakes.add(snake.id);
        drawSnakes();
    }
}

function autoPlayNextMove() {
    if (!isAutoPlayMode || snakes.length === 0) return;
    
    if (animatingSnakes.size > 0) {
        autoPlayTimeout = setTimeout(autoPlayNextMove, 200);
        return;
    }
    
    let freeSnake = null;
    for (const snake of snakes) {
        const head = snake.p[snake.p.length - 1];
        const dx = snake.d === 1 ? 1 : snake.d === 3 ? -1 : 0;
        const dy = snake.d === 2 ? 1 : snake.d === 0 ? -1 : 0;
        
        let cx = head.x;
        let cy = head.y;
        let blocked = false;
        
        while(true) {
            cx += dx; cy += dy;
            if (cx < 0 || cx >= currentLevel.cols || cy < 0 || cy >= currentLevel.rows) break; 
            for (const other of snakes) {
                if (other.id === snake.id) continue;
                if (other.p.some(pt => pt.x === cx && pt.y === cy)) { blocked = true; break; }
            }
            if (blocked) break;
            const obs = obstacles.find(o => o.x === cx && o.y === cy);
            if (obs && obs.t === 'rock') { blocked = true; break; }
        }
        
        if (!blocked) {
            freeSnake = snake;
            break;
        }
    }
    
    if (freeSnake) {
        const g = document.getElementById(`snake-${freeSnake.id}`);
        if (g) g.classList.add('flash-anim');
        
        autoPlayTimeout = setTimeout(() => {
            if (g) g.classList.remove('flash-anim');
            handleSnakeClick(freeSnake);
            autoPlayTimeout = setTimeout(autoPlayNextMove, 600);
        }, 600);
    } else {
        autoPlayTimeout = setTimeout(autoPlayNextMove, 600);
    }
}

let lastTime = 0;
let nextIdleAnimTime = performance.now() + 20000;

function animationLoop(timestamp) {
    if (timestamp > nextIdleAnimTime) {
        nextIdleAnimTime = timestamp + 20000 + Math.random() * 10000; // 20s to 30s
        const idleSnakes = snakes.filter(s => !animatingSnakes.has(s.id));
        if (idleSnakes.length > 0) {
            const randomSnake = idleSnakes[Math.floor(Math.random() * idleSnakes.length)];
            const headG = document.querySelector(`#snake-${randomSnake.id} .snake-head`);
            if (headG) {
                headG.classList.add('idle-look');
                setTimeout(() => {
                    if (headG) headG.classList.remove('idle-look');
                }, 2000);
            }
        }
    }

    const tickRate = isAutoPlayMode ? 120 : 40;
    if (timestamp - lastTime > tickRate) { 
        lastTime = timestamp;
        let needRedraw = false;
        
        animatingSnakes.forEach(id => {
            const s = snakes.find(x => x.id === id);
            if (!s) return;
            
            const head = s.p[s.p.length - 1];
            const dx = s.d === 1 ? 1 : s.d === 3 ? -1 : 0;
            const dy = s.d === 2 ? 1 : s.d === 0 ? -1 : 0;
            
            s.p.push({ x: head.x + dx, y: head.y + dy });
            s.p.shift();
            needRedraw = true;
            
            const isOffScreen = s.p.every(pt => pt.x < -1 || pt.x > currentLevel.cols || pt.y < -1 || pt.y > currentLevel.rows);
            if (isOffScreen) {
                snakes = snakes.filter(x => x.id !== id);
                animatingSnakes.delete(id);
                checkWin();
            }
        });
        
        if (needRedraw) {
            drawSnakes();
        }
    }
    animationFrameId = requestAnimationFrame(animationLoop);
}

function checkWin() {
    if (snakes.length === 0) {
        if (!isAutoPlayMode && currentLevelId >= maxUnlockedLevel && currentLevelId < 99) {
            maxUnlockedLevel = currentLevelId + 1;
            localStorage.setItem('snakeEscapeUnlocked', maxUnlockedLevel);
        }
        
        if (isAutoPlayMode) {
            setTimeout(() => {
                if (currentLevelId < 99) {
                    selectedLevel = currentLevelId + 1;
                    startLevel(selectedLevel);
                } else {
                    goHome();
                }
            }, 1500);
            return;
        }
        
        const winModal = document.getElementById('win-modal');
        const nextBtn = document.getElementById('next-level-btn');
        if (currentLevelId === 99) {
            nextBtn.style.display = 'none';
        } else {
            nextBtn.style.display = 'inline-block';
        }
        winModal.classList.add('active');
    }
}

function restartLevel() {
    startLevel(currentLevelId);
    document.getElementById('win-modal').classList.remove('active');
}

function nextLevel() {
    document.getElementById('win-modal').classList.remove('active');
    if (currentLevelId < 99) {
        selectedLevel = currentLevelId + 1;
        startLevel(selectedLevel);
    } else {
        goHome();
    }
}

function openInfoModal() {
    document.getElementById('info-modal').classList.add('active');
}
function closeInfoModal() {
    document.getElementById('info-modal').classList.remove('active');
}

init();
