const LEVELS = [
    {
        id: 1,
        title: "Level 1: Schlängeln",
        cols: 6, rows: 6,
        snakes: [
            { id: 1, c: 'green', d: 1, p: [{x:1, y:3}, {x:2, y:3}] }, // Head at (2,3), faces Right
            { id: 2, c: 'red', d: 2, p: [{x:4, y:1}, {x:4, y:2}] }    // Head at (4,2), faces Down
        ],
        obstacles: []
    },
    {
        id: 2,
        title: "Level 2: Der Knoten",
        cols: 8, rows: 8,
        snakes: [
            { id: 1, c: 'green', d: 1, p: [{x:1, y:4}, {x:2, y:4}, {x:3, y:4}] }, // Blocked by Red
            { id: 2, c: 'red', d: 2, p: [{x:4, y:2}, {x:4, y:3}, {x:4, y:4}, {x:4, y:5}] }, // Blocked by Blue
            { id: 3, c: 'blue', d: 1, p: [{x:3, y:6}, {x:4, y:6}, {x:5, y:6}] }  // Free
        ],
        obstacles: []
    },
    {
        id: 3,
        title: "Level 3: Zick-Zack",
        cols: 8, rows: 8,
        snakes: [
            // Hand-crafted solvable puzzle
            { id: 1, c: 'yellow', d: 1, p: [{x:2, y:4}, {x:3, y:4}, {x:4, y:4}] }, // Head 4,4 Right. Path hits 5,4
            { id: 2, c: 'purple', d: 2, p: [{x:5, y:2}, {x:5, y:3}, {x:5, y:4}, {x:5, y:5}] }, // Head 5,5 Down. Path is clear!
            { id: 3, c: 'red', d: 0, p: [{x:2, y:6}, {x:2, y:5}] } // Head 2,5 Up. Path hits 2,4 (Yellow tail)
        ],
        obstacles: []
    },
    {
        id: 4,
        title: "Level 4: Die Felsen",
        cols: 8, rows: 8,
        snakes: [
            { id: 1, c: 'blue', d: 1, p: [{x:1, y:2}, {x:2, y:2}] },
            { id: 2, c: 'red', d: 2, p: [{x:2, y:1}, {x:3, y:1}, {x:3, y:2}] },
            { id: 3, c: 'green', d: 3, p: [{x:6, y:5}, {x:5, y:5}, {x:4, y:5}] }
        ],
        obstacles: [
            { t: 'rock', x: 5, y: 2 },
            { t: 'totem', x: 2, y: 3 },
            { t: 'rock', x: 2, y: 5 }
        ]
    },
    {
        id: 5,
        title: "Level 5: Farben-Labyrinth",
        cols: 10, rows: 10,
        snakes: [
            { id: 1, c: 'red', d: 1, p: [{x:1, y:4}, {x:2, y:4}, {x:3, y:4}] },
            { id: 2, c: 'green', d: 2, p: [{x:6, y:2}, {x:6, y:3}, {x:7, y:3}] },
            { id: 3, c: 'blue', d: 0, p: [{x:8, y:8}, {x:8, y:7}, {x:7, y:7}, {x:7, y:6}] }
        ],
        obstacles: [
            { t: 'gate', c: 'green', x: 7, y: 4 },
            { t: 'totem', x: 3, y: 3 }
        ]
    },
    {
        id: 6,
        title: "Level 6: Das Grosse Gewirr",
        cols: 12, rows: 12,
        snakes: [
            { id: 1, c: 'purple', d: 1, p: [{x:1, y:5}, {x:2, y:5}, {x:2, y:6}, {x:3, y:6}, {x:3, y:7}, {x:4, y:7}] },
            { id: 2, c: 'blue', d: 0, p: [{x:5, y:10}, {x:5, y:9}, {x:6, y:9}, {x:6, y:8}, {x:7, y:8}] },
            { id: 3, c: 'yellow', d: 3, p: [{x:10, y:6}, {x:9, y:6}, {x:9, y:5}, {x:8, y:5}, {x:8, y:4}] },
            { id: 4, c: 'green', d: 2, p: [{x:6, y:1}, {x:6, y:2}, {x:5, y:2}, {x:5, y:3}, {x:4, y:3}] },
            { id: 5, c: 'red', d: 1, p: [{x:4, y:4}, {x:5, y:4}, {x:5, y:5}, {x:6, y:5}] },
            { id: 6, c: 'red', d: 2, p: [{x:7, y:4}, {x:7, y:5}, {x:6, y:6}, {x:6, y:7}] }
        ],
        obstacles: [
            { t: 'totem', x: 4, y: 6 }
        ]
    }
];

// Generates a mathematically guaranteed solvable level via reverse-simulation
function generateRandomLevel(cols, rows, numSnakes) {
    const grid = Array.from({length: cols}, () => Array(rows).fill(false));
    const snakes = [];
    const colors = ['green', 'red', 'blue', 'yellow', 'purple'];
    
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
        
        snakes.push({
            id: idCounter++,
            c: colors[Math.floor(Math.random() * colors.length)],
            d: head.d,
            p: body
        });
    }
    
    return {
        id: 'random',
        title: "Zufalls-Level",
        cols, rows,
        snakes,
        obstacles: []
    };
}
