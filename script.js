const state = {
    mode: null,
    difficulty: 'easy',
    format: '12',
    theme: 'light',
    score: 0,
    round: 0,
    maxRounds: 10,
    timer: null,
    timeLeft: 0,
    targetTime: { h: 0, m: 0, s: 0 },
    isPlaying: false
};

const screens = {
    menu: document.getElementById('mainMenu'),
    game: document.getElementById('gameScreen'),
    results: document.getElementById('resultsScreen')
};

const ui = {
    modeDisplay: document.getElementById('modeDisplay'),
    roundDisplay: document.getElementById('roundDisplay'),
    timerDisplay: document.getElementById('timerDisplay'),
    scoreDisplay: document.getElementById('scoreDisplay'),
    feedback: document.getElementById('feedback'),
    checkBtn: document.getElementById('checkBtn'),
    nextBtn: document.getElementById('nextBtn'),
    quitBtn: document.getElementById('quitBtn'),
    difficultySelect: document.getElementById('difficultySelect'),
    ampmGroup: document.getElementById('ampmGroup'),
    celestialBody: document.getElementById('celestialBody')
};

let hourRoller, minuteRoller, ampmRoller;
let canvas, ctx;
let skyCanvas, skyCtx;
let clockRadius;

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playSound(type) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    const now = audioCtx.currentTime;

    if (type === 'tick') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(800, now);
        osc.frequency.exponentialRampToValueAtTime(300, now + 0.05);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
        osc.start(now);
        osc.stop(now + 0.05);
    } else if (type === 'correct') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(500, now);
        osc.frequency.linearRampToValueAtTime(1000, now + 0.1);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.3);
    } else if (type === 'wrong') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.linearRampToValueAtTime(100, now + 0.2);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.3);
    }
}

class RollerSlider {
    constructor(elementId, min, max, initialVal, onChange) {
        this.container = document.getElementById(elementId);
        this.track = this.container.querySelector('.roller-track');
        this.min = min;
        this.max = max;
        this.value = initialVal;
        this.onChange = onChange;
        
        const style = getComputedStyle(document.documentElement);
        this.itemHeight = parseInt(style.getPropertyValue('--item-height')) || 50;
        
        this.items = [];
        this.isDragging = false;
        this.startY = 0;
        this.currentOffset = 0;
        this.startOffset = 0;
        
        this.initItems();
        this.updateVisuals(false);
        this.addEvents();
    }

    initItems() {
        this.track.innerHTML = '';
        this.items = [];
        
        const totalItems = (this.max - this.min) + 1;
        const repeatCount = 3; 
        
        for (let r = 0; r < repeatCount; r++) {
            for (let i = this.min; i <= this.max; i++) {
                const div = document.createElement('div');
                div.className = 'roller-item';
                div.textContent = i.toString().padStart(2, '0');
                if (i === this.value && r === 1) div.classList.add('active');
                this.track.appendChild(div);
                this.items.push({ element: div, value: i, group: r });
            }
        }
        
        const containerH = this.container.clientHeight;
        const centerOffset = (containerH / 2) - (this.itemHeight / 2);
        const startIndex = (this.value - this.min) + (totalItems * 1); 
        this.currentOffset = centerOffset - (startIndex * this.itemHeight);
        this.track.style.transform = `translateY(${this.currentOffset}px)`;
    }

    addEvents() {
        this.container.addEventListener('mousedown', (e) => this.onDragStart(e.clientY));
        window.addEventListener('mousemove', (e) => this.onDragMove(e.clientY));
        window.addEventListener('mouseup', () => this.onDragEnd());

        this.container.addEventListener('touchstart', (e) => this.onDragStart(e.touches[0].clientY), {passive: false});
        window.addEventListener('touchmove', (e) => this.onDragMove(e.touches[0].clientY), {passive: false});
        window.addEventListener('touchend', () => this.onDragEnd());

        this.container.addEventListener('wheel', (e) => {
            e.preventDefault();
            const delta = e.deltaY > 0 ? 1 : -1;
            this.changeValue(delta);
        }, {passive: false});
    }

    onDragStart(y) {
        this.isDragging = true;
        this.startY = y;
        this.startOffset = this.currentOffset;
        this.container.style.cursor = 'grabbing';
        this.track.style.transition = 'none';
    }

    onDragMove(y) {
        if (!this.isDragging) return;
        const delta = y - this.startY;
        this.currentOffset = this.startOffset + delta;
        this.track.style.transform = `translateY(${this.currentOffset}px)`;
    }

    onDragEnd() {
        if (!this.isDragging) return;
        this.isDragging = false;
        this.container.style.cursor = 'grab';
        this.snapToNearest();
    }

    snapToNearest() {
        const containerH = this.container.clientHeight;
        const centerOffset = (containerH / 2) - (this.itemHeight / 2);
        
        let rawIndex = (centerOffset - this.currentOffset) / this.itemHeight;
        let newIndex = Math.round(rawIndex);

        const totalItems = (this.max - this.min) + 1;
        
        if (newIndex < totalItems) {
            newIndex += totalItems;
        } else if (newIndex >= totalItems * 2) {
            newIndex -= totalItems;
        }

        const newValue = (newIndex % totalItems) + this.min;

        if (newValue !== this.value) {
            this.value = newValue;
            playSound('tick');
            if (this.onChange) this.onChange(this.value);
        }

        const finalIndex = (this.value - this.min) + totalItems;
        const targetOffset = centerOffset - (finalIndex * this.itemHeight);
        this.currentOffset = targetOffset;
        
        this.updateVisuals(true);
    }

    changeValue(direction) {
        let newVal = this.value + direction;
        if (newVal < this.min) newVal = this.max;
        if (newVal > this.max) newVal = this.min;

        if (newVal !== this.value) {
            this.value = newVal;
            playSound('tick');
            if (this.onChange) this.onChange(this.value);
            this.updateVisuals(true);
        }
    }

    setValue(val) {
        if (val < this.min) val = this.min;
        if (val > this.max) val = this.max;
        if (val !== this.value) {
            this.value = val;
            if (this.onChange) this.onChange(this.value);
        }
        this.updateVisuals(true);
    }

    updateVisuals(animate) {
        const containerH = this.container.clientHeight;
        const centerOffset = (containerH / 2) - (this.itemHeight / 2);
        const totalItems = (this.max - this.min) + 1;
        const targetIndex = (this.value - this.min) + totalItems;
        const targetOffset = centerOffset - (targetIndex * this.itemHeight);
        
        this.currentOffset = targetOffset;
        this.track.style.transition = animate ? 'transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)' : 'none';
        this.track.style.transform = `translateY(${this.currentOffset}px)`;

        this.items.forEach((itemObj) => {
            if (itemObj.value === this.value && itemObj.group === 1) {
                itemObj.element.classList.add('active');
            } else {
                itemObj.element.classList.remove('active');
            }
        });
    }
}

function initClock() {
    canvas = document.getElementById('clockCanvas');
    ctx = canvas.getContext('2d');
    skyCanvas = document.getElementById('skyCanvas');
    skyCtx = skyCanvas.getContext('2d');
    clockRadius = canvas.width / 2;
    drawClock(12, 0, 0);
    drawSkyPath();
}

function drawClock(h, m, s) {
    const W = canvas.width;
    const H = canvas.height;
    const CX = W / 2;
    const CY = H / 2;
    const R = clockRadius - 10;

    ctx.clearRect(0, 0, W, H);

    for (let i = 0; i < 60; i++) {
        const angle = (i * 6) * (Math.PI / 180);
        const isHour = i % 5 === 0;
        
        const len = isHour ? 15 : 8;
        const width = isHour ? 3 : 1;
        
        const x1 = CX + Math.sin(angle) * (R - len);
        const y1 = CY - Math.cos(angle) * (R - len);
        const x2 = CX + Math.sin(angle) * R;
        const y2 = CY - Math.cos(angle) * R;

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.lineWidth = width;
        ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--text-color').trim();
        ctx.stroke();
    }

    const hAngle = ((h % 12) + m / 60 + s / 3600) * 30 * (Math.PI / 180);
    drawHand(CX, CY, hAngle, 0.6 * R, 6, '--hand-hour');

    const mAngle = (m + s / 60) * 6 * (Math.PI / 180);
    drawHand(CX, CY, mAngle, 0.85 * R, 4, '--hand-minute');

    const sAngle = s * 6 * (Math.PI / 180);
    drawHand(CX, CY, sAngle, 0.9 * R, 2, '--hand-second');

    ctx.beginPath();
    ctx.arc(CX, CY, 8, 0, 2 * Math.PI);
    ctx.fillStyle = '#2d3748';
    ctx.fill();
}

function drawHand(cx, cy, angle, length, width, colorVar) {
    const color = getComputedStyle(document.body).getPropertyValue(colorVar).trim();
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.rect(-width / 2, -length, width, length);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
}

function drawSkyPath() {
    const W = skyCanvas.width;
    const H = skyCanvas.height;
    const CX = W / 2;
    const CY = H / 2;
    const R = W / 2 - 10;

    skyCtx.clearRect(0, 0, W, H);

    skyCtx.beginPath();
    skyCtx.arc(CX, CY, R, Math.PI, 0); 
    skyCtx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--hand-minute').trim();
    skyCtx.lineWidth = 2;
    skyCtx.setLineDash([5, 5]);
    skyCtx.stroke();

    skyCtx.beginPath();
    skyCtx.arc(CX, CY, R, 0, Math.PI); 
    skyCtx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--hand-hour').trim();
    skyCtx.stroke();
    
    skyCtx.setLineDash([]);

    skyCtx.beginPath();
    skyCtx.moveTo(10, CY);
    skyCtx.lineTo(W - 10, CY);
    skyCtx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--text-color').trim();
    skyCtx.globalAlpha = 0.3;
    skyCtx.stroke();
    skyCtx.globalAlpha = 1.0;
}

function updateCelestialBody(h, m) {
    let decimalH = h + m / 60;
    const W = skyCanvas.width;
    const H = skyCanvas.height;
    const CX = W / 2;
    const CY = H / 2;
    const R = W / 2 - 10;

    const isDay = decimalH >= 5.5 && decimalH < 17.5;
    
    ui.celestialBody.textContent = isDay ? '☀️' : '🌙';
    
    let progress;
    if (isDay) {
        progress = (decimalH - 5.5) / 12; 
    } else {
        let nightH = decimalH;
        if (nightH < 5.5) nightH += 24;
        progress = (nightH - 17.5) / 12;
    }

    const angle = progress * Math.PI;
    
    const x = CX + R * Math.cos(angle);
    
    let y;
    if (isDay) {
        y = CY - R * Math.sin(angle);
    } else {
        y = CY + R * Math.sin(angle);
    }

    ui.celestialBody.style.left = `${x - 20}px`;
    ui.celestialBody.style.top = `${y - 20}px`;
}

const game = {
    startLearningMode: () => {
        state.mode = 'learning';
        state.difficulty = document.getElementById('difficultyLevel').value;
        startGame();
    },
    startCompetitionMode: () => {
        state.mode = 'competition';
        state.difficulty = document.getElementById('difficultyLevel').value;
        startGame();
    }
};

function startGame() {
    state.score = 0;
    state.round = 0;
    state.isPlaying = true;
    
    screens.menu.classList.remove('active');
    screens.results.classList.remove('active');
    screens.game.classList.add('active');
    
    ui.modeDisplay.textContent = `Mode: ${state.mode === 'learning' ? 'Learning' : 'Competition'}`;
    ui.checkBtn.style.display = 'block';
    ui.nextBtn.style.display = 'none';
    
    setupRollers();
    
    nextRound();
}

function setupRollers() {
    const hMax = state.format === '12' ? 12 : 23;
    const hMin = state.format === '12' ? 1 : 0;
    
    ui.ampmGroup.style.display = state.format === '12' ? 'flex' : 'none';

    hourRoller = new RollerSlider('hourRoller', hMin, hMax, 12, (val) => {});
    minuteRoller = new RollerSlider('minuteRoller', 0, 59, 0, (val) => {});
    
    if (state.format === '12') {
        ampmRoller = new RollerSlider('ampmRoller', 0, 1, 0, (val) => {});
        const items = document.querySelectorAll('#ampmRoller .roller-item');
        items.forEach(item => {
            if (item.textContent === '00') item.textContent = "AM";
            if (item.textContent === '01') item.textContent = "PM";
        });
    }
}

function nextRound() {
    if (state.mode === 'competition' && state.round >= state.maxRounds) {
        endGame();
        return;
    }

    state.round++;
    ui.roundDisplay.textContent = `Round: ${state.round}/${state.maxRounds}`;
    ui.scoreDisplay.textContent = `Score: ${state.score}`;
    ui.feedback.textContent = '';
    ui.feedback.className = 'feedback';
    
    clearInterval(state.timer);
    if (state.mode === 'competition') {
        let limit = 30;
        if (state.difficulty === 'medium') limit = 20;
        if (state.difficulty === 'hard') limit = 15;
        state.timeLeft = limit;
        ui.timerDisplay.style.display = 'inline';
        ui.timerDisplay.textContent = `Time: ${state.timeLeft}s`;
        
        state.timer = setInterval(() => {
            state.timeLeft--;
            ui.timerDisplay.textContent = `Time: ${state.timeLeft}s`;
            if (state.timeLeft <= 0) {
                clearInterval(state.timer);
                handleAnswer(false);
            }
        }, 1000);
    } else {
        ui.timerDisplay.style.display = 'none';
    }

    const h = Math.floor(Math.random() * (state.format === '12' ? 12 : 24));
    const m = Math.floor(Math.random() * 60);
    const s = (state.difficulty === 'easy') ? 0 : Math.floor(Math.random() * 60);
    
    state.targetTime = { h, m, s };
    
    drawClock(h, m, s);
    updateCelestialBody(h, m);
    
    const startH = state.format === '12' ? 12 : 0;
    hourRoller.setValue(startH);
    minuteRoller.setValue(0);
    if (state.format === '12') {
        ampmRoller.setValue(h >= 12 ? 1 : 0);
    }
    
    ui.checkBtn.style.display = 'block';
    ui.nextBtn.style.display = 'none';
}

function checkAnswer() {
    let inputH = hourRoller.value;
    let inputM = minuteRoller.value;
    
    if (state.format === '12') {
        const isPM = ampmRoller.value === 1;
        if (isPM && inputH !== 12) inputH += 12;
        if (!isPM && inputH === 12) inputH = 0;
    }
    
    const correct = (inputH === state.targetTime.h && inputM === state.targetTime.m);
    handleAnswer(correct);
}

function handleAnswer(isCorrect) {
    clearInterval(state.timer);
    ui.checkBtn.style.display = 'none';
    ui.nextBtn.style.display = 'block';
    
    if (isCorrect) {
        ui.feedback.textContent = "Correct!";
        ui.feedback.classList.add('correct');
        playSound('correct');
        state.score += 10 + (state.mode === 'competition' ? state.timeLeft : 0);
    } else {
        ui.feedback.textContent = `Wrong! It was ${formatTime(state.targetTime.h, state.targetTime.m)}`;
        ui.feedback.classList.add('incorrect');
        playSound('wrong');
        drawClock(state.targetTime.h, state.targetTime.m, state.targetTime.s);
    }
    ui.scoreDisplay.textContent = `Score: ${state.score}`;
}

function formatTime(h, m) {
    if (state.format === '12') {
        const suffix = h >= 12 ? 'PM' : 'AM';
        const h12 = h % 12 || 12;
        return `${h12}:${m.toString().padStart(2,'0')} ${suffix}`;
    }
    return `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}`;
}

function endGame() {
    screens.game.classList.remove('active');
    screens.results.classList.add('active');
    document.getElementById('finalScoreVal').textContent = state.score;
    document.getElementById('correctCount').textContent = state.score > 0 ? "See Score" : "0";
}

ui.checkBtn.addEventListener('click', checkAnswer);
ui.nextBtn.addEventListener('click', nextRound);
ui.quitBtn.addEventListener('click', () => location.reload());

document.getElementById('themeToggle').addEventListener('click', () => {
    state.theme = state.theme === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', state.theme);
    document.getElementById('themeToggle').textContent = state.theme === 'light' ? '🌙 Dark' : '☀️ Light';
    if(state.isPlaying) {
        drawClock(state.targetTime.h, state.targetTime.m, state.targetTime.s);
        drawSkyPath();
    }
});

document.getElementById('formatToggle').addEventListener('click', () => {
    state.format = state.format === '12' ? '24' : '12';
    document.getElementById('formatToggle').textContent = state.format === '12' ? '12H / 24H' : '24H / 12H';
    if(state.isPlaying) setupRollers();
});

initClock();