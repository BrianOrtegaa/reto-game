const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const TILE_SIZE = 32;
let mapData, tileset;

let pacman = {
  x: 0,
  y: 0,
  dir: { x: 0, y: 0 },
  nextDir: { x: 0, y: 0 },
  speed: 2,
  mouthOpen: 0,
  radius: TILE_SIZE / 2 - 4,
  collisionRadius: 8  // Radio más pequeño para colisiones
};

let ghosts = [];
let dots = [];
let score = 0;
let lives = 3;
let highscore = localStorage.getItem('pacman-highscore') || 0;
let gameOver = false;
let powerMode = false;
let powerModeTimer = 0;
let username = '';

// Cargar mapa y tiles
async function loadGame() {
  // Pedir username al jugador
  username = prompt('¡Bienvenido a Pac-Man! 👾\n\nIngresa tu nombre de usuario:');
  
  // Si cancela o no ingresa nada, usar "Jugador"
  if (!username || username.trim() === '') {
    username = 'Jugador';
  }
  
  const res = await fetch('assets/map.json');
  mapData = await res.json();

  // Crear tileset proceduralmente si no existe la imagen
  tileset = document.createElement('canvas');
  tileset.width = TILE_SIZE;
  tileset.height = TILE_SIZE;
  const tileCtx = tileset.getContext('2d');
  
  // Dibujar tile de pared (azul neón)
  tileCtx.fillStyle = '#0015ff';
  tileCtx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
  tileCtx.strokeStyle = '#00ccff';
  tileCtx.lineWidth = 2;
  tileCtx.strokeRect(2, 2, TILE_SIZE - 4, TILE_SIZE - 4);

  // Cargar dots
  const dotsLayer = mapData.layers.find(l => l.name === "dots");
  if (dotsLayer && dotsLayer.objects) {
    dots = dotsLayer.objects.map(obj => ({
      x: obj.x,
      y: obj.y,
      collected: false,
      isPower: obj.name === "power"
    }));
  }

  // Generar dots automáticamente en espacios vacíos
  const walls = mapData.layers.find(l => l.name === 'walls').data;
  for (let y = 1; y < mapData.height - 1; y++) {
    for (let x = 1; x < mapData.width - 1; x++) {
      if (walls[y * mapData.width + x] === 0) {
        const dotX = x * TILE_SIZE + TILE_SIZE / 2;
        const dotY = y * TILE_SIZE + TILE_SIZE / 2;
        
        // Evitar duplicados
        const exists = dots.some(d => 
          Math.abs(d.x - dotX) < 10 && Math.abs(d.y - dotY) < 10
        );
        
        if (!exists) {
          dots.push({
            x: dotX,
            y: dotY,
            collected: false,
            isPower: false
          });
        }
      }
    }
  }

  // Posición inicial de Pac-Man
  const entitiesLayer = mapData.layers.find(l => l.name === "entities");
  if (entitiesLayer) {
    const pacObj = entitiesLayer.objects.find(o => o.name === "pacman_start");
    if (pacObj) {
      pacman.x = pacObj.x;
      pacman.y = pacObj.y;
    }

    // Crear fantasmas
    const ghostConfigs = [
      { name: "ghost_red", color: "#ff0000", behavior: "chase" },
      { name: "ghost_pink", color: "#ffb8ff", behavior: "ambush" },
      { name: "ghost_blue", color: "#00ffff", behavior: "patrol" },
      { name: "ghost_orange", color: "#ffb851", behavior: "random" }
    ];

    ghostConfigs.forEach(config => {
      const ghostObj = entitiesLayer.objects.find(o => o.name === config.name);
      if (ghostObj) {
        ghosts.push({
          x: ghostObj.x,
          y: ghostObj.y,
          startX: ghostObj.x,
          startY: ghostObj.y,
          dir: { x: 1, y: 0 },
          color: config.color,
          behavior: config.behavior,
          speed: 1.5,
          scatter: false
        });
      }
    });
  }
  
  // Si no hay posición inicial, ponerlo en un espacio vacío
  if (pacman.x === 0 && pacman.y === 0) {
    pacman.x = TILE_SIZE * 1.5;
    pacman.y = TILE_SIZE * 1.5;
  }

  updateScoreboard();
  requestAnimationFrame(gameLoop);
}

// Movimiento con buffer de dirección
window.addEventListener('keydown', e => {
  if (gameOver && e.key === 'Enter') {
    resetGame();
    return;
  }

  switch (e.key) {
    case 'ArrowUp': 
    case 'w':
    case 'W':
      pacman.nextDir = { x: 0, y: -1 }; 
      e.preventDefault();
      break;
    case 'ArrowDown':
    case 's':
    case 'S':
      pacman.nextDir = { x: 0, y: 1 }; 
      e.preventDefault();
      break;
    case 'ArrowLeft':
    case 'a':
    case 'A':
      pacman.nextDir = { x: -1, y: 0 }; 
      e.preventDefault();
      break;
    case 'ArrowRight':
    case 'd':
    case 'D':
      pacman.nextDir = { x: 1, y: 0 }; 
      e.preventDefault();
      break;
  }
});

function canMove(x, y) {
  const wallsLayer = mapData.layers.find(l => l.name === 'walls');
  if (!wallsLayer) return true;

  // Solo verificar el tile central donde está Pac-Man
  const tileX = Math.floor(x / TILE_SIZE);
  const tileY = Math.floor(y / TILE_SIZE);
  
  // Permitir salir de los límites (para túneles)
  if (tileX < 0 || tileX >= mapData.width) {
    return true;
  }
  
  if (tileY < 0 || tileY >= mapData.height) {
    return false;
  }
  
  const tileIndex = tileY * mapData.width + tileX;
  return wallsLayer.data[tileIndex] !== 1;
}

function updatePacman() {
  if (gameOver) return;

  // Si hay una nueva dirección solicitada, intentar cambiar
  if (pacman.nextDir.x !== 0 || pacman.nextDir.y !== 0) {
    const nextX = pacman.x + pacman.nextDir.x * pacman.speed;
    const nextY = pacman.y + pacman.nextDir.y * pacman.speed;

    if (canMove(nextX, nextY)) {
      pacman.dir = { ...pacman.nextDir };
    }
  }

  // Mover en la dirección actual
  if (pacman.dir.x !== 0 || pacman.dir.y !== 0) {
    const newX = pacman.x + pacman.dir.x * pacman.speed;
    const newY = pacman.y + pacman.dir.y * pacman.speed;

    if (canMove(newX, newY)) {
      pacman.x = newX;
      pacman.y = newY;
    }
  }

  // Wraparound (túnel)
  if (pacman.x < 0) pacman.x = mapData.width * TILE_SIZE;
  if (pacman.x > mapData.width * TILE_SIZE) pacman.x = 0;

  // Animación de boca
  pacman.mouthOpen = (pacman.mouthOpen + 0.1) % 1;

  // Recoger dots
  dots.forEach(dot => {
    if (!dot.collected) {
      const dx = pacman.x - dot.x;
      const dy = pacman.y - dot.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      if (dist < TILE_SIZE / 2) {
        dot.collected = true;
        score += dot.isPower ? 50 : 10;
        
        if (dot.isPower) {
          powerMode = true;
          powerModeTimer = 300; // 5 segundos a 60fps
        }
        
        updateScoreboard();
      }
    }
  });

  // Comprobar victoria
  if (dots.every(d => d.collected)) {
    alert("¡Ganaste! 🎉");
    resetGame();
  }

  // Power mode timer
  if (powerMode) {
    powerModeTimer--;
    if (powerModeTimer <= 0) {
      powerMode = false;
    }
  }
}

function updateGhosts() {
  if (gameOver) return;

  ghosts.forEach(ghost => {
    // Comportamiento del fantasma
    if (Math.random() < 0.02) {
      const directions = [
        { x: 0, y: -1 },
        { x: 0, y: 1 },
        { x: -1, y: 0 },
        { x: 1, y: 0 }
      ];

      if (ghost.behavior === "chase" && !powerMode) {
        // Perseguir a Pac-Man
        const dx = pacman.x - ghost.x;
        const dy = pacman.y - ghost.y;
        
        if (Math.abs(dx) > Math.abs(dy)) {
          ghost.dir = { x: Math.sign(dx), y: 0 };
        } else {
          ghost.dir = { x: 0, y: Math.sign(dy) };
        }
      } else if (powerMode) {
        // Huir de Pac-Man
        const dx = pacman.x - ghost.x;
        const dy = pacman.y - ghost.y;
        
        if (Math.abs(dx) > Math.abs(dy)) {
          ghost.dir = { x: -Math.sign(dx), y: 0 };
        } else {
          ghost.dir = { x: 0, y: -Math.sign(dy) };
        }
      } else {
        ghost.dir = directions[Math.floor(Math.random() * directions.length)];
      }
    }

    const newX = ghost.x + ghost.dir.x * ghost.speed;
    const newY = ghost.y + ghost.dir.y * ghost.speed;

    if (canMove(newX, newY)) {
      ghost.x = newX;
      ghost.y = newY;
    }

    // Colisión con Pac-Man
    const dx = pacman.x - ghost.x;
    const dy = pacman.y - ghost.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < TILE_SIZE - 5) {
      if (powerMode) {
        // Comer fantasma
        score += 200;
        ghost.x = ghost.startX;
        ghost.y = ghost.startY;
        updateScoreboard();
      } else {
        // Perder vida
        loseLife();
      }
    }
  });
}

function update() {
  updatePacman();
  updateGhosts();
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Fondo
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Paredes
  const walls = mapData.layers.find(l => l.name === 'walls').data;
  for (let y = 0; y < mapData.height; y++) {
    for (let x = 0; x < mapData.width; x++) {
      if (walls[y * mapData.width + x] === 1) {
        ctx.drawImage(tileset, x * TILE_SIZE, y * TILE_SIZE);
      }
    }
  }

  // Dots
  dots.forEach(dot => {
    if (!dot.collected) {
      ctx.beginPath();
      ctx.arc(dot.x, dot.y, dot.isPower ? 8 : 3, 0, Math.PI * 2);
      ctx.fillStyle = dot.isPower ? '#fff' : '#ffb897';
      ctx.fill();
      
      if (dot.isPower) {
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#fff';
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }
  });

  // Fantasmas
  ghosts.forEach(ghost => {
    ctx.save();
    ctx.translate(ghost.x, ghost.y);
    
    // Cuerpo
    ctx.beginPath();
    ctx.arc(0, -5, 12, Math.PI, 0);
    ctx.lineTo(12, 10);
    ctx.lineTo(9, 5);
    ctx.lineTo(6, 10);
    ctx.lineTo(3, 5);
    ctx.lineTo(0, 10);
    ctx.lineTo(-3, 5);
    ctx.lineTo(-6, 10);
    ctx.lineTo(-9, 5);
    ctx.lineTo(-12, 10);
    ctx.lineTo(-12, -5);
    ctx.closePath();
    
    ctx.fillStyle = powerMode ? '#0000ff' : ghost.color;
    ctx.fill();
    
    // Ojos
    ctx.fillStyle = '#fff';
    ctx.fillRect(-7, -8, 5, 6);
    ctx.fillRect(2, -8, 5, 6);
    
    ctx.fillStyle = '#000';
    ctx.fillRect(-5, -6, 2, 3);
    ctx.fillRect(4, -6, 2, 3);
    
    ctx.restore();
  });

  // Pac-Man
  ctx.save();
  ctx.translate(pacman.x, pacman.y);
  
  // Rotar según dirección
  let angle = 0;
  if (pacman.dir.x === 1) angle = 0;
  else if (pacman.dir.x === -1) angle = Math.PI;
  else if (pacman.dir.y === -1) angle = -Math.PI / 2;
  else if (pacman.dir.y === 1) angle = Math.PI / 2;
  
  ctx.rotate(angle);
  
  // Animación de boca
  const mouthAngle = 0.3 * Math.sin(pacman.mouthOpen * Math.PI * 2);
  
  ctx.beginPath();
  ctx.arc(0, 0, pacman.radius, 0.2 + mouthAngle, 2 * Math.PI - 0.2 - mouthAngle);
  ctx.lineTo(0, 0);
  ctx.fillStyle = '#ffcc00';
  ctx.fill();
  
  // Ojo
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(5, -5, 2, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.restore();

  // Power mode indicator
  if (powerMode) {
    ctx.fillStyle = 'rgba(0, 100, 255, 0.3)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  // Game Over
  if (gameOver) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.fillStyle = '#fff';
    ctx.font = '48px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('GAME OVER', canvas.width / 2, canvas.height / 2);
    
    ctx.font = '20px "Press Start 2P", monospace';
    ctx.fillText('Presiona ENTER', canvas.width / 2, canvas.height / 2 + 50);
  }
}

function gameLoop() {
  update();
  draw();
  requestAnimationFrame(gameLoop);
}

function updateScoreboard() {
  document.getElementById("username").textContent = username;
  document.getElementById("score").textContent = score;
  document.getElementById("lives").textContent = lives;
  
  if (score > highscore) {
    highscore = score;
    localStorage.setItem('pacman-highscore', highscore);
  }
  document.getElementById("highscore").textContent = highscore;
}

function loseLife() {
  lives--;
  updateScoreboard();
  
  if (lives <= 0) {
    gameOver = true;
  } else {
    // Reset posiciones
    const entitiesLayer = mapData.layers.find(l => l.name === "entities");
    const pacObj = entitiesLayer.objects.find(o => o.name === "pacman_start");
    pacman.x = pacObj.x;
    pacman.y = pacObj.y;
    pacman.dir = { x: 0, y: 0 };
    
    ghosts.forEach(ghost => {
      ghost.x = ghost.startX;
      ghost.y = ghost.startY;
    });
  }
}

function resetGame() {
  score = 0;
  lives = 3;
  gameOver = false;
  powerMode = false;
  
  dots.forEach(dot => dot.collected = false);
  
  const entitiesLayer = mapData.layers.find(l => l.name === "entities");
  const pacObj = entitiesLayer.objects.find(o => o.name === "pacman_start");
  pacman.x = pacObj.x;
  pacman.y = pacObj.y;
  pacman.dir = { x: 0, y: 0 };
  pacman.nextDir = { x: 0, y: 0 };
  
  ghosts.forEach(ghost => {
    ghost.x = ghost.startX;
    ghost.y = ghost.startY;
  });
  
  updateScoreboard();
}

loadGame();