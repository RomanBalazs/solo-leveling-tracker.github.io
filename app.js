/* Solo Leveling Tracker – Vanilla, Pages-safe (no modules, no external fetch required) */

const LS_KEY = "slt_v1";

const EMBED = {
  settings: {
    startWeight: 98.55,
    goalWeight: 75,
    currentWeight: 98.55,
    trainingLevel: 1
  },
  trainingLevels: {
    1: { strength: "2x8", z2min: 10, mobmin: 6, note: "Kímélő nap" },
    2: { strength: "3x8", z2min: 15, mobmin: 8, note: "Könnyű nap" },
    3: { strength: "3x10", z2min: 20, mobmin: 10, note: "Alap nap" },
    4: { strength: "4x10", z2min: 25, mobmin: 12, note: "Nehéz nap" },
    5: { strength: "5x10", z2min: 30, mobmin: 15, note: "Push nap" }
  },
  // Minimal demo: 7 nap, ma lesz aktív. (Később beolvassuk a Napi terv 2026-ból.)
  weekTemplate: [
    { name: "H", quests: ["Mobilitás 10p", "Z2 séta 20p", "Rendrakás 5p"] },
    { name: "K", quests: ["Erő edzés", "Lépés cél", "Nyújtás 8p"] },
    { name: "Sze", quests: ["Mobilitás 12p", "Z2 séta 25p", "Mosogatás"] },
    { name: "Cs", quests: ["Erő edzés", "Alvás cél", "Ruhamosás"] },
    { name: "P", quests: ["Mobilitás 10p", "Z2 séta 20p", "Víz 2L"] },
    { name: "Szo", quests: ["Erő edzés", "Lépés cél", "Nyújtás 10p"] },
    { name: "V", quests: ["Aktív pihenő", "Séta 30p", "Heti összegzés"] }
  ],
  scheduleDemo: [
    { date: "2026-02-07", shift: "P", note: "Minta beosztás" },
    { date: "2026-02-08", shift: "Szabad", note: "" },
    { date: "2026-02-09", shift: "É", note: "" }
  ],
  mealDemo: [
    { date: "2026-02-07", meal: "Leves + főétel", kcal: 1900, protein: 120 },
    { date: "2026-02-08", meal: "Könnyű nap", kcal: 1750, protein: 110 },
    { date: "2026-02-09", meal: "Erős nap", kcal: 2050, protein: 130 }
  ]
};

function loadState(){
  try{
    const raw = localStorage.getItem(LS_KEY);
    if(!raw) throw 0;
    const s = JSON.parse(raw);
    return s;
  }catch{
    return {
      profile: { level: 1, exp: 0, unspent: 0, stats: {STR:0, END:0, REC:0, DISC:0} },
      settings: {...EMBED.settings},
      quests: {}, // date => {checks:{}, steps, sleep, weight, cleared}
      measurements: []
    };
  }
}

function saveState(){
  localStorage.setItem(LS_KEY, JSON.stringify(state));
  setStatus("MENTVE");
  setTimeout(()=>setStatus(""), 900);
}

function setStatus(msg){
  const el = document.getElementById("statusMsg");
  if(el) el.textContent = msg;
}

function expToNext(level){
  return 100 + (level-1)*25;
}

function computeRank(level){
  if(level>=51) return "S";
  if(level>=41) return "A";
  if(level>=31) return "B";
  if(level>=21) return "C";
  if(level>=11) return "D";
  return "E";
}

function grantExp(amount){
  let {level, exp} = state.profile;
  exp += amount;

  let leveled = false;
  while(exp >= expToNext(level)){
    exp -= expToNext(level);
    level += 1;
    state.profile.unspent += 1; // 1 stat pont / szint
    leveled = true;
  }
  state.profile.level = level;
  state.profile.exp = exp;
  if(leveled) setStatus("LEVEL UP");
  saveState();
  renderProfile();
}

function fmtDate(d){
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,"0");
  const day = String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
}

function startOfWeek(date){
  const d = new Date(date);
  const day = (d.getDay()+6)%7; // Mon=0
  d.setDate(d.getDate()-day);
  d.setHours(0,0,0,0);
  return d;
}

function addDays(date, n){
  const d = new Date(date);
  d.setDate(d.getDate()+n);
  return d;
}

/* Tabs */
function setTab(tab){
  document.querySelectorAll(".tab").forEach(b=>{
    b.classList.toggle("active", b.dataset.tab===tab);
  });
  document.querySelectorAll(".view").forEach(v=>v.classList.remove("active"));
  document.getElementById(`view-${tab}`).classList.add("active");
}

document.querySelectorAll(".tab").forEach(btn=>{
  btn.addEventListener("click", ()=>setTab(btn.dataset.tab));
});

/* Profile render */
function renderProfile(){
  const p = state.profile;
  const rank = computeRank(p.level);

  document.getElementById("rankPill").textContent = `Rank: ${rank}`;
  document.getElementById("levelPill").textContent = `Lv ${p.level}`;
  document.getElementById("pointsPill").textContent = `Pont: ${p.unspent}`;

  document.getElementById("statSTR").textContent = p.stats.STR;
  document.getElementById("statEND").textContent = p.stats.END;
  document.getElementById("statREC").textContent = p.stats.REC;
  document.getElementById("statDISC").textContent = p.stats.DISC;

  const need = expToNext(p.level);
  document.getElementById("expLabel").textContent = `${p.exp} / ${need}`;
  document.getElementById("expFill").style.width = `${Math.min(100, (p.exp/need)*100)}%`;

  // settings form
  document.getElementById("setStartWeight").value = state.settings.startWeight ?? "";
  document.getElementById("setGoalWeight").value = state.settings.goalWeight ?? "";
  document.getElementById("setCurrentWeight").value = state.settings.currentWeight ?? "";
  document.getElementById("trainingLevel").value = String(state.settings.trainingLevel ?? 1);

  // training cards
  const lvl = Number(state.settings.trainingLevel || 1);
  const t = EMBED.trainingLevels[lvl];
  const box = document.getElementById("trainingCards");
  box.innerHTML = "";
  const card = document.createElement("div");
  card.className = "item";
  card.innerHTML = `
    <div class="itemTitle">Edzés szint ${lvl}</div>
    <div class="itemMeta">Erő: <b>${t.strength}</b> · Z2: <b>${t.z2min} perc</b> · Mobilitás: <b>${t.mobmin} perc</b></div>
    <div class="itemMeta">${t.note}</div>
  `;
  box.appendChild(card);

  renderSummary();
  renderMeasurements();
}

document.getElementById("saveSettings").addEventListener("click", ()=>{
  state.settings.startWeight = Number(document.getElementById("setStartWeight").value || 0);
  state.settings.goalWeight = Number(document.getElementById("setGoalWeight").value || 0);
  state.settings.currentWeight = Number(document.getElementById("setCurrentWeight").value || 0);
  state.settings.trainingLevel = Number(document.getElementById("trainingLevel").value || 1);
  saveState();
  renderProfile();
});

document.getElementById("resetLocal").addEventListener("click", ()=>{
  localStorage.removeItem(LS_KEY);
  location.reload();
});

document.querySelectorAll("[data-stat]").forEach(btn=>{
  btn.addEventListener("click", ()=>{
    if(state.profile.unspent<=0) return setStatus("NINCS PONT");
    const k = btn.dataset.stat;
    state.profile.stats[k] += 1;
    state.profile.unspent -= 1;
    saveState();
    renderProfile();
  });
});

/* Measurements */
function renderMeasurements(){
  const list = document.getElementById("measureList");
  list.innerHTML = "";
  const items = [...state.measurements].sort((a,b)=> (a.date<b.date?1:-1));
  if(items.length===0){
    const empty = document.createElement("div");
    empty.className="item";
    empty.textContent = "Nincs mérés rögzítve.";
    list.appendChild(empty);
    return;
  }
  items.forEach(m=>{
    const el = document.createElement("div");
    el.className="item";
    el.innerHTML = `
      <div class="itemTitle">${m.date}</div>
      <div class="itemMeta">Súly: <b>${m.weight ?? "-"}</b> kg · Derék: <b>${m.waist ?? "-"}</b> cm</div>
      <div class="itemMeta">${m.note ? m.note : ""}</div>
    `;
    list.appendChild(el);
  });
}

document.getElementById("addMeasurement").addEventListener("click", ()=>{
  const date = document.getElementById("mDate").value || fmtDate(new Date());
  const weight = Number(document.getElementById("mWeight").value || 0) || null;
  const waist = Number(document.getElementById("mWaist").value || 0) || null;
  const note = document.getElementById("mNote").value || "";
  state.measurements.push({date, weight, waist, note});
  saveState();
  renderMeasurements();
});

/* Summary */
function renderSummary(){
  const s = state.settings;
  const p = state.profile;
  const rank = computeRank(p.level);
  const box = document.getElementById("summaryBox");
  const start = s.startWeight || 0;
  const curr = s.currentWeight || 0;
  const goal = s.goalWeight || 0;
  const delta = start && curr ? (curr - start) : 0;
  const toGoal = goal && curr ? (curr - goal) : 0;

  box.innerHTML = `
    <div class="box"><span>Rank</span><strong>${rank}</strong></div>
    <div class="box"><span>Edzés szint</span><strong>${s.trainingLevel || 1}</strong></div>
    <div class="box"><span>Kezdő → Aktuális</span><strong>${start} → ${curr}</strong></div>
    <div class="box"><span>Eltérés (kg)</span><strong>${delta.toFixed(1)}</strong></div>
    <div class="box"><span>Célig hátra (kg)</span><strong>${toGoal.toFixed(1)}</strong></div>
    <div class="box"><span>Össz mérés</span><strong>${state.measurements.length}</strong></div>
  `;
}

/* Quests */
function renderQuests(){
  const today = new Date();
  const todayKey = fmtDate(today);
  document.getElementById("todayPill").textContent = `Ma: ${todayKey}`;

  const weekStart = startOfWeek(today);
  const strip = document.getElementById("weekStrip");
  strip.innerHTML = "";

  for(let i=0;i<7;i++){
    const d = addDays(weekStart,i);
    const key = fmtDate(d);
    const isToday = key===todayKey;

    if(!state.quests[key]){
      state.quests[key] = { checks:{}, steps:"", sleep:"", weight:"", cleared:false };
    }
    const q = state.quests[key];

    const dayCard = document.createElement("div");
    dayCard.className = "dayCard" + (isToday ? "" : " lock");
    const name = EMBED.weekTemplate[i].name;

    // Build checks
    const checks = EMBED.weekTemplate[i].quests.map((txt, idx)=>{
      const id = `q_${key}_${idx}`;
      const checked = !!q.checks[id];
      return { id, txt, checked };
    });

    const expPer = 15; // fix, később a sheet alapján differenciáljuk
    const allDone = checks.every(c=>c.checked) && q.cleared;

    dayCard.innerHTML = `
      <div class="dayHead">
        <div class="dayName">${name}</div>
        <div class="dayDate">${key}</div>
      </div>

      <div class="itemMeta">Küldetések (+${expPer} EXP / pipa)</div>

      <div class="stack" id="checks_${key}"></div>

      <div class="kpi">
        <div class="k"><span>Lépés (db)</span><strong><input ${isToday ? "" : "disabled"} inputmode="numeric" id="steps_${key}" value="${q.steps ?? ""}" placeholder="0"></strong></div>
        <div class="k"><span>Alvás (óra)</span><strong><input ${isToday ? "" : "disabled"} inputmode="decimal" id="sleep_${key}" value="${q.sleep ?? ""}" placeholder="0"></strong></div>
        <div class="k"><span>Súly (kg)</span><strong><input ${isToday ? "" : "disabled"} inputmode="decimal" id="weight_${key}" value="${q.weight ?? ""}" placeholder="0"></strong></div>
      </div>

      <div class="row" style="margin-top:10px">
        <button class="btn ${isToday ? "" : "ghost"}" id="clear_${key}" ${isToday ? "" : "disabled"}>${allDone ? "Daily Clear ✓" : "Napi lezárás"}</button>
        <div class="pill">Státusz: <span id="st_${key}">${allDone ? "KÉSZ" : (isToday ? "AKTÍV" : "ZÁRT")}</span></div>
      </div>
    `;

    strip.appendChild(dayCard);

    const checksBox = dayCard.querySelector(`#checks_${key}`);
    checks.forEach(c=>{
      const line = document.createElement("div");
      line.className = "check";
      line.innerHTML = `
        <label>${c.txt}</label>
        <input type="checkbox" id="${c.id}" ${c.checked ? "checked":""} ${isToday ? "" : "disabled"} />
      `;
      checksBox.appendChild(line);

      const cb = line.querySelector("input");
      cb.addEventListener("change", ()=>{
        if(!isToday) return;
        q.checks[c.id] = cb.checked;
        if(cb.checked) grantExp(expPer);
        saveState();
      });
    });

    // Inputs
    const stepsEl = dayCard.querySelector(`#steps_${key}`);
    const sleepEl = dayCard.querySelector(`#sleep_${key}`);
    const weightEl = dayCard.querySelector(`#weight_${key}`);

    function bindInput(el, prop){
      if(!el) return;
      el.addEventListener("input", ()=>{
        if(!isToday) return;
        q[prop] = el.value;
        saveState();
      });
    }
    bindInput(stepsEl,"steps");
    bindInput(sleepEl,"sleep");
    bindInput(weightEl,"weight");

    // Daily clear button
    const clearBtn = dayCard.querySelector(`#clear_${key}`);
    clearBtn.addEventListener("click", ()=>{
      if(!isToday) return;
      // only allow clear if all checks true
      const ok = checks.every(c=> !!q.checks[c.id]);
      if(!ok) return setStatus("NINCS MIND KÉSZ");
      if(q.cleared) return;
      q.cleared = true;
      // daily clear bonus
      grantExp(50);
      saveState();
      renderQuests();
    });
  }

  saveState();
}

/* Schedule */
function renderSchedule(){
  const list = document.getElementById("scheduleList");
  list.innerHTML = "";
  EMBED.scheduleDemo.forEach(e=>{
    const el = document.createElement("div");
    el.className="item";
    el.innerHTML = `<div class="itemTitle">${e.date}</div><div class="itemMeta">Műszak: <b>${e.shift}</b> ${e.note ? "· "+e.note : ""}</div>`;
    list.appendChild(el);
  });
}

/* Meal */
function renderMeal(){
  const todayKey = fmtDate(new Date());
  document.getElementById("mealPill").textContent = `Ma: ${todayKey}`;

  const today = EMBED.mealDemo.find(m=>m.date===todayKey) || EMBED.mealDemo[0];
  const box = document.getElementById("mealToday");
  box.innerHTML = "";
  const card = document.createElement("div");
  card.className="item";
  card.innerHTML = `
    <div class="itemTitle">Mai menü</div>
    <div class="itemMeta">${today.date} · <b>${today.meal}</b></div>
    <div class="itemMeta">kcal: <b>${today.kcal}</b> · fehérje: <b>${today.protein}g</b></div>
  `;
  box.appendChild(card);

  const list = document.getElementById("mealList");
  list.innerHTML = "";
  EMBED.mealDemo.forEach(m=>{
    const el = document.createElement("div");
    el.className="item";
    el.innerHTML = `<div class="itemTitle">${m.date}</div><div class="itemMeta">${m.meal}</div><div class="itemMeta">kcal: <b>${m.kcal}</b> · fehérje: <b>${m.protein}g</b></div>`;
    list.appendChild(el);
  });
}

/* Init */
const state = loadState();

// Default date in measurement
document.getElementById("mDate").value = fmtDate(new Date());

renderProfile();
renderQuests();
renderSchedule();
renderMeal();
