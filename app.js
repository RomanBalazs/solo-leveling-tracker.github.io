/* Solo Leveling System Tracker 2026
   Enhancements: (1) streak + daily clear, (2) titles + Hunter ID, (3) weekly dungeon run,
   (4) crates (cosmetics), (5) stats affect EXP, (7) trends chart, (8) export/import,
   (9) quick add, (10) daily modifiers.
   Runs fully on GitHub Pages (static) + localStorage.
*/
const LS_KEY = "st2026_v7";

/* ---------- Utils ---------- */
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
function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }
function setStatus(msg){
  const el = document.getElementById("statusMsg");
  if(el) el.textContent = msg || "";
}

/* Deterministic hash from string */
function hashStr(s){
  let h = 2166136261;
  for(let i=0;i<s.length;i++){
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h>>>0);
}

/* ---------- State ---------- */
function defaultState(){
  const todayKey = fmtDate(new Date());
  return {
    profile: {
      level: 1, exp: 0, unspent: 0,
      stats: { STR:0, END:0, REC:0, DISC:0 },
      title: "Rookie Hunter"
    },
    settings: { startWeight: 0, goalWeight: 0, currentWeight: 0, trainingLevel: 1 },
    quests: {}, // dateKey -> {checks:{}, steps:"", sleep:"", weight:"", closed:false, cleared:false, closeTs?:number}
    measurements: [],
    ui: { activeMonth: todayKey.slice(0,7), activeDate: todayKey },
    meta: {
      streak: 0,
      bestStreak: 0,
      lastClosedDate: null,
      tokens: 1,                 // 1 “streak protect” token
      tokenWeekKey: null,        // resets weekly
      crates: 0,
      lastCrateDate: null,
      weeklyClaims: {},          // weekKey -> true
      openedCrates: 0
    },
    cosmetics: {
      badges: ["Rookie"],
      frames: ["Default"],
      titles: ["Rookie Hunter","Gate Cleaner","Dungeon Runner","Shadow Candidate"],
      equippedFrame: "Default",
      equippedBadge: "Rookie"
    }
  };
}

function loadState(){
  try{
    const raw = localStorage.getItem(LS_KEY);
    if(!raw) throw 0;
    const s = JSON.parse(raw);

    // back-compat + defaults
    const d = defaultState();
    s.profile ??= d.profile;
    s.profile.stats ??= d.profile.stats;
    s.profile.title ??= d.profile.title;

    s.settings ??= d.settings;
    s.quests ??= {};
    s.measurements ??= [];
    s.ui ??= d.ui;

    s.meta ??= d.meta;
    s.meta.weeklyClaims ??= {};
    s.meta.tokens ??= 1;
    s.meta.crates ??= 0;

    s.cosmetics ??= d.cosmetics;
    s.cosmetics.badges ??= d.cosmetics.badges;
    s.cosmetics.frames ??= d.cosmetics.frames;
    s.cosmetics.titles ??= d.cosmetics.titles;

    return s;
  }catch{
    return defaultState();
  }
}
function saveState(){
  localStorage.setItem(LS_KEY, JSON.stringify(state));
  setStatus("MENTVE");
  setTimeout(()=>setStatus(""), 900);
}

/* ---------- Data loading (robust) ---------- */
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

/* ---------- Tabs ---------- */
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

/* ---------- Daily modifiers ---------- */
function getDailyModifier(dateKey){
  // Deterministic “System” daily modifiers
  const h = hashStr("mod:"+dateKey);
  const roll = h % 100;
  // default
  let mod = { key:"NORMAL", name:"Normal Day", expMult:1.0, extraQuest:null };

  if(roll < 10){
    mod = { key:"DOUBLE_REC", name:"Double EXP (REC)", expMult:1.0, extraQuest:{ id:`q_${dateKey}_rec`, text:"Recovery: 10 perc nyújtás/lazítás", exp:20, tag:"REC", mult:2.0 } };
  }else if(roll < 25){
    mod = { key:"BOSS", name:"Boss Day", expMult:1.15, extraQuest:{ id:`q_${dateKey}_boss`, text:"Boss: 15 perc extra séta / Z2", exp:30, tag:"END", mult:1.0 } };
  }else if(roll < 40){
    mod = { key:"LOW_MANA", name:"Low Mana Day", expMult:0.9, extraQuest:{ id:`q_${dateKey}_min`, text:"Minimum: 10 perc séta", exp:10, tag:"END", mult:1.0 } };
  }else if(roll < 55){
    mod = { key:"DISC", name:"Discipline Day", expMult:1.05, extraQuest:null };
  }else if(roll < 70){
    mod = { key:"SHADOW", name:"Shadow Day", expMult:1.1, extraQuest:{ id:`q_${dateKey}_shadow`, text:"Shadow Drill: 20 guggolás + 20 fekvő", exp:25, tag:"STR", mult:1.0 } };
  }
  return mod;
}

/* ---------- Weekly challenge ---------- */
function weekKeyFromDate(dateKey){
  const ws = startOfWeek(new Date(dateKey));
  return fmtDate(ws); // Monday date key
}
function ensureWeeklyTokenReset(dateKey){
  const wk = weekKeyFromDate(dateKey);
  if(state.meta.tokenWeekKey !== wk){
    state.meta.tokenWeekKey = wk;
    state.meta.tokens = 1; // reset weekly
    saveState();
  }
}

function getWeeklyChallenge(dateKey){
  const wk = weekKeyFromDate(dateKey);
  const h = hashStr("wk:"+wk);
  // targets vary a bit
  const stepsTarget = 25000 + (h % 3)*10000; // 25k/35k/45k
  const sleepTarget = 35 + ((h>>>2) % 3)*7;  // 35/42/49
  const clearsTarget = 5 + ((h>>>4) % 3);    // 5/6/7
  const rewardExp = 250 + ((h>>>6) % 3)*100; // 250/350/450
  const rewardCrate = 1;

  return {
    weekKey: wk,
    name: "Dungeon Run (Weekly)",
    stepsTarget,
    sleepTarget,
    clearsTarget,
    rewardExp,
    rewardCrate
  };
}

function computeWeeklyProgress(ch){
  const ws = new Date(ch.weekKey);
  let steps=0, sleep=0, clears=0;
  for(let i=0;i<7;i++){
    const key = fmtDate(addDays(ws,i));
    const d = state.quests[key];
    if(!d) continue;
    steps += Number(d.steps||0) || 0;
    sleep += Number(d.sleep||0) || 0;
    if(d.closed) clears += 1;
  }
  return { steps, sleep, clears };
}

function canClaimWeekly(ch){
  const claimed = !!state.meta.weeklyClaims[ch.weekKey];
  if(claimed) return false;
  const p = computeWeeklyProgress(ch);
  return p.steps>=ch.stepsTarget && p.sleep>=ch.sleepTarget && p.clears>=ch.clearsTarget;
}

/* ---------- EXP modifiers from stats ---------- */
function statBonusForTag(tag){
  const s = state.profile.stats;
  if(tag==="STR") return 1 + (s.STR||0)*0.01;
  if(tag==="END") return 1 + (s.END||0)*0.01;
  if(tag==="REC") return 1 + (s.REC||0)*0.01;
  if(tag==="DISC") return 1 + (s.DISC||0)*0.01;
  return 1.0;
}

function grantExpWithContext(baseExp, dateKey, tag){
  const mod = getDailyModifier(dateKey);
  ensureWeeklyTokenReset(dateKey);

  let mult = mod.expMult || 1.0;
  mult *= statBonusForTag(tag);

  // Special daily modifier extra quest multiplier
  if(mod.extraQuest && mod.extraQuest.tag === tag && mod.extraQuest.mult){
    // only applies if the EXP was earned by that extra quest (we handle separately)
  }

  const finalExp = Math.max(1, Math.round(baseExp * mult));
  grantExp(finalExp);
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

/* ---------- Titles / Cosmetics / Crates ---------- */
function equipTitle(title){
  if(!state.cosmetics.titles.includes(title)) return;
  state.profile.title = title;
  saveState();
  renderProfile();
}
function addTitle(title){
  if(!state.cosmetics.titles.includes(title)) state.cosmetics.titles.push(title);
}
function addBadge(badge){
  if(!state.cosmetics.badges.includes(badge)) state.cosmetics.badges.push(badge);
}
function addFrame(frame){
  if(!state.cosmetics.frames.includes(frame)) state.cosmetics.frames.push(frame);
}

function openCrate(){
  if(state.meta.crates <= 0){
    return setStatus("NINCS CRATE");
  }
  state.meta.crates -= 1;
  state.meta.openedCrates += 1;

  const poolTitles = ["Gate Cleaner","Dungeon Runner","Shadow Candidate","Discipline Adept","Recovery Specialist","Boss Slayer"];
  const poolBadges = ["Rookie","Iron Will","Night Shift","Streak Master","Dungeon Clear"];
  const poolFrames = ["Default","Neon Edge","Abyss Border","System Purple"];

  const r = (hashStr("crate:"+String(state.meta.openedCrates)+":"+fmtDate(new Date())) % 100);
  let reward = "";
  if(r < 40){
    const t = poolTitles[r % poolTitles.length];
    addTitle(t);
    reward = `Új cím: ${t}`;
  }else if(r < 75){
    const b = poolBadges[r % poolBadges.length];
    addBadge(b);
    state.cosmetics.equippedBadge = b;
    reward = `Új badge: ${b}`;
  }else{
    const f = poolFrames[r % poolFrames.length];
    addFrame(f);
    state.cosmetics.equippedFrame = f;
    reward = `Új frame: ${f}`;
  }

  saveState();
  renderProfile();
  setStatus(reward);
}

/* ---------- Export / Import ---------- */
function exportJson(){
  const blob = new Blob([JSON.stringify(state, null, 2)], {type:"application/json"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `system-tracker-${fmtDate(new Date())}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}
async function importJsonFile(file){
  try{
    const text = await file.text();
    const obj = JSON.parse(text);
    // Minimal validation
    if(!obj || !obj.profile || !obj.settings) throw new Error("Invalid");
    localStorage.setItem(LS_KEY, JSON.stringify(obj));
    location.reload();
  }catch(e){
    console.error(e);
    setStatus("IMPORT HIBA");
  }
}

/* ---------- Hunter ID PNG ---------- */
function exportHunterId(){
  const canvas = document.createElement("canvas");
  canvas.width = 900;
  canvas.height = 520;
  const ctx = canvas.getContext("2d");

  // Background
  const grad = ctx.createLinearGradient(0,0,900,520);
  grad.addColorStop(0, "#0b0f17");
  grad.addColorStop(1, "#141c2b");
  ctx.fillStyle = grad;
  ctx.fillRect(0,0,900,520);

  // Panel
  ctx.fillStyle = "rgba(16,24,35,0.75)";
  ctx.strokeStyle = "rgba(124,92,255,0.65)";
  ctx.lineWidth = 4;
  roundRect(ctx, 40, 40, 820, 440, 22, true, true);

  // Header
  ctx.fillStyle = "rgba(124,92,255,0.12)";
  ctx.strokeStyle = "rgba(124,92,255,0.55)";
  roundRect(ctx, 60, 60, 780, 80, 18, true, true);

  ctx.fillStyle = "#e7eefc";
  ctx.font = "800 28px ui-sans-serif,system-ui";
  ctx.fillText("HUNTER LICENSE", 80, 110);

  ctx.fillStyle = "#a9b6d3";
  ctx.font = "600 14px ui-monospace,monospace";
  ctx.fillText(`ID: ${hashStr("id:"+JSON.stringify(state.profile)).toString(16).toUpperCase()}`, 620, 112);

  // Content
  const rank = computeRank(state.profile.level);
  ctx.fillStyle = "#e7eefc";
  ctx.font = "900 40px ui-sans-serif,system-ui";
  ctx.fillText(`RANK ${rank}`, 80, 200);

  ctx.fillStyle = "#e7eefc";
  ctx.font = "800 26px ui-sans-serif,system-ui";
  ctx.fillText(`${state.profile.title || "Rookie Hunter"}`, 80, 245);

  ctx.fillStyle = "#a9b6d3";
  ctx.font = "600 18px ui-sans-serif,system-ui";
  ctx.fillText(`Level: ${state.profile.level}   EXP: ${state.profile.exp}/${expToNext(state.profile.level)}`, 80, 285);

  ctx.fillStyle = "#a9b6d3";
  ctx.font = "600 18px ui-sans-serif,system-ui";
  ctx.fillText(`Streak: ${state.meta.streak}   Best: ${state.meta.bestStreak}   Tokens: ${state.meta.tokens}`, 80, 315);

  // Stats
  const st = state.profile.stats;
  ctx.fillStyle = "#e7eefc";
  ctx.font = "800 18px ui-monospace,monospace";
  ctx.fillText(`STR ${st.STR||0}   END ${st.END||0}   REC ${st.REC||0}   DISC ${st.DISC||0}`, 80, 355);

  // Badge / Frame
  ctx.fillStyle = "#a9b6d3";
  ctx.font = "600 14px ui-sans-serif,system-ui";
  ctx.fillText(`Badge: ${state.cosmetics.equippedBadge}   Frame: ${state.cosmetics.equippedFrame}`, 80, 390);

  // Footer
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.fillRect(60, 420, 780, 1);
  ctx.fillStyle = "#a9b6d3";
  ctx.font = "600 14px ui-sans-serif,system-ui";
  ctx.fillText(`Generated: ${fmtDate(new Date())} · Local data only`, 80, 455);

  // download
  const a = document.createElement("a");
  a.href = canvas.toDataURL("image/png");
  a.download = `hunter-id-${fmtDate(new Date())}.png`;
  a.click();
}

function roundRect(ctx, x, y, w, h, r, fill, stroke){
  if(w < 2*r) r = w/2;
  if(h < 2*r) r = h/2;
  ctx.beginPath();
  ctx.moveTo(x+r, y);
  ctx.arcTo(x+w, y,   x+w, y+h, r);
  ctx.arcTo(x+w, y+h, x,   y+h, r);
  ctx.arcTo(x,   y+h, x,   y,   r);
  ctx.arcTo(x,   y,   x+w, y,   r);
  ctx.closePath();
  if(fill) ctx.fill();
  if(stroke) ctx.stroke();
}

/* ---------- Profile rendering ---------- */
function renderProfile(){
  const p = state.profile;
  const rank = computeRank(p.level);

  document.getElementById("rankPill").textContent = `Rank: ${rank}`;
  document.getElementById("levelPill").textContent = `Lv ${p.level}`;
  document.getElementById("pointsPill").textContent = `Pont: ${p.unspent}`;

  document.getElementById("streakPill").textContent = `Streak: ${state.meta.streak} (Best ${state.meta.bestStreak})`;
  document.getElementById("tokenPill").textContent = `Token: ${state.meta.tokens}`;
  document.getElementById("cratePill").textContent = `Crate: ${state.meta.crates}`;
  document.getElementById("titlePill").textContent = `Cím: ${p.title || "—"}`;

  const need = expToNext(p.level);
  document.getElementById("expLabel").textContent = `${p.exp} / ${need}`;
  document.getElementById("expFill").style.width = `${Math.min(100, (p.exp/need)*100)}%`;

  // Settings fields
  const setVal = (id, v)=>{ const el = document.getElementById(id); if(el) el.value = (v ?? ""); };
  setVal("setStartWeight", state.settings.startWeight);
  setVal("setGoalWeight", state.settings.goalWeight);
  setVal("setCurrentWeight", state.settings.currentWeight);

  const tl = document.getElementById("trainingLevel");
  if(tl) tl.value = String(state.settings.trainingLevel ?? 1);

  // Stats
  const st = p.stats;
  document.getElementById("statSTR").textContent = String(st.STR ?? 0);
  document.getElementById("statEND").textContent = String(st.END ?? 0);
  document.getElementById("statREC").textContent = String(st.REC ?? 0);
  document.getElementById("statDISC").textContent = String(st.DISC ?? 0);

  renderTrainingCards();
  renderSummary();
  renderMeasurements();
  renderTrend();
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

  document.getElementById("exportDataBtn")?.addEventListener("click", exportJson);
  document.getElementById("importFile")?.addEventListener("change", (e)=>{
    const f = e.target.files?.[0];
    if(f) importJsonFile(f);
  });

  document.getElementById("exportHunterIdBtn")?.addEventListener("click", exportHunterId);
  document.getElementById("openCrateBtn")?.addEventListener("click", openCrate);
}

function renderTrainingCards(){
  const box = document.getElementById("trainingCards");
  if(!box) return;
  box.innerHTML = "";
  const lvl = Number(state.settings.trainingLevel || 1);

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
    <div class="box"><span>Crates</span><strong>${state.meta.crates}</strong></div>
    <div class="box"><span>Streak</span><strong>${state.meta.streak} (Best ${state.meta.bestStreak})</strong></div>
    <div class="box"><span>Eltérés (kg)</span><strong>${delta.toFixed(1)}</strong></div>
    <div class="box"><span>Célig hátra (kg)</span><strong>${toGoal.toFixed(1)}</strong></div>
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
    renderTrend();
  });
}

/* ---------- Trend chart (30 days) ---------- */
function renderTrend(){
  const canvas = document.getElementById("trendCanvas");
  if(!canvas) return;
  const ctx = canvas.getContext("2d");
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0,0,w,h);

  // Build last 30 days series
  const days = [];
  const today = new Date();
  for(let i=29;i>=0;i--){
    const d = addDays(today, -i);
    const key = fmtDate(d);
    const q = state.quests[key] || {};
    days.push({
      key,
      steps: Number(q.steps||0) || 0,
      sleep: Number(q.sleep||0) || 0,
      weight: (q.weight!=="" && q.weight!=null) ? (Number(q.weight)||0) : null
    });
  }

  const padL=48, padR=12, padT=14, padB=28;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;

  const maxSteps = Math.max(1000, ...days.map(d=>d.steps));
  const maxSleep = Math.max(1, ...days.map(d=>d.sleep));
  const weights = days.map(d=>d.weight).filter(v=>v!=null && v>0);
  const minW = weights.length? Math.min(...weights): 60;
  const maxW = weights.length? Math.max(...weights): 100;

  // grid
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 1;
  for(let i=0;i<=4;i++){
    const y = padT + (plotH/4)*i;
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w-padR, y); ctx.stroke();
  }

  // axes labels
  ctx.fillStyle = "rgba(233,238,252,0.65)";
  ctx.font = "12px ui-monospace,monospace";
  ctx.fillText("30 nap", padL, h-10);

  // helper mapping
  const xOf = (i)=> padL + (plotW*(i/(days.length-1)));
  const ySteps = (v)=> padT + plotH*(1 - (v/maxSteps));
  const ySleep = (v)=> padT + plotH*(1 - (v/maxSleep));
  const yWeight = (v)=> padT + plotH*(1 - ((v-minW)/Math.max(1,(maxW-minW))));

  // Draw series
  function drawLine(getX, getY, color){
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    let started=false;
    for(let i=0;i<days.length;i++){
      const x=getX(i);
      const y=getY(days[i]);
      if(y==null || Number.isNaN(y)) continue;
      if(!started){ ctx.moveTo(x,y); started=true; }
      else ctx.lineTo(x,y);
    }
    ctx.stroke();
  }

  drawLine(xOf, (d)=>ySteps(d.steps), "rgba(60,230,165,0.85)"); // steps
  drawLine(xOf, (d)=>ySleep(d.sleep), "rgba(255,204,102,0.85)"); // sleep
  if(weights.length){
    drawLine(xOf, (d)=> d.weight? yWeight(d.weight): null, "rgba(124,92,255,0.85)"); // weight
  }

  // Legend
  ctx.fillStyle = "rgba(233,238,252,0.75)";
  ctx.font = "12px ui-monospace,monospace";
  ctx.fillText("Steps", padL, 14);
  ctx.fillText("Sleep", padL+90, 14);
  ctx.fillText("Weight", padL+180, 14);
}

/* ---------- Quests generation from daily_plan_2026 ---------- */
function truthyCell(v){
  if(v === null || v === undefined) return false;
  const s = String(v).trim().toLowerCase();
  if(!s) return false;
  if(["0","no","n","nem","-","false","off"].includes(s)) return false;
  return true;
}
// Date key extractor: tries multiple names/formats
function extractDateKey(row){
  if(!row) return null;
  const candidates = ["Dátum","Datum","date","Date"];
  let raw = null;
  for(const k of candidates){
    if(row[k]){ raw = row[k]; break; }
  }
  if(!raw) return null;
  const s = String(raw).trim();
  if(/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m1 = s.match(/^(\d{4})[.\-/ ]+(\d{1,2})[.\-/ ]+(\d{1,2})/);
  if(m1){
    const y=m1[1], mo=String(m1[2]).padStart(2,"0"), d=String(m1[3]).padStart(2,"0");
    return `${y}-${mo}-${d}`;
  }
  // Excel serial date (rare): try parse number as days since 1899-12-30
  const n = Number(s);
  if(!Number.isNaN(n) && n > 40000 && n < 60000){
    const base = new Date(Date.UTC(1899,11,30));
    const dd = new Date(base.getTime() + n*86400000);
    return fmtDate(dd);
  }
  return null;
}
function ensureQuestDay(dateKey){
  if(!state.quests[dateKey]){
    state.quests[dateKey] = { checks:{}, steps:"", sleep:"", weight:"", closed:false, cleared:false };
  }else{
    state.quests[dateKey].checks ??= {};
    state.quests[dateKey].closed ??= false;
    state.quests[dateKey].cleared ??= false;
  }
  return state.quests[dateKey];
}

function buildQuestsFromDailyRow(row, dateKey){
  const quests = [];

  // Edzés javaslat
  const workout = row?.["Edzés javaslat"] ?? row?.["Edzes javaslat"] ?? row?.["Edzés"] ?? row?.["Edzes"] ?? null;
  if(truthyCell(workout)){
    quests.push({ id:`q_${dateKey}_edzes`, text:`Edzés: ${String(workout).trim()}`, exp:30, tag:"STR" });
  }

  // chores
  const chores = [
    [["Mosogatás","Mosogatas"],"Mosogatás",10,"DISC"],
    [["Ruhamosás","Ruhamosas"],"Ruhamosás",10,"DISC"],
    [["Takarítás","Takaritas"],"Takarítás",10,"DISC"],
    [["Főzés","Fozes"],"Főzés",10,"DISC"],
    [["Barátok","Baratok"],"Barátok",10,"REC"],
  ];
  for(const [keys,label,exp,tag] of chores){
    let v = null;
    for(const k of keys){ if(row?.[k] !== undefined){ v = row[k]; break; } }
    if(truthyCell(v)){
      quests.push({ id:`q_${dateKey}_${label.toLowerCase().replace(/ő/g,"o").replace(/á/g,"a").replace(/ /g,"_")}`, text:label, exp, tag });
    }
  }

  // shift based
  const shift = String(row?.["Műszak"] ?? row?.["Muszak"] ?? row?.["Shift"] ?? "").toLowerCase();
  if(shift.includes("éj") || shift.includes("ej") || shift.includes("night")){
    quests.push({ id:`q_${dateKey}_regen`, text:"Regeneráció: 10 perc nyújtás / lazítás", exp:15, tag:"REC" });
  }

  // Daily modifier extra quest (if any)
  const mod = getDailyModifier(dateKey);
  if(mod.extraQuest){
    quests.push({ id: mod.extraQuest.id, text: mod.extraQuest.text, exp: mod.extraQuest.exp, tag: mod.extraQuest.tag, specialMult: mod.extraQuest.mult || 1.0 });
  }

  // fallback
  if(quests.length===0){
    quests.push({ id:`q_${dateKey}_min`, text:"Napi minimum: 10 perc séta", exp:10, tag:"END" });
  }

  return quests;
}

/* ---------- Daily clear + streak ---------- */
function dayIsComplete(dateKey, questsList){
  const d = ensureQuestDay(dateKey);
  const allChecks = questsList.every(q=> !!d.checks[q.id]);
  const hasSteps = String(d.steps||"").trim() !== "";
  const hasSleep = String(d.sleep||"").trim() !== "";
  const hasWeight = String(d.weight||"").trim() !== "";
  return allChecks && hasSteps && hasSleep && hasWeight;
}

function closeDay(dateKey, questsList){
  const d = ensureQuestDay(dateKey);
  if(d.closed) return;

  // Allow “close anyway” but daily clear bonus only if complete
  const complete = dayIsComplete(dateKey, questsList);
  d.closed = true;
  d.closeTs = Date.now();

  // streak handling
  ensureWeeklyTokenReset(dateKey);

  const prev = state.meta.lastClosedDate;
  if(prev){
    const prevDate = new Date(prev);
    const curDate = new Date(dateKey);
    const diffDays = Math.round((curDate - prevDate)/86400000);
    if(diffDays === 1){
      state.meta.streak += 1;
    }else if(diffDays > 1){
      // streak break: use token if available and only one day missing
      if(diffDays === 2 && state.meta.tokens > 0){
        state.meta.tokens -= 1;
        state.meta.streak += 1;
      }else{
        state.meta.streak = 1;
      }
    }else{
      // same day / past edits
      // don't change streak
    }
  }else{
    state.meta.streak = 1;
  }
  state.meta.bestStreak = Math.max(state.meta.bestStreak, state.meta.streak);
  state.meta.lastClosedDate = dateKey;

  // Rewards
  if(complete){
    // Daily clear bonus
    const streakMult = 1 + clamp(state.meta.streak, 0, 30)*0.005; // up to +15%
    const discBonus = 1 + (state.profile.stats.DISC||0)*0.005;
    const bonus = Math.round(50 * streakMult * discBonus);
    grantExp(bonus);

    // Crate: 1 per day
    state.meta.crates += 1;
    state.meta.lastCrateDate = dateKey;
    // Unlock titles at milestones
    if(state.meta.streak >= 7) addTitle("Streak Master");
    if(state.meta.streak >= 30) addTitle("Dungeon Legend");
    addBadge("Dungeon Clear");
  }

  saveState();
}

/* ---------- Quests view ---------- */
function getActiveMonth(){
  const v = document.getElementById("activeMonth")?.value;
  return (v && /^\d{4}-\d{2}$/.test(v)) ? v : state.ui.activeMonth;
}
function getActiveDate(){
  const v = document.getElementById("activeDate")?.value;
  return (v && /^\d{4}-\d{2}-\d{2}$/.test(v)) ? v : state.ui.activeDate;
}
function setActiveControls(monthKey, dateKey){
  const m = document.getElementById("activeMonth");
  const d = document.getElementById("activeDate");
  if(m) m.value = monthKey;
  if(d) d.value = dateKey;
}

function renderWeeklyCard(activeKey){
  const ch = getWeeklyChallenge(activeKey);
  const p = computeWeeklyProgress(ch);
  const progSteps = Math.min(1, p.steps / ch.stepsTarget);
  const progSleep = Math.min(1, p.sleep / ch.sleepTarget);
  const progClears = Math.min(1, p.clears / ch.clearsTarget);
  const prog = (progSteps + progSleep + progClears) / 3;

  document.getElementById("weeklyHint").textContent =
    `Cél: ${ch.stepsTarget} lépés + ${ch.sleepTarget} óra alvás + ${ch.clearsTarget} lezárt nap (jutalom: ${ch.rewardExp} EXP + ${ch.rewardCrate} crate)`;
  document.getElementById("weeklyPill").textContent = `Hét: ${ch.weekKey}`;
  document.getElementById("weeklyProgLabel").textContent =
    `${p.steps}/${ch.stepsTarget} · ${p.sleep}/${ch.sleepTarget} · ${p.clears}/${ch.clearsTarget}`;
  document.getElementById("weeklyProgFill").style.width = `${Math.round(prog*100)}%`;

  const btn = document.getElementById("claimWeeklyBtn");
  const ok = canClaimWeekly(ch);
  const claimed = !!state.meta.weeklyClaims[ch.weekKey];
  btn.disabled = claimed || !ok;
  btn.textContent = claimed ? "Jutalom felvéve" : (ok ? "Jutalom felvétele" : "Még nem kész");
}

function renderQuests(){
  const todayKey = fmtDate(new Date());
  document.getElementById("todayPill").textContent = `Ma: ${todayKey}`;

  // init controls
  let activeMonth = state.ui.activeMonth || todayKey.slice(0,7);
  let activeKey = state.ui.activeDate || todayKey;
  setActiveControls(activeMonth, activeKey);

  activeMonth = getActiveMonth();
  activeKey = getActiveDate();

  // keep date within month
  if(activeKey.slice(0,7) !== activeMonth){
    activeKey = `${activeMonth}-01`;
    setActiveControls(activeMonth, activeKey);
  }

  state.ui.activeMonth = activeMonth;
  state.ui.activeDate = activeKey;
  ensureWeeklyTokenReset(activeKey);
  saveState();

  document.getElementById("activeDayPill").textContent = `Aktív: ${activeKey}`;

  // daily mod pill (active day)
  const mod = getDailyModifier(activeKey);
  document.getElementById("dailyModPill").textContent = `Napi mod: ${mod.name} (x${mod.expMult})`;

  // index daily plan
  const byDate = {};
  if(Array.isArray(data.daily_plan_2026)){
    for(const r of data.daily_plan_2026){
      const dk = extractDateKey(r);
      if(dk) byDate[dk] = r;
    }
  }

  // weekly card
  renderWeeklyCard(activeKey);

  const weekStart = startOfWeek(new Date(activeKey));
  const strip = document.getElementById("weekStrip");
  strip.innerHTML = "";

  for(let i=0;i<7;i++){
    const key = fmtDate(addDays(weekStart,i));
    const isActive = key === activeKey;
    const withinMonth = key.slice(0,7) === activeMonth;

    const dayState = ensureQuestDay(key);
    const locked = dayState.closed || !withinMonth || !isActive;

    const row = byDate[key] || null;
    const questsList = buildQuestsFromDailyRow(row, key);

    const dayName = (row?.["Nap"] ?? row?.["Day"] ?? ["Hétfő","Kedd","Szerda","Csütörtök","Péntek","Szombat","Vasárnap"][i]);
    const shiftTxt = row?.["Műszak"] ?? row?.["Muszak"] ?? row?.["Shift"] ?? "-";
    const timeTxt = row?.["Idő"] ?? row?.["Ido"] ?? row?.["Time"] ?? "";

    const card = document.createElement("div");
    card.className = "dayCard" + (locked ? " lock" : "");
    const modDay = getDailyModifier(key);

    const complete = dayIsComplete(key, questsList);
    const statusText = dayState.closed ? "LEZÁRVA" : (isActive ? "AKTÍV" : "ZÁRT");

    card.innerHTML = `
      <div class="dayHead">
        <div class="dayName">${dayName}</div>
        <div class="dayDate">${key}</div>
      </div>

      <div class="itemMeta">
        ${row ? `Műszak: <b>${shiftTxt}</b>${timeTxt ? " · "+timeTxt : ""}` : "Nincs adat ehhez a naphoz a Napi terv 2026-ban."}
        · <b>Mod:</b> ${modDay.name}
        ${dayState.closed ? " · <b>LEZÁRVA</b>" : ""}
      </div>

      <div class="stack" id="checks_${key}"></div>

      <div class="kpi">
        <div class="k"><span>Lépés (db)</span><strong><input ${locked?"disabled":""} inputmode="numeric" id="steps_${key}" value="${dayState.steps ?? ""}" placeholder="0"></strong></div>
        <div class="k"><span>Alvás (óra)</span><strong><input ${locked?"disabled":""} inputmode="decimal" id="sleep_${key}" value="${dayState.sleep ?? ""}" placeholder="0"></strong></div>
        <div class="k"><span>Súly (kg)</span><strong><input ${locked?"disabled":""} inputmode="decimal" id="weight_${key}" value="${dayState.weight ?? ""}" placeholder="0"></strong></div>
      </div>

      <div class="row" style="margin-top:10px">
        <button class="btn ${locked?"ghost":""}" id="save_${key}" ${locked?"disabled":""}>Nap lezárása</button>
        <div class="pill">Státusz: <span>${statusText}${complete ? " · CLEAR ✓" : ""}</span></div>
      </div>
    `;
    strip.appendChild(card);

    // checklist
    const box = card.querySelector(`#checks_${key}`);
    questsList.forEach(q=>{
      const checked = !!dayState.checks[q.id];
      const expShow = q.specialMult ? Math.round(q.exp*q.specialMult) : q.exp;
      const line = document.createElement("div");
      line.className = "check";
      line.innerHTML = `
        <label>${q.text} <span style="color:var(--muted); font-family:var(--mono)">(+${expShow} EXP)</span></label>
        <input type="checkbox" ${checked?"checked":""} ${locked?"disabled":""} />
      `;
      box.appendChild(line);

      const cb = line.querySelector("input");
      cb.addEventListener("change", ()=>{
        if(locked) return;
        const prev = !!dayState.checks[q.id];
        dayState.checks[q.id] = cb.checked;

        // EXP on false -> true
        if(!prev && cb.checked){
          const base = q.specialMult ? Math.round(q.exp*q.specialMult) : q.exp;
          grantExpWithContext(base, key, q.tag || "DISC");
        }
        saveState();
        renderWeeklyCard(activeKey);
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
        renderWeeklyCard(activeKey);
        renderTrend();
      });
    };
    bind(`#steps_${key}`,"steps");
    bind(`#sleep_${key}`,"sleep");
    bind(`#weight_${key}`,"weight");

    // Close day button
    card.querySelector(`#save_${key}`)?.addEventListener("click", ()=>{
      if(locked) return;
      closeDay(key, questsList);
      renderProfile();
      renderWeeklyCard(activeKey);
      renderQuests();
    });
  }

  // Global lock/unlock for active day
  const activeDay = ensureQuestDay(activeKey);
  const lockBtn = document.getElementById("lockDayBtn");
  const unlockBtn = document.getElementById("unlockDayBtn");

  lockBtn.disabled = activeDay.closed;
  lockBtn.onclick = ()=>{
    if(activeDay.closed) return;
    const row = byDate[activeKey] || null;
    const questsList = buildQuestsFromDailyRow(row, activeKey);
    closeDay(activeKey, questsList);
    renderProfile();
    renderWeeklyCard(activeKey);
    renderQuests();
  };

  unlockBtn.disabled = !activeDay.closed;
  unlockBtn.onclick = ()=>{
    activeDay.closed = false;
    saveState();
    renderQuests();
  };
}

function bindQuestsSelectors(){
  const activeMonthEl = document.getElementById("activeMonth");
  const activeDateEl = document.getElementById("activeDate");

  activeMonthEl?.addEventListener("change", ()=>{
    state.ui.activeMonth = activeMonthEl.value;
    state.ui.activeDate = `${activeMonthEl.value}-01`;
    if(activeDateEl) activeDateEl.value = state.ui.activeDate;
    saveState();
    renderQuests();
  });

  activeDateEl?.addEventListener("change", ()=>{
    state.ui.activeDate = activeDateEl.value;
    state.ui.activeMonth = activeDateEl.value.slice(0,7);
    if(activeMonthEl) activeMonthEl.value = state.ui.activeMonth;
    saveState();
    renderQuests();
  });

  // Quick add
  document.getElementById("addSteps2k")?.addEventListener("click", ()=>quickAdd("steps", 2000));
  document.getElementById("addSteps5k")?.addEventListener("click", ()=>quickAdd("steps", 5000));
  document.getElementById("addSleep05")?.addEventListener("click", ()=>quickAdd("sleep", 0.5));
  document.getElementById("addSleep1")?.addEventListener("click", ()=>quickAdd("sleep", 1.0));

  // Weekly claim
  document.getElementById("claimWeeklyBtn")?.addEventListener("click", ()=>{
    const activeKey = state.ui.activeDate;
    const ch = getWeeklyChallenge(activeKey);
    if(!canClaimWeekly(ch)) return setStatus("NEM KÉSZ");
    state.meta.weeklyClaims[ch.weekKey] = true;
    // rewards
    grantExp(ch.rewardExp);
    state.meta.crates += ch.rewardCrate;
    addTitle("Dungeon Runner");
    addBadge("Iron Will");
    saveState();
    renderProfile();
    renderQuests();
    setStatus("WEEKLY CLEAR");
  });
}

function quickAdd(field, amount){
  const key = state.ui.activeDate;
  const d = ensureQuestDay(key);
  if(d.closed) return setStatus("LEZÁRVA");

  if(field==="steps"){
    const cur = Number(d.steps||0) || 0;
    d.steps = String(cur + amount);
  }else if(field==="sleep"){
    const cur = Number(d.sleep||0) || 0;
    d.sleep = String(Math.round((cur + amount)*10)/10);
  }
  saveState();
  renderQuests();
}

/* ---------- Schedule & Meal ---------- */
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
    .slice(0, 40);

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

  rows.slice(0, 40).forEach(r=>{
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

  // Render immediately (no blank UI)
  renderProfile();
  renderQuests();
  renderSchedule();
  renderMeal();

  // Load JSONs and rerender
  const loaded = await loadAllData();
  data = { ...data, ...loaded };

  // merge defaults from JSON settings only if local empty
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
