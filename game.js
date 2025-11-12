const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const TILE_SIZE = 32;
let mapData, tileset;
let portalImage; // Imagen del portal

// === SISTEMA DE SONIDOS ===
let sounds = {
  inicio: new Audio('sounds/inicio.mp3'),
  music: new Audio('sounds/Pac-man theme remix - By Arsenic1987.mp3'),
  comer: new Audio('sounds/comer.mp3'),
  muerte: new Audio('sounds/Muerte.mp3'),
  powerUp: new Audio('sounds/off.mp3')
};

// Configurar sonidos
sounds.music.loop = true; // La música se repite
sounds.music.volume = 0.3; // Volumen más bajo para la música de fondo
sounds.comer.volume = 0.5;
sounds.muerte.volume = 0.6;
sounds.powerUp.volume = 0.7;
sounds.inicio.volume = 0.5;

let pacman = {
  x: 0,
  y: 0,
  tileX: 0,  // Posición en la grilla
  tileY: 0,  // Posición en la grilla
  dir: { x: 0, y: 0 },
  nextDir: { x: 0, y: 0 },
  speed: 2,
  mouthOpen: 0,
  radius: TILE_SIZE / 2 - 4,
  collisionRadius: 8,  // Radio más pequeño para colisiones
  isMoving: false  // Si está en movimiento entre tiles
};

let ghosts = [];
let dots = [];
let score = 0;
let lives = 3;
let highscore = localStorage.getItem('pacman-highscore') || 0;
let gameOver = false;
let victory = false; // Estado de victoria
let powerMode = false;
let powerModeTimer = 0;
let powerModeDuration = 480; // 8 segundos a 60fps (8 * 60)
let username = '';
let gameStarted = false;

// Cargar mapa y tiles
async function loadGame() {
  const res = await fetch('assets/map.json');
  mapData = await res.json();

  // Cargar imagen del portal
  portalImage = new Image();
  portalImage.src = 'assets/portal.png';
  await new Promise(resolve => {
    portalImage.onload = resolve;
  });

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

  // Cargar dots desde el mapa (donde hay un 2)
  const dotsLayer = mapData.layers.find(l => l.name === "dots");
  dots = []; // Reiniciar el array de dots

  // Generar dots desde el mapa (buscar donde hay el número 2)
  const walls = mapData.layers.find(l => l.name === 'walls').data;
  for (let y = 0; y < mapData.height; y++) {
    for (let x = 0; x < mapData.width; x++) {
      const tileValue = walls[y * mapData.width + x];
      
      // Si el tile es 2, colocar un dot ahí
      if (tileValue === 2) {
        const dotX = x * TILE_SIZE + TILE_SIZE / 2;
        const dotY = y * TILE_SIZE + TILE_SIZE / 2;
        
        dots.push({
          x: dotX,
          y: dotY,
          collected: false,
          isPower: false // Puedes usar 3 para power pellets si quieres
        });
      }
      // Si el tile es 3, colocar un power pellet
      else if (tileValue === 3) {
        const dotX = x * TILE_SIZE + TILE_SIZE / 2;
        const dotY = y * TILE_SIZE + TILE_SIZE / 2;
        
        dots.push({
          x: dotX,
          y: dotY,
          collected: false,
          isPower: true
        });
      }
    }
  }

  // Posición inicial de Pac-Man
  const entitiesLayer = mapData.layers.find(l => l.name === "entities");
  if (entitiesLayer) {
    const pacObj = entitiesLayer.objects.find(o => o.name === "pacman_start");
    if (pacObj) {
      // Mover un cuadro a la izquierda
      pacman.x = pacObj.x - TILE_SIZE;
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
  
  // Configurar el menú de inicio
  setupMenu();
}

// Configurar menú de inicio
function setupMenu() {
  const menuContainer = document.getElementById('menu-container');
  const usernameInput = document.getElementById('username-input');
  const startButton = document.getElementById('start-button');

  // Evento para el botón de inicio
  startButton.addEventListener('click', () => {
    startGame();
  });

  // Permitir presionar Enter para iniciar
  usernameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      startGame();
    }
  });

  function startGame() {
    username = usernameInput.value.trim() || 'Jugador';
    
    // Ocultar menú
    menuContainer.classList.add('hidden');
    
    // Actualizar scoreboard con el nombre
    updateScoreboard();
    
    // Reproducir sonido de inicio y música de fondo
    sounds.inicio.play().catch(e => console.log('Error al reproducir sonido de inicio:', e));
    
    setTimeout(() => {
      sounds.music.play().catch(e => console.log('Error al reproducir música:', e));
    }, 1000);
    
    // Iniciar el juego
    gameStarted = true;
    requestAnimationFrame(gameLoop);
  }
}

// Movimiento con buffer de dirección
window.addEventListener('keydown', e => {
  if (!gameStarted) return; // No permitir controles antes de iniciar
  
  if ((gameOver || victory) && e.key === 'Enter') {
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

function canMoveTile(tileX, tileY) {
  const wallsLayer = mapData.layers.find(l => l.name === 'walls');
  if (!wallsLayer) return true;

  // Permitir salir de los límites (para túneles)
  if (tileX < 0 || tileX >= mapData.width) {
    return true;
  }
  
  if (tileY < 0 || tileY >= mapData.height) {
    return false;
  }
  
  const tileIndex = tileY * mapData.width + tileX;
  const tileValue = wallsLayer.data[tileIndex];
  
  // Puede moverse si es 0 (vacío), 2 (dot) o 3 (power pellet)
  return tileValue !== 1;
}

function updatePacman() {
  if (gameOver || victory) return;

  // Calcular posición actual en la grilla
  const currentTileX = Math.floor(pacman.x / TILE_SIZE);
  const currentTileY = Math.floor(pacman.y / TILE_SIZE);
  
  // Calcular centro del tile actual
  const centerX = currentTileX * TILE_SIZE + TILE_SIZE / 2;
  const centerY = currentTileY * TILE_SIZE + TILE_SIZE / 2;

  // Si no está en movimiento, puede iniciar un nuevo movimiento
  if (!pacman.isMoving) {
    // Actualizar posición en la grilla
    pacman.tileX = currentTileX;
    pacman.tileY = currentTileY;
    
    // Centrar en el tile
    pacman.x = centerX;
    pacman.y = centerY;
    
    // Intentar cambiar de dirección si hay una nueva dirección solicitada
    if (pacman.nextDir.x !== 0 || pacman.nextDir.y !== 0) {
      const nextTileX = pacman.tileX + pacman.nextDir.x;
      const nextTileY = pacman.tileY + pacman.nextDir.y;
      
      if (canMoveTile(nextTileX, nextTileY)) {
        pacman.dir = { ...pacman.nextDir };
        pacman.nextDir = { x: 0, y: 0 };
        pacman.isMoving = true;
      }
    }
    // Si no hay nueva dirección, continuar en la dirección actual
    else if (pacman.dir.x !== 0 || pacman.dir.y !== 0) {
      const nextTileX = pacman.tileX + pacman.dir.x;
      const nextTileY = pacman.tileY + pacman.dir.y;
      
      if (canMoveTile(nextTileX, nextTileY)) {
        pacman.isMoving = true;
      } else {
        // Detener si no puede continuar
        pacman.dir = { x: 0, y: 0 };
      }
    }
  }

  // Si está en movimiento, mover hacia el siguiente tile
  if (pacman.isMoving) {
    const targetX = (pacman.tileX + pacman.dir.x) * TILE_SIZE + TILE_SIZE / 2;
    const targetY = (pacman.tileY + pacman.dir.y) * TILE_SIZE + TILE_SIZE / 2;
    
    // Mover hacia el objetivo
    const dx = targetX - pacman.x;
    const dy = targetY - pacman.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    if (distance <= pacman.speed) {
      // Llegó al siguiente tile
      pacman.x = targetX;
      pacman.y = targetY;
      pacman.isMoving = false;
      pacman.tileX += pacman.dir.x;
      pacman.tileY += pacman.dir.y;
      
      // === LÓGICA DE PORTALES (TELETRANSPORTE) ===
      // Portal Izquierdo (índice 160 en fila 9)
      if (pacman.tileX < 0) {
        pacman.tileX = mapData.width - 1; // Aparecer en el lado derecho
        pacman.x = pacman.tileX * TILE_SIZE + TILE_SIZE / 2;
        console.log('🌀 Portal Izquierdo → Derecho');
      }
      // Portal Derecho (índice 179 en fila 9)
      else if (pacman.tileX >= mapData.width) {
        pacman.tileX = 1; // Aparecer en el lado izquierdo
        pacman.x = pacman.tileX * TILE_SIZE + TILE_SIZE / 2;
        console.log('🌀 Portal Derecho → Izquierdo');
      }
    } else {
      // Continuar moviéndose
      pacman.x += (dx / distance) * pacman.speed;
      pacman.y += (dy / distance) * pacman.speed;
    }
  }

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
        
        if (dot.isPower) {
          // Power Pellet: 50 puntos y activa modo poder por 8 segundos
          score += 50;
          powerMode = true;
          powerModeTimer = powerModeDuration; // 8 segundos
          
          // Reproducir sonido de power-up
          sounds.powerUp.currentTime = 0;
          sounds.powerUp.play().catch(e => console.log('Error al reproducir power-up:', e));
        } else {
          // Dot normal: 10 puntos
          score += 10;
          
          // Reproducir sonido de comer
          sounds.comer.currentTime = 0;
          sounds.comer.play().catch(e => console.log('Error al reproducir comer:', e));
        }
        
        updateScoreboard();
      }
    }
  });

  // Comprobar victoria
  if (dots.every(d => d.collected)) {
    victory = true;
    
    // Detener música y reproducir sonido de victoria
    sounds.music.pause();
    sounds.inicio.currentTime = 0;
    sounds.inicio.play().catch(e => console.log('Error al reproducir victoria:', e));
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
  if (gameOver || victory) return;

  ghosts.forEach(ghost => {
    // Actualizar comportamiento con menos frecuencia para movimientos más inteligentes
    if (Math.random() < 0.05) {
      const directions = [
        { x: 0, y: -1 },
        { x: 0, y: 1 },
        { x: -1, y: 0 },
        { x: 1, y: 0 }
      ];

      let targetX, targetY;

      if (powerMode) {
        // MODO ASUSTADO: Huir de Pac-Man (todos los fantasmas)
        const dx = pacman.x - ghost.x;
        const dy = pacman.y - ghost.y;
        
        // Huir en dirección opuesta
        if (Math.abs(dx) > Math.abs(dy)) {
          ghost.dir = { x: -Math.sign(dx), y: 0 };
        } else {
          ghost.dir = { x: 0, y: -Math.sign(dy) };
        }
      } else {
        // COMPORTAMIENTOS ESPECÍFICOS POR FANTASMA
        switch (ghost.behavior) {
          case "chase": // 👻 ROJO (Blinky): Perseguidor agresivo
            // Persigue directamente a Pac-Man
            targetX = pacman.x;
            targetY = pacman.y;
            ghost.dir = getSmartDirection(ghost, targetX, targetY, directions);
            break;

          case "ambush": // 💖 ROSA (Pinky): Anticipador
            // Anticipa 4 tiles adelante de Pac-Man
            const anticipation = 4 * TILE_SIZE;
            targetX = pacman.x + (pacman.dir.x * anticipation);
            targetY = pacman.y + (pacman.dir.y * anticipation);
            
            // Si Pac-Man está quieto, ir hacia su posición
            if (pacman.dir.x === 0 && pacman.dir.y === 0) {
              targetX = pacman.x;
              targetY = pacman.y;
            }
            
            ghost.dir = getSmartDirection(ghost, targetX, targetY, directions);
            break;

          case "patrol": // 💙 AZUL (Inky): Patrullador táctico
            // Comportamiento complejo: usa posición del fantasma rojo para flanquear
            const redGhost = ghosts.find(g => g.behavior === "chase");
            
            if (redGhost) {
              // Vector desde fantasma rojo hacia 2 tiles adelante de Pac-Man
              const aheadX = pacman.x + (pacman.dir.x * 2 * TILE_SIZE);
              const aheadY = pacman.y + (pacman.dir.y * 2 * TILE_SIZE);
              
              // Duplicar el vector para crear posición de emboscada
              const vectorX = aheadX - redGhost.x;
              const vectorY = aheadY - redGhost.y;
              
              targetX = aheadX + vectorX;
              targetY = aheadY + vectorY;
            } else {
              // Si no hay fantasma rojo, patrullar esquinas
              const corners = [
                { x: TILE_SIZE * 2, y: TILE_SIZE * 2 },
                { x: TILE_SIZE * (mapData.width - 3), y: TILE_SIZE * 2 },
                { x: TILE_SIZE * 2, y: TILE_SIZE * (mapData.height - 3) },
                { x: TILE_SIZE * (mapData.width - 3), y: TILE_SIZE * (mapData.height - 3) }
              ];
              
              const target = corners[Math.floor(Date.now() / 5000) % corners.length];
              targetX = target.x;
              targetY = target.y;
            }
            
            ghost.dir = getSmartDirection(ghost, targetX, targetY, directions);
            break;

          case "random": // 🧡 NARANJA (Clyde): Aleatorio inteligente
            // Si está lejos de Pac-Man (>8 tiles), perseguir
            // Si está cerca, huir a su esquina
            const distance = Math.sqrt(
              Math.pow(pacman.x - ghost.x, 2) + 
              Math.pow(pacman.y - ghost.y, 2)
            );
            
            if (distance > 8 * TILE_SIZE) {
              // Lejos: perseguir a Pac-Man
              targetX = pacman.x;
              targetY = pacman.y;
            } else {
              // Cerca: ir a esquina inferior izquierda
              targetX = TILE_SIZE * 2;
              targetY = TILE_SIZE * (mapData.height - 3);
            }
            
            ghost.dir = getSmartDirection(ghost, targetX, targetY, directions);
            break;
        }
      }
    }

    // Mover el fantasma en la dirección actual
    const newX = ghost.x + ghost.dir.x * ghost.speed;
    const newY = ghost.y + ghost.dir.y * ghost.speed;

    if (canMove(newX, newY)) {
      ghost.x = newX;
      ghost.y = newY;
    } else {
      // Si choca con pared, elegir nueva dirección válida
      const validDirections = [
        { x: 0, y: -1 },
        { x: 0, y: 1 },
        { x: -1, y: 0 },
        { x: 1, y: 0 }
      ].filter(dir => {
        const testX = ghost.x + dir.x * ghost.speed * 2;
        const testY = ghost.y + dir.y * ghost.speed * 2;
        return canMove(testX, testY);
      });
      
      if (validDirections.length > 0) {
        ghost.dir = validDirections[Math.floor(Math.random() * validDirections.length)];
      }
    }

    // Teletransporte de fantasmas por portales
    if (ghost.x < 0) ghost.x = mapData.width * TILE_SIZE;
    if (ghost.x > mapData.width * TILE_SIZE) ghost.x = 0;

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
        
        // Reproducir sonido al comer fantasma
        sounds.comer.currentTime = 0;
        sounds.comer.play().catch(e => console.log('Error al reproducir comer:', e));
        
        updateScoreboard();
      } else {
        // Perder vida
        loseLife();
      }
    }
  });
}

// Nueva función: Calcular dirección inteligente hacia un objetivo
function getSmartDirection(ghost, targetX, targetY, possibleDirections) {
  // Filtrar direcciones que no sean retroceder
  const validDirections = possibleDirections.filter(dir => {
    // No retroceder (no ir en dirección opuesta)
    const isOpposite = (dir.x === -ghost.dir.x && ghost.dir.x !== 0) || 
                       (dir.y === -ghost.dir.y && ghost.dir.y !== 0);
    
    if (isOpposite) return false;
    
    // Verificar que la dirección no choque con pared
    const testX = ghost.x + dir.x * TILE_SIZE;
    const testY = ghost.y + dir.y * TILE_SIZE;
    return canMove(testX, testY);
  });

  if (validDirections.length === 0) {
    // Si no hay direcciones válidas, permitir retroceder
    return possibleDirections.find(dir => {
      const testX = ghost.x + dir.x * TILE_SIZE;
      const testY = ghost.y + dir.y * TILE_SIZE;
      return canMove(testX, testY);
    }) || ghost.dir;
  }

  // Elegir la dirección que más se acerque al objetivo
  let bestDirection = validDirections[0];
  let bestDistance = Infinity;

  validDirections.forEach(dir => {
    const newX = ghost.x + dir.x * TILE_SIZE;
    const newY = ghost.y + dir.y * TILE_SIZE;
    
    const distance = Math.sqrt(
      Math.pow(targetX - newX, 2) + 
      Math.pow(targetY - newY, 2)
    );

    if (distance < bestDistance) {
      bestDistance = distance;
      bestDirection = dir;
    }
  });

  return bestDirection;
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

  // Dibujar portales en TODAS las filas que tienen espacios vacíos en los bordes
  if (portalImage && portalImage.complete) {
    const time = Date.now() / 1000;
    const glow = Math.sin(time * 3) * 0.3 + 0.7;
    
    for (let y = 0; y < mapData.height; y++) {
      const leftTile = walls[y * mapData.width + 0]; // Primer tile de la fila
      const rightTile = walls[y * mapData.width + (mapData.width - 1)]; // Último tile de la fila
      
      // Si el borde izquierdo es 0 (vacío), dibujar portal
      if (leftTile === 0) {
        ctx.drawImage(portalImage, 0, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        
        // Efecto de brillo
        ctx.save();
        ctx.globalAlpha = glow * 0.5;
        ctx.fillStyle = '#00ffff';
        ctx.fillRect(0, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        ctx.restore();
      }
      
      // Si el borde derecho es 0 (vacío), dibujar portal
      if (rightTile === 0) {
        ctx.drawImage(portalImage, (mapData.width - 1) * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        
        // Efecto de brillo
        ctx.save();
        ctx.globalAlpha = glow * 0.5;
        ctx.fillStyle = '#00ffff';
        ctx.fillRect((mapData.width - 1) * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        ctx.restore();
      }
    }
  }

  // Dots
  dots.forEach(dot => {
    if (!dot.collected) {
      ctx.beginPath();
      
      if (dot.isPower) {
        // Power Pellet: más grande y con efecto de pulso
        const time = Date.now() / 200;
        const pulseSize = 8 + Math.sin(time) * 2;
        ctx.arc(dot.x, dot.y, pulseSize, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#ffff00';
        ctx.fill();
        ctx.shadowBlur = 0;
      } else {
        // Dot normal
        ctx.arc(dot.x, dot.y, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#ffb897';
        ctx.fill();
      }
    }
  });

  // Fantasmas
  ghosts.forEach(ghost => {
    ctx.save();
    ctx.translate(ghost.x, ghost.y);
    
    // Determinar color del fantasma
    let ghostColor = ghost.color;
    
    if (powerMode) {
      // En modo poder: azul, pero parpadea en los últimos 3 segundos
      const timeRemaining = powerModeTimer / 60; // Convertir a segundos
      
      if (timeRemaining <= 3) {
        // Parpadear entre azul y color original en los últimos 3 segundos
        const blinkSpeed = 10; // frames por parpadeo
        const shouldBlink = Math.floor(powerModeTimer / blinkSpeed) % 2 === 0;
        ghostColor = shouldBlink ? '#0000ff' : ghost.color;
      } else {
        // Azul sólido
        ghostColor = '#0000ff';
      }
    }
    
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
    
    ctx.fillStyle = ghostColor;
    ctx.fill();
    
    // Ojos (cambiar expresión en modo asustado)
    if (powerMode) {
      // Ojos asustados (más pequeños y hacia abajo)
      ctx.fillStyle = '#fff';
      ctx.fillRect(-6, -5, 4, 5);
      ctx.fillRect(2, -5, 4, 5);
      
      ctx.fillStyle = '#000';
      ctx.fillRect(-5, -2, 2, 2);
      ctx.fillRect(3, -2, 2, 2);
    } else {
      // Ojos normales
      ctx.fillStyle = '#fff';
      ctx.fillRect(-7, -8, 5, 6);
      ctx.fillRect(2, -8, 5, 6);
      
      ctx.fillStyle = '#000';
      ctx.fillRect(-5, -6, 2, 3);
      ctx.fillRect(4, -6, 2, 3);
    }
    
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

  // Victory Screen
  if (victory) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.fillStyle = '#FFD700';
    ctx.font = '48px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('¡VICTORIA!', canvas.width / 2, canvas.height / 2 - 40);
    
    ctx.fillStyle = '#00ffcc';
    ctx.font = '24px "Press Start 2P", monospace';
    ctx.fillText('🎉 ¡GANASTE! 🎉', canvas.width / 2, canvas.height / 2 + 10);
    
    ctx.fillStyle = '#fff';
    ctx.font = '16px "Press Start 2P", monospace';
    ctx.fillText('Puntuación: ' + score, canvas.width / 2, canvas.height / 2 + 60);
    
    ctx.font = '20px "Press Start 2P", monospace';
    ctx.fillText('Presiona ENTER', canvas.width / 2, canvas.height / 2 + 110);
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
  
  // Actualizar vidas con corazones
  const livesContainer = document.getElementById("lives");
  livesContainer.innerHTML = '';
  
  for (let i = 0; i < lives; i++) {
    const heart = document.createElement('img');
    heart.src = 'assets/heart.webp';
    heart.alt = 'vida';
    heart.classList.add('heart-icon');
    livesContainer.appendChild(heart);
  }
  
  if (score > highscore) {
    highscore = score;
    localStorage.setItem('pacman-highscore', highscore);
  }
  document.getElementById("highscore").textContent = highscore;
}

function loseLife() {
  lives--;
  updateScoreboard();
  
  // Reproducir sonido de muerte
  sounds.muerte.currentTime = 0;
  sounds.muerte.play().catch(e => console.log('Error al reproducir muerte:', e));
  
  if (lives <= 0) {
    gameOver = true;
    // Detener música al morir
    sounds.music.pause();
    sounds.music.currentTime = 0;
  } else {
    // Reset posiciones
    const entitiesLayer = mapData.layers.find(l => l.name === "entities");
    const pacObj = entitiesLayer.objects.find(o => o.name === "pacman_start");
    // Mover un cuadro a la izquierda
    pacman.x = pacObj.x - TILE_SIZE;
    pacman.y = pacObj.y;
    pacman.dir = { x: 0, y: 0 };
    pacman.nextDir = { x: 0, y: 0 };
    pacman.isMoving = false;
    
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
  victory = false; // Resetear estado de victoria
  powerMode = false;
  powerModeTimer = 0;
  
  dots.forEach(dot => dot.collected = false);
  
  const entitiesLayer = mapData.layers.find(l => l.name === "entities");
  const pacObj = entitiesLayer.objects.find(o => o.name === "pacman_start");
  // Mover un cuadro a la izquierda
  pacman.x = pacObj.x - TILE_SIZE;
  pacman.y = pacObj.y;
  pacman.dir = { x: 0, y: 0 };
  pacman.nextDir = { x: 0, y: 0 };
  pacman.isMoving = false;
  
  ghosts.forEach(ghost => {
    ghost.x = ghost.startX;
    ghost.y = ghost.startY;
  });
  
  updateScoreboard();
  
  // Reiniciar música al resetear el juego
  sounds.music.currentTime = 0;
  sounds.music.play().catch(e => console.log('Error al reproducir música:', e));
}

loadGame();