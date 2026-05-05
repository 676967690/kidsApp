// ========== GAME LOGIC with competition mode hard behavior ==========
    const FOOD_DB = [
        { name: "🍚 Rice", protein: 2.5, carbs: 28, fat: 0.4, color: "#f7e0a3" },
        { name: "🍛 Dal (Lentils)", protein: 7, carbs: 18, fat: 1.2, color: "#d4b87a" },
        { name: "🍗 Chicken", protein: 23, carbs: 0, fat: 5, color: "#e2b68d" },
        { name: "🥦 Veggies", protein: 2, carbs: 6, fat: 0.2, color: "#98c46c" },
        { name: "🍞 Bread", protein: 4, carbs: 15, fat: 1, color: "#eac88b" },
        { name: "🧀 Paneer", protein: 14, carbs: 5, fat: 12, color: "#f3dead" },
        { name: "🍳 Egg", protein: 6, carbs: 0.6, fat: 5, color: "#fce1b3" },
        { name: "🐟 Fish", protein: 20, carbs: 0, fat: 7, color: "#c8d4b0" },
        { name: "🥑 Avocado", protein: 2, carbs: 9, fat: 15, color: "#b2cf87" },
        { name: "🍠 Sweet Potato", protein: 2, carbs: 20, fat: 0.1, color: "#e3b87c" },
        { name: "🌽 Corn", protein: 3, carbs: 21, fat: 1.5, color: "#f5d742" }
    ];

    let totalParts = 6;
    let selectedFoods = [];
    let portions = [0, 0, 0];
    let targetNutrition = { protein: 0, carbs: 0, fat: 0 };
    let gameWon = false;
    let currentMode = "learning"; // "learning" or "competition"
    let secretTotalParts = 6;      // for competition mode: the original parts that generated the target

    // DOM references
    const plateCanvas = document.getElementById('plateCanvas');
    const ctx = plateCanvas.getContext('2d');
    const foodContainer = document.getElementById('foodCardsContainer');
    const totalPartsSpan = document.getElementById('totalPartsDisplay');
    const usedPartsSpan = document.getElementById('usedParts');
    const maxPartsSpan = document.getElementById('maxPartsSpan');
    const feedbackDiv = document.getElementById('feedbackMsg');
    const resetBtn = document.getElementById('resetLevelBtn');
    const histogramDiv = document.getElementById('histogramContainer');
    const partsValueSpan = document.getElementById('partsValue');
    const decreasePartsBtn = document.getElementById('decreasePartsBtn');
    const increasePartsBtn = document.getElementById('increasePartsBtn');
    const hintBtn = document.getElementById('hintBtn');
    const modeBadge = document.getElementById('modeBadge');

    let dragActive = false, draggedCard = null;
    let plateDragActive = false, plateDraggedFoodIdx = -1, plateDragGhost = null;
    let sliceAngles = [];
    let dragGhost = null;

    function getRandomInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
    function pickRandomFoods() {
        const shuffled = [...FOOD_DB];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled.slice(0, 3);
    }
    function generateSolvableTarget(foods, N) {
        let a = getRandomInt(0, N);
        let b = getRandomInt(0, N - a);
        let c = N - a - b;
        const factor = 10 / N;
        const protein = (foods[0].protein * a + foods[1].protein * b + foods[2].protein * c) * factor;
        const carbs   = (foods[0].carbs * a + foods[1].carbs * b + foods[2].carbs * c) * factor;
        const fat     = (foods[0].fat * a + foods[1].fat * b + foods[2].fat * c) * factor;
        return { target: { protein, carbs, fat }, solutionPortions: [a,b,c] };
    }
    function updateNutrientTable() {
        const tbody = document.getElementById('nutrientTableBody');
        if (!tbody) return;
        tbody.innerHTML = '';
        selectedFoods.forEach(food => {
            const row = tbody.insertRow();
            row.insertCell(0).innerText = food.name;
            row.insertCell(1).innerText = food.protein;
            row.insertCell(2).innerText = food.carbs;
            row.insertCell(3).innerText = food.fat;
        });
    }
    function getCurrentNutrition() {
        let protein = 0, carbs = 0, fat = 0;
        const factor = 10 / totalParts;
        for (let i = 0; i < selectedFoods.length; i++) {
            protein += selectedFoods[i].protein * portions[i] * factor;
            carbs += selectedFoods[i].carbs * portions[i] * factor;
            fat += selectedFoods[i].fat * portions[i] * factor;
        }
        return { protein, carbs, fat };
    }
    function usedPortionsSum() { return portions.reduce((a,b) => a+b, 0); }
    function checkWinCondition() {
        if (gameWon) return true;
        const current = getCurrentNutrition();
        const isExact = (Math.abs(current.protein - targetNutrition.protein) < 0.01 &&
                          Math.abs(current.carbs - targetNutrition.carbs) < 0.01 &&
                          Math.abs(current.fat - targetNutrition.fat) < 0.01);
        const totalUsed = usedPortionsSum();
        if (isExact && totalUsed === totalParts && !gameWon) {
            gameWon = true;
            feedbackDiv.innerHTML = "🏆 PERFECT MEAL! 🏆 Now solve the final challenge!";
            showFinalChallenge();
            return true;
        } else if (isExact && totalUsed !== totalParts) {
            feedbackDiv.innerHTML = "⚠️ Nutrients match but plate parts unused (" + (totalParts - totalUsed) + " sectors left). Add more portions.";
        } else if (totalUsed === totalParts && !isExact) {
            feedbackDiv.innerHTML = "🍽️ Plate is full but nutrition doesn't match target. Adjust portions!";
        } else {
            if (totalUsed === 0) feedbackDiv.innerHTML = "🍽️ Add food to your plate!";
            else feedbackDiv.innerHTML = `🍽️ ${totalUsed}/${totalParts} parts used. Keep adjusting!`;
        }
        return false;
    }
    function adjustPortion(index, delta) {
        if (gameWon) { feedbackDiv.innerHTML = "🏆 You already won! Press 'New Level' to continue."; return; }
        let newVal = portions[index] + delta;
        const totalAfter = usedPortionsSum() - portions[index] + newVal;
        if (newVal < 0) return;
        if (totalAfter > totalParts) return;
        portions[index] = newVal;
        updateUI();
        drawPieChart();
        renderHistogram();
        checkWinCondition();
    }
    function updateUI() {
        usedPartsSpan.innerText = usedPortionsSum();
        maxPartsSpan.innerText = totalParts;
        totalPartsSpan.innerText = totalParts;
        partsValueSpan.innerText = totalParts;
        renderFoodCards();
    }
    function drawPieChart() {
        const w = plateCanvas.width, h = plateCanvas.height;
        ctx.clearRect(0, 0, w, h);
        const centerX = w/2, centerY = h/2, radius = Math.min(w,h)*0.42;
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, 2*Math.PI);
        ctx.fillStyle = "#e9dacb";
        ctx.fill();
        ctx.strokeStyle = "#b5926e";
        ctx.lineWidth = 2;
        ctx.stroke();
        let startAngle = -Math.PI/2;
        const totalUsed = usedPortionsSum();
        sliceAngles = [];
        if (totalUsed > 0) {
            for (let i = 0; i < selectedFoods.length; i++) {
                const portion = portions[i];
                if (portion === 0) continue;
                const angleSlice = (portion / totalParts) * 2 * Math.PI;
                const endAngle = startAngle + angleSlice;
                ctx.beginPath();
                ctx.moveTo(centerX, centerY);
                ctx.arc(centerX, centerY, radius, startAngle, endAngle);
                ctx.closePath();
                ctx.fillStyle = selectedFoods[i].color;
                ctx.fill();
                ctx.strokeStyle = "#ffffff";
                ctx.lineWidth = 1;
                ctx.stroke();
                sliceAngles.push({ idx: i, start: startAngle, end: endAngle });
                startAngle = endAngle;
            }
        }
        ctx.save();
        ctx.setLineDash([4, 6]);
        ctx.strokeStyle = "#5a4a3a";
        ctx.lineWidth = 1.5;
        const angleStep = (2 * Math.PI) / totalParts;
        for (let i = 0; i < totalParts; i++) {
            const angle = -Math.PI/2 + i * angleStep;
            const x2 = centerX + Math.cos(angle) * radius;
            const y2 = centerY + Math.sin(angle) * radius;
            ctx.beginPath();
            ctx.moveTo(centerX, centerY);
            ctx.lineTo(x2, y2);
            ctx.stroke();
        }
        ctx.setLineDash([]);
        ctx.restore();
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius*0.12, 0, 2*Math.PI);
        ctx.fillStyle = "#ecbe7a";
        ctx.fill();
    }
    function renderHistogram() {
        const current = getCurrentNutrition();
        const target = targetNutrition;
        const maxValue = Math.max(target.protein, target.carbs, target.fat, current.protein, current.carbs, current.fat, 0.1);
        const macros = [
            { label: "Protein (g)", current: current.protein, target: target.protein },
            { label: "Carbs (g)", current: current.carbs, target: target.carbs },
            { label: "Fat (g)", current: current.fat, target: target.fat }
        ];
        histogramDiv.innerHTML = "";
        macros.forEach(m => {
            let greenPercent = Math.min(100, (m.current / maxValue) * 100);
            let overflowPercent = 0;
            if (m.current > m.target && maxValue > 0) {
                overflowPercent = Math.min(100, ((m.current - m.target) / maxValue) * 100);
                greenPercent = Math.min(100, (m.target / maxValue) * 100);
            }
            const targetPercent = (m.target / maxValue) * 100;
            const container = document.createElement("div");
            container.className = "bar-item";
            container.innerHTML = `
                <div class="bar-label"><span>${m.label}</span><span>${m.current.toFixed(1)} / ${m.target.toFixed(1)} g</span></div>
                <div class="bar-bg"><div style="display:flex; height:100%;"><div class="bar-fill" style="width: ${greenPercent}%;"></div><div class="bar-overflow" style="width: ${overflowPercent}%;"></div></div>
                <div style="position: absolute; top: 0; left: ${targetPercent}%; height: 100%; width: 3px; background-color: #ff0000; pointer-events: none; transform: translateX(-50%);"></div></div>
                ${m.current > m.target ? `<div style="font-size:0.7rem; color:#c7361e;">⚠️ +${(m.current - m.target).toFixed(1)} excess</div>` : m.current < m.target ? `<div style="font-size:0.7rem; color:#b78f3a;">🔻 need ${(m.target - m.current).toFixed(1)} more</div>` : `<div style="font-size:0.7rem;">✓ exact match</div>`}
            `;
            histogramDiv.appendChild(container);
        });
    }
    function renderFoodCards() {
        foodContainer.innerHTML = "";
        selectedFoods.forEach((food, idx) => {
            const card = document.createElement("div");
            card.className = "card";
            card.style.backgroundColor = food.color;
            card.setAttribute("data-food-idx", idx);
            card.setAttribute("draggable", "true");
            card.addEventListener("dragstart", (e) => { if(gameWon){e.preventDefault();return false;} e.dataTransfer.setData("text/plain", idx); e.dataTransfer.effectAllowed = "copy"; card.classList.add("dragging"); });
            card.addEventListener("dragend", () => card.classList.remove("dragging"));
            card.addEventListener("touchstart", handleTouchStart, { passive: false });
            card.addEventListener("touchmove", handleTouchMove, { passive: false });
            card.addEventListener("touchend", handleTouchEnd);
            card.innerHTML = `<h3>${food.name}</h3><div class="portion-control"><button class="portion-btn minus-btn" data-idx="${idx}">−</button><span class="portion-value">${portions[idx]}</span><button class="portion-btn plus-btn" data-idx="${idx}">+</button></div>`;
            foodContainer.appendChild(card);
        });
        attachPortionButtons();
    }
    function attachPortionButtons() {
        document.querySelectorAll('.minus-btn').forEach(btn => { btn.removeEventListener('click', handleMinus); btn.addEventListener('click', handleMinus); });
        document.querySelectorAll('.plus-btn').forEach(btn => { btn.removeEventListener('click', handlePlus); btn.addEventListener('click', handlePlus); });
    }
    function handleMinus(e) { adjustPortion(parseInt(e.currentTarget.getAttribute('data-idx')), -1); }
    function handlePlus(e) { adjustPortion(parseInt(e.currentTarget.getAttribute('data-idx')), 1); }
    function handleTouchStart(e) { if(gameWon) return; const card=e.currentTarget; dragActive=true; draggedCard=card; const touch=e.touches[0]; card.classList.add("dragging"); dragGhost=card.cloneNode(true); dragGhost.className="drag-ghost"; dragGhost.style.width=card.offsetWidth+"px"; dragGhost.style.left=(touch.clientX-card.offsetWidth/2)+"px"; dragGhost.style.top=(touch.clientY-card.offsetHeight/2)+"px"; document.body.appendChild(dragGhost); e.preventDefault(); }
    function handleTouchMove(e) { if(!dragActive||!dragGhost)return; const touch=e.touches[0]; dragGhost.style.left=(touch.clientX-dragGhost.offsetWidth/2)+"px"; dragGhost.style.top=(touch.clientY-dragGhost.offsetHeight/2)+"px"; e.preventDefault(); }
    function handleTouchEnd(e) { if(!dragActive||!draggedCard||gameWon){ if(dragGhost)dragGhost.remove(); if(draggedCard)draggedCard.classList.remove("dragging"); dragActive=false; draggedCard=null; return; } const card=draggedCard; const touch=e.changedTouches[0]; const dropTarget=document.elementFromPoint(touch.clientX,touch.clientY); const plateCanvasElem=document.getElementById('plateCanvas'); if(dropTarget===plateCanvasElem||plateCanvasElem.contains(dropTarget)){ const foodIdx=parseInt(card.getAttribute('data-food-idx')); if(!isNaN(foodIdx)&&!gameWon){ if(usedPortionsSum()>=totalParts) feedbackDiv.innerHTML="❌ Plate is full! Remove some portions first."; else adjustPortion(foodIdx,1); } } if(dragGhost)dragGhost.remove(); dragGhost=null; card.classList.remove("dragging"); dragActive=false; draggedCard=null; e.preventDefault(); }
    function getSliceIndexFromXY(clientX,clientY){ const rect=plateCanvas.getBoundingClientRect(); const scaleX=plateCanvas.width/rect.width, scaleY=plateCanvas.height/rect.height; let canvasX=(clientX-rect.left)*scaleX, canvasY=(clientY-rect.top)*scaleY; const centerX=plateCanvas.width/2,centerY=plateCanvas.height/2; const dx=canvasX-centerX,dy=canvasY-centerY; if(Math.hypot(dx,dy)>Math.min(plateCanvas.width,plateCanvas.height)*0.42) return -1; let angle=Math.atan2(dy,dx); if(angle<0) angle+=2*Math.PI; let zeroBased=(angle+Math.PI/2)%(2*Math.PI); let cumulative=0; for(let s of sliceAngles){ const sliceAngle=(portions[s.idx]/totalParts)*2*Math.PI; if(zeroBased>=cumulative && zeroBased<cumulative+sliceAngle) return s.idx; cumulative+=sliceAngle; } return -1; }
    function handlePlateDragStart(e){ if(gameWon)return; let cx,cy; if(e.touches){cx=e.touches[0].clientX; cy=e.touches[0].clientY; e.preventDefault();} else{cx=e.clientX; cy=e.clientY; e.preventDefault();} const idx=getSliceIndexFromXY(cx,cy); if(idx===-1||portions[idx]===0)return; plateDraggedFoodIdx=idx; plateDragActive=true; plateDragGhost=document.createElement("div"); plateDragGhost.className="drag-ghost"; plateDragGhost.innerText=selectedFoods[idx].name; plateDragGhost.style.backgroundColor=selectedFoods[idx].color; plateDragGhost.style.left=(cx-plateDragGhost.offsetWidth/2)+"px"; plateDragGhost.style.top=(cy-plateDragGhost.offsetHeight/2)+"px"; document.body.appendChild(plateDragGhost); }
    function handlePlateDragMove(e){ if(!plateDragActive||!plateDragGhost)return; let cx,cy; if(e.touches){cx=e.touches[0].clientX; cy=e.touches[0].clientY; e.preventDefault();} else{cx=e.clientX; cy=e.clientY; e.preventDefault();} plateDragGhost.style.left=(cx-plateDragGhost.offsetWidth/2)+"px"; plateDragGhost.style.top=(cy-plateDragGhost.offsetHeight/2)+"px"; }
    function handlePlateDragEnd(e){ if(!plateDragActive||plateDraggedFoodIdx===-1){ if(plateDragGhost)plateDragGhost.remove(); plateDragActive=false; plateDraggedFoodIdx=-1; return; } let cx,cy; if(e.changedTouches){cx=e.changedTouches[0].clientX; cy=e.changedTouches[0].clientY;} else{cx=e.clientX; cy=e.clientY;} const dropTarget=document.elementFromPoint(cx,cy); const plateEl=document.getElementById('plateCanvas'); if(dropTarget!==plateEl && !plateEl.contains(dropTarget) && portions[plateDraggedFoodIdx]>0){ adjustPortion(plateDraggedFoodIdx,-1); feedbackDiv.innerHTML=`➖ Removed 1 portion of ${selectedFoods[plateDraggedFoodIdx].name}`; } if(plateDragGhost)plateDragGhost.remove(); plateDragGhost=null; plateDragActive=false; plateDraggedFoodIdx=-1; e.preventDefault(); }
    function setupPlateDrag(){ plateCanvas.addEventListener('mousedown',handlePlateDragStart); window.addEventListener('mousemove',handlePlateDragMove); window.addEventListener('mouseup',handlePlateDragEnd); plateCanvas.addEventListener('touchstart',handlePlateDragStart,{passive:false}); window.addEventListener('touchmove',handlePlateDragMove,{passive:false}); window.addEventListener('touchend',handlePlateDragEnd); }
    function setupDropTarget(){ const plateEl=document.getElementById('plateCanvas'); plateEl.addEventListener('dragover',(e)=>{e.preventDefault(); e.dataTransfer.dropEffect="copy";}); plateEl.addEventListener('drop',(e)=>{e.preventDefault(); if(gameWon){feedbackDiv.innerHTML="Game completed! Press 'New Level'.";return;} const foodIdx=e.dataTransfer.getData("text/plain"); if(foodIdx==="")return; const idx=parseInt(foodIdx); if(isNaN(idx))return; if(usedPortionsSum()>=totalParts) feedbackDiv.innerHTML="❌ Plate is full!"; else adjustPortion(idx,1); }); }
    
    // ========== MODIFIED: changeTotalParts with competition mode behavior ==========
    function changeTotalParts(delta) {
        let newTotal = totalParts + delta;
        if (newTotal < 2) newTotal = 2;
        if (newTotal > 12) newTotal = 12;
        if (newTotal === totalParts) return;
        totalParts = newTotal;
        if (currentMode === 'learning') {
            // Learning mode: regenerate level with new totalParts
            initLevel();
        } else {
            // Competition mode: keep same target, just update totalParts and UI
            // No reset of portions, but need to adjust if portions exceed new total? keep portions as is, but enforce sum <= totalParts
            let currentSum = usedPortionsSum();
            if (currentSum > totalParts) {
                // cannot have more portions than total parts; clamp portions? We'll set all portions to zero to avoid impossible state.
                portions = [0, 0, 0];
                feedbackDiv.innerHTML = "⚠️ Total parts reduced below used portions. Portions reset.";
            }
            updateUI();
            drawPieChart();
            renderHistogram();
            checkWinCondition();
        }
    }
    
    // ========== MODIFIED: resetLevel (new level) ==========
    function resetLevel() {
        gameWon = false;
        if (currentMode === 'competition') {
            // Pick random secret totalParts (3-12)
            secretTotalParts = getRandomInt(3, 12);
            totalParts = getRandomInt(3, 12);
            selectedFoods = pickRandomFoods();
            const { target } = generateSolvableTarget(selectedFoods, secretTotalParts);
            targetNutrition = target;
            portions = [0, 0, 0];
            updateUI();
            drawPieChart();
            renderHistogram();
            renderFoodCards();
            updateNutrientTable();
            checkWinCondition();
            feedbackDiv.innerHTML = "Find correct parts & portions. Hint reveals secret parts.";
        } else {
            // Learning mode: random totalParts between 3-12
            selectedFoods = pickRandomFoods();
            const { target } = generateSolvableTarget(selectedFoods, totalParts);
            targetNutrition = target;
            portions = [0, 0, 0];
            updateUI();
            drawPieChart();
            renderHistogram();
            renderFoodCards();
            updateNutrientTable();
            checkWinCondition();
            feedbackDiv.innerHTML = "Change parts to restart puzzle. Drag food to plate.";
        }
        const modal = document.getElementById('challengeModal');
        if (modal) modal.style.display = 'none';
    }
    
    function showFinalChallenge(){
        const modalDiv=document.getElementById('challengeModal'); if(!modalDiv)return; modalDiv.style.display='flex'; const modalInputs=document.getElementById('modalFoodInputs'); modalInputs.innerHTML=''; selectedFoods.forEach((food,idx)=>{ const div=document.createElement('div'); div.innerHTML=`<strong>${food.name}</strong> : <input type="number" id="pInp_${idx}" value="${portions[idx]}" min="0" max="${totalParts}" step="1" style="width:70px"> parts`; modalInputs.appendChild(div); }); document.getElementById('ratioInput').value=''; document.getElementById('modalFeedback').innerHTML=''; const submitBtn=document.getElementById('submitChallenge'); const newSubmit=submitBtn.cloneNode(true); submitBtn.parentNode.replaceChild(newSubmit,submitBtn); newSubmit.onclick=()=>{ let user=[]; let ok=true; for(let i=0;i<selectedFoods.length;i++){ const val=parseInt(document.getElementById(`pInp_${i}`).value); if(isNaN(val)||val<0||val>totalParts) ok=false; user.push(val); } if(!ok||user.reduce((a,b)=>a+b,0)!==totalParts){ document.getElementById('modalFeedback').innerHTML="❌ Sum must equal total parts"; return; } if(!user.every((v,i)=>v===portions[i])){ document.getElementById('modalFeedback').innerHTML="❌ Portions don't match"; return; } const ratioStr=document.getElementById('ratioInput').value.trim(); const ratioParts=ratioStr.split(':').map(s=>parseInt(s.trim())); if(ratioParts.length!==3||ratioParts.some(isNaN)){ document.getElementById('modalFeedback').innerHTML="❌ Enter ratio a:b:c"; return; } const gcd=(a,b)=>b===0?a:gcd(b,a%b); let g=portions[0]; for(let i=1;i<portions.length;i++) g=gcd(g,portions[i]); const simplified=portions.map(p=>p/g); if(JSON.stringify(simplified)!==JSON.stringify(ratioParts)){ document.getElementById('modalFeedback').innerHTML=`❌ Correct ratio: ${simplified.join(':')}`; return; } document.getElementById('modalFeedback').innerHTML="🎉 Perfect! You mastered ratios! 🎉"; setTimeout(()=>{ modalDiv.style.display='none'; feedbackDiv.innerHTML="🏆 Great job! Press 'New Level' to play more!";},1500); }; document.getElementById('closeModalNoValidate').onclick=()=>{modalDiv.style.display='none';}; }
    
    function initLevel() { resetLevel(); } // alias
    
    function startGame(mode) {
        currentMode = mode;
        modeBadge.innerText = (mode === 'competition') ? "🏆 COMPETITION MODE" : "📘 LEARNING MODE";
        if (mode === 'competition') {
            secretTotalParts = getRandomInt(3, 12);
            totalParts = getRandomInt(3, 12);
        } else {
            totalParts = getRandomInt(3, 12);
        }
        selectedFoods = pickRandomFoods();
        const { target } = generateSolvableTarget(selectedFoods, totalParts);
        targetNutrition = target;
        portions = [0, 0, 0];
        updateUI();
        drawPieChart();
        renderHistogram();
        renderFoodCards();
        updateNutrientTable();
        checkWinCondition();
        if (mode === 'competition') {
            feedbackDiv.innerHTML = "Find correct parts count & portions. Use hint if needed.";
        } else {
            feedbackDiv.innerHTML = "Change parts to generate new puzzle. Drag food to plate.";
        }
        const modal = document.getElementById('challengeModal');
        if (modal) modal.style.display = 'none';
        setupDropTarget();
        setupPlateDrag();
    }
    
    // HINT: reveal secret totalParts in competition mode; in learning mode just show part weight info.
    hintBtn.addEventListener('click', () => {
        if (currentMode === 'competition') {
            alert(`🔍 COMPETITION HINT: The target nutrition was generated using ${secretTotalParts} total parts. Set total parts to ${secretTotalParts} and find the correct portion distribution!`);
        } else {
            alert(`Learning Mode: Each part = ${(1000/totalParts).toFixed(1)}g. Adjust portions to match target.`);
        }
    });
    
    // ========== KNOWLEDGE SCREEN DRAWING FUNCTIONS (unchanged) ==========
    function drawGeneralPieWithLegend() {
        let canvas = document.getElementById('generalPieCanvas'); if (!canvas) return;
        let ctx = canvas.getContext('2d');
        let w = canvas.width, h = canvas.height, cx = w/2, cy = h/2, rad = Math.min(w,h)*0.4;
        let slices = [{ name: "Nitrogen (N₂)", value: 78.0, color: "#6baed6" },{ name: "Oxygen (O₂)", value: 20.9, color: "#74c476" },{ name: "Argon (Ar)", value: 0.9, color: "#fd8d3c" },{ name: "CO₂ + trace", value: 0.2, color: "#e78ac3" }];
        let sum = slices.reduce((s,sl) => s + sl.value, 0); if (Math.abs(sum - 100) > 0.01) slices[3].value += (100 - sum);
        ctx.clearRect(0,0,w,h); let start = -Math.PI/2;
        slices.forEach(s => { let angle = (s.value/100) * 2 * Math.PI; ctx.beginPath(); ctx.moveTo(cx,cy); ctx.arc(cx,cy,rad,start,start+angle); ctx.fillStyle = s.color; ctx.fill(); start += angle; });
        let legendDiv = document.getElementById('generalPieLegend'); legendDiv.innerHTML = '';
        slices.forEach(s => { let item = document.createElement('div'); item.className = 'legend-item'; item.innerHTML = `<div class="color-box" style="background:${s.color};"></div><span>${s.name}: ${s.value.toFixed(1)}%</span>`; legendDiv.appendChild(item); });
    }
    function drawGamePlateDemo() {
        let canvas = document.getElementById('gamePlateDemo'); if (!canvas) return;
        let ctx = canvas.getContext('2d'); let w = canvas.width, h = canvas.height, cx = w/2, cy = h/2, rad = Math.min(w,h)*0.4;
        ctx.clearRect(0,0,w,h); ctx.fillStyle = "#e9dacb"; ctx.beginPath(); ctx.arc(cx,cy,rad,0,2*Math.PI); ctx.fill();
        let parts = [{ name: "Rice", portions: 2, color: "#f7e0a3" },{ name: "Chicken", portions: 1, color: "#e2b68d" },{ name: "Veggies", portions: 1, color: "#98c46c" }];
        let total = 4, start = -Math.PI/2;
        parts.forEach(p => { let angle = (p.portions/total) * 2 * Math.PI; ctx.beginPath(); ctx.moveTo(cx,cy); ctx.arc(cx,cy,rad,start,start+angle); ctx.fillStyle = p.color; ctx.fill(); start += angle; });
        ctx.beginPath(); ctx.arc(cx,cy,rad*0.12,0,2*Math.PI); ctx.fillStyle = "#ecbe7a"; ctx.fill();
        let legendDiv = document.getElementById('gamePieLegend'); legendDiv.innerHTML = '';
        parts.forEach(p => { let percent = Math.round((p.portions/total)*100); let item = document.createElement('div'); item.className = 'legend-item'; item.innerHTML = `<div class="color-box" style="background:${p.color};"></div><span>${p.name}: ${p.portions} part (${percent}%)</span>`; legendDiv.appendChild(item); });
    }
    function drawGeneralHistogram() {
        let container = document.getElementById('generalHistogram'); if (!container) return; container.innerHTML = '';
        let cities = [{ name: "Bengaluru", salary: 15.2 },{ name: "Hyderabad", salary: 12.8 },{ name: "Noida", salary: 10.5 },{ name: "Pune", salary: 11.2 }];
        let maxSalary = 18;
        cities.forEach(city => { let barDiv = document.createElement('div'); barDiv.className = 'v-bar-item'; let percentHeight = (city.salary / maxSalary) * 100; barDiv.innerHTML = `<div class="v-bar-bg"><div class="v-bar-fill" style="height: ${percentHeight}%; background:#4caf50;"></div></div><div class="v-bar-label">${city.name}</div><div class="salary-value">₹${city.salary}L</div>`; container.appendChild(barDiv); });
    }
    function drawGameHistogramDemo() {
        let container = document.getElementById('gameHistogramDemo'); if (!container) return; container.innerHTML = '';
        let nutrients = [{ name: "Protein", current: 28.0, target: 28.0, unit: "g" },{ name: "Carbs", current: 50.0, target: 50.0, unit: "g" },{ name: "Fat", current: 10.0, target: 10.0, unit: "g" }];
        let maxVal = Math.max(...nutrients.map(n => n.target), 1);
        nutrients.forEach(n => { let greenPercent = (n.current / maxVal) * 100; let targetPercent = (n.target / maxVal) * 100; let row = document.createElement('div'); row.className = 'hist-row'; row.innerHTML = `<div class="hist-label"><span>${n.name}</span><span>${n.current.toFixed(1)} / ${n.target.toFixed(1)} ${n.unit}</span></div><div class="hist-bar-container"><div class="hist-green" style="width: ${greenPercent}%;"></div><div class="hist-target-line" style="left: ${targetPercent}%;"></div></div><div class="hist-note" style="color:#2b6e3c;">✓ exact match</div>`; container.appendChild(row); });
        let note = document.createElement('div'); note.style.marginTop = '12px'; note.style.fontSize = '0.75rem'; note.style.textAlign = 'center'; note.style.background = '#e9dfc7'; note.style.padding = '8px'; note.style.borderRadius = '20px'; note.innerHTML = '⬅️ In the game, these bars are <strong>horizontal</strong> and update live as you adjust portions. ➡️'; container.appendChild(note);
    }
    
    // ========== SCREEN NAVIGATION ==========
    const menuScreen = document.getElementById('menuScreen');
    const gameContainer = document.getElementById('gameContainer');
    const knowledgeScreen = document.getElementById('knowledgeScreen');
    const quitGameBtn = document.getElementById('quitGameBtn');
    const quitKnowledgeBtn = document.getElementById('quitKnowledgeBtn');
    const learningBtn = document.getElementById('learningModeBtn');
    const competitionBtn = document.getElementById('competitionModeBtn');
    const knowledgeMenuBtn = document.getElementById('knowledgeMenuBtn');
    
    function showMenu() { menuScreen.classList.remove('hidden'); gameContainer.classList.add('hidden'); knowledgeScreen.classList.add('hidden'); }
    function showGame(mode) { menuScreen.classList.add('hidden'); knowledgeScreen.classList.add('hidden'); gameContainer.classList.remove('hidden'); startGame(mode); }
    function showKnowledge() { menuScreen.classList.add('hidden'); gameContainer.classList.add('hidden'); knowledgeScreen.classList.remove('hidden'); drawGeneralPieWithLegend(); drawGamePlateDemo(); drawGeneralHistogram(); drawGameHistogramDemo(); }
    
    learningBtn.addEventListener('click', () => showGame('learning'));
    competitionBtn.addEventListener('click', () => showGame('competition'));
    knowledgeMenuBtn.addEventListener('click', showKnowledge);
    quitGameBtn.addEventListener('click', showMenu);
    quitKnowledgeBtn.addEventListener('click', showMenu);
    
    resetBtn.addEventListener('click', resetLevel);
    decreasePartsBtn.addEventListener('click', () => changeTotalParts(-1));
    increasePartsBtn.addEventListener('click', () => changeTotalParts(1));
    
    // Challenge modal fallback
    if (!document.getElementById('challengeModal')) {
        const modalDiv = document.createElement('div');
        modalDiv.id = 'challengeModal';
        modalDiv.className = 'modal';
        modalDiv.innerHTML = `<div class="modal-content"><h2>🧠 Final Challenge!</h2><div id="modalFoodInputs"></div><p>➕ Ratio in simplest form (e.g., 2:1:3)</p><input type="text" id="ratioInput" placeholder="e.g., 2:1:3"><div><button id="submitChallenge">✅ Validate</button></div><div id="modalFeedback"></div><hr><button id="closeModalNoValidate">Skip</button></div>`;
        document.body.appendChild(modalDiv);
    }
    
    showMenu();