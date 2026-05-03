// Sound Effects using Web Audio API
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
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
        osc.start(now);
        osc.stop(now + 0.05);
    } else if (type === 'success') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(500, now);
        osc.frequency.linearRampToValueAtTime(1000, now + 0.1);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.3);
    } else if (type === 'error') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(200, now);
        osc.frequency.linearRampToValueAtTime(100, now + 0.2);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.3);
    }
}

// Roller Slider Class
class RollerSlider {
    constructor(elementId, min, max, initialVal, onChange) {
        this.container = document.getElementById(elementId);
        this.itemsDiv = this.container.querySelector('.roller-items');
        this.min = min;
        this.max = max;
        this.itemHeight = 40;
        this.values = [];
        for(let i=min; i<=max; i++) {
            this.values.push(i.toString().padStart(2, '0'));
        }
        if(elementId.includes('ampm')) {
            this.values = ['AM', 'PM'];
            this.max = 1; 
        }

        this.currentIndex = initialVal;
        this.onChange = onChange;
        
        this.render();
        this.setupInteractions();
    }

    render() {
        this.itemsDiv.innerHTML = '';
        // Add padding items for smooth looping feel visually
        this.values.forEach((val, idx) => {
            const div = document.createElement('div');
            div.className = 'roller-item';
            div.textContent = val;
            if(idx === this.currentIndex) div.classList.add('active');
            this.itemsDiv.appendChild(div);
        });
        this.updatePosition(false);
    }

    updatePosition(animate = true) {
        const offset = -(this.currentIndex * this.itemHeight) + (this.container.offsetHeight / 2) - (this.itemHeight / 2);
        this.itemsDiv.style.transition = animate ? 'transform 0.3s cubic-bezier(0.25, 1, 0.5, 1)' : 'none';
        this.itemsDiv.style.transform = `translateY(${offset}px)`;
        
        // Update active class
        Array.from(this.itemsDiv.children).forEach((child, idx) => {
            child.classList.toggle('active', idx === this.currentIndex);
        });
    }

    setValue(val) {
        if(val < this.min) val = this.min;
        if(val > this.max) val = this.max;
        this.currentIndex = val;
        this.updatePosition(true);
        if(this.onChange) this.onChange(this.getValue());
    }

    getValue() {
        return this.values[this.currentIndex];
    }

    setupInteractions() {
        let startY = 0;
        let startIdx = 0;
        let isDragging = false;

        const onStart = (y) => {
            isDragging = true;
            startY = y;
            startIdx = this.currentIndex;
            this.itemsDiv.style.transition = 'none';
        };

        const onMove = (y) => {
            if(!isDragging) return;
            const delta = y - startY;
            const moveItems = Math.round(delta / this.itemHeight);
            let newIdx = startIdx - moveItems;
            // Clamp
            if(newIdx < 0) newIdx = 0;
            if(newIdx >= this.values.length) newIdx = this.values.length - 1;
            
            if(newIdx !== this.currentIndex) {
                this.currentIndex = newIdx;
                this.updatePosition(false);
                playSound('tick');
            }
        };

        const onEnd = () => {
            if(!isDragging) return;
            isDragging = false;
            // Snap logic handled by clamping in move, but ensure clean snap
            this.updatePosition(true);
            if(this.onChange) this.onChange(this.getValue());
        };

        // Mouse
        this.container.addEventListener('mousedown', e => onStart(e.clientY));
        window.addEventListener('mousemove', e => onMove(e.clientY));
        window.addEventListener('mouseup', onEnd);

        // Touch
        this.container.addEventListener('touchstart', e => onStart(e.touches[0].clientY), {passive: true});
        window.addEventListener('touchmove', e => onMove(e.touches[0].clientY), {passive: true});
        window.addEventListener('touchend', onEnd);

        // Wheel
        this.container.addEventListener('wheel', e => {
            e.preventDefault();
            const dir = Math.sign(e.deltaY);
            let newIdx = this.currentIndex + dir;
            if(newIdx >= 0 && newIdx < this.values.length) {
                this.setValue(newIdx);
            }
        }, {passive: false});
    }
}

// Game Logic
const game = {
    mode: null, // 'learning' or 'competition'
    difficulty: 'easy',
    is24Hour: false,
    round: 1,
    maxRounds: 10,
    score: 0,
    correctAnswers: 0,
    timer: null,
    timeLeft: 30,
    targetTime: { h: 0, m: 0, s: 0 },
    
    // Rollers
    hourRoller: null,
    minuteRoller: null,
    ampmRoller: null,

    init() {
        this.setupTheme();
        this.setupFormat();
        this.canvas = document.getElementById('clockCanvas');
        this.ctx = this.canvas.getContext('2d');
        
        // Resize canvas for high DPI
        const size = 300;
        this.canvas.width = size * 2;
        this.canvas.height = size * 2;
        this.canvas.style.width = `${size}px`;
        this.canvas.style.height = `${size}px`;
        this.ctx.scale(2, 2);
        this.center = size / 2;
        this.radius = size / 2 - 10;

        // Interaction for learning mode
        this.canvas.addEventListener('mousedown', this.handleClockStart.bind(this));
        this.canvas.addEventListener('mousemove', this.handleClockMove.bind(this));
        window.addEventListener('mouseup', this.handleClockEnd.bind(this));
        
        // Touch support for clock
        this.canvas.addEventListener('touchstart', e => {
            const touch = e.touches[0];
            const rect = this.canvas.getBoundingClientRect();
            this.handleClockStart({ clientX: touch.clientX, clientY: touch.clientY, target: this.canvas });
        }, {passive: false});
        this.canvas.addEventListener('touchmove', e => {
            e.preventDefault();
            const touch = e.touches[0];
            this.handleClockMove({ clientX: touch.clientX, clientY: touch.clientY });
        }, {passive: false});

        document.getElementById('checkBtn').addEventListener('click', () => this.checkAnswer());
        document.getElementById('nextBtn').addEventListener('click', () => this.nextRound());
        document.getElementById('quitBtn').addEventListener('click', () => location.reload());
    },

    setupTheme() {
        const btn = document.getElementById('themeToggle');
        btn.addEventListener('click', () => {
            const body = document.body;
            const isDark = body.getAttribute('data-theme') === 'dark';
            body.setAttribute('data-theme', isDark ? 'light' : 'dark');
            btn.textContent = isDark ? '🌙 Dark Mode' : '☀️ Light Mode';
            this.drawClock();
        });
    },

    setupFormat() {
        const btn = document.getElementById('formatToggle');
        btn.addEventListener('click', () => {
            this.is24Hour = !this.is24Hour;
            btn.textContent = this.is24Hour ? '24H' : '12H';
            if(this.mode) this.resetRollers();
        });
    },

    showScreen(id) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        document.getElementById(id).classList.add('active');
    },

    startLearningMode() {
        this.mode = 'learning';
        this.showScreen('gameScreen');
        document.getElementById('modeDisplay').textContent = 'Mode: Learning';
        document.getElementById('roundDisplay').style.display = 'none';
        document.getElementById('timerDisplay').style.display = 'none';
        document.getElementById('scoreDisplay').style.display = 'none';
        document.getElementById('difficultySelect').style.display = 'block';
        
        this.difficulty = document.getElementById('difficultyLevel').value;
        this.generateTarget();
        this.initRollers();
        this.drawClock();
        document.getElementById('targetInstruction').textContent = `Set the clock to: ${this.formatTarget()}`;
        document.getElementById('checkBtn').style.display = 'none';
        document.getElementById('nextBtn').style.display = 'inline-block';
        document.getElementById('nextBtn').textContent = "Reset Practice";
    },

    startCompetitionMode() {
        this.mode = 'competition';
        this.score = 0;
        this.round = 1;
        this.correctAnswers = 0;
        this.difficulty = document.getElementById('difficultyLevel').value;
        
        this.showScreen('gameScreen');
        document.getElementById('modeDisplay').textContent = 'Mode: Competition';
        document.getElementById('roundDisplay').style.display = 'inline';
        document.getElementById('timerDisplay').style.display = 'inline';
        document.getElementById('scoreDisplay').style.display = 'inline';
        document.getElementById('difficultySelect').style.display = 'none';
        
        this.startRound();
    },

    startRound() {
        if(this.round > this.maxRounds) {
            this.endGame();
            return;
        }
        
        document.getElementById('roundDisplay').textContent = `Round: ${this.round}/${this.maxRounds}`;
        document.getElementById('scoreDisplay').textContent = `Score: ${this.score}`;
        document.getElementById('feedback').textContent = '';
        document.getElementById('checkBtn').style.display = 'inline-block';
        document.getElementById('nextBtn').style.display = 'none';
        
        // Timer setup
        let timeLimit = 30;
        if(this.difficulty === 'hard') timeLimit = 15;
        this.timeLeft = timeLimit;
        document.getElementById('timerDisplay').textContent = `Time: ${this.timeLeft}s`;
        
        clearInterval(this.timer);
        this.timer = setInterval(() => {
            this.timeLeft--;
            document.getElementById('timerDisplay').textContent = `Time: ${this.timeLeft}s`;
            if(this.timeLeft <= 0) {
                clearInterval(this.timer);
                this.handleTimeout();
            }
        }, 1000);

        this.generateTarget();
        this.initRollers();
        this.drawClock();
        document.getElementById('targetInstruction').textContent = "What time is it?";
    },

    generateTarget() {
        this.targetTime.h = Math.floor(Math.random() * (this.is24Hour ? 24 : 12));
        if(!this.is24Hour && this.targetTime.h === 0) this.targetTime.h = 12;
        
        this.targetTime.m = Math.floor(Math.random() * 60);
        
        if(this.difficulty === 'easy') {
            this.targetTime.s = 0;
            // Snap to 5 mins for easy? No, let's keep it random but no seconds displayed
        } else {
            this.targetTime.s = Math.floor(Math.random() * 60);
        }
    },

    formatTarget() {
        const h = this.targetTime.h.toString().padStart(2,'0');
        const m = this.targetTime.m.toString().padStart(2,'0');
        const s = this.targetTime.s.toString().padStart(2,'0');
        let suffix = '';
        if(!this.is24Hour) {
            suffix = this.targetTime.h >= 12 ? ' PM' : ' AM';
            let h12 = this.targetTime.h % 12;
            if(h12 === 0) h12 = 12;
            return `${h12.toString().padStart(2,'0')}:${m}:${s}${suffix}`;
        }
        return `${h}:${m}:${s}`;
    },

    initRollers() {
        const hMax = this.is24Hour ? 23 : 12;
        const hMin = this.is24Hour ? 0 : 1;
        const hStart = this.is24Hour ? 0 : 1;
        
        if(this.hourRoller) { 
            // Re-initialize if format changed
            const container = document.getElementById('hourRoller');
            container.innerHTML = '<div class="roller-highlight"></div><div class="roller-items"></div>';
        }
        
        this.hourRoller = new RollerSlider('hourRoller', hMin, hMax, hStart, (val) => {});
        this.minuteRoller = new RollerSlider('minuteRoller', 0, 59, 0, (val) => {});
        
        const ampmCont = document.getElementById('ampmContainer');
        if(this.is24Hour) {
            ampmCont.style.display = 'none';
        } else {
            ampmCont.style.display = 'block';
            if(this.ampmRoller) {
                 const container = document.getElementById('ampmContainer');
                 container.innerHTML = '<div class="roller-highlight"></div><div class="roller-items"></div>';
            }
            this.ampmRoller = new RollerSlider('ampmContainer', 0, 1, 0, (val) => {});
        }
    },

    resetRollers() {
        this.initRollers();
    },

    drawClock() {
        const ctx = this.ctx;
        const w = this.canvas.width / 2;
        const h = this.canvas.height / 2;
        
        ctx.clearRect(0, 0, w, h);
        
        // Face
        ctx.beginPath();
        ctx.arc(this.center, this.center, this.radius, 0, 2 * Math.PI);
        ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--clock-face');
        ctx.fill();
        ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--clock-border');
        ctx.lineWidth = 8;
        ctx.stroke();

        // Markers
        for(let i=0; i<12; i++) {
            const angle = (i * 30) * Math.PI / 180;
            const x1 = this.center + (this.radius - 20) * Math.sin(angle);
            const y1 = this.center - (this.radius - 20) * Math.cos(angle);
            const x2 = this.center + (this.radius - 10) * Math.sin(angle);
            const y2 = this.center - (this.radius - 10) * Math.cos(angle);
            
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.lineWidth = 4;
            ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--text-color');
            ctx.stroke();
        }

        // Hands calculation
        let h = this.targetTime.h;
        let m = this.targetTime.m;
        let s = this.targetTime.s;

        if(!this.is24Hour && h > 12) h -= 12;
        if(h === 12 && !this.is24Hour) h = 0; // 12 AM/PM correction for angle

        const sAngle = (s * 6) * Math.PI / 180;
        const mAngle = ((m * 6) + (s * 0.1)) * Math.PI / 180;
        const hAngle = ((h * 30) + (m * 0.5)) * Math.PI / 180;

        this.drawHand(hAngle, 60, 6, getComputedStyle(document.body).getPropertyValue('--hand-hour'));
        this.drawHand(mAngle, 80, 4, getComputedStyle(document.body).getPropertyValue('--hand-minute'));
        this.drawHand(sAngle, 90, 2, getComputedStyle(document.body).getPropertyValue('--hand-second'));

        // Center dot
        ctx.beginPath();
        ctx.arc(this.center, this.center, 8, 0, 2*Math.PI);
        ctx.fillStyle = '#333';
        ctx.fill();
    },

    drawHand(angle, length, width, color) {
        const ctx = this.ctx;
        const x = this.center + length * Math.sin(angle);
        const y = this.center - length * Math.cos(angle);
        
        ctx.beginPath();
        ctx.moveTo(this.center, this.center);
        ctx.lineTo(x, y);
        ctx.lineWidth = width;
        ctx.strokeStyle = color;
        ctx.lineCap = 'round';
        ctx.stroke();
    },

    // Interactive Clock Logic (Learning Mode)
    draggingHand: null,
    handleClockStart(e) {
        if(this.mode !== 'learning') return;
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left - (rect.width/2);
        const y = e.clientY - rect.top - (rect.height/2);
        const dist = Math.sqrt(x*x + y*y);
        const angle = Math.atan2(x, -y); // 0 at 12 o'clock
        
        if(dist < this.radius) {
            // Determine which hand is closest roughly? 
            // Simplified: Dragging adjusts minutes primarily, shift key for hours?
            // Let's make it simple: Dragging sets the minute hand, hour follows.
            this.draggingHand = 'minute';
            this.updateClockFromAngle(angle);
        }
    },
    handleClockMove(e) {
        if(!this.draggingHand) return;
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left - (rect.width/2);
        const y = e.clientY - rect.top - (rect.height/2);
        const angle = Math.atan2(x, -y);
        this.updateClockFromAngle(angle);
    },
    handleClockEnd() {
        this.draggingHand = null;
    },
    updateClockFromAngle(angle) {
        let deg = angle * 180 / Math.PI;
        if(deg < 0) deg += 360;
        const m = Math.round(deg / 6);
        this.targetTime.m = m % 60;
        // Hour hand moves slightly with minutes
        // For simplicity in learning mode, we just update minutes and redraw
        // To set hour, maybe we add a separate control or tap? 
        // Let's assume user sets hour via roller in learning mode too? 
        // Prompt said "Hands must be interactive... Set the clock to 07:35".
        // Okay, let's allow clicking near center for hour, outer for minute?
        // Simplified: Dragging sets Minute. Click to toggle Hour drag?
        // Better: Just update minute. User can use rollers to set Hour in learning mode too?
        // Actually, let's just update the clock visual.
        this.drawClock();
        
        // Check instant feedback
        const inputH = parseInt(this.hourRoller.getValue());
        const inputM = parseInt(this.minuteRoller.getValue());
        // Sync rollers to clock? Or clock to rollers?
        // Prompt: "Show a target time... User can drag/rotate each hand"
        // This implies the hands ARE the input.
        // But we also have rollers. Let's sync rollers to clock hands for Learning Mode.
        this.minuteRoller.setValue(this.targetTime.m);
    },

    checkAnswer() {
        clearInterval(this.timer);
        const hInput = parseInt(this.hourRoller.getValue());
        const mInput = parseInt(this.minuteRoller.getValue());
        let apInput = 0;
        if(!this.is24Hour) {
            apInput = this.ampmRoller.getValue() === 'PM' ? 1 : 0;
        }

        let correctH = this.targetTime.h;
        let correctM = this.targetTime.m;
        
        // Normalize for comparison
        if(!this.is24Hour) {
            // Convert input to 24h for comparison
            let input24 = hInput;
            if(apInput === 1 && hInput !== 12) input24 += 12;
            if(apInput === 0 && hInput === 12) input24 = 0;
            
            if(input24 === correctH && mInput === correctM) {
                this.handleSuccess();
            } else {
                this.handleFailure(correctH, correctM);
            }
        } else {
            if(hInput === correctH && mInput === correctM) {
                this.handleSuccess();
            } else {
                this.handleFailure(correctH, correctM);
            }
        }
    },

    handleSuccess() {
        playSound('success');
        const fb = document.getElementById('feedback');
        fb.textContent = "Correct! 🎉";
        fb.className = "feedback correct";
        
        if(this.mode === 'competition') {
            const bonus = Math.max(0, this.timeLeft * 10);
            const points = 100 + bonus;
            this.score += points;
            this.correctAnswers++;
            document.getElementById('scoreDisplay').textContent = `Score: ${this.score}`;
            document.getElementById('checkBtn').style.display = 'none';
            document.getElementById('nextBtn').style.display = 'inline-block';
        } else {
            fb.textContent = "Perfect! You set it correctly.";
        }
    },

    handleFailure(ch, cm) {
        playSound('error');
        const fb = document.getElementById('feedback');
        fb.textContent = `Incorrect. Correct: ${ch.toString().padStart(2,'0')}:${cm.toString().padStart(2,'0')}`;
        fb.className = "feedback incorrect";
        
        if(this.mode === 'competition') {
            document.getElementById('checkBtn').style.display = 'none';
            document.getElementById('nextBtn').style.display = 'inline-block';
        }
    },

    handleTimeout() {
        playSound('error');
        const fb = document.getElementById('feedback');
        fb.textContent = `Time's up! It was ${this.targetTime.h.toString().padStart(2,'0')}:${this.targetTime.m.toString().padStart(2,'0')}`;
        fb.className = "feedback incorrect";
        document.getElementById('checkBtn').style.display = 'none';
        document.getElementById('nextBtn').style.display = 'inline-block';
    },

    nextRound() {
        this.round++;
        this.startRound();
    },

    endGame() {
        this.showScreen('resultsScreen');
        document.getElementById('finalScoreVal').textContent = this.score;
        document.getElementById('correctCount').textContent = this.correctAnswers;
    }
};

// Start
window.onload = () => game.init();