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
    game: document.getElementById('game-screen'),
    win: document.getElementById('win-screen'),
    gameComplete: document.getElementById('game-complete-screen')
};
const levelTitleEl = document.getElementById('current-level-title');
const levelNumberDisplay = document.getElementById('level-number-display');
const lockWarning = document.getElementById('lock-warning');
const livesContainer = document.getElementById('lives-container');

const svgMap = {
    grid: document.getElementById('grid-layer'),
    rocks: document.getElementById('obstacles-layer'),
    portals: document.getElementById('portals-layer'),
    snakes: document.getElementById('snakes-layer')
};

const portalColors = ['#ff00ff', '#00ffff', '#ffff00', '#ff8800', '#8800ff', '#ff0088', '#00ff88', '#88ff00', '#0088ff', '#88ffff'];
const gameSvg = document.getElementById('game-svg');
const gridBg = document.getElementById('grid-bg');
const boardWrapper = document.getElementById('board-wrapper');

function init() {
    selectedLevel = maxUnlockedLevel;
    updateLevelDisplay();
}

function updateLevelDisplay() {
    levelNumberDisplay.innerText = selectedLevel;
    if (lockWarning) lockWarning.style.display = 'none';
}

function changeLevel(delta) {
    let newLevel = selectedLevel + delta;
    if (newLevel < 1) newLevel = 1;
    if (newLevel > 99) newLevel = 99;
    selectedLevel = newLevel;
    updateLevelDisplay();
}

function changeLevelInGame(delta) {
    let newLevel = currentLevelId + delta;
    if (newLevel < 1) newLevel = 1;
    if (newLevel > 99) newLevel = 99;
    if (newLevel === currentLevelId) return;
    
    selectedLevel = newLevel;
    updateLevelDisplay();
    startLevel(newLevel);
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
        numSnakes = Math.floor(30 + ((lvl - 10) / 89) * 220);
    }
    numSnakes = Math.max(numSnakes, lvl, 3);
    
    const numRocks = Math.floor((lvl - 1) * (30 / 98));
    
    let numPortals = 0;
    if (lvl >= 25) {
        numPortals = Math.min(10, Math.floor((lvl - 24) / 5) + 1);
    }
    
    let numMovingObstacles = 0;
    if (lvl >= 10) {
        numMovingObstacles = Math.min(20, Math.floor(lvl / 4));
    }

    // shapes: only for level >= 15
    const shapes = ['none', 'heart', 'diamond', 'plus', 'circle'];
    let shapeType = 'none';
    if (lvl >= 15) {
        shapeType = shapes[Math.floor(Math.random() * shapes.length)];
        // Sometimes just do 'none' anyway
        if (Math.random() < 0.3) shapeType = 'none';
    }
    
    return { 
        cols, rows: cols, 
        numSnakes, numRocks, numPortals, numMovingObstacles,
        lives: Math.min(9, 3 + Math.floor(lvl / 15)),
        shapeType 
    };
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
    showScreen('game');
    
    currentLevelId = id;
    
    document.getElementById('current-level-title').innerText = `Level ${id}`;
    const hudPrev = document.getElementById('hud-prev-level');
    if (hudPrev) {
        hudPrev.disabled = id <= 1;
        hudPrev.style.opacity = id <= 1 ? '0.3' : '1';
    }

    const diff = getDifficulty(id);
    
    maxLives = diff.lives;
    currentLives = maxLives;
    updateLivesDisplay();
    
    let attempts = 0;
    const minSnakesRequired = Math.max(3, id);
    do {
        currentLevel = generateRandomLevel(diff);
        attempts++;
        if (attempts > 5) {
            diff.shapeType = 'none';
            currentLevel = generateRandomLevel(diff);
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
    drawPortals();
    drawObstacles();
    drawSnakes();
    
    showScreen('game');
    animationFrameId = requestAnimationFrame(animationLoop);
    
    if (isAutoPlayMode) {
        clearTimeout(autoPlayTimeout);
        autoPlayTimeout = setTimeout(autoPlayNextMove, 1000);
    }
}

function generateRandomLevel(diff) {
    const { cols, rows, numSnakes, numRocks, numPortals, numMovingObstacles, shapeType } = diff;
    
    const grid = Array.from({length: cols}, () => Array(rows).fill(false));
    const generatedSnakes = [];
    const generatedObstacles = [];
    const colors = ['green', 'red', 'blue', 'yellow', 'purple', 'orange', 'cyan', 'pink', 'teal', 'lime'];
    
    for(let x=0; x<cols; x++) {
        for(let y=0; y<rows; y++) {
            if (!isInsideShape(x, y, cols, rows, shapeType)) {
                grid[x][y] = true;
            }
        }
    }
    
    const generatedPortals = [];
    let pAttempts = 0;
    while(generatedPortals.length < numPortals && pAttempts < numPortals * 20) {
        const ax = Math.floor(Math.random() * cols);
        const ay = Math.floor(Math.random() * rows);
        const bx = Math.floor(Math.random() * cols);
        const by = Math.floor(Math.random() * rows);
        if (!grid[ax][ay] && !grid[bx][by] && (Math.abs(ax-bx)+Math.abs(ay-by) > 3)) {
            generatedPortals.push({
                id: generatedPortals.length,
                inX: ax, inY: ay,
                outX: bx, outY: by,
                color: portalColors[generatedPortals.length % portalColors.length],
                used: false
            });
        }
        pAttempts++;
    }
    
    const movingObstacles = [];
    let placedMOs = 0;
    let moAttempts = 0;
    while (placedMOs < numMovingObstacles && moAttempts < numMovingObstacles * 10) {
        const isHoriz = Math.random() > 0.5;
        const len = Math.floor(Math.random() * 6) + 2; // len 2 to 7
        const x = Math.floor(Math.random() * (cols - (isHoriz ? len : 0)));
        const y = Math.floor(Math.random() * (rows - (!isHoriz ? len : 0)));
        
        let trackFree = true;
        for (let i = 0; i < len; i++) {
            if (grid[x + (isHoriz ? i : 0)][y + (!isHoriz ? i : 0)]) {
                trackFree = false; break;
            }
        }
        if (trackFree) {
            const track = [];
            for (let i = 0; i < len; i++) {
                const tx = x + (isHoriz ? i : 0);
                const ty = y + (!isHoriz ? i : 0);
                grid[tx][ty] = true;
                track.push({x: tx, y: ty});
            }
            const maxObs = Math.max(1, Math.floor(len / 2)); // Guarantee every tile is free at some point
            const obsLen = Math.floor(Math.random() * maxObs) + 1;
            movingObstacles.push({
                id: placedMOs,
                track,
                pos: 0,
                dir: 1,
                isHoriz,
                obsLen,
                lastMove: performance.now() + Math.random() * 2000,
                speed: 1000 + Math.random() * 2000 // 1 to 3 seconds per step
            });
            placedMOs++;
        }
        moAttempts++;
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
    
    const isMOGrid = Array.from({length: cols}, () => Array(rows).fill(false));
    movingObstacles.forEach(mo => mo.track.forEach(pt => isMOGrid[pt.x][pt.y] = true));

    let idCounter = 1;
    for(let i=0; i<numSnakes; i++) {
        const blockGrid = Array.from({length: cols}, (_, x) => 
            Array.from({length: rows}, (_, y) => grid[x][y] && !isMOGrid[x][y])
        );

        const clear0 = Array.from({length: cols}, () => Array(rows).fill(false));
        const clear1 = Array.from({length: cols}, () => Array(rows).fill(false));
        const clear2 = Array.from({length: cols}, () => Array(rows).fill(false));
        const clear3 = Array.from({length: cols}, () => Array(rows).fill(false));

        for (let y = 0; y < rows; y++) {
            let c = true;
            for (let x = 0; x < cols; x++) {
                clear3[x][y] = c;
                if (blockGrid[x][y]) c = false;
            }
            c = true;
            for (let x = cols - 1; x >= 0; x--) {
                clear1[x][y] = c;
                if (blockGrid[x][y]) c = false;
            }
        }
        for (let x = 0; x < cols; x++) {
            let c = true;
            for (let y = 0; y < rows; y++) {
                clear0[x][y] = c;
                if (blockGrid[x][y]) c = false;
            }
            c = true;
            for (let y = rows - 1; y >= 0; y--) {
                clear2[x][y] = c;
                if (blockGrid[x][y]) c = false;
            }
        }

        const validHeads = [];
        for(let x=0; x<cols; x++) {
            for(let y=0; y<rows; y++) {
                if (grid[x][y]) continue;
                if (clear0[x][y]) validHeads.push({x, y, d: 0});
                if (clear1[x][y]) validHeads.push({x, y, d: 1});
                if (clear2[x][y]) validHeads.push({x, y, d: 2});
                if (clear3[x][y]) validHeads.push({x, y, d: 3});
            }
        }
        
        if (validHeads.length === 0) break;
        
        const head = validHeads[Math.floor(Math.random() * validHeads.length)];
        const body = [{x: head.x, y: head.y}];
        grid[head.x][head.y] = true;
        
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
        
        const len = Math.floor(Math.random() * 10) + 4; // Length 4 to 13 to fill the board
        let cx = head.x, cy = head.y;
        for(let step=1; step<len; step++) {
            let neighbors = [];
            if (step === 1) {
                const nx = cx + (head.d === 1 ? -1 : head.d === 3 ? 1 : 0);
                const ny = cy + (head.d === 2 ? -1 : head.d === 0 ? 1 : 0);
                if (nx >= 0 && nx < cols && ny >= 0 && ny < rows && !grid[nx][ny]) {
                    neighbors.push({x: nx, y: ny});
                }
            } else {
                if (cx > 0 && !grid[cx-1][cy]) neighbors.push({x: cx-1, y: cy});
                if (cx < cols-1 && !grid[cx+1][cy]) neighbors.push({x: cx+1, y: cy});
                if (cy > 0 && !grid[cx][cy-1]) neighbors.push({x: cx, y: cy-1});
                if (cy < rows-1 && !grid[cx][cy+1]) neighbors.push({x: cx, y: cy+1});
            }
            
            if (neighbors.length === 0) break;
            let jumped = false;
            for (const n of neighbors) {
                const portal = generatedPortals.find(p => p.outX === n.x && p.outY === n.y && !p.used);
                if (portal) {
                    if (!grid[portal.inX][portal.inY]) {
                        body.unshift({x: n.x, y: n.y});
                        body.unshift({x: portal.inX, y: portal.inY});
                        grid[n.x][n.y] = true;
                        grid[portal.inX][portal.inY] = true;
                        portal.used = true;
                        cx = portal.inX; cy = portal.inY;
                        step += 2;
                        jumped = true;
                        break;
                    }
                }
            }
            if (jumped) continue;
            
            const next = neighbors[Math.floor(Math.random() * neighbors.length)];
            body.unshift(next);
            grid[next.x][next.y] = true;
            cx = next.x; cy = next.y;
        }
        
        // Free the escape ray so other snakes can use it, but THIS snake didn't block it!
        escapeRay.forEach(pt => grid[pt.x][pt.y] = false);
        
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
        let availableColors = colors.filter(c => !usedColors.has(c));
        if (availableColors.length === 0) {
            const touchingColors = new Set();
            for (const other of generatedSnakes) {
                let isTouching = false;
                for (const p1 of body) {
                    for (const p2 of other.p) {
                        if (Math.abs(p1.x - p2.x) + Math.abs(p1.y - p2.y) <= 1) {
                            isTouching = true; break;
                        }
                    }
                    if (isTouching) break;
                }
                if (isTouching) touchingColors.add(other.c);
            }
            availableColors = colors.filter(c => !touchingColors.has(c));
            if (availableColors.length === 0) availableColors = colors;
        }
        const finalColor = availableColors[Math.floor(Math.random() * availableColors.length)];
        
        generatedSnakes.push({
            id: idCounter++,
            c: finalColor,
            d: head.d,
            p: body
        });
    }
    
    for(let x=0; x<cols; x++) {
        for(let y=0; y<rows; y++) {
            if (!isInsideShape(x, y, cols, rows, shapeType)) {
                grid[x][y] = false; 
            }
        }
    }
    
    return {
        cols, rows, snakes: generatedSnakes, obstacles: generatedObstacles,
        portals: generatedPortals.filter(p => p.used),
        movingObstacles
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

function drawPortals() {
    svgMap.portals.innerHTML = '';
    if (!currentLevel || !currentLevel.portals) return;
    const svgNS = "http://www.w3.org/2000/svg";
    
    currentLevel.portals.forEach(p => {
        // Entrance
        const c1 = document.createElementNS(svgNS, 'circle');
        c1.setAttribute('cx', p.inX * TILE + TILE/2);
        c1.setAttribute('cy', p.inY * TILE + TILE/2);
        c1.setAttribute('r', TILE/2 - 4);
        c1.setAttribute('class', 'portal-hole');
        c1.style.stroke = p.color;
        
        // Exit
        const c2 = document.createElementNS(svgNS, 'circle');
        c2.setAttribute('cx', p.outX * TILE + TILE/2);
        c2.setAttribute('cy', p.outY * TILE + TILE/2);
        c2.setAttribute('r', TILE/2 - 4);
        c2.setAttribute('class', 'portal-hole');
        c2.style.stroke = p.color;
        
        svgMap.portals.appendChild(c1);
        svgMap.portals.appendChild(c2);
    });
}

function drawObstacles() {
    const svgNS = "http://www.w3.org/2000/svg";
    svgMap.rocks.innerHTML = '';
    if (!currentLevel) return;
    
    if (obstacles) {
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
    
    if (currentLevel.movingObstacles) {
        currentLevel.movingObstacles.forEach(mo => {
            const rect = document.createElementNS(svgNS, 'rect');
            rect.id = `mo-${mo.id}`;
            rect.setAttribute('x', mo.track[mo.pos].x * TILE + 4);
            rect.setAttribute('y', mo.track[mo.pos].y * TILE + 4);
            rect.setAttribute('width', (mo.isHoriz ? mo.obsLen * TILE : TILE) - 8);
            rect.setAttribute('height', (!mo.isHoriz ? mo.obsLen * TILE : TILE) - 8);
            rect.setAttribute('class', 'rock-rect rock-gray moving-obstacle');
            rect.style.transition = `x ${mo.speed}ms linear, y ${mo.speed}ms linear`;
            svgMap.rocks.appendChild(rect);
        });
    }
}

function drawSnakes() {
    const svgNS = "http://www.w3.org/2000/svg";
    svgMap.snakes.innerHTML = '';
    
    snakes.forEach(snake => {
        const g = document.createElementNS(svgNS, 'g');
        g.id = `snake-${snake.id}`;
        g.setAttribute('class', 'snake-group');
        g.style.color = `var(--snake-${snake.c})`;
        
        if (animatingSnakes.has(snake.id)) {
            const phase = Date.now() / 150;
            const ox = Math.sin(phase) * 1.5;
            const oy = Math.cos(phase) * 1.5;
            g.setAttribute('transform', `translate(${ox}, ${oy})`);
        } else {
            g.onclick = () => handleSnakeClick(snake);
        }
        
        // Body Path
        const path = document.createElementNS(svgNS, 'path');
        let dStr = '';
        for (let j = 0; j < snake.p.length; j++) {
            const pt = snake.p[j];
            const px = pt.x * TILE + TILE/2;
            const py = pt.y * TILE + TILE/2;
            if (j === 0) {
                dStr += `M ${px} ${py} `;
            } else {
                const prev = snake.p[j-1];
                if (Math.abs(pt.x - prev.x) + Math.abs(pt.y - prev.y) > 1) {
                    dStr += `M ${px} ${py} `; // portal jump, break path
                } else {
                    dStr += `L ${px} ${py} `;
                }
            }
        }
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
        
        const headContainer = document.createElementNS(svgNS, 'g');
        headContainer.setAttribute('transform', `translate(${hx}, ${hy}) rotate(${snake.d * 90})`);
        headContainer.style.color = `var(--snake-${snake.c})`;
        
        const headG = document.createElementNS(svgNS, 'g');
        headG.setAttribute('class', 'snake-head');
        
        const headShape = document.createElementNS(svgNS, 'path');
        headShape.setAttribute('d', `M -10 10 C -15 0, -12 -14, 0 -15 C 12 -14, 15 0, 10 10 C 5 15, -5 15, -10 10 Z`);
        headShape.style.fill = 'currentColor';
        headShape.style.stroke = 'rgba(0,0,0,0.25)';
        headShape.style.strokeWidth = '1.5px';
        
        // Tongue
        const tongue = document.createElementNS(svgNS, 'path');
        tongue.setAttribute('d', 'M 0 -15 L 0 -22 M 0 -22 L -3 -25 M 0 -22 L 3 -25');
        tongue.setAttribute('class', 'snake-tongue');
        
        // Eyes (near tip)
        const eye1 = document.createElementNS(svgNS, 'circle');
        eye1.setAttribute('cx', '-4'); eye1.setAttribute('cy', '-5'); eye1.setAttribute('r', '2.5');
        eye1.setAttribute('class', 'snake-eye');
        const eye2 = document.createElementNS(svgNS, 'circle');
        eye2.setAttribute('cx', '4'); eye2.setAttribute('cy', '-5'); eye2.setAttribute('r', '2.5');
        eye2.setAttribute('class', 'snake-eye');
        
        headG.style.transition = 'transform 0.2s';
        headG.style.transformOrigin = '0px -10px';
        
        headG.appendChild(headShape);
        headG.appendChild(eye1);
        headG.appendChild(eye2);
        headG.appendChild(tongue);
        
        const hoverHandler = () => {
            if (animatingSnakes.has(snake.id)) return;
            headG.style.transform = `rotate(${(Math.random() - 0.5) * 30}deg)`;
            tongue.style.animation = 'tongueFlick 0.4s ease-in-out';
            setTimeout(() => {
                headG.style.transform = `rotate(0deg)`;
                tongue.style.animation = 'none';
            }, 500);
        };
        path.addEventListener('mouseenter', hoverHandler);
        headContainer.addEventListener('mouseenter', hoverHandler);
        
        headContainer.appendChild(headG);
        g.appendChild(path);
        g.appendChild(headContainer);
        svgMap.snakes.appendChild(g);
    });
}

function isSnakeBlocked(snake) {
    const head = snake.p[snake.p.length - 1];
    const dx = snake.d === 1 ? 1 : snake.d === 3 ? -1 : 0;
    const dy = snake.d === 2 ? 1 : snake.d === 0 ? -1 : 0;
    
    let cx = head.x;
    let cy = head.y;
    
    while(true) {
        cx += dx; cy += dy;
        if (cx < 0 || cx >= currentLevel.cols || cy < 0 || cy >= currentLevel.rows) return false; 
        for (const other of snakes) {
            if (other.p.some(pt => pt.x === cx && pt.y === cy)) return true;
        }
        const obs = obstacles.find(o => o.x === cx && o.y === cy);
        if (obs && obs.t === 'rock') return true;
        
        if (currentLevel.movingObstacles) {
            if (currentLevel.movingObstacles.some(mo => {
                for (let i = 0; i < mo.obsLen; i++) {
                    const mx = mo.track[0].x + (mo.isHoriz ? mo.pos + i : 0);
                    const my = mo.track[0].y + (!mo.isHoriz ? mo.pos + i : 0);
                    if (cx === mx && cy === my) return true;
                }
                return false;
            })) return true;
        }
    }
    return false;
}

function handleSnakeClick(snake) {
    if (animatingSnakes.has(snake.id)) return;
    
    const blocked = isSnakeBlocked(snake);
    
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
        if (!isSnakeBlocked(snake)) {
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
let lastMOTime = 0;
let nextIdleAnimTime = performance.now() + 3000;
let lastInteractionTime = performance.now();
let nextHintDelay = 20000 + Math.random() * 10000; // 20s to 30s

document.addEventListener('pointerdown', () => {
    lastInteractionTime = performance.now();
    nextHintDelay = 20000 + Math.random() * 10000;
});

function animationLoop(timestamp) {
    if (!lastTime) {
        lastTime = timestamp;
        lastMOTime = timestamp;
        nextIdleAnimTime = timestamp + 1000;
        lastInteractionTime = timestamp;
    }

    if (currentLevel && currentLevel.movingObstacles) {
        currentLevel.movingObstacles.forEach(mo => {
            if (mo.track.length > mo.obsLen) {
                if (timestamp - mo.lastMove >= mo.speed) {
                    mo.lastMove = timestamp;
                    
                    let isSnakeCrossing = false;
                    for (const snake of snakes) {
                        for (let pt of snake.p) {
                            for (let i = 0; i < mo.obsLen; i++) {
                                const checkPos = mo.pos + mo.dir;
                                const mx = mo.track[0].x + (mo.isHoriz ? checkPos + i : 0);
                                const my = mo.track[0].y + (!mo.isHoriz ? checkPos + i : 0);
                                if (pt.x === mx && pt.y === my) isSnakeCrossing = true;
                            }
                        }
                    }
                    
                    if (!isSnakeCrossing) {
                        mo.pos += mo.dir;
                        const maxPos = mo.track.length - mo.obsLen;
                        if (mo.pos >= maxPos) {
                            mo.pos = maxPos;
                            mo.dir = -1;
                        } else if (mo.pos <= 0) {
                            mo.pos = 0;
                            mo.dir = 1;
                        }
                        const rect = document.getElementById(`mo-${mo.id}`);
                        if (rect) {
                            rect.setAttribute('x', mo.track[mo.pos].x * TILE + 4);
                            rect.setAttribute('y', mo.track[mo.pos].y * TILE + 4);
                        }
                    }
                }
            }
        });
    }

    if (timestamp - lastInteractionTime > nextHintDelay) {
        lastInteractionTime = timestamp;
        nextHintDelay = 20000 + Math.random() * 10000;
        
        const freeSnakes = snakes.filter(s => !animatingSnakes.has(s.id) && !isSnakeBlocked(s));
        if (freeSnakes.length > 0) {
            const hintSnake = freeSnakes[Math.floor(Math.random() * freeSnakes.length)];
            const g = document.getElementById(`snake-${hintSnake.id}`);
            if (g) {
                g.classList.add('hint-flash');
                setTimeout(() => g.classList.remove('hint-flash'), 900);
            }
        }
    }

    if (timestamp > nextIdleAnimTime) {
        nextIdleAnimTime = timestamp + 1000 + Math.random() * 2000; // 1s to 3s
        const idleSnakes = snakes.filter(s => !animatingSnakes.has(s.id));
        if (idleSnakes.length > 0) {
            const numToAnimate = Math.min(idleSnakes.length, Math.floor(Math.random() * 4) + 2); // 2 to 5
            for(let k=0; k<numToAnimate; k++) {
                const randomSnake = idleSnakes[Math.floor(Math.random() * idleSnakes.length)];
                const snakeHeadGroup = document.querySelector(`#snake-${randomSnake.id} .snake-head`);
                const snakeTongue = document.querySelector(`#snake-${randomSnake.id} .snake-tongue`);
                if (snakeHeadGroup && snakeTongue) {
                    snakeHeadGroup.style.transform = `rotate(${(Math.random() - 0.5) * 30}deg)`;
                    snakeTongue.style.animation = 'tongueFlick 0.4s ease-in-out';
                    setTimeout(() => {
                        if (snakeHeadGroup) snakeHeadGroup.style.transform = `rotate(0deg)`;
                        if (snakeTongue) snakeTongue.style.animation = 'none';
                    }, 500);
                }
            }
        }
    }

    const tickRate = isAutoPlayMode ? 120 : 40;
    if (timestamp - lastTime >= tickRate) { 
        lastTime += tickRate;
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
        
        const nextBtn = document.getElementById('next-level-btn');
        if (currentLevelId === 99) {
            if (nextBtn) nextBtn.style.display = 'none';
            showScreen('gameComplete');
        } else {
            if (nextBtn) nextBtn.style.display = 'inline-block';
            showScreen('win');
        }
    }
}

function restartLevel() {
    startLevel(currentLevelId);
}

function nextLevel() {
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
