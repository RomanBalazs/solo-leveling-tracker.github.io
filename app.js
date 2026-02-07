// System Tracker 2026 – Vanilla HTML/CSS/JS (GitHub Pages kompatibilis)
// Adatok: ./data/*.json (Excelből generálva)
// Mentés: localStorage

const TABS = [
  { id: 'profile', label: 'Profil' },
  { id: 'quests', label: 'Küldetések' },
  { id: 'schedule', label: 'Beosztás' },
  { id: 'food', label: 'Étkezés' },
];

const LS_KEYS = {
  profile: 'system_profile_v1',
  quest: 'system_questlog_v1',
  inputs: 'system_inputs_v1',
  settingsOverrides: 'system_settings_overrides_v1',
};

function $(sel){ return document.querySelector(sel); }
function el(tag, attrs={}, children=[]){
  const n = document.createElement(tag);
  for (const [k,v] of Object.entries(attrs)){
    if (k === 'class') n.className = v;
    else if (k === 'html') n.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v);
  }
  for (const ch of children) n.append(ch);
  return n;
}

function loadLS(key, fallback){
  try{
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  }catch{
    return fallback;
  }
}
function saveLS(key, value){
  localStorage.setItem(key, JSON.stringify(value));
}

function todayISO(){
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}
function parseISO(s){
  // s = YYYY-MM-DD
  const [y,m,d] = s.split('-').map(Number);
  return new Date(y, m-1, d);
}
function startOfWeekISO(iso){
  // Monday-based
  const d = parseISO(iso);
  const day = d.getDay(); // 0 Sun ... 6 Sat
  const diff = (day === 0 ? -6 : 1 - day);
  d.setDate(d.getDate() + diff);
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const dd = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${dd}`;
}
function addDaysISO(iso, n){
  const d = parseISO(iso);
  d.setDate(d.getDate()+n);
  const y=d.getFullYear();
  const m=String(d.getMonth()+1).padStart(2,'0');
  const dd=String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${dd}`;
}

function rankFromLevel(level){
  if (level >= 51) return 'S';
  if (level >= 41) return 'A';
  if (level >= 31) return 'B';
  if (level >= 21) return 'C';
  if (level >= 11) return 'D';
  return 'E';
}
function neededExp(level){
  return 100 + (level-1)*25;
}
function awardExp(profile, amount, reason=''){
  profile.exp += amount;
  let leveled = false;
  while (profile.exp >= neededExp(profile.level)){
    profile.exp -= neededExp(profile.level);
    profile.level += 1;
    profile.unspent += 1;
    leveled = true;
  }
  profile.rank = rankFromLevel(profile.level);
  saveLS(LS_KEYS.profile, profile);
  if (leveled){
    toast('SYSTEM: Level Up', `Elérted a(z) ${profile.level}. szintet. +1 stat pont. ${reason}`.trim());
  } else {
    toast('SYSTEM', `+${amount} EXP. ${reason}`.trim());
  }
}

let DATA = null;

async function loadData(){
  const files = [
    'settings.json',
    'training_levels.json',
    'daily_plan_2026.json',
    'menu_2026.json',
    'measurements.json',
    'summary_cells.json',
    'calendar_2026.json',
  ];
  const out = {};
  for (const f of files){
    try{
      const r = await fetch(`./data/${f}`, { cache: 'no-store' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      out[f.replace('.json','')] = await r.json();
    }catch(err){
      console.warn('Data load failed:', f, err);
      out[f.replace('.json','')] = [];
    }
  }
  return out;
}


function toast(title, msg){
  let t = document.querySelector('.toast');
  if (!t){
    t = el('div', { class:'toast' }, [
      el('div', { class:'t' }),
      el('div', { class:'m' }),
    ]);
    document.body.append(t);
  }
  t.querySelector('.t').textContent = title;
  t.querySelector('.m').textContent = msg || '';
  t.classList.add('show');
  clearTimeout(toast._tm);
  toast._tm = setTimeout(()=> t.classList.remove('show'), 2400);
}

function getProfile(){
  const fallback = { level: 1, exp: 0, rank: 'E', unspent: 0, stats: { STR:0, END:0, REC:0, DISC:0 } };
  const p = loadLS(LS_KEYS.profile, fallback);
  p.rank = rankFromLevel(p.level);
  return p;
}

function getMergedSettings(){
  const base = DATA.settings || {};
  const ovr = loadLS(LS_KEYS.settingsOverrides, {});
  return { ...base, ...ovr };
}

function renderTabs(active){
  const tabs = $('#tabs');
  tabs.innerHTML = '';
  for (const t of TABS){
    const b = el('button', { class:`tabbtn ${active===t.id?'active':''}` }, []);
    b.textContent = t.label;
    b.addEventListener('click', ()=> {
      location.hash = `#${t.id}`;
    });
    tabs.append(b);
  }
}

function render(){
  const hash = (location.hash || '#profile').slice(1);
  const active = TABS.some(t=>t.id===hash) ? hash : 'profile';
  renderTabs(active);
  const view = $('#view');
  view.innerHTML = '';
  if (active === 'profile') view.append(renderProfile());
  if (active === 'quests') view.append(renderQuests());
  if (active === 'schedule') view.append(renderSchedule());
  if (active === 'food') view.append(renderFood());
}

function renderProfile(){
  const profile = getProfile();
  const settings = getMergedSettings();
  const levels = DATA.training_levels || [];
  const currentLevel = Number(settings['Edzés-szint (1–5)'] || 1);
  const lvlRow = levels.find(x => Number(x['Szint']) === currentLevel);

  const expNeed = neededExp(profile.level);
  const expPct = Math.max(0, Math.min(100, Math.round((profile.exp/expNeed)*100)));

  const root = el('div', { class:'grid cols2' }, []);

  // RPG card
  const rpg = el('div', { class:'card' }, [
    el('h2', { html: 'Profil / RPG' }),
    el('div', { class:'row' }, [
      el('span', { class:'badge', html: `Rang: <b style="color:var(--accent)">${profile.rank}</b>` }),
      el('span', { class:'badge', html: `Szint: <b>${profile.level}</b>` }),
      el('span', { class:'badge', html: `Elkölthető pont: <b>${profile.unspent}</b>` }),
    ]),
    el('div', { class:'hr' }),
    el('div', { class:'kpi' }, [
      el('div', { class:'label', html:'EXP' }),
      el('div', { class:'value', html:`${profile.exp} / ${expNeed}` }),
      el('div', { class:'progress' }, [ el('div', { style:`width:${expPct}%` }) ]),
    ]),
    el('div', { class:'hr' }),
    el('h3', { html:'Stat pontok' }),
    el('div', { class:'row' }, Object.keys(profile.stats).map(key=>{
      const wrap = el('div', { class:'kpi' }, [
        el('div', { class:'label', html:key }),
        el('div', { class:'value', html:String(profile.stats[key]) }),
      ]);
      const btnRow = el('div', { class:'row' }, [
        el('button', { class:'btn secondary', onClick: ()=> {
          if (profile.stats[key] <= 0) return;
          profile.stats[key] -= 1; profile.unspent += 1;
          saveLS(LS_KEYS.profile, profile);
          render();
        } }, []).appendChild(document.createTextNode('−')),
        el('button', { class:'btn', onClick: ()=> {
          if (profile.unspent <= 0) return;
          profile.stats[key] += 1; profile.unspent -= 1;
          saveLS(LS_KEYS.profile, profile);
          render();
        } }, []).appendChild(document.createTextNode('+')),
      ]);
      // quick fix: create real nodes
      wrap.append(el('div', { class:'row' }, [
        el('button', { class:'btn secondary', onClick: ()=> {
          const p = getProfile();
          if (p.stats[key] <= 0) return;
          p.stats[key] -= 1; p.unspent += 1;
          saveLS(LS_KEYS.profile, p);
          render();
        } }, [document.createTextNode('−')]),
        el('button', { class:'btn', onClick: ()=> {
          const p = getProfile();
          if (p.unspent <= 0) return;
          p.stats[key] += 1; p.unspent -= 1;
          saveLS(LS_KEYS.profile, p);
          render();
        } }, [document.createTextNode('+')]),
      ]));
      return wrap;
    }))
  ]);

  // Settings + training level card
  const setCard = el('div', { class:'card' }, [
    el('h2', { html:'Beállítások + Edzés szint (1–5)' }),
    el('div', { class:'row' }, [
      fieldNumber('Kezdő súly (kg)', settings, (k,v)=> saveSetting(k,v)),
      fieldNumber('Célsúly (kg)', settings, (k,v)=> saveSetting(k,v)),
      fieldNumber('Aktuális súly (kg)', settings, (k,v)=> saveSetting(k,v)),
    ]),
    el('div', { class:'hr' }),
    el('div', { class:'row' }, [
      el('div', { class:'field' }, [
        el('label', { html:'Edzés-szint (1–5)' }),
        levelPicker(currentLevel, (n)=>{ saveSetting('Edzés-szint (1–5)', n); render(); }),
      ]),
      el('div', { class:'field', style:'min-width:240px' }, [
        el('label', { html:'Anchor dátum (mintakezdés)' }),
        el('input', { value: settings['Anchor dátum (mintakezdés)'] || '', onChange:(e)=> saveSetting('Anchor dátum (mintakezdés)', e.target.value) }),
      ]),
      el('div', { class:'field', style:'min-width:220px' }, [
        el('label', { html:'Mintakezdés műszak' }),
        el('input', { value: settings['Mintakezdés műszak'] || '', onChange:(e)=> saveSetting('Mintakezdés műszak', e.target.value) }),
      ]),
    ]),
    el('div', { class:'hr' }),
    el('h3', { html:'Edzés terv (aktuális szint)' }),
    lvlRow ? el('div', { class:'grid' }, [
      infoRow('Erő', lvlRow['Erő (A/B) – sorozat x ismétlés']),
      infoRow('Kardió Z2', `${lvlRow['Kardió Z2 (perc)']} perc`),
      infoRow('Mobilitás', `${lvlRow['Mobilitás (perc)']} perc`),
      infoRow('Opció munkanapon', lvlRow['Opció: rövid erősítés munkanapon']),
      infoRow('Lépés cél (átlag)', lvlRow['Lépés cél (átlag)']),
      infoRow('Megjegyzés', lvlRow['Megjegyzés']),
    ]) : el('div', { class:'badge', html:'Nincs edzés terv sor ehhez a szinthez.' }),
  ]);

  // Measurements + summary
  const meas = el('div', { class:'card' }, [
    el('h2', { html:'Mérés (lista)' }),
    renderMeasurementsTable(),
    el('div', { class:'hr' }),
    el('h3', { html:'Új mérés rögzítése (local)' }),
    renderNewMeasurementForm(),
  ]);

  const summary = el('div', { class:'card' }, [
    el('h2', { html:'Összegzés (sheet snapshot)' }),
    renderSummaryMini(),
  ]);

  root.append(rpg);
  root.append(setCard);
  root.append(meas);
  root.append(summary);
  return root;
}

function saveSetting(key, val){
  const ovr = loadLS(LS_KEYS.settingsOverrides, {});
  // numbers
  const num = Number(val);
  ovr[key] = (val === '' || val === null) ? null : (isNaN(num) ? val : num);
  saveLS(LS_KEYS.settingsOverrides, ovr);
}

function infoRow(label, value){
  return el('div', { class:'kpi' }, [
    el('div', { class:'label', html: label }),
    el('div', { class:'value', html: escapeHTML(String(value ?? '—')) }),
  ]);
}
function escapeHTML(s){
  return s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
}

function fieldNumber(label, settings, onSave){
  const v = settings[label] ?? '';
  const input = el('input', { type:'number', step:'0.01', value: v, onChange:(e)=> onSave(label, e.target.value) });
  return el('div', { class:'field' }, [
    el('label', { html: label }),
    input
  ]);
}
function levelPicker(current, onPick){
  const wrap = el('div', { class:'row' }, []);
  for (let i=1;i<=5;i++){
    const b = el('button', { class:`btn ${i===current?'':'secondary'}`, onClick:()=>onPick(i) }, [document.createTextNode(String(i))]);
    wrap.append(b);
  }
  return wrap;
}

function renderMeasurementsTable(){
  const local = loadLS('system_measurements_local_v1', []);
  const all = [...(DATA.measurements || []), ...local].filter(x=>x && x['Dátum']).sort((a,b)=> a['Dátum']<b['Dátum']?-1:1);
  const table = el('table', { class:'table' }, []);
  table.append(el('thead', {}, [el('tr', {}, [
    el('th', { html:'Dátum' }),
    el('th', { html:'Súly (kg)' }),
    el('th', { html:'Derék (cm)' }),
    el('th', { html:'Megjegyzés' }),
  ])]));
  const tb = el('tbody');
  for (const r of all){
    tb.append(el('tr', {}, [
      el('td', { html: r['Dátum'] }),
      el('td', { html: r['Súly (kg)'] ?? '' }),
      el('td', { html: r['Derék (cm)'] ?? '' }),
      el('td', { html: escapeHTML(String(r['Megjegyzés'] ?? '')) }),
    ]));
  }
  table.append(tb);
  return table;
}

function renderNewMeasurementForm(){
  const wrap = el('div', { class:'row' }, []);
  const d = el('input', { type:'date', value: todayISO() });
  const w = el('input', { type:'number', step:'0.01', placeholder:'Súly' });
  const waist = el('input', { type:'number', step:'0.1', placeholder:'Derék' });
  const note = el('input', { placeholder:'Megjegyzés' });
  const btn = el('button', { class:'btn', onClick: ()=>{
    const rec = { 'Dátum': d.value, 'Súly (kg)': w.value ? Number(w.value) : null, 'Derék (cm)': waist.value ? Number(waist.value) : null, 'Megjegyzés': note.value || null };
    const local = loadLS('system_measurements_local_v1', []);
    local.push(rec);
    saveLS('system_measurements_local_v1', local);
    toast('SYSTEM', 'Mérés elmentve (local).');
    render();
  }}, [document.createTextNode('Mentés')]);
  wrap.append(el('div', { class:'field' }, [el('label', { html:'Dátum' }), d]));
  wrap.append(el('div', { class:'field' }, [el('label', { html:'Súly (kg)' }), w]));
  wrap.append(el('div', { class:'field' }, [el('label', { html:'Derék (cm)' }), waist]));
  wrap.append(el('div', { class:'field', style:'min-width:240px' }, [el('label', { html:'Megjegyzés' }), note]));
  wrap.append(btn);
  return wrap;
}

function renderSummaryMini(){
  const cells = DATA.summary_cells || [];
  // show key KPIs if present:
  const pick = (label)=>{
    const a = cells.find(x=>x.v===label);
    if (!a) return null;
    const b = cells.find(x=>x.r===a.r && x.c===a.c+1);
    return b ? b.v : null;
  };
  const startW = pick('Kezdő súly (kg)');
  const targetW = pick('Célsúly (kg)');
  const currentW = pick('Aktuális súly (kg)');
  const deltaW = pick('Változás (kg)');
  const level = pick('Edzés-szint');

  const g = el('div', { class:'grid cols2' }, [
    infoRow('Kezdő súly', startW ?? '—'),
    infoRow('Célsúly', targetW ?? '—'),
    infoRow('Aktuális súly', currentW ?? '—'),
    infoRow('Változás', deltaW ?? '—'),
    infoRow('Edzés-szint', level ?? '—'),
  ]);

  const note = cells.find(x=>typeof x.v==='string' && x.v.includes('A Mérés lapon'));
  const n = note ? el('div', { class:'badge', style:'margin-top:10px' }, [document.createTextNode(note.v)]) : el('div');
  const wrap = el('div', {}, [g, n]);
  return wrap;
}

function renderQuests(){
  const isoToday = todayISO();
  const weekStart = startOfWeekISO(isoToday);
  const days = Array.from({length:7}, (_,i)=> addDaysISO(weekStart,i));

  const daily = DATA.daily_plan_2026 || [];
  const byDate = new Map(daily.map(r => [r['Dátum'], r]));

  const questLog = loadLS(LS_KEYS.quest, {}); // {date:{checks:{k:true}}}
  const inputs = loadLS(LS_KEYS.inputs, {}); // {date:{steps,sleep,weight}}

  const wrapper = el('div', { class:'card' }, [
    el('h2', { html:'Küldetések – Napi terv 2026 (heti nézet)' }),
    el('div', { class:'badge', html:`Aktuális hét kezdete: <b>${weekStart}</b> • Ma: <b>${isoToday}</b>` }),
    el('div', { class:'hr' }),
  ]);

  const grid = el('div', { class:'daygrid' }, []);
  for (const date of days){
    const row = byDate.get(date);
    const isToday = date === isoToday;
    const locked = !isToday;
    const dayName = row?.['Nap'] ?? '';
    const shift = row?.['Műszak'] ?? '';
    const workout = row?.['Edzés javaslat'] ?? '';
    const workoutCode = row?.['Edzés kód'] ?? '';

    const card = el('div', { class:`daycard ${isToday?'today':''} ${locked?'locked':''}` }, [
      el('div', { class:'daytitle', html: `${date}` }),
      el('div', { class:'daymeta', html: `${escapeHTML(dayName)} • ${escapeHTML(shift)} ${workoutCode?('• '+escapeHTML(workoutCode)):''}` }),
      el('div', { class:'daymeta', html: workout ? escapeHTML(workout) : '—' }),
    ]);

    // editable inputs
    const inState = inputs[date] || {};
    const steps = el('input', { type:'number', placeholder:'Lépés (db)', value: inState.steps ?? '', disabled: locked, onChange:(e)=>{ setInput(date,'steps',e.target.value); } });
    const sleep = el('input', { type:'number', step:'0.5', placeholder:'Alvás (óra)', value: inState.sleep ?? '', disabled: locked, onChange:(e)=>{ setInput(date,'sleep',e.target.value); } });
    const weight = el('input', { type:'number', step:'0.1', placeholder:'Súly (kg)', value: inState.weight ?? '', disabled: locked, onChange:(e)=>{ setInput(date,'weight',e.target.value); } });

    card.append(el('div', { class:'row', style:'margin-top:10px' }, [
      el('div', { class:'field' }, [el('label', { html:'Lépés (db)' }), steps]),
      el('div', { class:'field' }, [el('label', { html:'Alvás (óra)' }), sleep]),
      el('div', { class:'field' }, [el('label', { html:'Súly (kg)' }), weight]),
    ]));

    // quests: derive from columns
    const qKeys = deriveQuestKeys(row);
    const st = questLog[date] || { checks:{} };
    for (const q of qKeys){
      const checked = !!st.checks[q.key];
      const cb = el('input', { type:'checkbox', checked, disabled: locked, onChange:(e)=>{
        setQuestCheck(date, q.key, e.target.checked, q.exp, q.label);
      }});
      const label = el('div', { html: `<b>${escapeHTML(q.label)}</b> <span style="color:var(--muted)">+${q.exp} EXP</span>` });
      card.append(el('div', { class:'quest' }, [cb, label]));
    }

    // daily clear
    if (isToday){
      const allChecked = qKeys.length>0 && qKeys.every(q=> !!(questLog[date]?.checks?.[q.key]));
      const btn = el('button', { class:`btn ${allChecked?'':'secondary'}`, disabled: !allChecked, onClick: ()=>{
        const p = getProfile();
        awardExp(p, 50, 'Daily Clear');
      }}, [document.createTextNode('Daily Clear (+50 EXP)')]);
      card.append(el('div', { class:'hr' }));
      card.append(btn);
    }

    grid.append(card);
  }

  wrapper.append(grid);
  return wrapper;
}

function deriveQuestKeys(row){
  if (!row) return [];
  // fix keys
  const fixed = [];
  if (row['Edzés javaslat']){
    fixed.push({ key:'workout_done', label:'Edzés / mozgás (jelöld, ha megvolt)', exp:30 });
  }
  // tasks columns (Mosogatás, Ruhamosás, Takarítás, Főzés, Barátok) – ha van jelölés a sheetben, akkor is legyen quest
  const candidates = ['Mosogatás','Ruhamosás','Takarítás','Főzés','Barátok'];
  for (const c of candidates){
    if (c in row){
      fixed.push({ key:`task_${c}`, label:c, exp:10 });
    }
  }
  // steps/sleep as quests if goals exist
  const settings = getMergedSettings();
  const stepGoal = parseGoal(settings['Munkanap lépésszám (átlag)'] || settings['Pihenőnap lépésszám cél']);
  const sleepGoal = 7.0;
  if (stepGoal){
    fixed.push({ key:'steps_goal', label:`Lépés cél elérése (>= ${stepGoal})`, exp:20 });
  }
  fixed.push({ key:'sleep_goal', label:`Alvás (>= ${sleepGoal} óra)`, exp:20 });
  return fixed;
}
function parseGoal(v){
  if (!v) return null;
  if (typeof v === 'number') return v;
  // string like "6 000–7 000" -> take lower bound
  const s = String(v).replaceAll(' ','');
  const m = s.match(/(\d{3,5})/);
  return m ? Number(m[1]) : null;
}

function setInput(date, key, value){
  const st = loadLS(LS_KEYS.inputs, {});
  if (!st[date]) st[date] = {};
  st[date][key] = value === '' ? null : Number(value);
  saveLS(LS_KEYS.inputs, st);
}

function setQuestCheck(date, qkey, checked, exp, label){
  const questLog = loadLS(LS_KEYS.quest, {});
  if (!questLog[date]) questLog[date] = { checks:{} };
  questLog[date].checks[qkey] = checked;
  saveLS(LS_KEYS.quest, questLog);

  // Auto-award on check, and remove on uncheck? (ne legyen exploit)
  // Egyszerű: csak BEpipáláskor jár, kivétel: ha visszaveszed, nem vonjuk le, de a Daily Clear csak akkor aktív ha mind be van pipálva.
  if (checked){
    const p = getProfile();
    const bonus = exp + Math.min(p.stats.DISC || 0, 10); // DISC ad 0..10 extra
    awardExp(p, bonus, label);
  }
  render();
}

function renderSchedule(){
  const isoToday = todayISO();
  const month = isoToday.slice(0,7); // YYYY-MM
  const entries = (DATA.calendar_2026 || []).slice().sort((a,b)=> a.date<b.date?-1:1);

  const wrap = el('div', { class:'card' }, [
    el('h2', { html:'Beosztás – Naptár 2026' }),
  ]);

  const sel = el('input', { type:'month', value: month, onChange:()=> render() });
  wrap.append(el('div', { class:'row' }, [
    el('div', { class:'field' }, [el('label', { html:'Hónap' }), sel]),
  ]));

  const selected = (document.querySelector('input[type="month"]')?.value) || month;
  const list = entries.filter(e => e.date.startsWith(selected));

  const table = el('table', { class:'table' }, []);
  table.append(el('thead', {}, [el('tr', {}, [
    el('th', { html:'Dátum' }),
    el('th', { html:'Műszak' }),
    el('th', { html:'Edzés kód' }),
    el('th', { html:'Teendők' }),
    el('th', { html:'Nyers' }),
  ])]));
  const tb = el('tbody');
  for (const e of list){
    tb.append(el('tr', {}, [
      el('td', { html: e.date }),
      el('td', { html: escapeHTML(e.shift || '') }),
      el('td', { html: escapeHTML(e.workoutCode || '') }),
      el('td', { html: escapeHTML(e.extra || '') }),
      el('td', { html: escapeHTML(e.raw || '') }),
    ]));
  }
  table.append(tb);
  wrap.append(el('div', { class:'hr' }));
  wrap.append(table);
  return wrap;
}

function renderFood(){
  const isoToday = todayISO();
  const month = isoToday.slice(0,7);
  const menu = DATA.menu_2026 || [];
  const byDate = new Map(menu.map(r => [r['Dátum'], r]));
  const today = byDate.get(isoToday);

  const wrap = el('div', { class:'grid cols2' }, []);

  const todayCard = el('div', { class:'card' }, [
    el('h2', { html:'Étkezés – Mai menü' }),
    today ? el('div', { class:'grid' }, [
      infoRow('Dátum', today['Dátum']),
      infoRow('Menü típus', today['Menü típus']),
      infoRow('Leves', today['Leves (ha főzés/maradék)'] ?? '—'),
      infoRow('Főétel', today['Főétel'] ?? '—'),
      infoRow('Csomagolható', today['Csomagolható'] ?? '—'),
      infoRow('Ebéd+vacsora kcal (becsült)', today['Ebéd+vacsora kcal (becsült)'] ?? '—'),
      infoRow('Napi kcal cél', today['Napi kcal cél'] ?? '—'),
      infoRow('Fehérje cél (g/nap)', today['Fehérje cél (g/nap)'] ?? '—'),
      infoRow('Megjegyzés', today['Megjegyzés'] ?? '—'),
    ]) : el('div', { class:'badge', html:'Nincs adat erre a napra.' }),
  ]);

  const listCard = el('div', { class:'card' }, [
    el('h2', { html:'Étkezés – Havi lista' }),
    el('div', { class:'row' }, [
      el('div', { class:'field' }, [
        el('label', { html:'Hónap' }),
        el('input', { type:'month', value: month, onChange:()=> render() }),
      ]),
    ]),
    el('div', { class:'hr' }),
  ]);

  const selected = document.querySelectorAll('input[type="month"]')[1]?.value || month;
  const list = menu.filter(r => (r['Dátum']||'').startsWith(selected));

  const table = el('table', { class:'table' }, []);
  table.append(el('thead', {}, [el('tr', {}, [
    el('th', { html:'Dátum' }),
    el('th', { html:'Menü' }),
    el('th', { html:'Leves' }),
    el('th', { html:'Főétel' }),
    el('th', { html:'kcal (becsült)' }),
  ])]));
  const tb = el('tbody');
  for (const r of list){
    tb.append(el('tr', {}, [
      el('td', { html: r['Dátum'] }),
      el('td', { html: escapeHTML(String(r['Menü típus'] ?? '')) }),
      el('td', { html: escapeHTML(String(r['Leves (ha főzés/maradék)'] ?? '')) }),
      el('td', { html: escapeHTML(String(r['Főétel'] ?? '')) }),
      el('td', { html: r['Ebéd+vacsora kcal (becsült)'] ?? '' }),
    ]));
  }
  table.append(tb);
  listCard.append(table);

  wrap.append(todayCard);
  wrap.append(listCard);
  return wrap;
}

window.addEventListener('hashchange', render);

(async function init(){
  DATA = await loadData();
  // initialize training level from settings
  const settings = getMergedSettings();
  if (!settings['Edzés-szint (1–5)']){
    saveSetting('Edzés-szint (1–5)', 1);
  }
  // ensure profile exists
  saveLS(LS_KEYS.profile, getProfile());
  // build tabs
  const tabs = $('#tabs');
  for (const t of TABS){
    const b = el('button', { class:'tabbtn' }, [document.createTextNode(t.label)]);
    b.addEventListener('click', ()=> location.hash = `#${t.id}`);
    tabs.append(b);
  }
  render();
})();
