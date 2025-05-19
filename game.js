const canvas = document.getElementById('fightpit');
const ctx = canvas.getContext('2d');

const STAGE_RADIUS = 350;
const PLAYER_RADIUS = 10;
const ORB_RADIUS = 8;

let players = [];
let critMessages = [];
let orbs = [];
let orbTypes = ['strength', 'speed', 'lucky', 'freeze', 'invisible', 'clone', 'shield', 'blast'];
let lastOrbSpawn = 0;
const ORB_SPAWN_INTERVAL = 5000;
const ORB_EFFECT_DURATION = 600;
const BLAST_EFFECT_DURATION = 60;

function startGame() {
  const names = document.getElementById('names').value.split(',').map(n => n.trim()).filter(n => n);
  players = names.map(name => ({
    name,
    x: canvas.width / 2 + (Math.random() - 0.5) * 100,
    y: canvas.height / 2 + (Math.random() - 0.5) * 100,
    vx: 0,
    vy: 0,
    alive: true,
    color: '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0'),
    orbEffects: {
      strength: 0, speed: 0, lucky: 0, freeze: 0,
      invisible: 0, clone: 0, shield: 0, blast: 0,
      freezePower: 0 // NEW: power to freeze others
    },
    clones: []
  }));
  critMessages = [];
  orbs = [];
  lastOrbSpawn = performance.now();
  requestAnimationFrame(gameLoop);
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function getNearestEnemy(player, exclude = []) {
  let nearest = null, minDist = Infinity;
  for (const other of players) {
    if (other === player || !other.alive || exclude.includes(other)) continue;
    if (other.orbEffects.invisible > 0) continue;
    const dist = distance(player, other);
    if (dist < minDist) {
      minDist = dist;
      nearest = other;
    }
  }
  return nearest;
}

function getNearbyOrb(player) {
  for (const orb of orbs) {
    if (distance(player, orb) <= 200) return orb;
  }
  return null;
}

function spawnOrb() {
  const angle = Math.random() * Math.PI * 2;
  const radius = Math.random() * (STAGE_RADIUS - ORB_RADIUS);
  const x = canvas.width / 2 + Math.cos(angle) * radius;
  const y = canvas.height / 2 + Math.sin(angle) * radius;
  const type = orbTypes[Math.floor(Math.random() * orbTypes.length)];
  orbs.push({ x, y, type });
}

function addCritMessage(attacker, target) {
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
    ctx.fillStyle = 'red';
    ctx.font = 'bold 18px sans-serif';
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
      case 'shield': ctx.fillStyle = 'lime'; break;
      case 'blast': ctx.fillStyle = 'orange'; break;
      default: ctx.fillStyle = 'white';
    }
    ctx.fill();
    ctx.fillStyle = 'black';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(orb.type[0].toUpperCase(), orb.x, orb.y + 4);
  }
}

function drawClones(player) {
  for (const clone of player.clones) {
    if (!clone.alive) continue;
    ctx.beginPath();
    ctx.arc(clone.x, clone.y, PLAYER_RADIUS * 0.7, 0, Math.PI * 2);
    ctx.fillStyle = player.color;
    ctx.globalAlpha = 0.6;
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

function updateClones(player) {
  if (player.orbEffects.clone <= 0 || !player.clones) {
    player.clones = [];
    return;
  }

  for (const clone of player.clones) {
    if (!clone.alive) continue;

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

      if (enemy.alive && dist < PLAYER_RADIUS * 2) {
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

function gameLoop() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.beginPath();
  ctx.arc(canvas.width / 2, canvas.height / 2, STAGE_RADIUS, 0, Math.PI * 2);
  ctx.strokeStyle = 'white';
  ctx.lineWidth = 4;
  ctx.stroke();

  if (performance.now() - lastOrbSpawn > ORB_SPAWN_INTERVAL) {
    spawnOrb();
    lastOrbSpawn = performance.now();
  }

  drawOrbs();

  for (const p of players) {
    if (!p.alive) continue;

    for (let effect in p.orbEffects) {
      if (p.orbEffects[effect] > 0) p.orbEffects[effect]--;
    }

    updateClones(p);

    for (let i = orbs.length - 1; i >= 0; i--) {
      const orb = orbs[i];
      if (distance(p, orb) < PLAYER_RADIUS + ORB_RADIUS) {
        if (orb.type === 'blast') {
          p.orbEffects.blast = BLAST_EFFECT_DURATION;
        } else if (orb.type === 'clone') {
          p.orbEffects.clone = ORB_EFFECT_DURATION;
          p.clones = [];
          for (let c = 0; c < 4; c++) {
            let angle = (Math.PI * 2 / 4) * c;
            let dist = PLAYER_RADIUS * 2;
            p.clones.push({
              x: p.x + Math.cos(angle) * dist,
              y: p.y + Math.sin(angle) * dist,
              vx: 0,
              vy: 0,
              alive: true
            });
          }
        } else if (orb.type === 'freeze') {
          p.orbEffects.freezePower = ORB_EFFECT_DURATION;
        } else {
          p.orbEffects[orb.type] = ORB_EFFECT_DURATION;
        }
        orbs.splice(i, 1);
      }
    }

    if (p.orbEffects.freeze > 0) {
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

      ctx.beginPath();
      ctx.arc(p.x, p.y, PLAYER_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = 'lightblue';
      ctx.fill();

      ctx.fillStyle = 'white';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      drawClones(p);
      continue;
    }

    if (p.orbEffects.blast > 0) {
      for (const other of players) {
        if (other === p || !other.alive) continue;
        const dx = other.x - p.x;
        const dy = other.y - p.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 0 && dist <= 100) {
          const pushForce = 10;
          other.vx += (dx / dist) * pushForce;
          other.vy += (dy / dist) * pushForce;
        }
      }
    }

    let target = getNearbyOrb(p) || getNearestEnemy(p);

    if (target) {
      const dx = target.x - p.x;
      const dy = target.y - p.y;
      const dist = Math.hypot(dx, dy);

      if (dist > 0.1) {
        const baseSpeed = 0.5;
        const speedMult = p.orbEffects.speed > 0 ? 2 : 1;
        const speed = baseSpeed * speedMult;
        p.vx += (dx / dist) * speed;
        p.vy += (dy / dist) * speed;
      }

      if ('alive' in target && target.alive && dist < PLAYER_RADIUS * 2) {
        if (target.orbEffects.invisible <= 0) {
          const baseCritChance = 0.01;
          const critBonus = p.orbEffects.lucky > 0 ? 0.09 : 0;
          const critChance = baseCritChance + critBonus;
          const isCrit = Math.random() < critChance;

          let knockback = isCrit ? 100 : (Math.random() * 9.9 + 0.1);
          if (p.orbEffects.strength > 0 && !isCrit) knockback *= 2;
          if (target.orbEffects.shield > 0) knockback *= 0.5;

          const angle = Math.atan2(dy, dx);
          target.vx += Math.cos(angle) * knockback;
          target.vy += Math.sin(angle) * knockback;

          if (p.orbEffects.freezePower > 0 && players.includes(p)) {
            target.orbEffects.freeze = 300;
          }

          if (isCrit) addCritMessage(p, target);
        }
      }
    }

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

    ctx.beginPath();
    ctx.arc(p.x, p.y, PLAYER_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = p.orbEffects.freeze > 0 ? 'lightblue' : p.color;
    ctx.fill();

    ctx.fillStyle = 'white';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(p.name, p.x, p.y - PLAYER_RADIUS - 5);

    const effects = [];
    if (p.orbEffects.strength > 0) effects.push('S');
    if (p.orbEffects.speed > 0) effects.push('P');
    if (p.orbEffects.lucky > 0) effects.push('L');
    if (p.orbEffects.freezePower > 0) effects.push('F');
    if (p.orbEffects.invisible > 0) effects.push('I');
    if (p.orbEffects.clone > 0) effects.push('C');
    if (p.orbEffects.shield > 0) effects.push('H');
    if (effects.length) {
      ctx.fillStyle = 'lightgreen';
      ctx.font = 'bold 14px monospace';
      ctx.fillText(effects.join(''), p.x, p.y - PLAYER_RADIUS - 20);
    }

    drawClones(p);
  }

  drawCritMessages();

  const alive = players.filter(p => p.alive);
  if (alive.length <= 1) {
    ctx.fillStyle = 'yellow';
    ctx.font = '30px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(
      alive.length === 1 ? `${alive[0].name} wins!` : `No one wins!`,
      canvas.width / 2,
      50
    );
    return;
  }

  requestAnimationFrame(gameLoop);
}

document.getElementById('start-btn').addEventListener('click', startGame);
