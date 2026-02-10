/* Solo Leveling Tracker 2026
   - Gamified fitness tracker (localStorage)
   - v2026.02 (Boss Fight + Penalty + Heatmap + PWA-lite + Backup + Excel import + Focus mode + Anti-cheat + Avatar + Weather)
*/

const APP_VERSION = "2026.02.10";
const LS_KEY = "st2026_state_v1";
const DATA_OVERRIDE_KEY = "st2026_data_override_v1";

/* ---------- Utilities ---------- */
const pad2 = (n)=> String(n).padStart(2,"0");
function fmtDate(d){
  return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
}
function fmtMonth(d){ return `${d.getFullYear()}-${pad2(d.getMonth()+1)}`; }
function parseDateKey(s){
  if(!s) return null;
  const m = String(s).match(/(\d{4})-(\d{2})-(\d{2})/);
  if(!m) return null;
  const y=+m[1], mo=+m[2], da=+m[3];
  const dt=new Date(y,mo-1,da);
  if(Number.isNaN(dt.getTime())) return null;
  return fmtDate(dt);
}
function startOfMonthDate(monthKey){
  const m = String(monthKey||"").match(/(\d{4})-(\d{2})/);
  if(!m) return new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  return new Date(+m[1], +m[2]-1, 1);
}
function endOfMonthMs(monthKey){
  const d = startOfMonthDate(monthKey);
  const next = new Date(d.getFullYear(), d.getMonth()+1, 1);
  return next.getTime() - 1;
}
function clamp(n,min,max){ return Math.max(min, Math.min(max,n)); }
function safeNumber(v, fallback=0){
  const n = Number(String(v).replace(",",".").trim());
  return Number.isFinite(n) ? n : fallback;
}
function truthyCell(v){
  if(v==null) return false;
  if(typeof v === "number") return v !== 0 && !Number.isNaN(v);
  const s = String(v).trim();
  if(!s) return false;
  const low = s.toLowerCase();
  if(low==="0" || low==="nem" || low==="no" || low==="false") return false;
  return true;
}

function escapeHtml(s){
  return String(s ?? "").replace(/[&<>"']/g, (ch)=>{
    switch(ch){
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case "\"": return "&quot;";
      case "'": return "&#39;";
      default: return ch;
    }
  });
}

function setStatus(msg){
  const el=document.getElementById("statusMsg");
  if(el) el.textContent = msg;
  if(msg) setTimeout(()=>{ const e=document.getElementById("statusMsg"); if(e && e.textContent===msg) e.textContent=""; }, 2500);
}

/* ---------- Perks & Rarity ---------- */
const RARITY_ORDER = ["Common","Rare","Epic","Legendary"];
const RARITY_COLOR = {
  Common: "var(--muted)",
  Rare: "var(--accent)",
  Epic: "var(--warn)",
  Legendary: "var(--good)"
};

const PERKS = [
  { id:"perk_weekly_crate", name:"+1 crate hetente", desc:"Heti jutalom felvételekor +1 crate extra." },
  { id:"perk_daily_clear_bonus", name:"Daily clear EXP +10%", desc:"Daily clear jutalom EXP +10%." },
  { id:"perk_streak_token_plus", name:"Streak token +1/ hét", desc:"Hetente +1 extra token." },
  { id:"perk_boss_reward_plus", name:"Boss reward +20%", desc:"Havi Boss EXP +20% + jobb drop esély." }
];

const COLLECTIONS = [
  { id:"night_shift_set", name:"Night Shift Set", badges:["Night Shift","Shadow Coffee","Iron Will"], bonus:"+5% EXP (minden jutalom)" },
  { id:"discipline_set", name:"Discipline Set", badges:["Daily Clear","Streak Keeper","No Excuses"], bonus:"+1 token / hét" }
];

/* ---------- Monthly Boss (Solo Leveling) ---------- */
const MONTHLY_BOSS_ROSTER = [
  { id:"kasaka", name:"Blue Venom-Fanged Kasaka" },
  { id:"igris", name:"Blood-Red Commander Igris" },
  { id:"baruka", name:"Baruka" },
  { id:"kargalgan", name:"Kargalgan" },
  { id:"vulcan", name:"Vulcan" },
  { id:"metus", name:"Metus" },
  { id:"ant_king", name:"Ant King" },
  { id:"baran", name:"Baran" },
  { id:"kandiaru", name:"Kandiaru" },
  { id:"kamish", name:"Kamish" },
  { id:"legia", name:"Legia" },
  { id:"cerberus", name:"Cerberus" }
];
function bossIndexForMonth(monthKey){
  const mm = String(monthKey||"").match(/(\d{4})-(\d{2})/);
  const y = mm ? parseInt(mm[1],10) : new Date().getFullYear();
  const mo = mm ? parseInt(mm[2],10) : (new Date().getMonth()+1);
  const seed = y*12 + (mo-1);
  const len = MONTHLY_BOSS_ROSTER.length;
  return ((seed % len) + len) % len;
}
function monthKeyFromDateKey(dateKey){
  const dk = parseDateKey(dateKey) || fmtDate(new Date());
  return String(dk).slice(0,7);
}


/* ---------- State ---------- */
function defaultState(){
  const today = fmtDate(new Date());
  const month = fmtMonth(new Date());
  return {
    version: 2,
    appVersion: APP_VERSION,
    settings: {
      startWeight: "",
      goalWeight: "",
      currentWeight: "",
      trainingLevel: 1,
      antiCheat: true,
      notifDaily: false,
      city: "Budapest"
    },
    profile: {
      exp: 0,
      level: 1,
      statPoints: 0,
      stats: { STR:0, END:0, REC:0, DISC:0 },
      perkPoints: 0,
      perks: [],
      title: "Rookie Hunter",
      avatarDataUrl: ""
    },
    cosmetics: {
      badges: [{ name:"Rookie", rarity:"Common" }],
      pinnedBadges: ["Rookie","",""],
      equippedFrame: "Default"
    },
    meta: {
      streak: 0,
      bestStreak: 0,
      lastClosedDate: "",
      tokens: 1,
      tokenWeekKey: "",
      crates: 0,
      lastCrateDate: "",
      openedCrates: 0,
      weeklyClaims: {}, // weekKey -> true
      manualEdits: [], // {dateKey, ts, reason}
      penaltyMonths: 0,
      penaltyMonthKeyLastCounted: ""
    },
    penalty: {
      monthKey: month,
      active: false,
      stage: 0,
      expiresAt: 0,
      resolved: false,
      completedAt: 0
    },
    boss: {
      byMonth: {} // monthKey -> {bossId, bossName, type, completed, completedAt}
    },
    quests: {}, // dateKey -> { closed, checks: {}, steps:"", sleep:"", weight:"", note:"", manualEdited:false }
    measurements: [],
    routines: {}, // dateKey -> { type, locked }
    ui: {
      activeMonth: month,
      activeDate: today,
      focusMode: false
    }
  };
}

function migrateState(s){
  const d = defaultState();
  if(!s || typeof s !== "object") return d;

  // Keep existing fields where possible
  const out = { ...d, ...s };
  out.settings = { ...d.settings, ...(s.settings||{}) };
  out.profile = { ...d.profile, ...(s.profile||{}) };
  out.profile.stats = { ...d.profile.stats, ...((s.profile||{}).stats||{}) };

  out.cosmetics = { ...d.cosmetics, ...(s.cosmetics||{}) };
  // badges migration: string[] -> objects
  if(Array.isArray(out.cosmetics.badges)){
    out.cosmetics.badges = out.cosmetics.badges.map(b=>{
      if(!b) return null;
      if(typeof b === "string") return { name:b, rarity:"Common" };
      if(typeof b === "object" && b.name) return { name:String(b.name), rarity: b.rarity && RARITY_ORDER.includes(b.rarity) ? b.rarity : "Common" };
      return null;
    }).filter(Boolean);
  }else{
    out.cosmetics.badges = [{name:"Rookie",rarity:"Common"}];
  }
  if(!Array.isArray(out.cosmetics.pinnedBadges) || out.cosmetics.pinnedBadges.length!==3){
    const first = out.cosmetics.badges?.[0]?.name || "Rookie";
    out.cosmetics.pinnedBadges = [first,"",""];
  }

  out.meta = { ...d.meta, ...(s.meta||{}) };
  out.penalty = { ...d.penalty, ...(s.penalty||{}) };
  out.boss = { ...d.boss, ...(s.boss||{}) };
  out.boss.byMonth = (out.boss.byMonth && typeof out.boss.byMonth === "object") ? out.boss.byMonth : {};
  // legacy migration (daily boss -> monthly boss)
  if(out.boss.byDate && typeof out.boss.byDate === "object"){
    for(const [dk, b] of Object.entries(out.boss.byDate)){
      if(!b || !b.type) continue;
      const mk = String(dk).slice(0,7);
      const roster = MONTHLY_BOSS_ROSTER[bossIndexForMonth(mk)];
      const cur = out.boss.byMonth[mk];
      if(!cur){
        out.boss.byMonth[mk] = { bossId: roster.id, bossName: roster.name, type: b.type, completed: !!b.completed, completedAt: 0 };
      }else{
        cur.bossId = cur.bossId || roster.id;
        cur.bossName = cur.bossName || roster.name;
        if(!cur.type) cur.type = b.type;
        cur.completed = !!cur.completed || !!b.completed;
        cur.completedAt = Number(cur.completedAt||0);
      }
    }
    delete out.boss.byDate;
  }
  out.quests = (s.quests && typeof s.quests==="object") ? s.quests : {};
  out.measurements = Array.isArray(s.measurements) ? s.measurements : [];
  out.routines = (s.routines && typeof s.routines==="object") ? s.routines : {};
  out.ui = { ...d.ui, ...(s.ui||{}) };

  // normalize keys
  out.settings.trainingLevel = clamp(Number(out.settings.trainingLevel||1),1,5);
  out.settings.antiCheat = !!out.settings.antiCheat;
  out.settings.notifDaily = !!out.settings.notifDaily;
  out.settings.city = out.settings.city || "Budapest";

  out.profile.level = Math.max(1, Number(out.profile.level||1));
  out.profile.exp = Math.max(0, Number(out.profile.exp||0));
  out.profile.statPoints = Math.max(0, Number(out.profile.statPoints||0));
  out.profile.perkPoints = Math.max(0, Number(out.profile.perkPoints||0));
  out.profile.perks = Array.isArray(out.profile.perks) ? out.profile.perks : [];
  out.profile.title = out.profile.title || "Rookie Hunter";
  out.profile.avatarDataUrl = out.profile.avatarDataUrl || "";

  out.ui.activeMonth = out.ui.activeMonth || fmtMonth(new Date());
  out.ui.activeDate = out.ui.activeDate || fmtDate(new Date());
  out.ui.focusMode = !!out.ui.focusMode;

  out.penalty.monthKey = out.penalty.monthKey || out.ui.activeMonth;
  out.penalty.stage = Number(out.penalty.stage||0);
  out.penalty.expiresAt = Number(out.penalty.expiresAt||0);
  out.penalty.active = !!out.penalty.active;
  out.penalty.resolved = !!out.penalty.resolved;
  out.penalty.completedAt = Number(out.penalty.completedAt||0);

  out.appVersion = APP_VERSION;
  return out;
}

function loadState(){
  try{
    const raw = localStorage.getItem(LS_KEY);
    if(!raw) return defaultState();
    return migrateState(JSON.parse(raw));
  }catch{
    return defaultState();
  }
}
function saveState(){
  try{
    localStorage.setItem(LS_KEY, JSON.stringify(state));
  }catch(e){
    console.warn("Save failed", e);
    setStatus("MENTÉS HIBA");
  }
}

/* ---------- Local data override (Excel import) ---------- */
function loadDataOverride(){
  try{
    const raw = localStorage.getItem(DATA_OVERRIDE_KEY);
    if(!raw) return null;
    const d = JSON.parse(raw);
    return (d && typeof d === "object") ? d : null;
  }catch{
    return null;
  }
}
function saveDataOverride(obj){
  localStorage.setItem(DATA_OVERRIDE_KEY, JSON.stringify(obj));
}
function clearDataOverride(){
  localStorage.removeItem(DATA_OVERRIDE_KEY);
}

/* ---------- Fetch JSON ---------- */
async function safeFetchJson(url){
  try{
    const r = await fetch(url, { cache: "no-store" });
    if(!r.ok) throw new Error(String(r.status));
    return await r.json();
  }catch{
    return null;
  }
}
async function loadAllData(){
  const ov = loadDataOverride();
  if(ov){
    return {
      settings: ov.settings ?? null,
      training_levels: ov.training_levels ?? null,
      daily_plan_2026: ov.daily_plan_2026 ?? null,
      menu_2026: ov.menu_2026 ?? null,
      calendar_2026: ov.calendar_2026 ?? null,
      routine_templates: ov.routine_templates ?? null
    };
  }
  const out = {};
  out.settings = await safeFetchJson("./data/settings.json");
  out.training_levels = await safeFetchJson("./data/training_levels.json");
  out.daily_plan_2026 = await safeFetchJson("./data/daily_plan_2026.json");
  out.menu_2026 = await safeFetchJson("./data/menu_2026.json");
  out.calendar_2026 = await safeFetchJson("./data/calendar_2026.json");
  out.routine_templates = await safeFetchJson("./data/routine_templates.json");
  return out;
}

/* ---------- Derived helper (data) ---------- */
function extractDateKey(row){
  if(!row || typeof row !== "object") return null;
  const cand = row["Dátum"] ?? row["Datum"] ?? row["date"] ?? row["Date"];
  return parseDateKey(cand);
}
function normalizeShiftCode(v){
  if(v==null) return "";
  const s = String(v).trim().toUpperCase();
  if(!s) return "";
  if(s==="E" || s==="É" || s.includes("ÉJ") || s.includes("EJ")) return "É";
  if(s==="N" || s.includes("NAP")) return "N";
  if(s==="P" || s.includes("SZAB") || s.includes("PIH")) return "P";
  // full words
  if(s.includes("NAPP")) return "N";
  if(s.includes("ÉJS")) return "É";
  return s;
}
function indexByDate(arr){
  const m = {};
  if(Array.isArray(arr)){
    for(const r of arr){
      const dk = extractDateKey(r);
      if(dk) m[dk]=r;
    }
  }
  return m;
}
function getWorkoutSuggestion(row){
  if(!row) return "";
  return String(row["Edzés javaslat"] ?? row["Edzes javaslat"] ?? row["Edzés"] ?? row["Edzes"] ?? "").trim();
}

/* ---------- Core progression ---------- */
function expToNext(level){
  // simple curve
  return 120 + (level-1) * 40;
}
function getPerkEffects(){
  const perks = new Set(state.profile.perks || []);
  return {
    weeklyCratePlus: perks.has("perk_weekly_crate") ? 1 : 0,
    dailyClearBonus: perks.has("perk_daily_clear_bonus") ? 0.10 : 0,
    weeklyTokenPlus: perks.has("perk_streak_token_plus") ? 1 : 0,
    bossRewardPlus: perks.has("perk_boss_reward_plus") ? 0.20 : 0
  };
}
function getCollectionExpBonus(){
  // minimal: if a collection is complete, apply +5% per collection that says so
  const owned = new Set((state.cosmetics.badges||[]).map(b=>b.name));
  let bonus = 0;
  for(const c of COLLECTIONS){
    const ok = c.badges.every(b=> owned.has(b));
    if(ok && /EXP/i.test(c.bonus)) bonus += 0.05;
  }
  return bonus;
}

function addExp(amount, reason=""){
  const effects = getPerkEffects();
  const collectionBonus = getCollectionExpBonus();
  let gain = Math.max(0, Math.floor(amount));
  if(collectionBonus>0) gain = Math.floor(gain * (1 + collectionBonus));

  state.profile.exp += gain;

  // Level up loop
  let leveled = false;
  while(state.profile.exp >= expToNext(state.profile.level)){
    state.profile.exp -= expToNext(state.profile.level);
    state.profile.level += 1;
    state.profile.statPoints += 1;
    state.profile.perkPoints += 1;
    leveled = true;
  }
  if(leveled){
    setStatus(`LEVEL UP! Lv ${state.profile.level}`);
  }else if(reason){
    setStatus(`+${gain} EXP (${reason})`);
  }else{
    setStatus(`+${gain} EXP`);
  }
  saveState();
}

function addCrates(n){
  state.meta.crates = Math.max(0, Number(state.meta.crates||0) + n);
  saveState();
}

/* ---------- Inventory ---------- */
function ensureInventory(){
  state.cosmetics ??= {};
  if(!Array.isArray(state.cosmetics.badges)) state.cosmetics.badges = [{name:"Rookie",rarity:"Common"}];
  if(!Array.isArray(state.cosmetics.pinnedBadges) || state.cosmetics.pinnedBadges.length!==3){
    const first = state.cosmetics.badges?.[0]?.name || "Rookie";
    state.cosmetics.pinnedBadges = [first,"",""];
  }
}
function hasBadge(name){
  return (state.cosmetics.badges||[]).some(b=> b.name === name);
}
function addBadge(name, rarity="Common"){
  ensureInventory();
  if(hasBadge(name)) return false;
  const r = RARITY_ORDER.includes(rarity) ? rarity : "Common";
  state.cosmetics.badges.push({name, rarity:r});
  saveState();
  return true;
}
function pickRarity(weights){
  // weights object {Common:x, Rare:y,...} sum doesn't have to be 1
  const entries = RARITY_ORDER.map(r=> [r, Math.max(0, Number(weights?.[r]||0))]);
  const sum = entries.reduce((a,[_r,w])=>a+w,0);
  if(sum<=0) return "Common";
  let t = Math.random()*sum;
  for(const [r,w] of entries){
    t -= w;
    if(t<=0) return r;
  }
  return "Common";
}
function randomBadgeName(rarity){
  const pool = {
    Common: ["Daily Clear","Gate Opener","Dungeon Walker","No Excuses","Night Shift","Rookie+","Shadow Coffee"],
    Rare: ["Iron Will","Streak Keeper","Hunter's Focus","Boss Hunter","Blue Flame"],
    Epic: ["Shadow Monarch's Favor","A-Rank Discipline","Unbroken Chain"],
    Legendary: ["System Chosen","Monarch's Emblem"]
  };
  const arr = pool[rarity] || pool.Common;
  return arr[Math.floor(Math.random()*arr.length)];
}

/* ---------- Quests / Day state ---------- */
function ensureQuestDay(dateKey){
  if(!state.quests[dateKey]){
    state.quests[dateKey] = {
      closed:false,
      checks:{},
      steps:"",
      sleep:"",
      weight:"",
      note:"",
      manualEdited:false
    };
  }else{
    state.quests[dateKey].checks ??= {};
    state.quests[dateKey].closed ??= false;
    state.quests[dateKey].manualEdited ??= false;
    if(state.quests[dateKey].steps==null) state.quests[dateKey].steps="";
    if(state.quests[dateKey].sleep==null) state.quests[dateKey].sleep="";
    if(state.quests[dateKey].weight==null) state.quests[dateKey].weight="";
    if(state.quests[dateKey].note==null) state.quests[dateKey].note="";
  }
  return state.quests[dateKey];
}

function dayHasAnyActivity(d){
  if(!d) return false;
  if(d.closed) return true;
  if(d.steps || d.sleep || d.weight) return true;
  if(d.checks && Object.values(d.checks).some(Boolean)) return true;
  return false;
}

/* ---------- Daily plan -> quest list ---------- */
function buildQuestListForDate(dateKey){
  const row = data.byDateDaily?.[dateKey] || null;

  const quests = [];

  // Penalty quest injection (if active and not resolved)
  if(state.penalty.active && !state.penalty.resolved){
    quests.push({ id:"PENALTY", label:"Büntetés: extra feladat", required:false });
  }

  // Monthly Boss quest injection
  const mk = monthKeyFromDateKey(dateKey);
  const boss = ensureMonthlyBoss(mk);
  if(boss.type && !boss.completed){
    const labelBase = boss.type==="WALK20" ? "+20 perc séta" : "+1 extra blokk edzés";
    const label = `Boss (${boss.bossName}): ${labelBase}`;
    quests.push({ id:"BOSS", label, required:false });
  }

  // Core quests from daily plan
  let hasCore = false;

  if(row){
    // Edzés javaslat -> core
    const workout = getWorkoutSuggestion(row);
    if(truthyCell(workout)){
      quests.push({ id:"WORKOUT", label:`Edzés: ${String(workout).trim()}`, required:true });
      hasCore = true;
    }

    // Háztartási / napi teendők -> core (ha a cella nem üres)
    const chores = [
      { id:"Mosogatás", keys:["Mosogatás","Mosogatas"], label:"Mosogatás" },
      { id:"Ruhamosás", keys:["Ruhamosás","Ruhamosas"], label:"Ruhamosás" },
      { id:"Takarítás", keys:["Takarítás","Takaritas"], label:"Takarítás" },
      { id:"Főzés", keys:["Főzés","Fozes"], label:"Főzés" },
      { id:"Barátok", keys:["Barátok","Baratok"], label:"Barátok" }
    ];

    for(const c of chores){
      let v = null;
      for(const k of c.keys){
        if(row[k] !== undefined){ v = row[k]; break; }
      }
      if(truthyCell(v)){
        quests.push({ id:c.id, label:c.label, required:true });
        hasCore = true;
      }
    }

    // Éjszakás műszak -> extra regen
    const shiftRaw = row["Műszak"] ?? row["Muszak"] ?? row["shift"] ?? row["Shift"] ?? "";
    const shift = normalizeShiftCode(shiftRaw);
    if(shift === "É"){
      quests.push({ id:"REGEN", label:"Regeneráció: 10 perc nyújtás / lazítás", required:false });
    }
  }

  // Fallback: ha nincs core, legyen minimum
  if(!hasCore){
    quests.push({ id:"MINIMUM", label:"Napi minimum: 10 perc séta", required:true });
  }

  // Metrics input fields (mindig a lista végén)
  quests.push({ id:"METRICS", label:"Lépés / Alvás / Súly", required:false });

  return quests;
}

/* ---------- Weekly system ---------- */
function getISOWeekKey(dateKey){
  // ISO week number based on dateKey in local time
  const d0 = parseDateKey(dateKey);
  const d = d0 ? new Date(d0+"T12:00:00") : new Date();
  const dayNr = (d.getDay()+6)%7; // Mon=0..Sun=6
  d.setDate(d.getDate()-dayNr+3); // Thursday
  const firstThu = new Date(d.getFullYear(),0,4);
  const firstDayNr=(firstThu.getDay()+6)%7;
  firstThu.setDate(firstThu.getDate()-firstDayNr+3);
  const week = 1 + Math.round((d.getTime()-firstThu.getTime())/(7*24*3600*1000));
  return `${d.getFullYear()}-W${pad2(week)}`;
}

function resetWeeklyTokensIfNeeded(){
  const todayKey = fmtDate(new Date());
  const wk = getISOWeekKey(todayKey);
  if(state.meta.tokenWeekKey !== wk){
    const effects = getPerkEffects();
    state.meta.tokenWeekKey = wk;
    state.meta.tokens = 1 + effects.weeklyTokenPlus;
    saveState();
  }
}

/* ---------- Penalty system ---------- */
function resetPenaltyIfMonthChanged(){
  const mk = fmtMonth(new Date());
  if(state.penalty.monthKey !== mk){
    state.penalty.monthKey = mk;
    state.penalty.active = false;
    state.penalty.stage = 0;
    state.penalty.expiresAt = 0;
    state.penalty.resolved = false;
    state.penalty.completedAt = 0;
    saveState();
  }
}

function checkNeedPenalty(todayKey){
  const monthKey = fmtMonth(new Date(todayKey+"T12:00:00"));
  const start = startOfMonthDate(monthKey);
  const today = new Date(todayKey+"T12:00:00");
  // scan days up to yesterday
  for(let d=new Date(start); d < today; d.setDate(d.getDate()+1)){
    const dk = fmtDate(d);
    if(dk === todayKey) break;
    // only days before today
    if(dk >= todayKey) break;
    const day = state.quests[dk];
    if(!dayHasAnyActivity(day)){
      return true;
    }
  }
  return false;
}

function activatePenaltyIfNeeded(){
  const todayKey = fmtDate(new Date());
  resetPenaltyIfMonthChanged();

  if(state.penalty.resolved) return;

  const need = checkNeedPenalty(todayKey);
  if(!need) return;

  if(!state.penalty.active){
    state.penalty.active = true;
    state.penalty.stage = 1;
    state.penalty.expiresAt = Date.now() + 24*3600*1000;
    // count month once
    const mk = state.penalty.monthKey;
    if(state.meta.penaltyMonthKeyLastCounted !== mk){
      state.meta.penaltyMonths = Number(state.meta.penaltyMonths||0) + 1;
      state.meta.penaltyMonthKeyLastCounted = mk;
    }
    saveState();
    setStatus("BÜNTETÉS AKTÍV");
  }
}

function tickPenaltyEscalation(){
  if(!state.penalty.active || state.penalty.resolved) return;
  const now = Date.now();
  if(state.penalty.expiresAt && now <= state.penalty.expiresAt) return;

  if(state.penalty.stage === 1){
    state.penalty.stage = 2;
    state.penalty.expiresAt = now + 7*24*3600*1000;
    saveState();
  }else if(state.penalty.stage === 2){
    state.penalty.stage = 3;
    state.penalty.expiresAt = endOfMonthMs(state.penalty.monthKey);
    saveState();
  }else{
    // stage 3 stays until month end
    state.penalty.expiresAt = endOfMonthMs(state.penalty.monthKey);
    saveState();
  }
}

function completePenalty(){
  if(!state.penalty.active) return;
  state.penalty.active = false;
  state.penalty.resolved = true;
  state.penalty.completedAt = Date.now();
  state.penalty.stage = 0;
  state.penalty.expiresAt = 0;
  saveState();
  addExp(140, "Büntetés teljesítve");
  // small chance to give a rare badge
  const r = pickRarity({Common:50, Rare:35, Epic:13, Legendary:2});
  const name = randomBadgeName(r);
  if(addBadge(name, r)) setStatus(`DROP: ${name} (${r})`);
}

/* ---------- Monthly Boss ---------- */
function ensureMonthlyBoss(monthKey){
  state.boss ??= {};
  state.boss.byMonth ??= {};
  if(!state.boss.byMonth[monthKey]){
    const roster = MONTHLY_BOSS_ROSTER[bossIndexForMonth(monthKey)];
    state.boss.byMonth[monthKey] = { bossId: roster.id, bossName: roster.name, type:"", completed:false, completedAt:0 };
  }else{
    const b = state.boss.byMonth[monthKey];
    const roster = MONTHLY_BOSS_ROSTER[bossIndexForMonth(monthKey)];
    b.bossId = roster.id;
    b.bossName = roster.name;
    b.type = b.type || "";
    b.completed = !!b.completed;
    b.completedAt = Number(b.completedAt||0);
  }
  return state.boss.byMonth[monthKey];
}

function selectMonthlyBoss(monthKey, type){
  const b = ensureMonthlyBoss(monthKey);
  if(b.completed) return setStatus("MÁR TELJESÍTVE");
  b.type = type;
  saveState();
  renderQuests();
}
function clearMonthlyBoss(monthKey){
  const b = ensureMonthlyBoss(monthKey);
  if(b.completed) return;
  b.type = "";
  saveState();
  renderQuests();
}
function completeMonthlyBoss(monthKey){
  const b = ensureMonthlyBoss(monthKey);
  if(!b.type || b.completed) return;
  b.completed = true;
  b.completedAt = Date.now();
  saveState();

  const effects = getPerkEffects();
  const base = 260;
  const bonus = effects.bossRewardPlus;
  const gain = Math.floor(base * (1+bonus));
  addExp(gain, `Havi Boss: ${b.bossName}`);
  // Drop: badge with better odds
  const rarity = pickRarity({
    Common: 35,
    Rare: 35 + Math.round(15*bonus),
    Epic: 22 + Math.round(10*bonus),
    Legendary: 8 + Math.round(5*bonus)
  });
  const name = randomBadgeName(rarity);
  if(addBadge(name, rarity)){
    setStatus(`HAVI BOSS DROP: ${name} (${rarity})`);
  }else{
    addCrates(1);
    setStatus("HAVI BOSS DROP: +1 crate");
  }
}

/* ---------- Daily close + scoring ---------- */
function isDailyClear(dateKey){
  const d = state.quests[dateKey];
  if(!d) return false;
  const q = buildQuestListForDate(dateKey).filter(x=> x.required);
  if(q.length===0) return false;
  const checks = d.checks || {};
  return q.every(item => !!checks[item.id]);
}

function lockDay(dateKey){
  const d = ensureQuestDay(dateKey);
  if(d.closed) return setStatus("MÁR LEZÁRVA");

  d.closed = true;

  // streak handling
  const prev = state.meta.lastClosedDate ? parseDateKey(state.meta.lastClosedDate) : null;
  if(prev){
    const prevDate = new Date(prev+"T12:00:00");
    const curDate = new Date(dateKey+"T12:00:00");
    const diff = Math.round((curDate - prevDate)/(24*3600*1000));
    if(diff === 1){
      state.meta.streak = Number(state.meta.streak||0) + 1;
    }else if(diff > 1){
      // streak broken, try token
      if(Number(state.meta.tokens||0) > 0){
        state.meta.tokens -= 1;
        state.meta.streak = Number(state.meta.streak||0) + 1;
        setStatus("STREAK MEGMENTVE (TOKEN)");
      }else{
        state.meta.streak = 1;
      }
    }else{
      // same day re-close
      state.meta.streak = Math.max(1, Number(state.meta.streak||1));
    }
  }else{
    state.meta.streak = 1;
  }
  state.meta.bestStreak = Math.max(Number(state.meta.bestStreak||0), Number(state.meta.streak||0));
  state.meta.lastClosedDate = dateKey;

  // Daily rewards
  const effects = getPerkEffects();
  let expGain = 0;

  const cleared = isDailyClear(dateKey);
  if(cleared){
    expGain += Math.floor(70 * (1 + effects.dailyClearBonus));
  }else if(dayHasAnyActivity(d)){
    expGain += 30;
  }
  // Monthly Boss completion check (1x/hó)
  const mk = monthKeyFromDateKey(dateKey);
  const b = ensureMonthlyBoss(mk);
  if(b.type && !b.completed && d.checks?.BOSS){
    completeMonthlyBoss(mk);
  }

  if(expGain>0) addExp(expGain, cleared ? "Daily clear" : "Részleges");

  // Penalty completion check: if active and penalty checked
  if(state.penalty.active && !state.penalty.resolved && (d.checks?.PENALTY)){
    completePenalty();
  }

  // crate timer: 24h free crate
  const last = state.meta.lastCrateDate ? parseDateKey(state.meta.lastCrateDate) : null;
  const nowMs = Date.now();
  if(!last){
    state.meta.lastCrateDate = dateKey;
  }else{
    const lastMs = new Date(last+"T00:00:00").getTime();
    if(nowMs - lastMs >= 24*3600*1000){
      addCrates(1);
      state.meta.lastCrateDate = dateKey;
      setStatus("FREE CRATE +1");
    }
  }

  saveState();
}

function unlockDay(dateKey){
  const d = ensureQuestDay(dateKey);
  if(!d.closed) return setStatus("NINCS LEZÁRVA");

  if(state.settings.antiCheat){
    const reason = prompt("Anti-cheat: Miért oldod fel? (kötelező)");
    if(!reason || !String(reason).trim()){
      return setStatus("MEGSZAKÍTVA");
    }
    d.manualEdited = true;
    state.meta.manualEdits = Array.isArray(state.meta.manualEdits) ? state.meta.manualEdits : [];
    state.meta.manualEdits.push({ dateKey, ts: Date.now(), reason: String(reason).trim() });
  }

  d.closed = false;
  saveState();
  renderQuests();
  renderProfile();
  setStatus("FELOLDVA");
}

/* ---------- Daily mod (flavor) ---------- */
function todayMod(){
  const mods = ["+10% EXP", "Double Steps (motiváció)", "+1 extra quest (Boss)", "Recovery day", "Focus mode"];
  const t = new Date();
  const seed = t.getFullYear()*10000 + (t.getMonth()+1)*100 + t.getDate();
  return mods[seed % mods.length];
}

/* ---------- UI bind ---------- */
function bindTabs(){
  document.querySelectorAll(".tab").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      document.querySelectorAll(".tab").forEach(b=>b.classList.remove("active"));
      btn.classList.add("active");
      const tab = btn.getAttribute("data-tab");
      document.querySelectorAll(".view").forEach(v=>v.classList.remove("active"));
      document.getElementById(`view-${tab}`)?.classList.add("active");
      saveState();
      if(tab==="profile") renderProfile();
      if(tab==="quests") renderQuests();
      if(tab==="schedule") renderSchedule();
      if(tab==="meal") renderMeal();
    });
  });
}

function bindTopWidgets(){
  const citySel = document.getElementById("citySelect");
  const saveBtn = document.getElementById("saveCityBtn");
  if(citySel){
    citySel.value = state.settings.city || "Budapest";
  }
  saveBtn?.addEventListener("click", ()=>{
    const c = citySel?.value || "Budapest";
    state.settings.city = c;
    saveState();
    setStatus("VÁROS MENTVE");
    refreshWeather(true);
  });
}

function bindProfile(){
  // stat buttons
  document.querySelectorAll("[data-stat]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const key = btn.getAttribute("data-stat");
      if(state.profile.statPoints<=0) return setStatus("NINCS PONT");
      state.profile.stats[key] = Number(state.profile.stats[key]||0) + 1;
      state.profile.statPoints -= 1;
      saveState();
      renderProfile();
    });
  });

  // settings
  const saveBtn = document.getElementById("saveSettings");
  const resetBtn = document.getElementById("resetLocal");
  const exportBtn = document.getElementById("exportDataBtn");
  const importFile = document.getElementById("importFile");
  const exportIdBtn = document.getElementById("exportHunterIdBtn");
  const openCrateBtn = document.getElementById("openCrateBtn");

  saveBtn?.addEventListener("click", ()=>{
    state.settings.startWeight = String(document.getElementById("setStartWeight")?.value || "");
    state.settings.goalWeight = String(document.getElementById("setGoalWeight")?.value || "");
    state.settings.currentWeight = String(document.getElementById("setCurrentWeight")?.value || "");
    state.settings.trainingLevel = clamp(Number(document.getElementById("trainingLevel")?.value || 1),1,5);

    const antiSel = document.getElementById("antiCheat");
    state.settings.antiCheat = (antiSel?.value || "on")==="on";

    const notifSel = document.getElementById("notifDaily");
    state.settings.notifDaily = (notifSel?.value || "off")==="on";

    saveState();
    renderProfile();
    setStatus("MENTVE");
    if(state.settings.notifDaily) ensureNotificationPermission();
  });

  resetBtn?.addEventListener("click", ()=>{
    if(!confirm("Biztos? Minden helyi adat törlődik.")) return;
    localStorage.removeItem(LS_KEY);
    // keep excel override intentionally
    location.reload();
  });

  exportBtn?.addEventListener("click", ()=>{
    const blob = new Blob([JSON.stringify(state, null, 2)], {type:"application/json"});
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "sl-tracker-state.json";
    a.click();
    URL.revokeObjectURL(a.href);
  });

  importFile?.addEventListener("change", async ()=>{
    const f = importFile.files?.[0];
    if(!f) return;
    try{
      const txt = await f.text();
      const incoming = migrateState(JSON.parse(txt));
      Object.assign(state, incoming);
      saveState();
      renderAll();
      setStatus("IMPORT OK");
    }catch(e){
      console.warn(e);
      setStatus("IMPORT HIBA");
    }finally{
      importFile.value = "";
    }
  });

  exportIdBtn?.addEventListener("click", exportHunterId);
  openCrateBtn?.addEventListener("click", openCrate);

  // backup
  document.getElementById("makeBackupBtn")?.addEventListener("click", ()=>{
    const code = makeBackupString();
    const ta = document.getElementById("backupText");
    if(ta) ta.value = code;
    navigator.clipboard?.writeText(code).catch(()=>{});
    setStatus("BACKUP KÉSZ");
  });
  document.getElementById("restoreBackupBtn")?.addEventListener("click", ()=>{
    const ta = document.getElementById("backupText");
    const code = ta?.value || "";
    if(!code.trim()) return setStatus("NINCS STRING");
    try{
      const s = restoreBackupString(code.trim());
      Object.assign(state, migrateState(s));
      saveState();
      renderAll();
      setStatus("RESTORE OK");
    }catch(e){
      console.warn(e);
      setStatus("RESTORE HIBA");
    }
  });

  // excel import
  document.getElementById("excelImport")?.addEventListener("change", handleExcelImport);
  document.getElementById("clearExcelOverrideBtn")?.addEventListener("click", ()=>{
    if(!confirm("Biztos? Visszaáll a repo JSON adatokra.")) return;
    clearDataOverride();
    location.reload();
  });

  // avatar
  document.getElementById("avatarInput")?.addEventListener("change", handleAvatarUpload);

  // perk
  document.getElementById("choosePerkBtn")?.addEventListener("click", choosePerk);
}

function bindMeasurements(){
  document.getElementById("addMeasurement")?.addEventListener("click", ()=>{
    const date = document.getElementById("mDate")?.value || fmtDate(new Date());
    const weight = safeNumber(document.getElementById("mWeight")?.value, 0);
    const waist = safeNumber(document.getElementById("mWaist")?.value, 0);
    const note = String(document.getElementById("mNote")?.value || "").trim();
    if(!date) return;
    state.measurements.push({ date, weight, waist, note });
    state.measurements.sort((a,b)=> String(b.date).localeCompare(String(a.date)));
    saveState();
    renderMeasurements();
    renderProfile();
    setStatus("MÉRÉS MENTVE");
  });
}

function bindQuests(){
  document.getElementById("activeMonth")?.addEventListener("change", (e)=>{
    state.ui.activeMonth = e.target.value || fmtMonth(new Date());
    // adjust activeDate into month
    const first = startOfMonthDate(state.ui.activeMonth);
    state.ui.activeDate = fmtDate(first);
    saveState();
    renderQuests();
    renderSchedule();
    renderMeal();
  });
  document.getElementById("activeDate")?.addEventListener("change", (e)=>{
    const dk = parseDateKey(e.target.value) || fmtDate(new Date());
    state.ui.activeDate = dk;
    saveState();
    renderQuests();
    renderSchedule();
    renderMeal();
  });

  document.getElementById("lockDayBtn")?.addEventListener("click", ()=>{
    const dk = state.ui.activeDate;
    lockDay(dk);
    saveState();
    renderQuests();
    renderProfile();
  });
  document.getElementById("unlockDayBtn")?.addEventListener("click", ()=>{
    unlockDay(state.ui.activeDate);
  });

  // quick add
  document.getElementById("addSteps2k")?.addEventListener("click", ()=> quickAdd("steps", 2000));
  document.getElementById("addSteps5k")?.addEventListener("click", ()=> quickAdd("steps", 5000));
  document.getElementById("addSleep05")?.addEventListener("click", ()=> quickAdd("sleep", 0.5));
  document.getElementById("addSleep1")?.addEventListener("click", ()=> quickAdd("sleep", 1));

  // focus mode
  document.getElementById("focusToggleBtn")?.addEventListener("click", ()=>{
    state.ui.focusMode = !state.ui.focusMode;
    document.body.classList.toggle("focusMode", state.ui.focusMode);
    saveState();
    setStatus(state.ui.focusMode ? "FOCUS MODE ON" : "FOCUS MODE OFF");
  });

  // monthly boss actions
  document.getElementById("bossOptWalk")?.addEventListener("click", ()=> {
    const mk = monthKeyFromDateKey(state.ui.activeDate);
    selectMonthlyBoss(mk, "WALK20");
  });
  document.getElementById("bossOptBlock")?.addEventListener("click", ()=> {
    const mk = monthKeyFromDateKey(state.ui.activeDate);
    selectMonthlyBoss(mk, "EXTRA_BLOCK");
  });
  document.getElementById("bossClear")?.addEventListener("click", ()=> {
    const mk = monthKeyFromDateKey(state.ui.activeDate);
    clearMonthlyBoss(mk);
  });

  // weekly claim
  document.getElementById("claimWeeklyBtn")?.addEventListener("click", claimWeeklyReward);
}

function bindSchedule(){
  const m = document.getElementById("scheduleMonth");
  const d = document.getElementById("scheduleDate");
  const todayBtn = document.getElementById("scheduleTodayBtn");

  m?.addEventListener("change", (e)=>{
    state.ui.activeMonth = e.target.value || fmtMonth(new Date());
    const first = startOfMonthDate(state.ui.activeMonth);
    state.ui.activeDate = fmtDate(first);
    saveState();
    renderQuests();
    renderSchedule();
    renderMeal();
  });

  d?.addEventListener("change", (e)=>{
    const dk = parseDateKey(e.target.value) || fmtDate(new Date());
    state.ui.activeDate = dk;
    state.ui.activeMonth = String(dk).slice(0,7);
    saveState();
    renderQuests();
    renderSchedule();
    renderMeal();
  });

  todayBtn?.addEventListener("click", ()=>{
    const dk = fmtDate(new Date());
    state.ui.activeDate = dk;
    state.ui.activeMonth = String(dk).slice(0,7);
    saveState();
    renderQuests();
    renderSchedule();
    renderMeal();
  });
}


function quickAdd(field, amount){
  const key = state.ui.activeDate;
  const d = ensureQuestDay(key);
  if(d.closed) return setStatus("LEZÁRVA");

  if(field==="steps"){
    const cur = safeNumber(d.steps, 0);
    d.steps = String(cur + amount);
  }else if(field==="sleep"){
    const cur = safeNumber(d.sleep, 0);
    d.sleep = String(Math.round((cur + amount)*10)/10);
  }
  saveState();
  renderQuests();
}

/* ---------- Notifications (best effort) ---------- */
async function ensureNotificationPermission(){
  if(!("Notification" in window)) return;
  if(Notification.permission === "granted") return;
  if(Notification.permission === "denied") return;
  try{
    await Notification.requestPermission();
  }catch{}
}

function maybeNotifyDaily(){
  if(!state.settings.notifDaily) return;
  if(!("Notification" in window)) return;
  if(Notification.permission !== "granted") return;

  const now = new Date();
  const hhmm = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
  if(hhmm !== "20:00") return;

  const today = fmtDate(now);
  const d = state.quests[today];
  const done = d && d.closed;
  if(done) return;

  try{
    new Notification("Solo Leveling Tracker", { body: "Napi küldetések még nyitva." });
  }catch{}
}

/* ---------- Weather + clock ---------- */
const CITY_COORDS = {
  "Budapest": { lat: 47.4979, lon: 19.0402 },
  "Tatabánya": { lat: 47.5840, lon: 18.3940 }
};
let weatherCache = { ts:0, city:"", text:"Időjárás: –" };

function formatClock(){
  const el = document.getElementById("clockPill");
  if(!el) return;
  const dtf = new Intl.DateTimeFormat("hu-HU", { timeZone:"Europe/Budapest", hour:"2-digit", minute:"2-digit", second:"2-digit" });
  el.textContent = dtf.format(new Date());
}

function wmoIsRain(code){
  const c = Number(code);
  if(!Number.isFinite(c)) return false;
  // rain/drizzle/freezing rain/showers/thunder
  if((c>=51 && c<=67) || (c>=80 && c<=82) || (c>=91 && c<=99)) return true;
  return false;
}

async function refreshWeather(force=false){
  const el = document.getElementById("weatherPill");
  if(!el) return;

  const city = state.settings.city || "Budapest";
  const coord = CITY_COORDS[city] || CITY_COORDS["Budapest"];
  const now = Date.now();
  if(!force && weatherCache.city===city && (now - weatherCache.ts) < 10*60*1000){
    el.textContent = weatherCache.text;
    return;
  }

  try{
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${coord.lat}&longitude=${coord.lon}&current=temperature_2m,precipitation,weather_code&timezone=Europe%2FBudapest`;
    const r = await fetch(url);
    if(!r.ok) throw new Error(String(r.status));
    const j = await r.json();
    const cur = j.current || {};
    const t = cur.temperature_2m;
    const precip = cur.precipitation;
    const code = cur.weather_code;
    const raining = (safeNumber(precip,0) > 0) || wmoIsRain(code);
    const text = `${city}: ${Math.round(safeNumber(t,0))}°C · ${raining ? "Esik" : "Nem esik"}`;
    weatherCache = { ts: now, city, text };
    el.textContent = text;
  }catch{
    el.textContent = weatherCache.text || "Időjárás: –";
  }
}

/* ---------- Backup string ---------- */
function makeBackupString(){
  const json = JSON.stringify(state);
  // UTF-8 safe base64
  const enc = btoa(unescape(encodeURIComponent(json)));
  return enc;
}
function restoreBackupString(code){
  const json = decodeURIComponent(escape(atob(code)));
  return JSON.parse(json);
}

/* ---------- Avatar ---------- */
async function handleAvatarUpload(e){
  const f = e.target.files?.[0];
  if(!f) return;
  if(f.size > 2*1024*1024){
    setStatus("TÚL NAGY (2MB)");
    e.target.value = "";
    return;
  }
  try{
    const dataUrl = await fileToDataUrl(f);
    const resized = await resizeImageDataUrl(dataUrl, 256, 256, 0.86);
    state.profile.avatarDataUrl = resized;
    saveState();
    renderProfile();
    setStatus("PROFILKÉP MENTVE");
  }catch(err){
    console.warn(err);
    setStatus("KÉP HIBA");
  }finally{
    e.target.value = "";
  }
}
function fileToDataUrl(file){
  return new Promise((res, rej)=>{
    const fr = new FileReader();
    fr.onload = ()=> res(fr.result);
    fr.onerror = ()=> rej(new Error("read"));
    fr.readAsDataURL(file);
  });
}
function resizeImageDataUrl(dataUrl, maxW, maxH, quality=0.86){
  return new Promise((res, rej)=>{
    const img = new Image();
    img.onload = ()=>{
      const w = img.width, h = img.height;
      const scale = Math.min(1, maxW/w, maxH/h);
      const cw = Math.max(1, Math.round(w*scale));
      const ch = Math.max(1, Math.round(h*scale));
      const c = document.createElement("canvas");
      c.width = cw; c.height = ch;
      const ctx = c.getContext("2d");
      ctx.drawImage(img,0,0,cw,ch);
      try{
        res(c.toDataURL("image/jpeg", quality));
      }catch(e){
        rej(e);
      }
    };
    img.onerror = ()=> rej(new Error("img"));
    img.src = dataUrl;
  });
}

/* ---------- Excel import (SheetJS) ---------- */
function sheetToMatrix(wb, sheetName){
  const ws = wb.Sheets[sheetName];
  if(!ws) return [];
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" });
}
function findHeaderRowIndex(matrix, headerCell){
  const target = String(headerCell).trim().toLowerCase();
  for(let i=0;i<matrix.length;i++){
    const row = matrix[i];
    for(const cell of row){
      if(String(cell).trim().toLowerCase() === target) return i;
    }
  }
  return -1;
}
function matrixToObjects(matrix, headerRowIndex){
  const header = matrix[headerRowIndex].map(h=> String(h||"").trim()).filter(Boolean);
  const start = headerRowIndex+1;
  const out = [];
  for(let i=start;i<matrix.length;i++){
    const row = matrix[i];
    if(!row || row.every(c=> String(c||"").trim()==="")) continue;
    const obj = {};
    for(let c=0;c<header.length;c++){
      obj[header[c]] = row[c] ?? "";
    }
    out.push(obj);
  }
  return out;
}
function parseSettingsFromMatrix(matrix){
  // try key-value layout: first col key, second col value
  const out = {};
  for(const row of matrix){
    if(!row || row.length<2) continue;
    const key = String(row[0]||"").trim();
    const val = row[1];
    if(!key) continue;
    if(key.toLowerCase()==="beállítások" || key.toLowerCase().includes("beállítás")) continue;
    out[key] = val;
  }
  return Object.keys(out).length ? out : null;
}
function parseTrainingLevels(matrix){
  const idx = findHeaderRowIndex(matrix, "Szint");
  if(idx<0) return null;
  const rows = matrixToObjects(matrix, idx);
  // map columns by position: Szint, Erő, Kardió, Mobilitás, Opció, Lépés cél, Megjegyzés
  const header = matrix[idx].map(x=>String(x||"").trim());
  const col = {
    lvl: header.findIndex(h=>h.toLowerCase()==="szint"),
    strength: 1,
    z2: 2,
    mob: 3,
    opt: 4,
    steps: 5,
    note: 6
  };
  const out = [];
  for(const r of rows){
    const rawLvl = r["Szint"];
    const level = Number(String(rawLvl).trim());
    if(!Number.isFinite(level)) continue;
    const values = Object.values(r);
    const o = {
      level,
      strength: values[col.strength] ?? "",
      z2min: values[col.z2] ?? "",
      mobmin: values[col.mob] ?? "",
      workday_option: values[col.opt] ?? "",
      steps_target: values[col.steps] ?? "",
      note: values[col.note] ?? ""
    };
    out.push(o);
  }
  return out.length ? out : null;
}
function parseTableByHeader(matrix, headerName){
  const idx = findHeaderRowIndex(matrix, headerName);
  if(idx<0) return null;
  const rows = matrixToObjects(matrix, idx);
  return rows.length ? rows : null;
}
function parseRoutineTemplates(matrix){
  const templates = {};
  const sections = [
    { key:"N", match:/NAPPALOS/i },
    { key:"É", match:/ÉJSZAKÁS|EJSZAKAS/i },
    { key:"P1", match:/Szabadnap\s*#?1/i },
    { key:"P2", match:/Szabadnap\s*#?2/i },
    { key:"P3", match:/Szabadnap\s*#?3/i },
    { key:"P4", match:/Szabadnap\s*#?4/i }
  ];
  let current = null;
  for(let i=0;i<matrix.length;i++){
    const row = matrix[i] || [];
    const a = String(row[0]||"");
    for(const s of sections){
      if(s.match.test(a)){
        current = s.key;
        templates[current] = [];
      }
    }
    if(!current) continue;
    // header row ("Idő", "Tevékenység", "Megjegyzés")
    if(String(row[0]).trim().toLowerCase()==="idő" && String(row[1]).trim().toLowerCase().startsWith("tev")) continue;

    const time = String(row[0]||"").trim();
    const activity = String(row[1]||"").trim();
    const note = String(row[2]||"").trim();

    if(time && activity){
      templates[current].push({ time, activity, note });
    }
  }
  // validate minimal
  const keys = Object.keys(templates);
  if(keys.length===0) return null;
  for(const k of keys){
    if(!templates[k].length) delete templates[k];
  }
  return Object.keys(templates).length ? templates : null;
}

async function handleExcelImport(e){
  const f = e.target.files?.[0];
  if(!f) return;
  try{
    const buf = await f.arrayBuffer();
    const wb = XLSX.read(buf, { type:"array" });

    const settingsM = sheetToMatrix(wb, "Beállítások");
    const trainingM = sheetToMatrix(wb, "Edzés terv");
    const dailyM = sheetToMatrix(wb, "Napi terv 2026");
    const calM = sheetToMatrix(wb, "Naptár 2026");
    const menuM = sheetToMatrix(wb, "Menü 2026");
    const routineM = sheetToMatrix(wb, "Napi rutin");

    const ov = {
      settings: parseSettingsFromMatrix(settingsM),
      training_levels: parseTrainingLevels(trainingM),
      daily_plan_2026: parseTableByHeader(dailyM, "Dátum"),
      calendar_2026: parseTableByHeader(calM, "Dátum"),
      menu_2026: parseTableByHeader(menuM, "Dátum"),
      routine_templates: parseRoutineTemplates(routineM)
    };

    // keep existing json if parsing failed
    saveDataOverride(ov);
    setStatus("EXCEL IMPORT OK");
    location.reload();
  }catch(err){
    console.warn(err);
    setStatus("EXCEL IMPORT HIBA");
  }finally{
    e.target.value = "";
  }
}

/* ---------- Perk selection ---------- */
function choosePerk(){
  const sel = document.getElementById("perkSelect");
  const id = sel?.value;
  if(!id) return;
  if(state.profile.perkPoints<=0) return setStatus("NINCS PERK PONT");
  if(state.profile.perks.includes(id)) return setStatus("MÁR MEGVAN");
  state.profile.perks.push(id);
  state.profile.perkPoints -= 1;
  saveState();
  renderProfile();
  setStatus("PERK FELVÉVE");
}

/* ---------- Hunter ID (PNG) ---------- */
function exportHunterId(){
  const c = document.createElement("canvas");
  c.width = 860; c.height = 460;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#0b0f17"; ctx.fillRect(0,0,c.width,c.height);
  ctx.fillStyle = "rgba(124,92,255,.18)"; ctx.fillRect(40,40,c.width-80,c.height-80);
  ctx.strokeStyle = "rgba(124,92,255,.6)"; ctx.lineWidth = 2; ctx.strokeRect(40,40,c.width-80,c.height-80);

  ctx.fillStyle = "#e7eefc";
  ctx.font = "800 34px ui-sans-serif, system-ui";
  ctx.fillText("HUNTER ID", 70, 105);

  ctx.font = "700 18px ui-monospace, SFMono-Regular";
  ctx.fillStyle = "#a9b6d3";
  ctx.fillText(`APP: ${APP_VERSION}`, 70, 145);
  ctx.fillText(`LEVEL: ${state.profile.level}`, 70, 175);
  ctx.fillText(`STREAK: ${state.meta.streak} (BEST ${state.meta.bestStreak})`, 70, 205);
  ctx.fillText(`PENALTY MONTHS: ${state.meta.penaltyMonths||0}`, 70, 235);
  ctx.fillText(`MANUAL EDITS: ${(state.meta.manualEdits||[]).length}`, 70, 265);

  ctx.fillStyle = "#e7eefc";
  ctx.font = "900 46px ui-sans-serif, system-ui";
  ctx.fillText(state.profile.title || "Rookie Hunter", 70, 330);

  ctx.font = "700 16px ui-monospace, SFMono-Regular";
  ctx.fillStyle = "#a9b6d3";
  ctx.fillText(`DATE: ${fmtDate(new Date())}`, 70, 380);

  const a = document.createElement("a");
  a.download = "hunter-id.png";
  a.href = c.toDataURL("image/png");
  a.click();
}

/* ---------- Crate system ---------- */
function openCrate(){
  if(state.meta.crates<=0) return setStatus("NINCS CRATE");
  state.meta.crates -= 1;
  state.meta.openedCrates = Number(state.meta.openedCrates||0) + 1;

  const rarity = pickRarity({Common:68, Rare:22, Epic:8, Legendary:2});
  const name = randomBadgeName(rarity);
  const added = addBadge(name, rarity);
  saveState();
  renderProfile();
  renderInventory();
  setStatus(added ? `CRATE: ${name} (${rarity})` : "CRATE: DUPLIKÁT -> +20 EXP");
  if(!added) addExp(20, "Dup");
}

/* ---------- Weekly reward ---------- */
function claimWeeklyReward(){
  const todayKey = fmtDate(new Date());
  const wk = getISOWeekKey(todayKey);
  state.meta.weeklyClaims ??= {};
  if(state.meta.weeklyClaims[wk]) return setStatus("MÁR FELVETTED");

  const clearedDays = countClosedDaysInWeek(todayKey);
  const req = 5;
  if(clearedDays < req) return setStatus("NINCS ELÉG CLEAR");

  state.meta.weeklyClaims[wk] = true;
  const effects = getPerkEffects();
  addCrates(1 + effects.weeklyCratePlus);
  addExp(120, "Weekly");
  saveState();
  renderQuests();
  renderProfile();
  setStatus("WEEKLY CLAIM OK");
}

function countClosedDaysInWeek(dateKey){
  // Monday..Sunday for the week that contains dateKey
  const d0 = parseDateKey(dateKey);
  const d = d0 ? new Date(d0+"T12:00:00") : new Date();
  const dayNr=(d.getDay()+6)%7;
  const mon=new Date(d); mon.setDate(d.getDate()-dayNr);
  let count=0;
  for(let i=0;i<7;i++){
    const dd = new Date(mon); dd.setDate(mon.getDate()+i);
    const dk = fmtDate(dd);
    if(state.quests[dk]?.closed) count++;
  }
  return count;
}

/* ---------- Periodization / scaling assist ---------- */
function getWeekIndex(dateKey){
  const wk = getISOWeekKey(dateKey);
  const m = wk.match(/W(\d+)/);
  return m ? Number(m[1]) : 1;
}
function isDeloadWeek(dateKey){
  // 3 weeks up, 1 week deload: weeks 4,8,12,...
  const w = getWeekIndex(dateKey);
  return w % 4 === 0;
}
function getStepsTargetForLevel(level){
  const row = (Array.isArray(data.training_levels) ? data.training_levels.find(x=>Number(x.level)===level) : null) || null;
  const t = row?.steps_target || "";
  // extract first number in string (e.g. "7 000–8 000")
  const m = String(t).replace(/\s/g,"").match(/(\d{3,5})/);
  return m ? Number(m[1]) : 7000;
}
function computeScalingSuggestion(){
  const today = fmtDate(new Date());
  const lvl = Number(state.settings.trainingLevel||1);
  const stepsTarget = getStepsTargetForLevel(lvl);
  const sleepTarget = 7; // default
  let ok=0, total=0;
  for(let i=1;i<=14;i++){
    const d = new Date(today+"T12:00:00"); d.setDate(d.getDate()-i);
    const dk = fmtDate(d);
    const day = state.quests[dk];
    if(!day) continue;
    total++;
    const steps = safeNumber(day.steps,0);
    const sleep = safeNumber(day.sleep,0);
    const clear = day.closed && isDailyClear(dk);
    if(clear && steps>=stepsTarget && sleep>=sleepTarget) ok++;
  }
  if(total<6) return { text:"Még kevés adat (14 nap) a skálázáshoz.", action:"none" };
  if(ok>=10 && lvl<5) return { text:"2 hét stabil teljesítés: javaslat → Lépj 1 szintet fel.", action:"up" };
  if(ok<=4) return { text:"Sok kihagyás: javaslat → Maradj ezen / deload.", action:"stay" };
  return { text:"Stabil, de még nem elég a szintlépéshez. Tartsd a ritmust.", action:"none" };
}

/* ---------- Rendering ---------- */
function renderProfile(){
  resetWeeklyTokensIfNeeded();
  ensureInventory();
  activatePenaltyIfNeeded();

  // avatar
  const img = document.getElementById("avatarImg");
  if(img){
    img.src = state.profile.avatarDataUrl || "./icon-192.png";
  }

  // settings inputs
  document.getElementById("setStartWeight") && (document.getElementById("setStartWeight").value = state.settings.startWeight || "");
  document.getElementById("setGoalWeight") && (document.getElementById("setGoalWeight").value = state.settings.goalWeight || "");
  document.getElementById("setCurrentWeight") && (document.getElementById("setCurrentWeight").value = state.settings.currentWeight || "");
  document.getElementById("trainingLevel") && (document.getElementById("trainingLevel").value = String(state.settings.trainingLevel||1));

  const antiSel = document.getElementById("antiCheat");
  if(antiSel) antiSel.value = state.settings.antiCheat ? "on" : "off";
  const notifSel = document.getElementById("notifDaily");
  if(notifSel) notifSel.value = state.settings.notifDaily ? "on" : "off";

  // profile pills
  const rank = state.profile.level>=20 ? "A" : state.profile.level>=10 ? "B" : "C";
  document.getElementById("rankPill") && (document.getElementById("rankPill").textContent = `Rank: ${rank}`);
  document.getElementById("levelPill") && (document.getElementById("levelPill").textContent = `Lv ${state.profile.level}`);
  document.getElementById("pointsPill") && (document.getElementById("pointsPill").textContent = `Pont: ${state.profile.statPoints}`);
  document.getElementById("streakPill") && (document.getElementById("streakPill").textContent = `Streak: ${state.meta.streak} (best ${state.meta.bestStreak})`);
  document.getElementById("tokenPill") && (document.getElementById("tokenPill").textContent = `Token: ${state.meta.tokens}`);
  document.getElementById("cratePill") && (document.getElementById("cratePill").textContent = `Crate: ${state.meta.crates}`);
  document.getElementById("titlePill") && (document.getElementById("titlePill").textContent = `Cím: ${state.profile.title || "—"}`);

  const pinned = (state.cosmetics.pinnedBadges||[]).filter(Boolean).join(" · ") || "—";
  document.getElementById("pinnedBadges") && (document.getElementById("pinnedBadges").textContent = `Kitűzve: ${pinned}`);

  document.getElementById("penaltyMonthsPill") && (document.getElementById("penaltyMonthsPill").textContent = `Büntető hónapok: ${state.meta.penaltyMonths||0}`);
  document.getElementById("manualEditPill") && (document.getElementById("manualEditPill").textContent = `Manual edit: ${(state.meta.manualEdits||[]).length}`);
  document.getElementById("perkPill") && (document.getElementById("perkPill").textContent = `Perk pont: ${state.profile.perkPoints}`);

  // stats
  document.getElementById("statSTR") && (document.getElementById("statSTR").textContent = String(state.profile.stats.STR||0));
  document.getElementById("statEND") && (document.getElementById("statEND").textContent = String(state.profile.stats.END||0));
  document.getElementById("statREC") && (document.getElementById("statREC").textContent = String(state.profile.stats.REC||0));
  document.getElementById("statDISC") && (document.getElementById("statDISC").textContent = String(state.profile.stats.DISC||0));

  // exp bar
  const need = expToNext(state.profile.level);
  const pct = Math.floor((state.profile.exp/need)*100);
  document.getElementById("expLabel") && (document.getElementById("expLabel").textContent = `${state.profile.exp} / ${need}`);
  document.getElementById("expFill") && (document.getElementById("expFill").style.width = `${clamp(pct,0,100)}%`);

  // perk selector
  const sel = document.getElementById("perkSelect");
  if(sel){
    sel.innerHTML = "";
    PERKS.forEach(p=>{
      const opt=document.createElement("option");
      opt.value=p.id;
      const owned = state.profile.perks.includes(p.id);
      opt.textContent = `${p.name}${owned ? " (megvan)" : ""}`;
      opt.disabled = owned;
      sel.appendChild(opt);
    });
  }
  const perkHint = document.getElementById("perkHint");
  if(perkHint){
    const list = state.profile.perks.map(id => PERKS.find(p=>p.id===id)?.name).filter(Boolean);
    perkHint.textContent = list.length ? `Aktív perkek: ${list.join(" · ")}` : "Nincs aktív perk.";
  }

  renderTrainingCards();
  renderTrainingTable();
  renderMeasurements();
  renderSummary();
  renderTrend();
  renderInventory();
}

function renderTrainingCards(){
  const box = document.getElementById("trainingCards");
  if(!box) return;
  box.innerHTML = "";
  const lvl = Number(state.settings.trainingLevel||1);
  const row = Array.isArray(data.training_levels) ? data.training_levels.find(x=>Number(x.level)===lvl) : null;

  const deload = isDeloadWeek(fmtDate(new Date()));
  const deloadText = deload ? "Deload hét: -20% volumen javaslat." : "Normál hét.";
  const item = document.createElement("div");
  item.className="item";
  item.innerHTML = `
    <div class="row space">
      <div class="itemTitle">Edzés szint ${lvl}</div>
      <div class="pill">${deloadText}</div>
    </div>
    <div class="itemMeta">Erő: <b>${row?.strength || "—"}</b></div>
    <div class="itemMeta">Kardió Z2: <b>${row?.z2min || "—"}</b> perc · Mobilitás: <b>${row?.mobmin || "—"}</b> perc</div>
    <div class="itemMeta">Munkanap opció: <b>${row?.workday_option || "—"}</b></div>
    <div class="itemMeta">Lépés cél: <b>${row?.steps_target || "—"}</b></div>
    ${row?.note ? `<div class="itemMeta">${row.note}</div>` : ``}
  `;
  box.appendChild(item);

  const sugg = computeScalingSuggestion();
  const hint = document.getElementById("scalingHint");
  if(hint) hint.textContent = `Scaling assist: ${sugg.text}`;

  // auto action button if suggested
  if(sugg.action==="up"){
    const b = document.createElement("button");
    b.className="btn";
    b.textContent = "Szint +1 (ajánlott)";
    b.addEventListener("click", ()=>{
      state.settings.trainingLevel = clamp(lvl+1,1,5);
      saveState();
      renderProfile();
      setStatus("SZINT +1");
    });
    box.appendChild(b);
  }
}

function renderTrainingTable(){
  const box = document.getElementById("trainingTable");
  if(!box) return;
  box.innerHTML = "";
  const rows = Array.isArray(data.training_levels) ? data.training_levels : [];
  if(!rows.length){
    const el=document.createElement("div");
    el.className="item";
    el.textContent="Nincs training_levels adat.";
    box.appendChild(el);
    return;
  }
  rows.forEach(r=>{
    const el=document.createElement("div");
    el.className="item";
    el.innerHTML = `
      <div class="row space">
        <div class="itemTitle">Szint ${r.level}</div>
        <div class="pill">Erő: <b>${r.strength||"—"}</b></div>
      </div>
      <div class="itemMeta">Z2: <b>${r.z2min||"—"}</b> perc · Mobilitás: <b>${r.mobmin||"—"}</b> perc</div>
      ${r.note ? `<div class="itemMeta">${r.note}</div>` : ``}
    `;
    box.appendChild(el);
  });
}

function renderMeasurements(){
  const list = document.getElementById("measureList");
  if(!list) return;
  list.innerHTML = "";
  const rows = Array.isArray(state.measurements) ? state.measurements : [];
  if(!rows.length){
    const el=document.createElement("div");
    el.className="item";
    el.textContent="Nincs mérés.";
    list.appendChild(el);
    return;
  }
  rows.slice(0,25).forEach(m=>{
    const el=document.createElement("div");
    el.className="item";
    el.innerHTML = `
      <div class="row space">
        <div class="itemTitle">${m.date}</div>
        <div class="pill">${m.weight ? `${m.weight} kg` : "—"}</div>
      </div>
      <div class="itemMeta">Derék: <b>${m.waist||"—"}</b> cm ${m.note ? `· ${m.note}` : ""}</div>
    `;
    list.appendChild(el);
  });
}

function renderSummary(){
  const box = document.getElementById("summaryBox");
  if(!box) return;
  const sw = safeNumber(state.settings.startWeight, NaN);
  const cw = safeNumber(state.settings.currentWeight, NaN);
  const gw = safeNumber(state.settings.goalWeight, NaN);
  const d = (Number.isFinite(sw) && Number.isFinite(cw)) ? (sw - cw) : NaN;
  const toGo = (Number.isFinite(cw) && Number.isFinite(gw)) ? (cw - gw) : NaN;
  const closed30 = countClosedLastNDays(30);
  const clear30 = countDailyClearLastNDays(30);

  box.innerHTML = `
    <div class="box"><span>Leadott súly</span><strong>${Number.isFinite(d) ? d.toFixed(1)+" kg" : "—"}</strong></div>
    <div class="box"><span>Célig hátra</span><strong>${Number.isFinite(toGo) ? toGo.toFixed(1)+" kg" : "—"}</strong></div>
    <div class="box"><span>Lezárt nap (30)</span><strong>${closed30}</strong></div>
    <div class="box"><span>Daily clear (30)</span><strong>${clear30}</strong></div>
  `;
}

function countClosedLastNDays(n){
  const today = new Date();
  let c=0;
  for(let i=0;i<n;i++){
    const d = new Date(today); d.setDate(today.getDate()-i);
    const dk = fmtDate(d);
    if(state.quests[dk]?.closed) c++;
  }
  return c;
}
function countDailyClearLastNDays(n){
  const today = new Date();
  let c=0;
  for(let i=0;i<n;i++){
    const d = new Date(today); d.setDate(today.getDate()-i);
    const dk = fmtDate(d);
    if(state.quests[dk]?.closed && isDailyClear(dk)) c++;
  }
  return c;
}

function renderTrend(){
  const canvas = document.getElementById("trendCanvas");
  if(!canvas) return;
  const ctx = canvas.getContext("2d");
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0,0,w,h);
  ctx.fillStyle="rgba(0,0,0,0)";
  ctx.fillRect(0,0,w,h);

  const today = new Date();
  const points = [];
  for(let i=29;i>=0;i--){
    const d = new Date(today); d.setDate(today.getDate()-i);
    const dk = fmtDate(d);
    const day = state.quests[dk] || {};
    points.push({
      steps: safeNumber(day.steps, NaN),
      sleep: safeNumber(day.sleep, NaN),
      weight: safeNumber(day.weight, NaN)
    });
  }

  // normalize and draw 3 lines (steps, sleep, weight)
  function drawSeries(vals){
    const finite = vals.filter(v=>Number.isFinite(v));
    if(!finite.length) return;
    const min = Math.min(...finite), max = Math.max(...finite);
    const span = (max-min) || 1;
    ctx.beginPath();
    for(let i=0;i<vals.length;i++){
      const v = vals[i];
      const x = (i/(vals.length-1))*(w-40)+20;
      const y = h-20 - ((Number.isFinite(v)?(v-min)/span:0))* (h-60);
      if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    }
    ctx.stroke();
  }

  ctx.lineWidth=2;

  // Steps
  ctx.strokeStyle="rgba(124,92,255,.85)";
  drawSeries(points.map(p=> p.steps));

  // Sleep
  ctx.strokeStyle="rgba(60,230,165,.85)";
  drawSeries(points.map(p=> p.sleep));

  // Weight (invert)
  const ws = points.map(p=> p.weight);
  const finiteW = ws.filter(v=>Number.isFinite(v));
  if(finiteW.length){
    const min = Math.min(...finiteW), max=Math.max(...finiteW), span=(max-min)||1;
    ctx.strokeStyle="rgba(255,204,102,.85)";
    ctx.beginPath();
    for(let i=0;i<ws.length;i++){
      const v=ws[i];
      const x=(i/(ws.length-1))*(w-40)+20;
      const y=20 + ((Number.isFinite(v)?(v-min)/span:0))*(h-60); // inverted
      if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    }
    ctx.stroke();
  }
}

function renderInventory(){
  ensureInventory();
  const list = document.getElementById("inventoryList");
  if(!list) return;
  list.innerHTML = "";

  const owned = state.cosmetics.badges || [];
  const pinned = state.cosmetics.pinnedBadges || ["","",""];
  const slots = document.getElementById("badgeSlots");
  if(slots) slots.textContent = `Slotok: ${pinned.map((b,i)=> b?`#${i+1}:${b}`:`#${i+1}:—`).join("  ")}`;

  // collections pill
  const colPill = document.getElementById("collectionPill");
  if(colPill){
    const ownedSet = new Set(owned.map(b=>b.name));
    const done = COLLECTIONS.filter(c=> c.badges.every(b=>ownedSet.has(b))).length;
    colPill.textContent = `Collections: ${done}/${COLLECTIONS.length}`;
  }

  if(!owned.length){
    const el=document.createElement("div");
    el.className="item";
    el.textContent="Nincs badge.";
    list.appendChild(el);
    return;
  }

  // sort by rarity then name
  const sorted = [...owned].sort((a,b)=>{
    const ra = RARITY_ORDER.indexOf(a.rarity||"Common");
    const rb = RARITY_ORDER.indexOf(b.rarity||"Common");
    if(ra!==rb) return ra-rb;
    return String(a.name).localeCompare(String(b.name));
  });

  sorted.forEach(b=>{
    const el=document.createElement("div");
    el.className="badgeItem";
    const isPinned = pinned.includes(b.name);
    const color = RARITY_COLOR[b.rarity] || "var(--muted)";
    el.innerHTML = `
      <div>
        <div class="row" style="gap:8px">
          <span class="badgeChip" style="border-color:${color}">${b.name}</span>
          <span class="pill" style="color:${color}; border-color:${color}">${b.rarity}</span>
          ${isPinned ? `<span class="pill">KITŰZVE</span>` : ``}
        </div>
        <div class="meta">Badge</div>
      </div>
      <div class="row" style="gap:8px">
        <button class="btn small" data-pin=\"${encodeURIComponent(b.name)}\">Kitűzés</button>
        <button class="btn small ghost\" data-unpin=\"${encodeURIComponent(b.name)}\">Levétel</button>
      </div>
    `;
    list.appendChild(el);
  });

  list.querySelectorAll("[data-pin]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const name = decodeURIComponent(btn.getAttribute("data-pin"));
      const p = state.cosmetics.pinnedBadges;
      if(p.includes(name)) return;
      const empty = p.findIndex(x=>!x);
      if(empty===-1) return setStatus("TELT (3)");
      p[empty]=name;
      saveState();
      renderInventory();
      renderProfile();
    });
  });
  list.querySelectorAll("[data-unpin]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const name = decodeURIComponent(btn.getAttribute("data-unpin"));
      const p = state.cosmetics.pinnedBadges;
      const idx = p.indexOf(name);
      if(idx>=0) p[idx]="";
      saveState();
      renderInventory();
      renderProfile();
    });
  });
}

function renderQuests(){
  activatePenaltyIfNeeded();
  tickPenaltyEscalation();

  const todayKey = fmtDate(new Date());
  const todayPill = document.getElementById("todayPill");
  if(todayPill) todayPill.textContent = `Ma: ${todayKey}`;
  const modPill = document.getElementById("dailyModPill");
  if(modPill) modPill.textContent = `Napi mod: ${todayMod()}`;

  // month/date inputs
  const m = document.getElementById("activeMonth");
  const d = document.getElementById("activeDate");
  if(m) m.value = state.ui.activeMonth || fmtMonth(new Date());
  if(d) d.value = state.ui.activeDate || todayKey;
  const activePill = document.getElementById("activeDayPill");
  if(activePill) activePill.textContent = `Aktív: ${state.ui.activeDate}`;

  // focus mode class
  document.body.classList.toggle("focusMode", !!state.ui.focusMode);
  // Monthly Boss UI
  const mk = monthKeyFromDateKey(state.ui.activeDate);
  const boss = ensureMonthlyBoss(mk);
  const bossPill = document.getElementById("bossPill");
  if(bossPill){
    bossPill.textContent = boss.completed ? "TELJESÍTVE" : (boss.type ? "AKTÍV" : "NINCS");
  }
  const bossHint = document.getElementById("bossHint");
  if(bossHint){
    let action = "válassz feladatot";
    if(boss.type==="WALK20") action = "+20 perc séta";
    if(boss.type==="EXTRA_BLOCK") action = "+1 extra blokk edzés";
    bossHint.textContent = `Havi Boss: ${boss.bossName} — ${action}. (Teljesítés: pipáld ki a napi listában és zárd le a napot.)`;
  }
  const bossActions = document.getElementById("bossActions");
  if(bossActions){
    bossActions.querySelectorAll("button").forEach(btn=> btn.disabled = boss.completed);
  }

  // Penalty card
  renderPenaltyCard();

  // week strip
  renderWeekStrip(state.ui.activeMonth, state.ui.activeDate);

  // heatmap
  renderHeatmap(state.ui.activeMonth);
}

function renderPenaltyCard(){
  const card = document.getElementById("penaltyCard");
  if(!card) return;
  const active = state.penalty.active && !state.penalty.resolved;

  if(!active){
    card.style.display = "none";
    return;
  }
  card.style.display = "block";

  const hint = document.getElementById("penaltyHint");
  const stage = state.penalty.stage;
  const stageText = stage===1 ? "1. szint (24 óra)" : stage===2 ? "2. szint (1 hét)" : "3. szint (hónap vége)";
  if(hint) hint.textContent = `Skálázódó büntetés: ${stageText}. Teljesítsd, mielőtt lejár.`;

  const timerPill = document.getElementById("penaltyTimerPill");
  if(timerPill){
    const left = Math.max(0, state.penalty.expiresAt - Date.now());
    timerPill.textContent = `Hátra: ${formatMs(left)}`;
  }

  const box = document.getElementById("penaltyQuestBox");
  if(!box) return;

  box.innerHTML = "";
  const dk = state.ui.activeDate;
  const day = ensureQuestDay(dk);

  const item = document.createElement("div");
  item.className = "item";
  item.innerHTML = `
    <div class="row space">
      <div>
        <div class="itemTitle">Büntetés (extra feladat)</div>
        <div class="itemMeta">Javaslat: +20 perc séta VAGY +1 extra blokk edzés.</div>
      </div>
      <label class="pill" style="cursor:pointer">
        <input type="checkbox" id="penaltyCheck" ${day.checks?.PENALTY ? "checked" : ""} ${day.closed ? "disabled" : ""} />
        KÉSZ
      </label>
    </div>
  `;
  box.appendChild(item);

  item.querySelector("#penaltyCheck")?.addEventListener("change", (e)=>{
    const dk2 = state.ui.activeDate;
    const d2 = ensureQuestDay(dk2);
    if(d2.closed){ e.target.checked = !!d2.checks?.PENALTY; return; }
    d2.checks.PENALTY = !!e.target.checked;
    saveState();
    renderQuests();
  });
}

function formatMs(ms){
  const s = Math.floor(ms/1000);
  const ss = s%60;
  const m = Math.floor(s/60)%60;
  const h = Math.floor(s/3600)%24;
  const d = Math.floor(s/86400);
  if(d>0) return `${d}n ${pad2(h)}:${pad2(m)}`;
  return `${pad2(h)}:${pad2(m)}:${pad2(ss)}`;
}

function renderHeatmap(monthKey){
  const grid = document.getElementById("heatmapGrid");
  if(!grid) return;
  grid.innerHTML = "";

  const first = startOfMonthDate(monthKey);
  const year = first.getFullYear();
  const month = first.getMonth();
  const daysInMonth = new Date(year, month+1, 0).getDate();
  const startWeekday = (new Date(year, month, 1).getDay()+6)%7; // Mon=0

  // add padding cells
  for(let i=0;i<startWeekday;i++){
    const el = document.createElement("div");
    el.className = "hDay hEmpty";
    el.textContent = "";
    grid.appendChild(el);
  }

  let green=0,yellow=0,red=0;
  for(let day=1; day<=daysInMonth; day++){
    const d = new Date(year, month, day);
    const dk = fmtDate(d);
    const st = state.quests[dk];
    const closed = !!st?.closed;
    const clear = closed && isDailyClear(dk);
    const any = dayHasAnyActivity(st);
    let cls = "hDay";
    if(clear){ cls += " hGreen"; green++; }
    else if(any){ cls += " hYellow"; yellow++; }
    else { cls += " hRed"; red++; }

    const el = document.createElement("div");
    el.className = cls;
    el.innerHTML = `${day}<small>${clear ? "clear" : any ? "partial" : "none"}</small>`;
    el.title = dk;
    el.addEventListener("click", ()=>{
      state.ui.activeMonth = monthKey;
      state.ui.activeDate = dk;
      saveState();
      renderQuests();
    });
    grid.appendChild(el);
  }

  const pill = document.getElementById("heatmapPill");
  if(pill) pill.textContent = `Zöld ${green} · Sárga ${yellow} · Piros ${red}`;
}

function renderWeekStrip(monthKey, activeDateKey){
  const strip = document.getElementById("weekStrip");
  if(!strip) return;
  strip.innerHTML = "";

  // show 7 days around activeDate
  const a0 = parseDateKey(activeDateKey) || fmtDate(new Date());
  const center = new Date(a0+"T12:00:00");
  const dayNr=(center.getDay()+6)%7;
  const mon=new Date(center); mon.setDate(center.getDate()-dayNr);

  for(let i=0;i<7;i++){
    const d = new Date(mon); d.setDate(mon.getDate()+i);
    const dk = fmtDate(d);
    const dayState = ensureQuestDay(dk);

    const list = buildQuestListForDate(dk);
    const required = list.filter(x=>x.required).map(x=>x.id);

    const card = document.createElement("div");
    card.className = "dayCard" + (dayState.closed ? " lock" : "");
    if(dk === activeDateKey) card.style.outline = "2px solid rgba(124,92,255,.55)";
    card.innerHTML = `
      <div class="dayHead">
        <div class="dayName">${["H","K","Sze","Cs","P","Szo","V"][i]}</div>
        <div class="dayDate">${dk}</div>
      </div>
      <div class="stack" id="q_${dk}"></div>
      <div class="kpi">
        <div class="k"><span>Lépés</span><strong>${dayState.steps || "—"}</strong></div>
        <div class="k"><span>Alvás</span><strong>${dayState.sleep || "—"}</strong></div>
        <div class="k"><span>Súly</span><strong>${dayState.weight || "—"}</strong></div>
      </div>
    `;
    strip.appendChild(card);

    const box = card.querySelector(`#q_${CSS.escape(dk)}`);
    // metrics input (only for active day)
    list.forEach(item=>{
      if(item.id==="METRICS"){
        const line=document.createElement("div");
        line.className="item";
        const disabled = dayState.closed || dk!==activeDateKey;
        line.innerHTML = `
          <div class="row" style="gap:8px">
            <label class="field" style="flex:1; margin:0">
              <span>Lépés</span>
              <input type="number" inputmode="numeric" id="steps_${dk}" value="${dayState.steps || ""}" ${disabled?"disabled":""} placeholder="pl. 8000">
            </label>
            <label class="field" style="flex:1; margin:0">
              <span>Alvás (óra)</span>
              <input type="number" step="0.1" inputmode="decimal" id="sleep_${dk}" value="${dayState.sleep || ""}" ${disabled?"disabled":""} placeholder="pl. 7.5">
            </label>
            <label class="field" style="flex:1; margin:0">
              <span>Súly (kg)</span>
              <input type="number" step="0.1" inputmode="decimal" id="weight_${dk}" value="${dayState.weight || ""}" ${disabled?"disabled":""} placeholder="pl. 98.5">
            </label>
          </div>
        `;
        box.appendChild(line);

        if(!disabled){
          line.querySelector(`#steps_${CSS.escape(dk)}`)?.addEventListener("input", (e)=>{
            const d2 = ensureQuestDay(dk);
            d2.steps = String(e.target.value||"");
            saveState();
          });
          line.querySelector(`#sleep_${CSS.escape(dk)}`)?.addEventListener("input", (e)=>{
            const d2 = ensureQuestDay(dk);
            d2.sleep = String(e.target.value||"");
            saveState();
          });
          line.querySelector(`#weight_${CSS.escape(dk)}`)?.addEventListener("input", (e)=>{
            const d2 = ensureQuestDay(dk);
            d2.weight = String(e.target.value||"");
            // also sync settings currentWeight for convenience
            state.settings.currentWeight = String(e.target.value||"");
            saveState();
            renderProfile();
          });
        }
        return;
      }

      const id = item.id;
      const checked = !!dayState.checks?.[id];
      const disabled = dayState.closed || dk !== activeDateKey;

      const c = document.createElement("div");
      c.className = "check";
      const label = item.label;
      c.innerHTML = `
        <label style="display:flex; align-items:center; gap:10px">
          <input type="checkbox" ${checked?"checked":""} ${disabled?"disabled":""}>
          <span>${label}</span>
        </label>
        <span class="pill">${required.includes(id) ? "CORE" : "EXTRA"}</span>
      `;
      const cb = c.querySelector("input[type=checkbox]");
      cb?.addEventListener("change", ()=>{
        const d2 = ensureQuestDay(dk);
        d2.checks[id] = cb.checked;
        saveState();

        // special: Monthly Boss completion
        if(id==="BOSS" && cb.checked){
          const mk = monthKeyFromDateKey(dk);
          completeMonthlyBoss(mk);
        }
        // special: Penalty completion immediate allowed (even without lock)
        if(id==="PENALTY" && cb.checked){
          completePenalty();
        }

        renderQuests();
        renderProfile();
      });
      box.appendChild(c);
    });

    // card click -> set active date
    card.addEventListener("click", (ev)=>{
      // ignore clicks on inputs
      if(ev.target && (ev.target.tagName==="INPUT" || ev.target.tagName==="LABEL" || ev.target.closest("input"))) return;
      state.ui.activeDate = dk;
      state.ui.activeMonth = fmtMonth(d);
      saveState();
      renderQuests();
    });

    if(dayState.manualEdited){
      const tag=document.createElement("div");
      tag.className="hint";
      tag.textContent="Manual edit: igen";
      box.appendChild(tag);
    }
  }

  // Weekly UI
  const wk = getISOWeekKey(activeDateKey);
  const claimed = !!state.meta.weeklyClaims?.[wk];
  const progress = countClosedDaysInWeek(activeDateKey);
  document.getElementById("weeklyPill") && (document.getElementById("weeklyPill").textContent = claimed ? "FELVÉVE" : `${progress}/5`);
  document.getElementById("weeklyHint") && (document.getElementById("weeklyHint").textContent = `Hét: ${wk} · Lezárt napok: ${progress}/5`);
  document.getElementById("weeklyProgLabel") && (document.getElementById("weeklyProgLabel").textContent = `${progress}/5`);
  const pct = Math.floor((progress/5)*100);
  document.getElementById("weeklyProgFill") && (document.getElementById("weeklyProgFill").style.width = `${clamp(pct,0,100)}%`);
  document.getElementById("claimWeeklyBtn") && (document.getElementById("claimWeeklyBtn").disabled = claimed || progress<5);
}

function shiftUiClass(shift){
  if(shift==="É") return "shiftE";
  if(shift==="N") return "shiftN";
  if(shift==="P") return "shiftP";
  return "";
}

function normalizeTimeRangeLabel(timeStr){
  const s = String(timeStr||"").trim();
  if(!s) return { label:"—", start:"", end:"" };
  const m = s.match(/(\d{1,2}:\d{2})\s*[–—\-]\s*(\d{1,2}:\d{2})/);
  if(m) return { label:`${m[1]}–${m[2]}`, start:m[1], end:m[2] };
  const m2 = s.match(/(\d{1,2}:\d{2})/);
  if(m2) return { label:m2[1], start:m2[1], end:"" };
  return { label:s, start:"", end:"" };
}

function getRoutineTypeForSchedule(dateKey, shift){
  const entry = (state.routines && state.routines[dateKey]) ? state.routines[dateKey] : null;
  if(shift==="P"){
    const t = String(entry?.type || "P1").toUpperCase();
    return ["P1","P2","P3","P4"].includes(t) ? t : "P1";
  }
  if(shift==="É") return "É";
  if(shift==="N") return "N";
  // fallback
  const t = String(entry?.type || "P1").toUpperCase();
  return ["P1","P2","P3","P4","N","É"].includes(t) ? t : "P1";
}

function isRoutineLocked(dateKey){
  const entry = (state.routines && state.routines[dateKey]) ? state.routines[dateKey] : null;
  return !!entry?.locked;
}

function setRoutineState(dateKey, patch){
  if(!state.routines || typeof state.routines !== 'object') state.routines = {};
  const prev = state.routines[dateKey] && typeof state.routines[dateKey]==='object' ? state.routines[dateKey] : {};
  state.routines[dateKey] = { ...prev, ...patch };
  saveState();
}

function renderSchedule(){
  const list = document.getElementById("scheduleList");
  if(!list) return;
  list.innerHTML = "";

  // Sync Schedule selectors with global UI state
  const monthInput = document.getElementById("scheduleMonth");
  const dateInput = document.getElementById("scheduleDate");
  const weekPill = document.getElementById("scheduleWeekPill");

  const activeDateKey = parseDateKey(state.ui.activeDate) || fmtDate(new Date());
  const activeMonthKey = state.ui.activeMonth || String(activeDateKey).slice(0,7);

  // normalize + persist
  state.ui.activeDate = activeDateKey;
  state.ui.activeMonth = activeMonthKey;

  if(monthInput) monthInput.value = activeMonthKey;
  if(dateInput) dateInput.value = activeDateKey;
  if(weekPill) weekPill.textContent = `Hét: ${getISOWeekKey(activeDateKey)}`;

  const cal = Array.isArray(data.calendar_2026) ? data.calendar_2026 : [];
  const calIndex = data.byDateCalendar || indexByDate(cal);

  // Heti nézet (Hétfő → Vasárnap) az aktív nap körül
  const center = new Date(activeDateKey+"T12:00:00");
  const dayNr = (center.getDay()+6)%7; // Mon=0..Sun=6
  const mon = new Date(center); mon.setDate(center.getDate()-dayNr);

  const weekKeys = [];
  for(let i=0;i<7;i++){
    const d = new Date(mon); d.setDate(mon.getDate()+i);
    weekKeys.push(fmtDate(d));
  }

  // Aktív nap legyen fent
  const orderedKeys = [activeDateKey, ...weekKeys.filter(k=>k!==activeDateKey)];

  // Summary (heti bontás)
  const cnt = {"N":0, "É":0, "P":0, "":0};
  for(const dk of weekKeys){
    const r = calIndex[dk];
    const shiftRaw = r ? (r["Műszak"] ?? r["Muszak"] ?? r.shift ?? r.Shift ?? "") : "";
    const shift = normalizeShiftCode(shiftRaw);
    cnt[shift] = (cnt[shift]||0) + 1;
  }

  const sum = document.createElement("div");
  sum.className = "item";
  sum.innerHTML = `
    <div class="row space">
      <div>
        <div class="itemTitle">Beosztás · Heti nézet</div>
        <div class="itemMeta">Aktív nap: <b>${activeDateKey}</b> · Hét: <b>${getISOWeekKey(activeDateKey)}</b></div>
        <div class="itemMeta" style="margin-top:6px">
          <span class="pill shiftN" style="margin-right:6px">Nappali</span>
          <span class="pill shiftE" style="margin-right:6px">Éjjeles</span>
          <span class="pill shiftP">Pihenő</span>
        </div>
      </div>
      <div class="pill">N: ${cnt["N"]||0} · É: ${cnt["É"]||0} · P: ${cnt["P"]||0}</div>
    </div>
  `;
  list.appendChild(sum);

  const templates = (data.routine_templates && typeof data.routine_templates === 'object') ? data.routine_templates : null;
  const dayLabels = ["H","K","Sze","Cs","P","Szo","V"]; // Hétfő..Vasárnap
  const labelByKey = {};
  weekKeys.forEach((k,i)=> labelByKey[k]=dayLabels[i]||"");

  orderedKeys.forEach(dk=>{
    const calRow = calIndex[dk] || null;
    const shiftRaw = calRow ? (calRow["Műszak"] ?? calRow["Muszak"] ?? calRow.shift ?? calRow.Shift ?? "") : "";
    const note = calRow ? String(calRow["Megjegyzés"] ?? calRow["Megjegyzes"] ?? calRow.note ?? "") : "";
    const shift = normalizeShiftCode(shiftRaw);

    const plan = data.byDateDaily?.[dk] || null;
    const dayName = plan?.["Nap"] ?? plan?.["Day"] ?? "";
    const timeTxt = plan?.["Idő"] ?? plan?.["Ido"] ?? plan?.["Time"] ?? "";
    const workout = getWorkoutSuggestion(plan);
    const workoutCode = String(plan?.["Edzés kód"] ?? plan?.["Edzes kod"] ?? "").trim();

    const shiftCls = shiftUiClass(shift);
    const routineType = getRoutineTypeForSchedule(dk, shift);
    const locked = isRoutineLocked(dk);
    const routineRows = templates?.[routineType] || [];

    const dayEl = document.createElement('div');
    dayEl.className = `item scheduleDay ${shiftCls}${dk===activeDateKey ? ' activeDay' : ''}`;

    // Header
    const head = document.createElement('div');
    head.className = 'row space';

    const left = document.createElement('div');
    left.innerHTML = `
      <div class="itemTitle">${labelByKey[dk] ? (labelByKey[dk] + ' · ') : ''}${dk}${dayName ? ' · '+dayName : ''}</div>
      <div class="itemMeta">${timeTxt ? timeTxt : ''}${note ? (timeTxt ? ' · ' : '') + escapeHtml(note) : ''}</div>
    `;

    const right = document.createElement('div');
    right.className = 'row';

    const shiftPill = document.createElement('div');
    shiftPill.className = `pill shiftPill ${shiftCls}`;
    shiftPill.textContent = `Műszak: ${shift || '—'}`;
    right.appendChild(shiftPill);

    if(workoutCode){
      const wc = document.createElement('div');
      wc.className = 'pill';
      wc.textContent = workoutCode;
      right.appendChild(wc);
    }

    if(dk===activeDateKey){
      const tag = document.createElement('div');
      tag.className = 'pill activeTag';
      tag.textContent = 'AKTÍV';
      right.appendChild(tag);
    }

    head.appendChild(left);
    head.appendChild(right);
    dayEl.appendChild(head);

    // Click header -> set active day
    head.addEventListener('click', ()=>{
      if(state.ui.activeDate === dk) return;
      state.ui.activeDate = dk;
      state.ui.activeMonth = String(dk).slice(0,7);
      saveState();
      renderQuests();
      renderSchedule();
      renderMeal();
    });

    if(truthyCell(workout)){
      const w = document.createElement('div');
      w.className = 'itemMeta';
      w.innerHTML = `<b>Edzés javaslat:</b> ${escapeHtml(String(workout).trim())}`;
      dayEl.appendChild(w);
    }

    // Routine block
    const routineBlock = document.createElement('div');
    routineBlock.className = 'routineBlock';

    const routineTop = document.createElement('div');
    routineTop.className = 'row space';

    const rtLeft = document.createElement('div');
    rtLeft.innerHTML = `<div class="routineTitle">Napi rutin</div>`;

    const rtRight = document.createElement('div');
    rtRight.className = 'row';

    // Rest day selector (P)
    if(shift === 'P'){
      const label = document.createElement('div');
      label.className = 'itemMeta';
      label.textContent = 'Szabadnap típus';

      const sel = document.createElement('select');
      sel.className = 'scheduleSelect';
      ['P1','P2','P3','P4'].forEach(t=>{
        const opt = document.createElement('option');
        opt.value = t;
        opt.textContent = t;
        sel.appendChild(opt);
      });
      sel.value = routineType;
      sel.disabled = locked;

      const saveBtn = document.createElement('button');
      saveBtn.className = 'btn small';
      saveBtn.textContent = 'Mentés';
      saveBtn.disabled = locked;

      const unlockBtn = document.createElement('button');
      unlockBtn.className = 'btn ghost small';
      unlockBtn.textContent = 'Feloldás';
      unlockBtn.disabled = !locked;

      sel.addEventListener('change', ()=>{
        if(isRoutineLocked(dk)) return;
        setRoutineState(dk, { type: sel.value, locked: false });
        renderSchedule();
      });

      saveBtn.addEventListener('click', ()=>{
        if(isRoutineLocked(dk)) return;
        setRoutineState(dk, { type: sel.value, locked: true });
        setStatus('RUTIN MENTVE');
        renderSchedule();
      });

      unlockBtn.addEventListener('click', ()=>{
        if(!isRoutineLocked(dk)) return;
        if(state.settings.antiCheat){
          const reason = prompt('Feloldás indoka (manual edit):');
          if(!reason) return;
          if(!Array.isArray(state.meta.manualEdits)) state.meta.manualEdits = [];
          state.meta.manualEdits.push({ dateKey: dk, ts: Date.now(), reason: String(reason).slice(0,200) });
        }
        setRoutineState(dk, { locked: false });
        setStatus('FELOLDVA');
        renderSchedule();
      });

      rtRight.appendChild(label);
      rtRight.appendChild(sel);
      rtRight.appendChild(saveBtn);
      rtRight.appendChild(unlockBtn);
    }else{
      const chip = document.createElement('div');
      chip.className = 'pill';
      chip.textContent = `Rutin: ${routineType}`;
      rtRight.appendChild(chip);
    }

    routineTop.appendChild(rtLeft);
    routineTop.appendChild(rtRight);
    routineBlock.appendChild(routineTop);

    const routineList = document.createElement('div');
    routineList.className = 'routineList';

    if(!templates){
      const empty = document.createElement('div');
      empty.className = 'itemMeta';
      empty.textContent = 'Nincs betöltve a „Napi rutin” sablon (routine_templates).';
      routineList.appendChild(empty);
    }else if(!routineRows.length){
      const empty = document.createElement('div');
      empty.className = 'itemMeta';
      empty.textContent = `Nincs rutin sablon ehhez: ${routineType}`;
      routineList.appendChild(empty);
    }else{
      routineRows.forEach(rr=>{
        const t = normalizeTimeRangeLabel(rr.time);

        const row = document.createElement('div');
        row.className = 'routineRow';

        const time = document.createElement('div');
        time.className = 'timeBadge';
        time.textContent = t.label;

        const txt = document.createElement('div');
        txt.className = 'routineText';
        txt.innerHTML = `
          <div class="routineActivity"><b>${escapeHtml(String(rr.activity||''))}</b>${rr.note ? `<span class="routineNote"> · ${escapeHtml(String(rr.note))}</span>` : ''}</div>
        `;

        const tag = document.createElement('div');
        tag.className = 'pill small';
        tag.textContent = 'RUTIN';

        row.appendChild(time);
        row.appendChild(txt);
        row.appendChild(tag);
        routineList.appendChild(row);
      });
    }

    routineBlock.appendChild(routineList);
    dayEl.appendChild(routineBlock);
    list.appendChild(dayEl);
  });
}


function renderMeal(){
  const todayBox = document.getElementById("mealToday");
  const list = document.getElementById("mealList");
  if(!todayBox || !list) return;

  const rows = Array.isArray(data.menu_2026) ? data.menu_2026 : [];
  if(rows.length===0){
    todayBox.innerHTML = `<div class="item">Nincs menu_2026 adat.</div>`;
    list.innerHTML = "";
    return;
  }

  const todayKey = fmtDate(new Date());
  const monthKey = state.ui.activeMonth || fmtMonth(new Date());

  function dateOf(r){
    return extractDateKey(r) || String(r["Dátum"]||r["Datum"]||r.date||r.Date||"");
  }
  function pickField(r, keys){
    for(const k of keys){
      if(r && r[k] !== undefined && r[k] !== null && String(r[k]).trim() !== "") return String(r[k]).trim();
    }
    return "";
  }

  const soupKeys = ["Leves","Leves (ha főzés/maradék)","Leves (ha fozes/maradek)"];
  const mainKeys = ["Főétel","Foetel","Főetel"];
  const typeKeys = ["Menü típus","Menu tipus","Menü tipus","Típus","Tipus"];
  const kcalKeys = ["Ebéd+vacsora kcal (becsült)","Ebed+vacsora kcal (becsult)","Kcal"];
  const packKeys = ["Csomagolható","Csomagolhato"];

  const pick = rows.find(r=> dateOf(r)===todayKey) || rows.find(r=> dateOf(r).slice(0,7)===monthKey) || rows[0];

  const soup = pickField(pick, soupKeys);
  const main = pickField(pick, mainKeys);
  const type = pickField(pick, typeKeys);
  const kcal = pickField(pick, kcalKeys);
  const pack = pickField(pick, packKeys);

  todayBox.innerHTML = `
    <div class="item">
      <div class="row space">
        <div class="itemTitle">Mai menü (${todayKey})</div>
        <div class="pill">${type || "—"}</div>
      </div>
      <div class="itemMeta">${[soup, main].filter(Boolean).join(" · ") || "—"}</div>
      <div class="itemMeta">${kcal ? `Kcal: <b>${kcal}</b>` : ""}${pack ? ` · Csomagolható: <b>${pack}</b>` : ""}</div>
    </div>
  `;

  const monthRows = rows
    .map(r=>({r, dk: dateOf(r)}))
    .filter(x=> x.dk && String(x.dk).slice(0,7)===monthKey)
    .sort((a,b)=> a.dk.localeCompare(b.dk));

  const rowsToShow = monthRows.length ? monthRows : rows
    .map(r=>({r, dk: dateOf(r)}))
    .filter(x=> x.dk)
    .sort((a,b)=> a.dk.localeCompare(b.dk))
    .slice(0, 40);

  list.innerHTML = "";
  rowsToShow.forEach(x=>{
    const r = x.r;
    const dk = x.dk;
    const s2 = pickField(r, soupKeys);
    const m2 = pickField(r, mainKeys);
    const t2 = pickField(r, typeKeys);
    const k2 = pickField(r, kcalKeys);
    const p2 = pickField(r, packKeys);

    const el = document.createElement("div");
    el.className = "item";
    el.innerHTML = `
      <div class="row space">
        <div class="itemTitle">${dk}</div>
        <div class="pill">${t2 || "—"}</div>
      </div>
      <div class="itemMeta">${[s2, m2].filter(Boolean).join(" · ") || "—"}</div>
      ${(k2 || p2) ? `<div class="itemMeta">${k2 ? `Kcal: <b>${k2}</b>` : ""}${p2 ? ` · Csomagolható: <b>${p2}</b>` : ""}</div>` : ``}
    `;
    list.appendChild(el);
  });
}

function renderAll(){
  renderProfile();
  renderQuests();
  renderSchedule();
  renderMeal();
}

/* ---------- Init ---------- */
const state = loadState();
let data = {
  settings:null,
  training_levels:null,
  daily_plan_2026:null,
  menu_2026:null,
  calendar_2026:null,
  routine_templates:null,
  byDateDaily: {},
  byDateCalendar: {}
};

document.addEventListener("DOMContentLoaded", async ()=>{
  bindTabs();
  bindTopWidgets();
  bindProfile();
  bindMeasurements();
  bindQuests();
  bindSchedule();

  // immediate
  renderProfile();
  renderQuests();
  renderSchedule();
  renderMeal();

  // load data
  const loaded = await loadAllData();
  data = { ...data, ...loaded };
  data.byDateDaily = indexByDate(data.daily_plan_2026);
  data.byDateCalendar = indexByDate(data.calendar_2026);

  // merge defaults from settings json (only if empty)
  if(data.settings && typeof data.settings === "object"){
    const sw = data.settings["Kezdő súly (kg)"];
    const gw = data.settings["Célsúly (kg)"];
    const cw = data.settings["Aktuális súly (kg)"];
    const tl = data.settings["Edzés-szint (1–5)"];
    if(!state.settings.startWeight && sw!=null) state.settings.startWeight = String(sw);
    if(!state.settings.goalWeight && gw!=null) state.settings.goalWeight = String(gw);
    if(!state.settings.currentWeight && cw!=null) state.settings.currentWeight = String(cw);
    if((!state.settings.trainingLevel || state.settings.trainingLevel===1) && tl!=null) state.settings.trainingLevel = clamp(Number(tl),1,5);
  }

  // city select
  const citySel = document.getElementById("citySelect");
  if(citySel) citySel.value = state.settings.city || "Budapest";

  saveState();
  renderAll();

  // Clock + Weather loops
  formatClock();
  refreshWeather(true);
  setInterval(formatClock, 1000);
  setInterval(()=> refreshWeather(false), 60*1000);
  setInterval(()=>{ activatePenaltyIfNeeded(); tickPenaltyEscalation(); renderPenaltyCard(); }, 1000);
  setInterval(maybeNotifyDaily, 60*1000);

  // notifications permission if enabled
  if(state.settings.notifDaily) ensureNotificationPermission();
});
