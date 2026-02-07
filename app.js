/* System Tracker 2026 – Robust init + Quests generated from daily_plan_2026.json (real columns)
   Key goal: Quests tab never "blank" even if data JSON is missing/late.
*/
const LS_KEY = "st2026_v6";

function expToNext(level){ return 100 + (level-1)*25; }
function computeRank(level){
  if(level>=51) return "S";
  if(level>=41) return "A";
  if(level>=31) return "B";
  if(level>=21) return "C";
  if(level>=11) return "D";
  return "E";
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
function addDays(date, n){ const d = new Date(date); d.setDate(d.getDate()+n); return d; }
function setStatus(msg){
  const el = document.getElementById("statusMsg");
  if(el) el.textContent = msg || "";
}

function loadState(){
  try{
    const raw = localStorage.getItem(LS_KEY);
    if(!raw) throw 0;
    const s = JSON.parse(raw);

    s.profile ??= { level: 1, exp: 0, unspent: 0, stats: {STR:0, END:0, REC:0, DISC:0} };
    s.settings ??= { startWeight: 0, goalWeight: 0, currentWeight: 0, trainingLevel: 1 };
    s.quests ??= {};
    s.measurements ??= [];
    s.ui ??= {};
    s.ui.activeMonth ??= fmtDate(new Date()).slice(0,7);
    s.ui.activeDate ??= fmtDate(new Date());
    return s;
  }catch{
    return {
      profile: { level: 1, exp: 0, unspent: 0, stats: {STR:0, END:0, REC:0, DISC:0} },
      settings: { startWeight: 0, goalWeight: 0, currentWeight: 0, trainingLevel: 1 },
      quests: {},
      measurements: [],
      ui: { activeMonth: fmtDate(new Date()).slice(0,7), activeDate: fmtDate(new Date()) }
    };
  }
}
function saveState(){
  localStorage.setItem(LS_KEY, JSON.stringify(state));
  setStatus("MENTVE");
  setTimeout(()=>setStatus(""), 900);
}
function grantExp(amount){
  let {level, exp} = state.profile;
  exp += amount;
  let leveled = false;
  while(exp >= expToNext(level)){
    exp -= expToNext(level);
    level += 1;
    state.profile.unspent += 1;
    leveled = true;
  }
  state.profile.level = level;
  state.profile.exp = exp;
  saveState();
  renderProfile();
  if(leveled) setStatus("LEVEL UP");
}

/* ---------- Data loading (robust, non-blocking) ---------- */
async function safeFetchJson(path){
  try{
    const r = await fetch(path, { cache: "no-store" });
    if(!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  }catch(e){
    console.warn("Fetch fail:", path, e);
    return null;
  }
}
async function loadAllData(){
  const out = {};
  out.settings = await safeFetchJson("./data/settings.json");
  out.training_levels = await safeFetchJson("./data/training_levels.json");
  out.daily_plan_2026 = await safeFetchJson("./data/daily_plan_2026.json");
  out.menu_2026 = await safeFetchJson("./data/menu_2026.json");
  out.calendar_2026 = await safeFetchJson("./data/calendar_2026.json");
  return out;
}

/* ---------- UI Tabs ---------- */
function setTab(tab){
  document.querySelectorAll(".tab").forEach(b=>{
    b.classList.toggle("active", b.dataset.tab===tab);
  });
  document.querySelectorAll(".view").forEach(v=>v.classList.remove("active"));
  const view = document.getElementById(`view-${tab}`);
  if(view) view.classList.add("active");
}
function bindTabs(){
  document.querySelectorAll(".tab").forEach(btn=>{
    btn.addEventListener("click", ()=>setTab(btn.dataset.tab));
  });
}

/* ---------- Profile ---------- */
function renderProfile(){
  const p = state.profile;
  const rank = computeRank(p.level);

  document.getElementById("rankPill").textContent = `Rank: ${rank}`;
  document.getElementById("levelPill").textContent = `Lv ${p.level}`;
  document.getElementById("pointsPill").textContent = `Pont: ${p.unspent}`;

  const need = expToNext(p.level);
  document.getElementById("expLabel").textContent = `${p.exp} / ${need}`;
  document.getElementById("expFill").style.width = `${Math.min(100, (p.exp/need)*100)}%`;

  const setVal = (id, v)=>{ const el = document.getElementById(id); if(el) el.value = (v ?? ""); };
  setVal("setStartWeight", state.settings.startWeight);
  setVal("setGoalWeight", state.settings.goalWeight);
  setVal("setCurrentWeight", state.settings.currentWeight);

  const tl = document.getElementById("trainingLevel");
  if(tl) tl.value = String(state.settings.trainingLevel ?? 1);

  const st = state.profile.stats;
  document.getElementById("statSTR").textContent = String(st.STR ?? 0);
  document.getElementById("statEND").textContent = String(st.END ?? 0);
  document.getElementById("statREC").textContent = String(st.REC ?? 0);
  document.getElementById("statDISC").textContent = String(st.DISC ?? 0);

  renderTrainingCards();
  renderSummary();
  renderMeasurements();
}
function bindProfile(){
  document.querySelectorAll("[data-stat]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      if(state.profile.unspent<=0) return setStatus("NINCS PONT");
      const k = btn.dataset.stat;
      state.profile.stats[k] = (state.profile.stats[k]||0) + 1;
      state.profile.unspent -= 1;
      saveState();
      renderProfile();
    });
  });

  document.getElementById("saveSettings")?.addEventListener("click", ()=>{
    const num = (id)=> Number(document.getElementById(id)?.value || 0);
    state.settings.startWeight = num("setStartWeight");
    state.settings.goalWeight = num("setGoalWeight");
    state.settings.currentWeight = num("setCurrentWeight");
    state.settings.trainingLevel = Number(document.getElementById("trainingLevel")?.value || 1);
    saveState();
    renderProfile();
  });

  document.getElementById("resetLocal")?.addEventListener("click", ()=>{
    localStorage.removeItem(LS_KEY);
    location.reload();
  });
}
function renderTrainingCards(){
  const box = document.getElementById("trainingCards");
  if(!box) return;
  box.innerHTML = "";
  const lvl = Number(state.settings.trainingLevel || 1);

  // training_levels can be either { "1": {...}, ... } or array; handle both
  let tl = null;
  if(data.training_levels){
    if(Array.isArray(data.training_levels)){
      tl = data.training_levels.find(x => String(x?.level) === String(lvl)) || null;
    }else{
      tl = data.training_levels[String(lvl)] || null;
    }
  }

  const item = document.createElement("div");
  item.className = "item";
  if(tl){
    item.innerHTML = `
      <div class="itemTitle">Edzés szint ${lvl}</div>
      <div class="itemMeta">Erő: <b>${tl.strength ?? tl.Strength ?? "-"}</b> · Z2: <b>${tl.z2min ?? tl.Z2 ?? "-"} perc</b> · Mobilitás: <b>${tl.mobmin ?? tl.Mobility ?? "-"} perc</b></div>
      <div class="itemMeta">${tl.note ?? tl.Note ?? ""}</div>
    `;
  }else{
    item.innerHTML = `<div class="itemTitle">Edzés szint ${lvl}</div><div class="itemMeta">Nincs training_levels adat ehhez a szinthez.</div>`;
  }
  box.appendChild(item);
}
function renderSummary(){
  const box = document.getElementById("summaryBox");
  if(!box) return;
  const s = state.settings;
  const start = Number(s.startWeight||0);
  const curr = Number(s.currentWeight||0);
  const goal = Number(s.goalWeight||0);
  const delta = (start && curr) ? (curr - start) : 0;
  const toGoal = (goal && curr) ? (curr - goal) : 0;

  box.innerHTML = `
    <div class="box"><span>Rank</span><strong>${computeRank(state.profile.level)}</strong></div>
    <div class="box"><span>Edzés szint</span><strong>${s.trainingLevel||1}</strong></div>
    <div class="box"><span>Kezdő → Aktuális</span><strong>${start||"-"} → ${curr||"-"}</strong></div>
    <div class="box"><span>Eltérés (kg)</span><strong>${delta.toFixed(1)}</strong></div>
    <div class="box"><span>Célig hátra (kg)</span><strong>${toGoal.toFixed(1)}</strong></div>
    <div class="box"><span>Mérések</span><strong>${state.measurements.length}</strong></div>
  `;
}

/* ---------- Measurements ---------- */
function renderMeasurements(){
  const list = document.getElementById("measureList");
  if(!list) return;
  list.innerHTML = "";
  const items = [...state.measurements].sort((a,b)=> (a.date<b.date?1:-1));
  if(items.length===0){
    const empty = document.createElement("div");
    empty.className="item";
    empty.textContent="Nincs mérés.";
    list.appendChild(empty);
    return;
  }
  items.forEach(m=>{
    const el = document.createElement("div");
    el.className="item";
    el.innerHTML = `
      <div class="itemTitle">${m.date}</div>
      <div class="itemMeta">Súly: <b>${m.weight ?? "-"}</b> kg · Derék: <b>${m.waist ?? "-"}</b> cm</div>
      <div class="itemMeta">${m.note ?? ""}</div>
    `;
    list.appendChild(el);
  });
}
function bindMeasurements(){
  const dateEl = document.getElementById("mDate");
  if(dateEl) dateEl.value = fmtDate(new Date());

  document.getElementById("addMeasurement")?.addEventListener("click", ()=>{
    const date = document.getElementById("mDate")?.value || fmtDate(new Date());
    const weight = Number(document.getElementById("mWeight")?.value || 0) || null;
    const waist = Number(document.getElementById("mWaist")?.value || 0) || null;
    const note = document.getElementById("mNote")?.value || "";
    state.measurements.push({date, weight, waist, note});
    saveState();
    renderMeasurements();
  });
}

/* ---------- Quests (from daily_plan_2026) ---------- */
function ensureQuestDay(key){
  if(!state.quests[key]){
    state.quests[key] = { checks:{}, steps:"", sleep:"", weight:"", closed:false };
  }else{
    state.quests[key].checks ??= {};
    if(state.quests[key].closed === undefined) state.quests[key].closed = false;
  }
  return state.quests[key];
}

function truthyCell(v){
  if(v === null || v === undefined) return false;
  const s = String(v).trim().toLowerCase();
  if(!s) return false;
  if(["0","no","n","nem","-","false","off"].includes(s)) return false;
  return true;
}

// Date key extractor: tries multiple possible field names and formats
function extractDateKey(row){
  if(!row) return null;
  const candidates = ["Dátum","Datum","date","Date"];
  let raw = null;
  for(const k of candidates){
    if(row[k]){ raw = row[k]; break; }
  }
  if(!raw) return null;
  const s = String(raw).trim();
  // already ISO?
  if(/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // handle '2026.01.05' or '2026. 01. 05'
  const m1 = s.match(/^(\d{4})[.\-/ ]+(\d{1,2})[.\-/ ]+(\d{1,2})/);
  if(m1){
    const y=m1[1], mo=String(m1[2]).padStart(2,"0"), d=String(m1[3]).padStart(2,"0");
    return `${y}-${mo}-${d}`;
  }
  return null;
}

function buildQuestsFromDailyRow(row, dateKey){
  const quests = [];

  // Edzés javaslat
  const workout = row?.["Edzés javaslat"] ?? row?.["Edzes javaslat"] ?? row?.["Edzés"] ?? row?.["Edzes"] ?? null;
  if(truthyCell(workout)){
    quests.push({ id:`q_${dateKey}_edzes`, text:`Edzés: ${String(workout).trim()}`, exp:30 });
  }

  // Teendők oszlopok (rugalmas kulcsok)
  const chores = [
    [["Mosogatás","Mosogatas"],"Mosogatás",10],
    [["Ruhamosás","Ruhamosas"],"Ruhamosás",10],
    [["Takarítás","Takaritas"],"Takarítás",10],
    [["Főzés","Fozes"],"Főzés",10],
    [["Barátok","Baratok"],"Barátok",10],
  ];
  for(const [keys,label,exp] of chores){
    let v = null;
    for(const k of keys){ if(row?.[k] !== undefined){ v = row[k]; break; } }
    if(truthyCell(v)){
      quests.push({ id:`q_${dateKey}_${label.toLowerCase().replace(/ő/g,"o").replace(/á/g,"a").replace(/ /g,"_")}`, text:label, exp });
    }
  }

  // Éjszakás extra
  const shift = String(row?.["Műszak"] ?? row?.["Muszak"] ?? row?.["Shift"] ?? "").toLowerCase();
  if(shift.includes("éj") || shift.includes("ej") || shift.includes("night")){
    quests.push({ id:`q_${dateKey}_regen`, text:"Regeneráció: 10 perc nyújtás / lazítás", exp:10 });
  }

  if(quests.length === 0){
    quests.push({ id:`q_${dateKey}_min`, text:"Napi minimum: 10 perc séta", exp:10 });
  }
  return quests;
}

function renderQuests(){
  const todayKey = fmtDate(new Date());
  const todayPill = document.getElementById("todayPill");
  if(todayPill) todayPill.textContent = `Ma: ${todayKey}`;

  // init selectors safely
  const activeMonthEl = document.getElementById("activeMonth");
  const activeDateEl = document.getElementById("activeDate");

  if(activeMonthEl && !activeMonthEl.value){
    activeMonthEl.value = state.ui.activeMonth || todayKey.slice(0,7);
  }
  if(activeDateEl && !activeDateEl.value){
    activeDateEl.value = state.ui.activeDate || todayKey;
  }

  const activeMonth = activeMonthEl?.value || todayKey.slice(0,7);
  let activeKey = activeDateEl?.value || todayKey;
  if(activeKey.slice(0,7) !== activeMonth){
    activeKey = `${activeMonth}-01`;
    if(activeDateEl) activeDateEl.value = activeKey;
  }

  state.ui.activeMonth = activeMonth;
  state.ui.activeDate = activeKey;
  saveState();

  // index daily plan by normalized date key
  const byDate = {};
  if(Array.isArray(data.daily_plan_2026)){
    for(const r of data.daily_plan_2026){
      const dk = extractDateKey(r);
      if(dk) byDate[dk] = r;
    }
  }

  const weekStart = startOfWeek(new Date(activeKey));
  const strip = document.getElementById("weekStrip");
  if(!strip) return;
  strip.innerHTML = "";

  for(let i=0;i<7;i++){
    const d = addDays(weekStart,i);
    const key = fmtDate(d);
    const isActive = key === activeKey;
    const withinMonth = key.slice(0,7) === activeMonth;

    const dayState = ensureQuestDay(key);
    const locked = dayState.closed || !withinMonth || !isActive;

    const row = byDate[key] || null;
    const quests = buildQuestsFromDailyRow(row, key);

    const dayName = (row?.["Nap"] ?? row?.["Day"] ?? ["Hétfő","Kedd","Szerda","Csütörtök","Péntek","Szombat","Vasárnap"][i]);
    const shiftTxt = row?.["Műszak"] ?? row?.["Muszak"] ?? row?.["Shift"] ?? "-";
    const timeTxt = row?.["Idő"] ?? row?.["Ido"] ?? row?.["Time"] ?? "";

    const card = document.createElement("div");
    card.className = "dayCard" + (locked ? " lock" : "");
    card.innerHTML = `
      <div class="dayHead">
        <div class="dayName">${dayName}</div>
        <div class="dayDate">${key}</div>
      </div>
      <div class="itemMeta">
        ${row ? `Műszak: <b>${shiftTxt}</b>${timeTxt ? " · "+timeTxt : ""}` : "Nincs adat ehhez a naphoz a Napi terv 2026-ban."}
        ${dayState.closed ? " · <b>LEZÁRVA</b>" : ""}
      </div>

      <div class="stack" id="checks_${key}"></div>

      <div class="kpi">
        <div class="k"><span>Lépés (db)</span><strong><input ${locked?"disabled":""} inputmode="numeric" id="steps_${key}" value="${dayState.steps ?? ""}" placeholder="0"></strong></div>
        <div class="k"><span>Alvás (óra)</span><strong><input ${locked?"disabled":""} inputmode="decimal" id="sleep_${key}" value="${dayState.sleep ?? ""}" placeholder="0"></strong></div>
        <div class="k"><span>Súly (kg)</span><strong><input ${locked?"disabled":""} inputmode="decimal" id="weight_${key}" value="${dayState.weight ?? ""}" placeholder="0"></strong></div>
      </div>

      <div class="row" style="margin-top:10px">
        <button class="btn ${locked?"ghost":""}" id="save_${key}" ${locked?"disabled":""}>Nap mentése + lezárás</button>
        <div class="pill">Státusz: <span>${dayState.closed ? "LEZÁRVA" : (isActive ? "AKTÍV" : "ZÁRT")}</span></div>
      </div>
    `;
    strip.appendChild(card);

    const box = card.querySelector(`#checks_${key}`);
    quests.forEach(q=>{
      const checked = !!dayState.checks[q.id];
      const line = document.createElement("div");
      line.className = "check";
      line.innerHTML = `
        <label>${q.text} <span style="color:var(--muted); font-family:ui-monospace,monospace">(+${q.exp} EXP)</span></label>
        <input type="checkbox" ${checked?"checked":""} ${locked?"disabled":""} />
      `;
      box.appendChild(line);

      const cb = line.querySelector("input");
      cb.addEventListener("change", ()=>{
        if(locked) return;
        const prev = !!dayState.checks[q.id];
        dayState.checks[q.id] = cb.checked;
        if(!prev && cb.checked) grantExp(q.exp);
        saveState();
      });
    });

    // inputs
    const bind = (sel, prop)=>{
      const el = card.querySelector(sel);
      if(!el) return;
      el.addEventListener("input", ()=>{
        if(locked) return;
        dayState[prop] = el.value;
        saveState();
      });
    };
    bind(`#steps_${key}`,"steps");
    bind(`#sleep_${key}`,"sleep");
    bind(`#weight_${key}`,"weight");

    // save + lock
    card.querySelector(`#save_${key}`)?.addEventListener("click", ()=>{
      if(locked) return;
      dayState.closed = true;
      saveState();
      setStatus("LEZÁRVA");
      renderQuests();
    });
  }

  // global lock/unlock active day
  const activeDay = ensureQuestDay(activeKey);
  const lockBtn = document.getElementById("lockDayBtn");
  const unlockBtn = document.getElementById("unlockDayBtn");
  if(lockBtn){
    lockBtn.disabled = activeDay.closed;
    lockBtn.onclick = ()=>{
      activeDay.closed = true;
      saveState();
      renderQuests();
      setStatus("LEZÁRVA");
    };
  }
  if(unlockBtn){
    unlockBtn.disabled = !activeDay.closed;
    unlockBtn.onclick = ()=>{
      activeDay.closed = false;
      saveState();
      renderQuests();
      setStatus("FELOLDVA");
    };
  }
}

function bindQuestsSelectors(){
  const activeMonthEl = document.getElementById("activeMonth");
  const activeDateEl = document.getElementById("activeDate");
  if(activeMonthEl){
    activeMonthEl.addEventListener("change", ()=>{
      state.ui.activeMonth = activeMonthEl.value;
      state.ui.activeDate = `${activeMonthEl.value}-01`;
      if(activeDateEl) activeDateEl.value = state.ui.activeDate;
      saveState();
      renderQuests();
    });
  }
  if(activeDateEl){
    activeDateEl.addEventListener("change", ()=>{
      state.ui.activeDate = activeDateEl.value;
      state.ui.activeMonth = activeDateEl.value.slice(0,7);
      if(activeMonthEl) activeMonthEl.value = state.ui.activeMonth;
      saveState();
      renderQuests();
    });
  }
}

/* ---------- Schedule & Meal (basic render) ---------- */
function renderSchedule(){
  const list = document.getElementById("scheduleList");
  if(!list) return;
  list.innerHTML = "";
  const rows = Array.isArray(data.calendar_2026) ? data.calendar_2026 : [];
  if(rows.length===0){
    const el = document.createElement("div");
    el.className="item";
    el.textContent="Nincs calendar_2026 adat (vagy nem töltődött be).";
    list.appendChild(el);
    return;
  }
  const today = fmtDate(new Date());
  const upcoming = rows
    .map(r=>({r, dk: extractDateKey(r) || String(r["Dátum"]||r["Datum"]||r["date"]||"")}))
    .filter(x=> x.dk && x.dk >= today)
    .sort((a,b)=> a.dk.localeCompare(b.dk))
    .slice(0, 30);

  upcoming.forEach(x=>{
    const r = x.r;
    const dt = x.dk;
    const shift = r["Műszak"] || r["Muszak"] || r["shift"] || "-";
    const note = r["Megjegyzés"] || r["Megjegyzes"] || r["note"] || "";
    const el = document.createElement("div");
    el.className="item";
    el.innerHTML = `<div class="itemTitle">${dt}</div><div class="itemMeta">Műszak: <b>${shift}</b>${note ? " · "+note : ""}</div>`;
    list.appendChild(el);
  });
}

function renderMeal(){
  const pill = document.getElementById("mealPill");
  const todayKey = fmtDate(new Date());
  if(pill) pill.textContent = `Ma: ${todayKey}`;

  const todayBox = document.getElementById("mealToday");
  const list = document.getElementById("mealList");
  if(!todayBox || !list) return;

  todayBox.innerHTML = "";
  list.innerHTML = "";

  const rows = Array.isArray(data.menu_2026) ? data.menu_2026 : [];
  if(rows.length===0){
    const el = document.createElement("div");
    el.className="item";
    el.textContent="Nincs menu_2026 adat (vagy nem töltődött be).";
    todayBox.appendChild(el);
    return;
  }

  const pick = rows.find(r => (extractDateKey(r) || "") === todayKey) || rows[0];
  const dt = extractDateKey(pick) || (pick["Dátum"]||pick["Datum"]||"-");
  const soup = pick["Leves"] || pick["Soup"] || "";
  const main = pick["Főétel"] || pick["Foetel"] || pick["Main"] || pick["meal"] || "";

  const mainEl = document.createElement("div");
  mainEl.className="item";
  mainEl.innerHTML = `<div class="itemTitle">Mai menü</div><div class="itemMeta">${dt} · <b>${[soup,main].filter(Boolean).join(" · ") || "-"}</b></div>`;
  todayBox.appendChild(mainEl);

  rows.slice(0, 30).forEach(r=>{
    const dt2 = extractDateKey(r) || (r["Dátum"]||r["Datum"]||"-");
    const s2 = r["Leves"] || r["Soup"] || "";
    const m2 = r["Főétel"] || r["Foetel"] || r["Main"] || "";
    const el = document.createElement("div");
    el.className="item";
    el.innerHTML = `<div class="itemTitle">${dt2}</div><div class="itemMeta">${[s2,m2].filter(Boolean).join(" · ")}</div>`;
    list.appendChild(el);
  });
}

/* ---------- Init ---------- */
const state = loadState();
let data = { settings:null, training_levels:null, daily_plan_2026:null, menu_2026:null, calendar_2026:null };

document.addEventListener("DOMContentLoaded", async ()=>{
  bindTabs();
  bindProfile();
  bindMeasurements();
  bindQuestsSelectors();

  // Always render something immediately (no blank tabs)
  renderProfile();
  renderQuests();
  renderSchedule();
  renderMeal();

  // Load JSONs afterwards and rerender
  const loaded = await loadAllData();
  data = { ...data, ...loaded };

  // Merge defaults from JSON settings only if local seems empty
  if(data.settings){
    const s = state.settings;
    const emptyish = (!s.startWeight && !s.goalWeight && !s.currentWeight);
    if(emptyish) state.settings = { ...s, ...data.settings };
  }

  saveState();
  renderProfile();
  renderQuests();
  renderSchedule();
  renderMeal();
});
