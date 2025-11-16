const canvas = document.getElementById('fightpit');
const ctx = canvas.getContext('2d');
const startBtn = document.getElementById('start-btn');

const STAGE_RADIUS = 350;
const PLAYER_RADIUS = 10;
const JUGGERNAUT_RADIUS = PLAYER_RADIUS * 5; // 5 times larger
const JUGGERNAUT_KNOCKBACK_MULT = 5; // 3 times more knockback
const HUNTER_DAMAGE_KNOCKBACK_MULT = 1; // How much knockback translates to damage
const ORB_RADIUS = 8;
// Renamed INVINCIBILITY_DURATION to IMMUNITY_DURATION
const IMMUNITY_DURATION = 5 * 60; 
const FREEZE_DURATION = 300; // 5 seconds freeze for targets

// --- NEW LUNGE CONSTANTS ---
const LUNGE_DURATION = 2 * 60; // 120 frames (2 seconds)
const LUNGE_COOLDOWN = 7 * 60; // 420 frames (7 seconds)
const LUNGE_FORCE = 3; // Additional force multiplier for lunge
// --- END NEW LUNGE CONSTANTS ---

let players = [];
let critMessages = [];
let orbs = [];
// 'immunity' is no longer an orb type, 'shield' is the new knockback orb
let orbTypes = ['strength', 'speed', 'lucky', 'freeze', 'invisible', 'clone', 'blast', 'shield']; 
let lastOrbSpawn = 0;
const ORB_SPAWN_INTERVAL = 5000;
const ORB_EFFECT_DURATION = 600;
const BLAST_EFFECT_DURATION = 60; // 1 second at 60fps

// --- Game Mode Variables ---
let gameMode = 'freeforall';
let numTeams = 2;
let teamColors = ['#FF0000', '#0000FF', '#00FF00', '#FFFF00', '#FF00FF', '#00FFFF', '#FF8000', '#8000FF'];
let gameTimer = 0;
let crownPlayer = null;
let potatoPlayers = [];
// --- NEW JUGGERNAUT VARIABLES ---
let juggernautPlayer = null;
let juggernautHP = 0;
let hunterCount = 0;
// --- END JUGGERNAUT VARIABLES ---
let isGameRunning = false;
let animationFrameId = null;

function resetGameState() {
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
    }
    players = [];
    critMessages = [];
    orbs = [];
    lastOrbSpawn = 0;
    gameTimer = 0;
    crownPlayer = null;
    potatoPlayers = [];
    // --- NEW JUGGERNAUT RESET ---
    juggernautPlayer = null;
    juggernautHP = 0;
    hunterCount = 0;
    // --- END JUGGERNAUT RESET ---
    isGameRunning = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function assignTeams(players, numTeams) {
    players.sort(() => Math.random() - 0.5);
    for (let i = 0; i < players.length; i++) {
        const teamIndex = i % numTeams;
        players[i].teamId = teamIndex;
        players[i].color = teamColors[teamIndex];
        players[i].originalColor = players[i].color;
    }
}

function assignPotatoes() {
    const alivePlayers = players.filter(p => p.alive);
    if (alivePlayers.length === 0) return;

    // Reset all current potato states
    alivePlayers.forEach(p => {
        p.isPotato = false;
        p.color = p.originalColor || 'white';
        // Clear immunity on assignment reset
        p.orbEffects.immunity = 0; 
    });

    // Determine number of potatoes for this round (max 10, minimum 1)
    const numPotatoes = Math.max(1, Math.min(10, alivePlayers.length - 1));
    
    // Select new potatoes randomly from alive players
    potatoPlayers = alivePlayers.sort(() => Math.random() - 0.5).slice(0, numPotatoes);
    
    // Apply potato status and color
    for (const p of potatoPlayers) {
        p.isPotato = true;
        p.color = 'brown';
    }
}

function startGame() {
    resetGameState();
    const names = document.getElementById('names').value.split(',').map(n => n.trim()).filter(n => n);
    if (names.length < 2) {
        alert("Please enter at least two player names.");
        return;
    }

    gameMode = document.getElementById('game-mode').value;
    numTeams = parseInt(document.getElementById('num-teams').value) || 2;
    if (numTeams < 2) numTeams = 2;
    
    const customTimerSecs = parseInt(document.getElementById('timer-duration').value);

    players = names.map(name => ({
        name,
        x: canvas.width / 2 + (Math.random() - 0.5) * 100,
        y: canvas.height / 2 + (Math.random() - 0.5) * 100,
        vx: 0,
        vy: 0,
        alive: true,
        color: '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0'),
        // Added 'shield: 0' for the knockback reduction orb
        orbEffects: { strength: 0, speed: 0, lucky: 0, freeze: 0, invisible: 0, clone: 0, immunity: 0, shield: 0, blast: 0, isFreezing: 0 },
        clones: [],
        teamId: -1,
        isPotato: false,
        isCrown: false,
        isJuggernaut: false, // NEW
        hp: 1, // NEW: Base HP for non-juggernauts
        crownTime: 0,
        originalColor: null, 
        
        // --- NEW LUNGE PROPERTIES ---
        lungeCooldown: 0, 
        isLunging: 0,
        lungeDirection: 0 
        // --- END NEW LUNGE PROPERTIES ---
    }));

    if (gameMode === 'teamswap' || gameMode === 'teamdeathmatch') {
        assignTeams(players, numTeams);
    } else if (gameMode === 'crown') {
        crownPlayer = players[Math.floor(Math.random() * players.length)];
        crownPlayer.isCrown = true;
        crownPlayer.color = 'gold';
        crownPlayer.originalColor = crownPlayer.color;
        gameTimer = (customTimerSecs > 0 ? customTimerSecs : 60) * 60; 
    } else if (gameMode === 'potato') { 
        // Initial potato assignment
        players.forEach(p => p.originalColor = p.color);
        assignPotatoes(); 
        gameTimer = (customTimerSecs > 0 ? customTimerSecs : 60) * 60; // 60 seconds for Potato
    } else if (gameMode === 'juggernaut') {
        const juggernautIndex = Math.floor(Math.random() * players.length);
        juggernautPlayer = players[juggernautIndex];

        // 1. Assign Juggernaut properties
        juggernautPlayer.isJuggernaut = true;
        juggernautPlayer.color = 'darkred';
        juggernautPlayer.originalColor = juggernautPlayer.color;

        // 2. Calculate initial HP (250 * Hunter Count)
        hunterCount = players.length - 1;
        juggernautHP = 250 * hunterCount;
        juggernautPlayer.hp = juggernautHP; // Juggernaut tracks its own HP

        // 3. Assign Hunter properties
        players.forEach(p => {
            if (!p.isJuggernaut) {
                p.originalColor = p.color; // Keep their random color
            }
        });
    } else {
        players.forEach(p => p.originalColor = p.color);
    }

    critMessages = [];
    orbs = [];
    lastOrbSpawn = performance.now();
    isGameRunning = true;
    animationFrameId = requestAnimationFrame(gameLoop);
}

function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

function getNearestEnemy(player, exclude = []) {
    let nearest = null, minDist = Infinity;
    
    // --- Juggernaut Radius Check ---
    const playerRadius = player.isJuggernaut ? JUGGERNAUT_RADIUS : PLAYER_RADIUS;
    
    // --- IMMUNITY EVASION LOGIC (Highest Priority) ---
    // FIX: Ensure player.orbEffects exists before checking immunity, as clones lack this property
    if (player.orbEffects && player.orbEffects.immunity > 0) {
        let nearestThreat = null;
        let minThreatDist = Infinity;
        
        for (const other of players) {
            if (other === player || !other.alive) continue;
            
            let isThreat = false;
            
            if (gameMode === 'freeforall' || gameMode === 'teamdeathmatch' || gameMode === 'teamswap') {
                if (other.teamId !== player.teamId) isThreat = true; // Any enemy team member in team modes
                else if (gameMode === 'freeforall') isThreat = true; // Any non-teammate in FFA
            } else if (gameMode === 'potato') { 
                if (other.isPotato) isThreat = true; // All potatoes are a threat to an immune non-potato
            } else if (gameMode === 'crown') {
                if (player.isCrown && !other.isCrown) isThreat = true; // Crown runs from all non-Crowns
                // For simplicity, only the Crown runs when immune.
            } else if (gameMode === 'juggernaut') {
                if (!player.isJuggernaut && other.isJuggernaut) isThreat = true; // Hunters run from Juggernaut
                // Juggernaut doesn't run from hunters
            }

            if (isThreat) {
                const dist = distance(player, other);
                if (dist < minThreatDist) {
                    minThreatDist = dist;
                    nearestThreat = other;
                }
            }
        }
        
        if (nearestThreat) {
            // Return evasion target coordinates for the immune player to run from
            return { 
                x: nearestThreat.x, 
                y: nearestThreat.y, 
                isEvasionTarget: true, 
                dist: minThreatDist 
            };
        }
    }
    // --- END IMMUNITY EVASION LOGIC ---
    
    const isRunningMode = (gameMode === 'potato' || gameMode === 'crown' || gameMode === 'juggernaut'); 
    let evasionTarget = null;
    
    for (const other of players) {
        if (other === player || !other.alive) continue;
        if (exclude.includes(other)) continue;
        if (other.orbEffects.invisible > 0) continue;
        
        const otherRadius = other.isJuggernaut ? JUGGERNAUT_RADIUS : PLAYER_RADIUS;
        const dist = distance(player, other);

        if (gameMode === 'teamswap' || gameMode === 'teamdeathmatch') {
            if (other.teamId === player.teamId) continue;
        }
        
        // Potato Mode Evasion/Targeting logic (for non-immune players)
        if (gameMode === 'potato') { 
            
            // Potato chases Non-Potato
            if (player.isPotato && !other.isPotato) { 
                if (dist < minDist) {
                    minDist = dist;
                    nearest = other;
                }
                continue;
            }
            // Non-Potato runs from Potato
            else if (!player.isPotato && other.isPotato) { 
                // If a Potato is within 300px, it becomes the immediate evasion target
                if (dist < 300) { 
                    if (!evasionTarget || dist < distance(player, evasionTarget)) {
                       evasionTarget = { x: other.x, y: other.y, isEvasionTarget: true, dist: dist }; 
                    }
                }
                continue;
            }
            // Skip same type
            else { continue; }
        }

        // Juggernaut Mode Evasion/Targeting logic
        if (gameMode === 'juggernaut') {
            
            // Hunter chases Juggernaut (Target is Juggernaut)
            if (!player.isJuggernaut && other.isJuggernaut) {
                if (dist < minDist) {
                    minDist = dist;
                    nearest = other;
                }
                continue;
            }
            // Juggernaut chases Hunter (Target is Hunter)
            else if (player.isJuggernaut && !other.isJuggernaut) { 
                 if (dist < minDist) {
                    minDist = dist;
                    nearest = other;
                }
                continue;
            }
            // Skip same type
            else { continue; }
        }
        
        // Crown Mode Evasion/Targeting logic (for non-immune players)
        if (gameMode === 'crown') {
            // Non-Crown chases Crown (Target is Crown)
            if (!player.isCrown && other.isCrown) {
                if (dist < minDist) {
                    minDist = dist;
                    nearest = other;
                }
                continue;
            }
            // Crown runs from Non-Crown (Target is Non-Crown, evasion is used)
            else if (player.isCrown && !other.isCrown) { 
                if (dist < 300) {
                    if (!evasionTarget || dist < distance(player, evasionTarget)) {
                       evasionTarget = { x: other.x, y: other.y, isEvasionTarget: true, dist: dist };
                    }
                }
                continue;
            }
            // Skip same type
            else { continue; }
        }

        // Standard FFA / Team modes targeting
        
        if (dist < minDist) {
            minDist = dist;
            nearest = other;
        }
    }
    
    // In running modes, existing evasion overrides chasing (running away is higher priority)
    if (isRunningMode && evasionTarget) {
        return evasionTarget;
    }
    
    return nearest;
}

function getNearbyOrb(player) {
    // Orbs are only available in FFA and Team Deathmatch
    if (gameMode === 'potato' || gameMode === 'crown' || gameMode === 'teamswap' || gameMode === 'juggernaut') return null; 

    for (const orb of orbs) {
        if (distance(player, orb) <= 200) return orb;
    }
    return null;
}

function spawnOrb() {
    // Orbs are only available in FFA and Team Deathmatch
    if (gameMode === 'potato' || gameMode === 'crown' || gameMode === 'teamswap' || gameMode === 'juggernaut') return; 

    let angle = Math.random() * Math.PI * 2;
    let radius = Math.random() * (STAGE_RADIUS - ORB_RADIUS);
    let x = canvas.width / 2 + Math.cos(angle) * radius;
    let y = canvas.height / 2 + Math.sin(angle) * radius;
    let type = orbTypes[Math.floor(Math.random() * orbTypes.length)];
    orbs.push({ x, y, type });
}

function addCritMessage(attacker, target) {
    if (gameMode === 'teamswap' || gameMode === 'potato' || gameMode === 'crown' || gameMode === 'juggernaut') return; 
    
    critMessages.push({
        text: `${attacker.name.toUpperCase()} JUST CRIT ${target.name.toUpperCase()}`,
        x: target.x,
        y: target.y,
        alpha: 1,
        life: 60
    });
}

function drawCritMessages() {
    for (const msg of critMessages) {
        ctx.save();
        ctx.globalAlpha = msg.alpha;
        ctx.fillStyle = msg.size ? 'yellow' : 'red';
        ctx.font = `bold ${msg.size || 18}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(msg.text, msg.x, msg.y);
        ctx.restore();
        msg.y -= 0.5;
        msg.life--;
        msg.alpha = msg.life / 60;
    }
    critMessages = critMessages.filter(m => m.life > 0);
}

function drawOrbs() {
    for (const orb of orbs) {
        ctx.beginPath();
        ctx.arc(orb.x, orb.y, ORB_RADIUS, 0, Math.PI * 2);
        switch (orb.type) {
            case 'strength': ctx.fillStyle = 'purple'; break;
            case 'speed': ctx.fillStyle = 'cyan'; break;
            case 'lucky': ctx.fillStyle = 'gold'; break;
            case 'freeze': ctx.fillStyle = 'lightblue'; break;
            case 'invisible': ctx.fillStyle = 'gray'; break;
            case 'clone': ctx.fillStyle = 'magenta'; break;
            case 'blast': ctx.fillStyle = 'orange'; break;
            case 'shield': ctx.fillStyle = 'silver'; break; // Color for the new Shield orb
            default: ctx.fillStyle = 'white';
        }
        ctx.fill();
        ctx.fillStyle = 'black';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(orb.type[0].toUpperCase(), orb.x, orb.y + 4);
    }
}

function drawClones(player, radius) {
    for (const clone of player.clones) {
        if (!clone.alive) continue;
        ctx.beginPath();
        ctx.arc(clone.x, clone.y, radius * 0.7, 0, Math.PI * 2);
        ctx.fillStyle = player.color;
        ctx.globalAlpha = 0.6;
        ctx.fill();
        ctx.globalAlpha = 1;
    }
}

function updateClones(player) {
    if (player.orbEffects.clone <= 0 || !player.clones) {
        // Only clear the clones once the effect has expired to prevent array errors
        if (player.clones && player.clones.length > 0) {
            player.clones = [];
        }
        return;
    }
    
    const playerRadius = player.isJuggernaut ? JUGGERNAUT_RADIUS : PLAYER_RADIUS;

    for (const clone of player.clones) {
        if (!clone.alive) continue;

        // Clone objects don't have orbEffects, getNearestEnemy handles this safety check now
        const enemy = getNearestEnemy(clone, [player, ...player.clones]);
        if (enemy) {
            const dx = enemy.x - clone.x;
            const dy = enemy.y - clone.y;
            const dist = Math.hypot(dx, dy);

            if (dist > 0.1) {
                const speed = 0.7;
                clone.vx += (dx / dist) * speed;
                clone.vy += (dy / dist) * speed;
            }

            // Clones only knock back, they don't apply the freeze effect.
            const otherRadius = enemy.isJuggernaut ? JUGGERNAUT_RADIUS : PLAYER_RADIUS;
            // Check for immunity here before knockback (enemy is a real player, so orbEffects is safe)
            if ('alive' in enemy && enemy.alive && enemy.orbEffects.immunity <= 0 && dist < playerRadius * 0.7 + otherRadius) {
                const knockback = 10;
                const angle = Math.atan2(dy, dx);
                enemy.vx += Math.cos(angle) * knockback;
                enemy.vy += Math.sin(angle) * knockback;
            }
        }

        clone.x += clone.vx;
        clone.y += clone.vy;
        clone.vx *= 0.9;
        clone.vy *= 0.9;

        const dx = clone.x - canvas.width / 2;
        const dy = clone.y - canvas.height / 2;
        if (Math.hypot(dx, dy) > STAGE_RADIUS) {
            clone.alive = false;
        }
    }
}


function checkVictoryConditions() {
    const alivePlayers = players.filter(p => p.alive);

    if (gameMode === 'freeforall' || gameMode === 'teamdeathmatch') {
        const aliveTeams = new Set(alivePlayers.map(p => p.teamId !== -1 ? p.teamId : p.name));

        if (alivePlayers.length === 0) {
            return { winner: 'No one', isEnd: true };
        } else if (gameMode === 'freeforall' && alivePlayers.length === 1) {
            return { winner: alivePlayers[0].name, isEnd: true };
        } else if (gameMode === 'teamdeathmatch' && aliveTeams.size === 1) {
            const winningTeamId = alivePlayers[0].teamId;
            return { winner: `Team ${winningTeamId + 1}`, isEnd: true };
        }
    } else if (gameMode === 'teamswap') {
        const aliveTeams = new Set(alivePlayers.map(p => p.teamId));

        if (alivePlayers.length === 0) {
            return { winner: 'No one', isEnd: true };
        } else if (aliveTeams.size === 1) {
            const winningTeamId = alivePlayers[0].teamId;
            return { winner: `Team ${winningTeamId + 1}`, isEnd: true };
        }
    } else if (gameMode === 'potato') { 
        const aliveNonPotatoes = players.filter(p => p.alive && !p.isPotato);
        
        // Win if only one player remains alive (final survivor)
        if (alivePlayers.length === 1) {
            return { winner: alivePlayers[0].name, isEnd: true };
        }
        
        // Win if all players were tagged before the timer expired
        if (aliveNonPotatoes.length === 0 && gameTimer > 0) {
            return { winner: 'The Potatoes', isEnd: true };
        }

    } else if (gameMode === 'crown') {
        if (gameTimer <= 0 && crownPlayer && crownPlayer.alive) {
            return { winner: `${crownPlayer.name} (Crown)`, isEnd: true };
        }
        if (alivePlayers.length === 1) {
            return { winner: alivePlayers[0].name, isEnd: true };
        }
    } else if (gameMode === 'juggernaut') { // NEW JUGGERNAUT LOGIC
        const juggernautIsAlive = alivePlayers.some(p => p.isJuggernaut);
        const huntersAreAlive = alivePlayers.some(p => !p.isJuggernaut);

        if (!juggernautIsAlive && huntersAreAlive) {
            return { winner: 'The Hunters', isEnd: true };
        }
        if (juggernautIsAlive && !huntersAreAlive) {
            return { winner: `${juggernautPlayer.name} (Juggernaut)`, isEnd: true };
        }
    }

    return { winner: null, isEnd: false };
}


function gameLoop(currentTime) {
    if (!isGameRunning) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.beginPath();
    ctx.arc(canvas.width / 2, canvas.height / 2, STAGE_RADIUS, 0, Math.PI * 2);
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 4;
    ctx.stroke();

    // Game Mode Timers
    if (gameMode === 'potato' || gameMode === 'crown') { 
        if (gameTimer > 0) {
            gameTimer--;
            const secs = Math.ceil(gameTimer / 60);
            ctx.fillStyle = 'red';
            ctx.font = 'bold 24px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(`Time: ${secs}s`, canvas.width / 2, 30);
        } 
        
        // POTATO MODE RESTART LOGIC
        if (gameMode === 'potato' && gameTimer === 0) { 
            const customTimerSecs = parseInt(document.getElementById('timer-duration').value);
            const initialTimer = (customTimerSecs > 0 ? customTimerSecs : 60) * 60; 
            
            // 1. Eliminate existing Taggers/Potatoes
            let potatoesWereKilled = false;
            for (const p of players) {
                if (p.isPotato) {
                    p.alive = false;
                    potatoesWereKilled = true;
                }
            }

            // 2. Check if a final winner was determined
            const { winner, isEnd } = checkVictoryConditions();
            if (isEnd) {
                isGameRunning = false;
                ctx.fillStyle = 'yellow';
                ctx.font = '30px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(winner === 'No one' ? `No one wins!` : `${winner} wins!`, canvas.width / 2, 50);
                return;
            }

            // 3. Restart the round if there are still multiple players
            if (players.filter(p => p.alive).length > 1) {
                assignPotatoes(); 
                gameTimer = initialTimer;
                
                if (potatoesWereKilled) {
                    critMessages.push({
                        text: `POTATOES ELIMINATED! NEW ROUND BEGINS!`,
                        x: canvas.width / 2, y: canvas.height / 2, alpha: 1, life: 120, size: 24
                    });
                }
            }
        }
    }
    
    // Team Status Display
    if (gameMode === 'teamdeathmatch' || gameMode === 'teamswap') {
        const teamStatus = {};
        players.filter(p => p.alive).forEach(p => {
            teamStatus[p.teamId] = (teamStatus[p.teamId] || 0) + 1;
        });

        let displayY = 30;
        ctx.font = '16px sans-serif';
        for(let i = 0; i < numTeams; i++) {
            ctx.fillStyle = teamColors[i];
            ctx.fillText(`Team ${i + 1}: ${teamStatus[i] || 0} alive`, canvas.width - 100, displayY);
            displayY += 20;
        }
    }

    // Crown Player Status
    if (gameMode === 'crown' && crownPlayer && crownPlayer.alive) {
        crownPlayer.crownTime++;
        ctx.fillStyle = 'gold';
        ctx.font = 'bold 20px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`Crown: ${crownPlayer.name}`, canvas.width / 2, 60);
    }
    
    // Orbs now only spawn in 'freeforall' or 'teamdeathmatch'
    if (gameMode !== 'potato' && gameMode !== 'crown' && gameMode !== 'teamswap' && gameMode !== 'juggernaut' && performance.now() - lastOrbSpawn > ORB_SPAWN_INTERVAL) { 
        spawnOrb();
        lastOrbSpawn = performance.now();
    }

    drawOrbs();

    // UNIVERSAL COLLISION CHECK (Including Teammates)
    for (let i = 0; i < players.length; i++) {
        const p1 = players[i];
        if (!p1.alive) continue;
        const r1 = p1.isJuggernaut ? JUGGERNAUT_RADIUS : PLAYER_RADIUS; // Get radius for p1
        
        for (let j = i + 1; j < players.length; j++) {
            const p2 = players[j];
            if (!p2.alive) continue;
            const r2 = p2.isJuggernaut ? JUGGERNAUT_RADIUS : PLAYER_RADIUS; // Get radius for p2

            const dist = distance(p1, p2);
            if (dist < r1 + r2) { // Check collision using combined radii
                const overlap = (r1 + r2) - dist;
                const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);

                const knockbackForce = overlap * 0.1; 

                p1.vx -= Math.cos(angle) * knockbackForce;
                p1.vy -= Math.sin(angle) * knockbackForce;
                p2.vx += Math.cos(angle) * knockbackForce;
                p2.vy += Math.sin(angle) * knockbackForce;
            }
        }
    }


    for (const p of players) {
        if (!p.alive) continue;
        
        const currentRadius = p.isJuggernaut ? JUGGERNAUT_RADIUS : PLAYER_RADIUS; // NEW: Get current radius

        for (let effect in p.orbEffects) {
            if (p.orbEffects[effect] > 0) p.orbEffects[effect]--;
        }
        
        // --- NEW LUNGE LOGIC: Cooldown & Duration Decrement ---
        if (p.lungeCooldown > 0) p.lungeCooldown--;
        if (p.isLunging > 0) p.isLunging--;
        // --- END LUNGE LOGIC ---

        // --- IMMUNITY COLOR RESTORATION ---
        // Restore color when the immunity effect ends
        if (p.orbEffects.immunity === 0 && p.originalColor && !p.isCrown && !p.isPotato && !p.isJuggernaut && p.color !== p.originalColor) {
            p.color = p.originalColor;
        }
        // --- END IMMUNITY COLOR RESTORATION ---

        updateClones(p);

        // Check orb pickup (FFA, Team Deathmatch only)
        if (gameMode !== 'potato' && gameMode !== 'crown' && gameMode !== 'teamswap' && gameMode !== 'juggernaut') { 
            for (let i = orbs.length - 1; i >= 0; i--) {
                const orb = orbs[i];
                if (distance(p, orb) < currentRadius + ORB_RADIUS) { // Use currentRadius
                    if (orb.type === 'blast') {
                        p.orbEffects[orb.type] = BLAST_EFFECT_DURATION;
                    } else if (orb.type === 'clone') {
                        p.orbEffects.clone = ORB_EFFECT_DURATION;
                        p.clones = [];
                        for (let c = 0; c < 4; c++) {
                            let angle = (Math.PI * 2 / 4) * c;
                            let dist = currentRadius * 2;
                            p.clones.push({
                                x: p.x + Math.cos(angle) * dist,
                                y: p.y + Math.sin(angle) * dist,
                                vx: 0, vy: 0, alive: true
                            });
                        }
                    } else if (orb.type === 'freeze') {
                        p.orbEffects.isFreezing = ORB_EFFECT_DURATION; // Player becomes the "freezer"
                    } else {
                        // Handles strength, speed, lucky, invisible, and SHIELD
                        p.orbEffects[orb.type] = ORB_EFFECT_DURATION; 
                    }
                    orbs.splice(i, 1);
                }
            }
        }

        // Frozen state logic (Bouncing)
        if (p.orbEffects.freeze > 0) {
             // Only frozen targets are fully blocked from movement
            if (p.orbEffects.isFreezing <= 0) { 
                p.x += p.vx;
                p.y += p.vy;
                p.vx *= 0.9;
                p.vy *= 0.9;

                const dx = p.x - canvas.width / 2;
                const dy = p.y - canvas.height / 2;
                if (Math.hypot(dx, dy) > STAGE_RADIUS) {
                    p.alive = false;
                    continue;
                }
            }
            
            // Draw frozen player (both targets and attackers will be lightblue)
            ctx.beginPath();
            ctx.arc(p.x, p.y, currentRadius, 0, Math.PI * 2); // Use currentRadius
            ctx.fillStyle = 'lightblue';
            ctx.fill();
            drawClones(p, currentRadius);
            
            // Only continue (skip movement logic) for frozen targets
            if (p.orbEffects.isFreezing <= 0) { 
                continue;
            }
        }

        // Blast orb pushes nearby players
        if (p.orbEffects.blast > 0) {
            for (const other of players) {
                if (other === p || !other.alive) continue;
                const dx = other.x - p.x;
                const dy = other.y - p.y;
                const dist = Math.hypot(dx, dy);
                if (dist > 0 && dist <= 100 + currentRadius) { // Adjusted blast radius
                    const pushForce = 10;
                    other.vx += (dx / dist) * pushForce;
                    other.vy += (dy / dist) * pushForce;
                }
            }
        }

        // Target acquisition
        let target = getNearbyOrb(p) || getNearestEnemy(p);

        if (target) {
            const dx = target.x - p.x;
            const dy = target.y - p.y;
            const dist = Math.hypot(dx, dy);

            // --- NEW LUNGE TRIGGER ---
            const isNonCrownHunter = gameMode === 'crown' && !p.isCrown && target.isCrown;

            // Trigger lunge if non-Crown, off cooldown, not currently lunging, and is chasing the crown (or a primary target)
            // Lunge is not triggered if the target is too close (dist < 100) to prevent overshooting
            if (isNonCrownHunter && dist > 100 && p.lungeCooldown <= 0 && p.isLunging <= 0) {
                // 1. Set Direction to target direction
                const angle = Math.atan2(dy, dx);
                p.lungeDirection = angle;
                
                // 2. Start Lunge
                p.isLunging = LUNGE_DURATION;
                
                // 3. Set Cooldown 
                p.lungeCooldown = LUNGE_COOLDOWN; 
            }
            // --- END LUNGE TRIGGER ---

            if (dist > 0.1) {
                let baseSpeed = 0.5;
                const speedMult = p.orbEffects.speed > 0 ? 2 : 1;
                
                if (gameMode === 'potato' && p.isPotato) baseSpeed *= 1.25; 
                if (gameMode === 'juggernaut' && p.isJuggernaut) baseSpeed *= 0.8; // Juggernaut is slower
                if (gameMode === 'crown' && p.isCrown && p.orbEffects.speed === 0) baseSpeed *= 1.10; 
                else if (gameMode === 'crown' && p.isCrown && p.orbEffects.speed > 0) baseSpeed *= 1.5; 

                let speed = baseSpeed * speedMult;
                
                
                // --- APPLY LUNGE FORCE IF ACTIVE ---
                if (p.isLunging > 0) {
                    speed *= LUNGE_FORCE; 
                    
                    // Apply lunge force in the stored direction. Lunge direction takes precedence over normal movement logic.
                    p.vx += Math.cos(p.lungeDirection) * speed; 
                    p.vy += Math.sin(p.lungeDirection) * speed;
                } else {
                    // Normal Movement
                    if (target.isEvasionTarget) {
                        // Running away from the target coordinates
                        p.vx -= (dx / dist) * speed; 
                        p.vy -= (dy / dist) * speed;
                    } else {
                        // Chasing the target coordinates
                        p.vx += (dx / dist) * speed;
                        p.vy += (dy / dist) * speed;
                    }
                }
            }

            // Attack logic (collision)
            const targetRadius = 'isJuggernaut' in target && target.isJuggernaut ? JUGGERNAUT_RADIUS : PLAYER_RADIUS;
            if ('alive' in target && target.alive && dist < currentRadius + targetRadius) {
                if (target.orbEffects.invisible <= 0) {
                    
                    // --- IMMUNITY CHECK (Invincibility/Tagback Protection) ---
                    if (target.orbEffects.immunity > 0) {
                        // Still apply general physics separation force
                        const overlap = currentRadius + targetRadius - dist;
                        const angle = Math.atan2(dy, dx);
                        const knockbackForce = overlap * 0.5; 
                        p.vx -= Math.cos(angle) * knockbackForce;
                        p.vy -= Math.sin(angle) * knockbackForce;
                        target.vx += Math.cos(angle) * knockbackForce;
                        target.vy += Math.sin(angle) * knockbackForce;
                        continue; // Skip all other attack effects
                    }
                    // --- END IMMUNITY CHECK ---

                    const canCrit = (gameMode === 'freeforall' || gameMode === 'teamdeathmatch');
                    const baseCritChance = 0.01;
                    const critBonus = p.orbEffects.lucky > 0 ? 0.09 : 0;
                    const critChance = baseCritChance + critBonus;
                    const isCrit = canCrit && Math.random() < critChance;

                    let knockback = isCrit ? 100 : (Math.random() * 9.9 + 0.1);
                    if (p.orbEffects.strength > 0 && !isCrit) knockback *= 2;
                    
                    // --- MODE SPECIFIC COLLISION RESULTS ---
                    
                    // JUGGERNAUT LOGIC (Highest Priority)
                    if (gameMode === 'juggernaut') {
                        if (p.isJuggernaut && !target.isJuggernaut) { 
                            // Juggernaut (p) hits a Hunter (target)
                            knockback *= JUGGERNAUT_KNOCKBACK_MULT; // 3x knockback
                        }
                        else if (!p.isJuggernaut && target.isJuggernaut) { 
                            // Hunter (p) hits the Juggernaut (target)
                            
                            // Knockback is converted to damage (Hunter cannot knock Juggernaut back)
                            const damage = knockback * HUNTER_DAMAGE_KNOCKBACK_MULT; 
                            target.hp -= damage;
                            knockback = 0; // Hunter applies 0 knockback to Juggernaut

                            if (target.hp <= 0) {
                                target.alive = false; // Defeat the Juggernaut
                            }
                        }
                    }
                    
                    // Team Swap Logic
                    else if (gameMode === 'teamswap' && p.teamId !== target.teamId) {
                        if (knockback > 5) { 
                            target.teamId = p.teamId;
                            target.color = p.color;
                            target.originalColor = p.color; // Ensure original color is updated
                            knockback = 10;
                            critMessages.push({
                                text: `SWAP! ${target.name.toUpperCase()} IS TEAM ${p.teamId + 1}`,
                                x: target.x, y: target.y, alpha: 1, life: 60
                            });
                        }
                    } 
                    // Potato Mode Tag Logic (Tagger tags Runner)
                    else if (gameMode === 'potato' && p.isPotato && target.alive && !target.isPotato) { 
                        // 1. Turn the target into a potato
                        target.isPotato = true;
                        target.color = 'brown';

                        // 2. Remove potato status from tagger
                        p.isPotato = false;
                        p.color = p.originalColor || 'white';

                        // 3. Update the global potato list
                        potatoPlayers = players.filter(pl => pl.isPotato);

                        // 4. Give the tagger IMMUNITY for 5 seconds (Invincibility/Tagback)
                        p.orbEffects.immunity = IMMUNITY_DURATION;

                        // 5. Prevent knockback so the tag feels smooth
                        knockback = 0;
                    }

                    // Crown Mode Tag Logic (Non-Crown tags Crown)
                    else if (gameMode === 'crown' && !p.isCrown && target.isCrown) {
                        // Successful Steal
                        target.isCrown = false;
                        target.color = target.originalColor; 
                        
                        p.isCrown = true;
                        p.color = 'gold';
                        crownPlayer = p;
                        knockback = 0;
                        
                        // Stealer (p) gets 5-second IMMUNITY to escape (Invincibility/Tagback)
                        p.orbEffects.immunity = IMMUNITY_DURATION;
                        
                        critMessages.push({
                            text: `STEAL! ${p.name.toUpperCase()} HAS THE CROWN!`,
                            x: target.x, y: target.y, alpha: 1, life: 60
                        });
                    }
                    
                    // --- SHIELD EFFECT LOGIC (Knockback Reduction) ---
                    if (target.orbEffects.shield > 0) {
                        knockback *= 0.5; // Halve the incoming knockback
                    }
                    // --- END SHIELD EFFECT LOGIC ---
                    
                    const angle = Math.atan2(dy, dx);
                    target.vx += Math.cos(angle) * knockback;
                    target.vy += Math.sin(angle) * knockback;

                    // Only apply the freeze status if the attacker is the 'freezing' player
                    if (p.orbEffects.isFreezing > 0) {
                        target.orbEffects.freeze = FREEZE_DURATION;
                    }

                    if (isCrit) addCritMessage(p, target);
                }
            }
        }
        
        // --- Stage Border Avoidance Logic (Danger Zone Active) ---
        const dxCenter = p.x - canvas.width / 2;
        const dyCenter = p.y - canvas.height / 2;
        const distCenter = Math.hypot(dxCenter, dyCenter);
        // Use currentRadius for accurate danger zone calculation
        const DANGER_ZONE = STAGE_RADIUS - currentRadius * 5; 

        if (distCenter > DANGER_ZONE) {
            // Player is in the DANGER_ZONE (near the border).
            // Apply an inward force to push the player away from the edge.
            const angle = Math.atan2(dyCenter, dxCenter);
            const avoidanceForce = (distCenter - DANGER_ZONE) * 0.05; // Force increases closer to the edge
            
            p.vx -= Math.cos(angle) * avoidanceForce;
            p.vy -= Math.sin(angle) * avoidanceForce;
        }


        // Move player & apply friction
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.9;
        p.vy *= 0.9;

        // Kill if outside stage radius
        const dx = p.x - canvas.width / 2;
        const dy = p.y - canvas.height / 2;
        if (Math.hypot(dx, dy) > STAGE_RADIUS) {
            
            // Boundary rules:
            if (gameMode === 'potato') { 
                if (!p.isPotato) {
                    p.alive = false; // Non-Potatoes die
                } else {
                    // Potatoes bounce off the boundary
                    const angle = Math.atan2(dy, dx);
                    p.x = canvas.width / 2 + Math.cos(angle) * STAGE_RADIUS;
                    p.y = canvas.height / 2 + Math.sin(angle) * STAGE_RADIUS;
                    p.vx = -p.vx * 0.5;
                    p.vy = -p.vy * 0.5;
                }
            } 
            else if (gameMode === 'crown') {
                const wasCrown = p.isCrown;
                p.alive = false; // Crown player and Non-Crowns die

                // If the Crown player died, choose a new one
                if (wasCrown) {
                    p.isCrown = false;
                    p.color = p.originalColor; // Restore color of dead crown player
                    crownPlayer = null; 
                    
                    const aliveNonCrowns = players.filter(pl => pl.alive && !pl.isCrown);
                    if (aliveNonCrowns.length > 0) {
                        const newCrown = aliveNonCrowns[Math.floor(Math.random() * aliveNonCrowns.length)];
                        newCrown.isCrown = true;
                        newCrown.color = 'gold';
                        crownPlayer = newCrown;
                        // Grant 5-second IMMUNITY to the new Crown
                        newCrown.orbEffects.immunity = IMMUNITY_DURATION; 
                    }
                }
            } 
            else {
                // All other modes: player dies
                p.alive = false;
            }
            
            continue;
        }

        // Draw player
        ctx.beginPath();
        ctx.arc(p.x, p.y, currentRadius, 0, Math.PI * 2); // Use currentRadius
        // Draw blue if frozen OR isFreezing
        ctx.fillStyle = (p.orbEffects.freeze > 0 || p.orbEffects.isFreezing > 0) ? 'lightblue' : p.color;
        
        // Draw IMMUNITY outline (pulsing green) - Only for Invincibility/Tagback
        if (p.orbEffects.immunity > 0) {
             ctx.strokeStyle = (p.orbEffects.immunity % 15 < 7) ? 'lime' : p.color;
             ctx.lineWidth = 3;
             ctx.stroke();
        }

        ctx.fill();

        // Draw Player Name
        ctx.fillStyle = 'white';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(p.name, p.x, p.y - currentRadius - 5); // Use currentRadius
        
        // Draw Juggernaut HP Bar (NEW)
        if (p.isJuggernaut) {
            // Draw HP Bar
            const barWidth = 40;
            const barHeight = 5;
            const hpRatio = p.hp / juggernautHP;
            
            ctx.fillStyle = 'gray';
            ctx.fillRect(p.x - barWidth / 2, p.y - currentRadius - 15, barWidth, barHeight);
            
            ctx.fillStyle = hpRatio > 0.5 ? 'green' : (hpRatio > 0.2 ? 'yellow' : 'red');
            ctx.fillRect(p.x - barWidth / 2, p.y - currentRadius - 15, barWidth * hpRatio, barHeight);
            
            ctx.fillStyle = 'white';
            ctx.fillText(`HP: ${Math.ceil(p.hp)}`, p.x, p.y - currentRadius - 25);
        }

        if (p.teamId !== -1 && !p.isCrown) {
             ctx.fillStyle = 'white';
             ctx.fillText(`T${p.teamId + 1}`, p.x, p.y + currentRadius + 10);
        }
        if (p.isCrown) {
             ctx.fillStyle = 'yellow';
             ctx.fillText(`CROWN`, p.x, p.y + currentRadius + 10);
        }
        if (p.isPotato) {
             ctx.fillStyle = 'red';
             ctx.fillText(`POTATO`, p.x, p.y + currentRadius + 10);
        }
        if (p.isJuggernaut) {
             ctx.fillStyle = 'red';
             ctx.fillText(`JUGGERNAUT`, p.x, p.y + currentRadius + 10);
        }
        
        // --- NEW LUNGE STATUS DISPLAY ---
        if (gameMode === 'crown' && !p.isCrown) {
            if (p.isLunging > 0) {
                ctx.fillStyle = 'red';
                ctx.font = 'bold 10px sans-serif';
                ctx.fillText('LUNGE!', p.x, p.y + currentRadius + 20);
            } else if (p.lungeCooldown > 0) {
                 ctx.fillStyle = 'orange';
                 ctx.font = 'bold 10px sans-serif';
                 ctx.fillText(`L:${Math.ceil(p.lungeCooldown / 60)}s`, p.x, p.y + currentRadius + 20);
            }
        }
        // --- END LUNGE STATUS DISPLAY ---


        const effects = [];
        if (p.orbEffects.strength > 0) effects.push('S');
        if (p.orbEffects.speed > 0) effects.push('P');
        if (p.orbEffects.lucky > 0) effects.push('L');
        if (p.orbEffects.freeze > 0) effects.push('F');
        if (p.orbEffects.isFreezing > 0) effects.push('F'); // Indicate the attacker status
        if (p.orbEffects.invisible > 0) effects.push('I');
        if (p.orbEffects.clone > 0) effects.push('C');
        // Shield (knockback reduction) displays 'H'
        if (p.orbEffects.shield > 0) effects.push('H'); 
        
        // Note: p.orbEffects.immunity (Invincibility/Tagback) is not displayed here (No letter)

        if (effects.length) {
            ctx.fillStyle = 'lightgreen';
            ctx.font = 'bold 14px monospace';
            ctx.fillText(effects.join(''), p.x, p.y - currentRadius - 20);
        }

        drawClones(p, currentRadius);
    }

    drawCritMessages();

    const { winner, isEnd } = checkVictoryConditions();
    if (isEnd) {
        isGameRunning = false;
        ctx.fillStyle = 'yellow';
        ctx.font = '30px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(
            winner === 'No one' ? `No one wins!` : `${winner} wins!`,
            canvas.width / 2,
            50
        );
        return;
    }

    animationFrameId = requestAnimationFrame(gameLoop);
}

document.getElementById('start-btn').addEventListener('click', startGame);

ctx.fillStyle = 'white';
ctx.font = '20px sans-serif';
ctx.textAlign = 'center';
ctx.fillText('Enter names and select a Game Mode to begin!', canvas.width / 2, canvas.height / 2);
