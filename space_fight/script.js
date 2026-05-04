<script>
    (function(){
        // ---------- CANVAS ----------
        const canvas = document.getElementById('gameCanvas');
        const ctx = canvas.getContext('2d');
        
        // Logical dimensions (fixed 1000x700) – canvas will scale visually
        const LOGIC_W = 1000;
        const LOGIC_H = 700;
        const centerX = LOGIC_W/2;
        const centerY = LOGIC_H/2;
        const PROTRACTOR_RADIUS = 270;
        
        // ---------- GAME STATE ----------
        let gameActive = true;
        let score = 0;
        let ammo = 6;
        let playerAngle = 0;    // degrees: 0° right, 90° up, 180° left, 270° down
        
        let enemyExists = false;
        let enemyAngle = 0;          // standard math angle from center
        let enemyX = 0, enemyY = 0;
        const ENEMY_SPEED = 0.3625;   // constant 25% speed
        const ENEMY_HIT_RADIUS = 18;
        
        // Smooth rotation
        let rotating = false;
        let rotStartAngle = 0;
        let rotTargetAngle = 0;
        let rotDuration = 200;
        let rotStartTime = 0;
        let pendingSelectedDeg = 0;
        let processingAnswer = false;
        
        // Visual FX
        let correctFlash = 0;
        let wrongFlash = 0;
        let laserActive = false;
        let laserAngle = 0;
        let laserTimer = 0;
        let explosionEffect = false;
        let explosionPos = { x: 0, y: 0 };
        
        // Game mode
        let gameMode = null; // Will be set to 'learning' or 'competitive'
        
        // DOM elements
        const mainMenu = document.getElementById('mainMenu');
        const gameContainer = document.getElementById('gameContainer');
        const scoreSpan = document.getElementById('scoreValue');
        const ammoSpan = document.getElementById('ammoValue');
        const playerAngleSpan = document.getElementById('playerAngleUI');
        const enemyAngleSpan = document.getElementById('enemyAngleUI');
        const optionsDiv = document.getElementById('optionsContainer');
        const feedbackDiv = document.getElementById('feedbackMsg');
        const restartBtn = document.getElementById('restartButton');
        const learningModeBtn = document.getElementById('learningModeBtn');
        const competitiveModeBtn = document.getElementById('competitiveModeBtn');
        
        // Set up mode selection
        learningModeBtn.addEventListener('click', () => {
            gameMode = 'learning';
            startGame();
        });
        
        competitiveModeBtn.addEventListener('click', () => {
            gameMode = 'competitive';
            startGame();
        });
        
        function startGame() {
            mainMenu.style.display = 'none';
            gameContainer.style.display = 'flex';
            fullRestart();
            gameLoop();
        }
        
        // Helper: normalize 0..359
        function normAngle(deg){
            deg = deg % 360;
            if(deg < 0) deg += 360;
            return Math.floor(deg);
        }
        
        // Required anti-clockwise rotation (integer)
        function calcRequiredRotation(playerDeg, enemyDeg){
            let raw = (enemyDeg - playerDeg + 360) % 360;
            return Math.round(raw);
        }
        
        // Generate 4 MCQ options (distractors ±10)
        function generateOptions(correctRot){
            let opts = new Set();
            opts.add(correctRot);
            let attempts = 0;
            while(opts.size < 4 && attempts < 50){
                let offset = Math.floor(Math.random() * 21) - 10;
                let candidate = (correctRot + offset + 360) % 360;
                if(!opts.has(candidate) || (opts.size === 1 && candidate !== correctRot)) {
                    opts.add(candidate);
                }
                attempts++;
            }
            if(opts.size < 4){
                for(let i=1; i<=3; i++){
                    let fallback = (correctRot + i*23) % 360;
                    opts.add(fallback);
                    if(opts.size === 4) break;
                }
            }
            let optionsArray = Array.from(opts);
            for(let i=optionsArray.length - 1; i>0; i--){
                const j = Math.floor(Math.random()*(i+1));
                [optionsArray[i], optionsArray[j]] = [optionsArray[j], optionsArray[i]];
            }
            return optionsArray;
        }
        
        // Get spawn point on rectangle edge (1000x700) given standard angle
        function getBoundaryPoint(angleDeg){
            const rad = angleDeg * Math.PI / 180;
            const dx = Math.cos(rad);
            const dy = -Math.sin(rad);   // canvas Y inversion
            let tMin = Infinity;
            if(dx > 0) { let t = (LOGIC_W - centerX) / dx; if(t > 0 && t < tMin) tMin = t; }
            if(dx < 0) { let t = (0 - centerX) / dx; if(t > 0 && t < tMin) tMin = t; }
            if(dy > 0) { let t = (LOGIC_H - centerY) / dy; if(t > 0 && t < tMin) tMin = t; }
            if(dy < 0) { let t = (0 - centerY) / dy; if(t > 0 && t < tMin) tMin = t; }
            if(tMin === Infinity) tMin = 400;
            const x = centerX + tMin * dx;
            const y = centerY + tMin * dy;
            return { x: Math.min(LOGIC_W, Math.max(0, x)), y: Math.min(LOGIC_H, Math.max(0, y)) };
        }
        
        function spawnEnemy(){
            if(!gameActive) return;
            let newAngle = Math.floor(Math.random() * 360);
            enemyAngle = newAngle;
            const spawnPoint = getBoundaryPoint(newAngle);
            enemyX = spawnPoint.x;
            enemyY = spawnPoint.y;
            enemyExists = true;
            refreshQuestionUI();
        }
        
        function refreshQuestionUI(){
            if(!gameActive) return;
            playerAngleSpan.innerText = Math.floor(playerAngle) + "°";
            if(enemyExists){
                enemyAngleSpan.innerText = Math.floor(enemyAngle) + "°";
                let required = calcRequiredRotation(playerAngle, enemyAngle);
                let opts = generateOptions(required);
                optionsDiv.innerHTML = "";
                opts.forEach(opt => {
                    let btn = document.createElement('button');
                    btn.className = "angle-btn";
                    btn.innerText = opt + "°";
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        if(!gameActive || rotating || processingAnswer) {
                            feedbackDiv.innerText = "⚠️ Wait, ship is rotating...";
                            return;
                        }
                        if(ammo <= 0){
                            gameOver("OUT OF AMMO!");
                            return;
                        }
                        attemptShot(opt);
                    });
                    optionsDiv.appendChild(btn);
                });
            } else {
                enemyAngleSpan.innerText = "---";
                optionsDiv.innerHTML = "<div style='color:#aaa; padding:10px;'>⚡ SPAWNING ENEMY...</div>";
            }
        }
        
        function destroyCurrentEnemy(){
            if(!enemyExists) return;
            explosionEffect = true;
            explosionPos = { x: enemyX, y: enemyY };
            setTimeout(() => { explosionEffect = false; }, 280);
            
            enemyExists = false;
            score++;
            scoreSpan.innerText = score;
            if(ammo <= 0){
                gameOver("OUT OF AMMO!");
                return;
            }
            if(gameActive){
                spawnEnemy();
            }
            refreshQuestionUI();
        }
        
        function resolveShot(selectedRotation, preShotPlayerAngle, preShotEnemyAngle, preShotEnemyExists){
            if(!gameActive) return;
            
            let requiredBefore = calcRequiredRotation(preShotPlayerAngle, preShotEnemyAngle);
            let isCorrect = (selectedRotation === requiredBefore) && preShotEnemyExists;
            
            // Fire laser
            laserActive = true;
            laserAngle = playerAngle;
            laserTimer = 8;
            
            ammo--;
            ammoSpan.innerText = ammo;
            if(ammo < 0) ammo = 0;
            
            if(!preShotEnemyExists){
                feedbackDiv.innerText = "⚠️ No target!";
                if(gameActive && ammo<=0) gameOver("No bullets left");
                else processingAnswer = false;
                return;
            }
            
            if(isCorrect){
                correctFlash = 0.85;
                feedbackDiv.innerText = `✓ HIT! +1 | rotated ${selectedRotation}° anti-clockwise`;
                destroyCurrentEnemy();
            } else {
                wrongFlash = 0.9;
                feedbackDiv.innerText = `✘ MISS! You rotated ${selectedRotation}° (needed ${requiredBefore}°)`;
            }
            
            if(ammo <= 0 && gameActive){
                gameOver("AMMUNITION DEPLETED");
                return;
            }
            
            if(gameActive){
                playerAngleSpan.innerText = Math.floor(playerAngle) + "°";
                if(enemyExists) refreshQuestionUI();
                else if(!enemyExists && gameActive) { refreshQuestionUI(); }
            }
            processingAnswer = false;
        }
        
        function attemptShot(selectedDeg){
            if(rotating || !gameActive || processingAnswer) return;
            if(ammo <= 0){
                gameOver("No ammo left!");
                return;
            }
            processingAnswer = true;
            let startAng = playerAngle;
            let delta = selectedDeg % 360;
            let targetAngRaw = (startAng + delta) % 360;
            let targetAngle = normAngle(targetAngRaw);
            
            const snapshotEnemyExists = enemyExists;
            const snapshotEnemyAngle = enemyAngle;
            const snapshotPlayerAngle = playerAngle;
            
            rotating = true;
            rotStartAngle = startAng;
            rotTargetAngle = targetAngle;
            rotStartTime = performance.now();
            pendingSelectedDeg = selectedDeg;
            
            function updateRotation(now){
                if(!rotating) return;
                let elapsed = now - rotStartTime;
                let t = Math.min(1, elapsed / rotDuration);
                let ease = 1 - Math.pow(1-t, 3);
                let currAng = rotStartAngle + (rotTargetAngle - rotStartAngle) * ease;
                playerAngle = normAngle(currAng);
                drawCanvas();
                if(t < 1){
                    requestAnimationFrame(updateRotation);
                } else {
                    playerAngle = rotTargetAngle;
                    rotating = false;
                    drawCanvas();
                    resolveShot(pendingSelectedDeg, snapshotPlayerAngle, snapshotEnemyAngle, snapshotEnemyExists);
                    drawCanvas();
                }
            }
            requestAnimationFrame(updateRotation);
        }
        
        function gameOver(reason){
            if(!gameActive) return;
            gameActive = false;
            feedbackDiv.innerHTML = `<span style="color:#ff7777; font-weight:bold;">💀 GAME OVER - ${reason} 💀</span>`;
            optionsDiv.innerHTML = `<button class="angle-btn restart-btn" id="gameOverRestart">🔄 PLAY AGAIN</button>`;
            const restartGameBtn = document.getElementById('gameOverRestart');
            if(restartGameBtn) restartGameBtn.addEventListener('click', () => fullRestart());
            drawCanvas();
        }
        
        function fullRestart(){
            gameActive = true;
            score = 0;
            ammo = 6;
            playerAngle = Math.floor(Math.random() * 360);
            enemyExists = false;
            correctFlash = 0;
            wrongFlash = 0;
            laserActive = false;
            explosionEffect = false;
            rotating = false;
            processingAnswer = false;
            
            scoreSpan.innerText = score;
            ammoSpan.innerText = ammo;
            playerAngleSpan.innerText = playerAngle + "°";
            enemyAngleSpan.innerText = "---";
            feedbackDiv.innerText = "";
            spawnEnemy();
            drawCanvas();
        }
        
        function updateEnemyMovement(){
            if(!gameActive) return;
            if(enemyExists){
                // In learning mode, enemy doesn't move
                if(gameMode === 'learning') return;
                
                let dx = centerX - enemyX;
                let dy = centerY - enemyY;
                let distance = Math.hypot(dx, dy);
                
                if(distance <= ENEMY_HIT_RADIUS) {
                    gameOver("ENEMY REACHED YOUR SHIP!");
                    return;
                }
                if(distance > 0.01) {
                    let stepX = (dx / distance) * ENEMY_SPEED;
                    let stepY = (dy / distance) * ENEMY_SPEED;
                    if(stepX > distance) stepX = distance;
                    if(stepY > distance) stepY = distance;
                    enemyX += stepX;
                    enemyY += stepY;
                }
                let newDist = Math.hypot(centerX - enemyX, centerY - enemyY);
                if(newDist <= ENEMY_HIT_RADIUS) {
                    gameOver("ENEMY COLLISION!");
                }
            }
        }
        
        // ---------- DRAWING (clean, no extra instructional overlays) ----------
        function drawProtractor(){
            ctx.save();
            ctx.shadowBlur = 0;
            ctx.beginPath();
            ctx.arc(centerX, centerY, PROTRACTOR_RADIUS, 0, Math.PI*2);
            ctx.strokeStyle = "#6fcbff";
            ctx.lineWidth = 2.5;
            ctx.setLineDash([5, 8]);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.beginPath();
            ctx.arc(centerX, centerY, PROTRACTOR_RADIUS-3, 0, Math.PI*2);
            ctx.strokeStyle = "#2fa0cc88";
            ctx.lineWidth = 1;
            ctx.stroke();
            
            for(let deg = 0; deg < 360; deg += 1){
                let rad = deg * Math.PI / 180;
                let startR = PROTRACTOR_RADIUS - (deg % 30 === 0 ? 18 : (deg % 5 === 0 ? 16 : 9));
                let endR = PROTRACTOR_RADIUS - 3;
                let x1 = centerX + Math.cos(rad) * startR;
                let y1 = centerY - Math.sin(rad) * startR;
                let x2 = centerX + Math.cos(rad) * endR;
                let y2 = centerY - Math.sin(rad) * endR;
                ctx.beginPath();
                ctx.moveTo(x1, y1);
                ctx.lineTo(x2, y2);
                ctx.strokeStyle = deg % 30 === 0 ? "#ffe6a3" : (deg % 5 === 0 ? "#ffff00" : "#7bb7d0");
                ctx.lineWidth = deg % 30 === 0 ? 1.8 : 1;
                ctx.stroke();
		ctx.textAlign = "center";
            ctx.textBaseline = "middle";
                if(deg % 30 === 0){
                    ctx.font = "bold 30px 'Segoe UI'";
                    ctx.fillStyle = "#f3ffb9";
                    ctx.shadowBlur = 4;
                    let tx = centerX + Math.cos(rad) * (PROTRACTOR_RADIUS - 50);
                    let ty = centerY - Math.sin(rad) * (PROTRACTOR_RADIUS - 50);
                    ctx.fillText(deg+"°", tx, ty);
                }
            }
            ctx.shadowBlur = 0;
            ctx.beginPath();
            ctx.arc(centerX, centerY, 8, 0, Math.PI*2);
            ctx.fillStyle = "#ffd966";
            ctx.fill();
        }
        
        function drawShip(angleDeg){
            ctx.save();
            ctx.translate(centerX, centerY);
            ctx.rotate(-angleDeg * Math.PI/180);
            ctx.shadowBlur = 6;
            ctx.shadowColor = "#00f7ff";
            ctx.beginPath();
            ctx.moveTo(20, 0);
            ctx.lineTo(-12, -12);
            ctx.lineTo(-6, 0);
            ctx.lineTo(-12, 12);
            ctx.closePath();
            ctx.fillStyle = "#93e9ff";
            ctx.fill();
            ctx.strokeStyle = "#ffffff";
            ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(-12, 0);
            ctx.lineTo(-20, -5);
            ctx.lineTo(-20, 5);
            ctx.fillStyle = "#ff9040";
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(20, -3);
            ctx.lineTo(28, 0);
            ctx.lineTo(20, 3);
            ctx.fillStyle = "#e0aaff";
            ctx.fill();
            ctx.restore();
        }
        
        function drawEnemy(){
            if(!enemyExists) return;
            ctx.beginPath();
            ctx.arc(enemyX, enemyY, 16, 0, Math.PI*2);
            ctx.fillStyle = "#ff4d6d";
            ctx.shadowBlur = 12;
            ctx.fill();
            ctx.beginPath();
            ctx.arc(enemyX-5, enemyY-4, 3, 0, Math.PI*2);
            ctx.fillStyle = "#ffffff";
            ctx.fill();
            ctx.beginPath();
            ctx.arc(enemyX+5, enemyY-4, 3, 0, Math.PI*2);
            ctx.fill();
            ctx.fillStyle = "#000";
            ctx.beginPath();
            ctx.arc(enemyX-5, enemyY-4, 1.2, 0, Math.PI*2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(enemyX+5, enemyY-4, 1.2, 0, Math.PI*2);
            ctx.fill();
            ctx.fillStyle = "#880022";
            ctx.beginPath();
            ctx.ellipse(enemyX, enemyY+3, 8, 5, 0, 0, Math.PI*2);
            ctx.fill();
        }
        
        function drawDottedLineToEnemy(){
            if(!enemyExists) return;
            ctx.beginPath();
            ctx.setLineDash([8, 8]);
            ctx.moveTo(centerX, centerY);
            ctx.lineTo(enemyX, enemyY);
            ctx.strokeStyle = "#f0f0aa";
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.setLineDash([]);
        }
        
        function drawLaserFromTip(){
            if(!laserActive || laserTimer <= 0) return;
            const rad = laserAngle * Math.PI / 180;
            const tipX = centerX + Math.cos(rad) * 24;
            const tipY = centerY - Math.sin(rad) * 24;
            const endX = centerX + Math.cos(rad) * (LOGIC_W + 100);
            const endY = centerY - Math.sin(rad) * (LOGIC_H + 100);
            ctx.beginPath();
            ctx.moveTo(tipX, tipY);
            ctx.lineTo(endX, endY);
            ctx.strokeStyle = "#ff5555";
            ctx.lineWidth = 6;
            ctx.shadowBlur = 12;
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(tipX, tipY);
            ctx.lineTo(endX, endY);
            ctx.strokeStyle = "#ffffff";
            ctx.lineWidth = 2.5;
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(tipX, tipY, 7, 0, Math.PI*2);
            ctx.fillStyle = "#ffaa33";
            ctx.shadowBlur = 14;
            ctx.fill();
            laserTimer--;
            if(laserTimer <= 0) laserActive = false;
        }
        
        function drawVisualFX(){
            if(correctFlash > 0){
                ctx.fillStyle = `rgba(80, 255, 100, ${correctFlash * 0.55})`;
                ctx.fillRect(0,0,LOGIC_W,LOGIC_H);
                correctFlash -= 0.05;
            }
            if(wrongFlash > 0){
                ctx.fillStyle = `rgba(255, 60, 80, ${wrongFlash * 0.5})`;
                ctx.fillRect(0,0,LOGIC_W,LOGIC_H);
                wrongFlash -= 0.05;
            }
            if(explosionEffect){
                ctx.beginPath();
                ctx.arc(explosionPos.x, explosionPos.y, 22, 0, Math.PI*2);
                ctx.fillStyle = "#ff9900aa";
                ctx.fill();
                ctx.beginPath();
                ctx.arc(explosionPos.x, explosionPos.y, 12, 0, Math.PI*2);
                ctx.fillStyle = "#ff5500";
                ctx.fill();
            }
        }
        
        function drawCanvas(){
            if(!canvas) return;
            ctx.clearRect(0,0,LOGIC_W,LOGIC_H);
            ctx.fillStyle = "#03001C";
            ctx.fillRect(0,0,LOGIC_W,LOGIC_H);
            // stars
            for(let i=0;i<200;i++){
                if(i%2===0) continue;
                ctx.fillStyle = `rgba(255,255,200,${Math.random()*0.5})`;
                ctx.fillRect( (i*131)%LOGIC_W, (i*57)%LOGIC_H, 1.5,1.5);
            }
            drawProtractor();
            drawDottedLineToEnemy();
            drawEnemy();
            drawShip(playerAngle);
            drawLaserFromTip();
            drawVisualFX();
            if(!gameActive){
                ctx.fillStyle = "rgba(0,0,0,0.75)";
                ctx.fillRect(0,0,LOGIC_W,LOGIC_H);
                ctx.font = "bold 32px monospace";
                ctx.fillStyle = "#ffb347";
                ctx.fillText("⚡ GAME OVER ⚡", LOGIC_W/2, LOGIC_H/2-40);
                ctx.font = "18px monospace";
                ctx.fillStyle = "white";
                ctx.fillText("click RESTART", LOGIC_W/2, LOGIC_H/2+30);
            }
        }
        
        // Game loop
        function gameLoop(){
            if(gameActive){
                updateEnemyMovement();
                if(gameActive){
                    playerAngleSpan.innerText = Math.floor(playerAngle) + "°";
                    if(enemyExists) enemyAngleSpan.innerText = Math.floor(enemyAngle) + "°";
                }
            }
            drawCanvas();
            requestAnimationFrame(gameLoop);
        }
        
        restartBtn.addEventListener('click', () => fullRestart());
        
        // Initialize the main menu (game will start after mode selection)
    })();
</script>
