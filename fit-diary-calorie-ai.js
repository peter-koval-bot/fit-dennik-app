(() => {
  "use strict";
  if (window.__FIT_DIARY_SMART_CALORIES__) return;
  window.__FIT_DIARY_SMART_CALORIES__ = true;

  const KEY = "fitDiary.smartCalories.v1";
  const today = () => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,"0");
    const day = String(d.getDate()).padStart(2,"0");
    return `${y}-${m}-${day}`;
  };
  const num = (v, fallback=0) => {
    const n = Number(String(v ?? "").replace(",", "."));
    return Number.isFinite(n) ? n : fallback;
  };
  const round = v => Math.round(Number.isFinite(v) ? v : 0);
  const clamp = (v,a,b) => Math.min(b,Math.max(a,v));
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));

  const defaults = {
    profile: { sex:"male", age:"", weight:"", height:"", bodyFat:"", activity:"1.30" },
    foods: [],
    workouts: [],
    weights: []
  };

  function load(){
    try{
      const x = JSON.parse(localStorage.getItem(KEY) || "{}");
      return {
        profile: {...defaults.profile, ...(x.profile || {})},
        foods: Array.isArray(x.foods) ? x.foods : [],
        workouts: Array.isArray(x.workouts) ? x.workouts : [],
        weights: Array.isArray(x.weights) ? x.weights : []
      };
    }catch(_){ return structuredClone ? structuredClone(defaults) : JSON.parse(JSON.stringify(defaults)); }
  }
  let state = load();
  const save = () => localStorage.setItem(KEY, JSON.stringify(state));

  function bmr(){
    const p = state.profile;
    const w = num(p.weight), h = num(p.height), age = num(p.age), bf = num(p.bodyFat, NaN);
    if (!(w>0 && h>0 && age>0)) return 0;
    if (Number.isFinite(bf) && bf>=3 && bf<=60){
      const lean = w * (1 - bf/100);
      return 370 + 21.6 * lean; // Katch-McArdle
    }
    return 10*w + 6.25*h - 5*age + (p.sex === "female" ? -161 : 5); // Mifflin-St Jeor
  }

  function formulaBase(){
    return bmr() * num(state.profile.activity, 1.30);
  }

  function strengthEstimate(minutes, intensity, weight){
    const mets = {light:3.5, moderate:5.0, hard:6.0};
    const met = mets[intensity] || 5.0;
    const mid = met * 3.5 * weight / 200 * minutes;
    return {met, low:mid*0.82, mid, high:mid*1.18};
  }

  function dateMs(s){ return new Date(`${s}T12:00:00`).getTime(); }

  function smartBase(){
    const base = formulaBase();
    if (!base) return {value:0, active:false, note:"Doplň profil"};

    const weights = state.weights
      .filter(x => x.date && num(x.kg)>0)
      .sort((a,b)=>a.date.localeCompare(b.date));
    if (weights.length < 4) return {value:base, active:false, note:"Smart kalibrácia potrebuje aspoň 4 váženia"};

    const firstMs = dateMs(weights[0].date), lastMs = dateMs(weights.at(-1).date);
    const spanDays = Math.max(1, (lastMs-firstMs)/86400000);
    if (spanDays < 7) return {value:base, active:false, note:"Smart kalibrácia sa zapne po 7+ dňoch"};

    const inRangeFoods = state.foods.filter(x => {
      const ms = dateMs(x.date);
      return ms >= firstMs && ms <= lastMs;
    });
    const foodDays = [...new Set(inRangeFoods.map(x=>x.date))];
    if (foodDays.length < 7) return {value:base, active:false, note:"Potrebných je aspoň 7 dní jedál"};

    // Linear regression weight trend in kg/day to reduce day-to-day water noise.
    const xs = weights.map(x => (dateMs(x.date)-firstMs)/86400000);
    const ys = weights.map(x => num(x.kg));
    const xm = xs.reduce((a,b)=>a+b,0)/xs.length;
    const ym = ys.reduce((a,b)=>a+b,0)/ys.length;
    let top=0, bot=0;
    xs.forEach((x,i)=>{ top+=(x-xm)*(ys[i]-ym); bot+=(x-xm)*(x-xm); });
    const slope = bot ? top/bot : 0;

    const dayIntakes = foodDays.map(d =>
      inRangeFoods.filter(x=>x.date===d).reduce((s,x)=>s+num(x.kcal),0)
    ).filter(v=>v>0);
    const avgIntake = dayIntakes.reduce((a,b)=>a+b,0)/dayIntakes.length;

    const inRangeWorkouts = state.workouts.filter(x => {
      const ms = dateMs(x.date);
      return ms >= firstMs && ms <= lastMs;
    });
    const avgWorkout = inRangeWorkouts.reduce((s,x)=>s+num(x.kcal),0) / (spanDays+1);

    // Approximate energy density of body-mass change. Clamp prevents water-weight
    // fluctuations from causing implausible corrections.
    const adaptiveTotal = avgIntake - slope * 7700;
    const adaptiveBase = adaptiveTotal - avgWorkout;
    const limited = clamp(adaptiveBase, base*0.75, base*1.25);
    const alpha = clamp(0.25 + (foodDays.length-7)*0.025, 0.25, 0.70);
    const value = base*(1-alpha) + limited*alpha;
    return {
      value,
      active:true,
      note:`Kalibrované z ${foodDays.length} dní • trend ${slope>=0?"+":""}${(slope*7).toFixed(2)} kg/týž.`
    };
  }

  function dayData(d=today()){
    const foods = state.foods.filter(x=>x.date===d);
    const workouts = state.workouts.filter(x=>x.date===d);
    const eaten = foods.reduce((s,x)=>s+num(x.kcal),0);
    const protein = foods.reduce((s,x)=>s+num(x.protein),0);
    const carbs = foods.reduce((s,x)=>s+num(x.carbs),0);
    const fat = foods.reduce((s,x)=>s+num(x.fat),0);
    const training = workouts.reduce((s,x)=>s+num(x.kcal),0);
    const sb = smartBase();
    const expenditure = sb.value + training;
    return {foods, workouts, eaten, protein, carbs, fat, training, expenditure, balance:eaten-expenditure, sb};
  }

  const css = `
  #fdce-btn,#fdce-modal{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif}
  #fdce-btn{position:fixed;right:16px;bottom:calc(84px + env(safe-area-inset-bottom));z-index:2147481000;border:0;width:56px;height:56px;border-radius:18px;background:linear-gradient(145deg,#12b9ff,#0877ff);color:white;font-weight:900;font-size:13px;box-shadow:0 14px 34px rgba(0,126,255,.32);display:grid;place-items:center}
  #fdce-btn[hidden]{display:none!important}
  #fdce-modal{position:fixed;inset:0;z-index:2147482000;background:rgba(1,7,14,.72);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);display:none;color:#f4f8ff}
  #fdce-modal.open{display:block}
  #fdce-sheet{position:absolute;left:50%;bottom:0;transform:translateX(-50%);width:min(720px,100%);max-height:92dvh;overflow:auto;background:#07111d;border:1px solid rgba(122,180,230,.18);border-radius:26px 26px 0 0;box-shadow:0 -24px 70px rgba(0,0,0,.45);padding:18px 16px calc(22px + env(safe-area-inset-bottom))}
  .fdce-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}.fdce-title{font-size:21px;font-weight:900}.fdce-sub{font-size:12px;color:#8fa7bf;margin-top:2px}
  .fdce-close{width:38px;height:38px;border-radius:12px;border:1px solid #20354a;background:#0b1a29;color:#dcecff;font-size:22px}
  .fdce-tabs{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;background:#05101b;padding:5px;border:1px solid #152c40;border-radius:15px;position:sticky;top:-18px;z-index:2}
  .fdce-tab{border:0;border-radius:11px;padding:10px 5px;background:transparent;color:#839ab0;font-size:12px;font-weight:800}.fdce-tab.on{background:#10263a;color:#42c4ff}
  .fdce-pane{display:none;padding-top:14px}.fdce-pane.on{display:block}
  .fdce-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}.fdce-card{background:linear-gradient(180deg,#0b1928,#081520);border:1px solid #173149;border-radius:18px;padding:14px}
  .fdce-label{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#7f9bb5;font-weight:800}.fdce-big{font-size:27px;font-weight:950;letter-spacing:-.04em;margin-top:3px}.fdce-unit{font-size:12px;color:#8fa7bf;font-weight:700}
  .fdce-good{color:#4dd79b}.fdce-warn{color:#ffbe55}.fdce-blue{color:#38bfff}
  .fdce-form{display:grid;gap:10px}.fdce-row{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  .fdce-field label{display:block;font-size:11px;color:#8ea7bf;font-weight:800;margin:0 0 5px 2px}.fdce-field input,.fdce-field select{width:100%;height:44px;border:1px solid #1e3a52;border-radius:12px;background:#06121e;color:#eef7ff;padding:0 11px;font-size:16px;outline:none}.fdce-field input:focus,.fdce-field select:focus{border-color:#1caeff;box-shadow:0 0 0 3px rgba(28,174,255,.12)}
  .fdce-primary,.fdce-secondary{height:46px;border-radius:13px;font-weight:900;font-size:14px}.fdce-primary{border:0;background:linear-gradient(90deg,#0aa9f5,#0b79ff);color:white}.fdce-secondary{border:1px solid #20435f;background:#0a1b2a;color:#cfeaff}
  .fdce-section{margin:15px 0 8px;font-size:13px;font-weight:900;color:#dcecff}.fdce-note{font-size:12px;line-height:1.45;color:#88a1b8;margin-top:8px}.fdce-list{display:grid;gap:8px;margin-top:10px}
  .fdce-item{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:11px 12px;border:1px solid #173149;border-radius:14px;background:#081623}.fdce-item strong{font-size:14px}.fdce-item small{display:block;color:#7f9bb5;margin-top:3px}.fdce-del{border:0;background:#25131a;color:#ff8a9c;border-radius:9px;padding:7px 9px;font-weight:800}
  .fdce-bar{height:7px;border-radius:999px;background:#132536;overflow:hidden;margin-top:7px}.fdce-bar>i{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,#0ba9f4,#27d0ff);width:0}
  .fdce-chip{display:inline-flex;align-items:center;gap:6px;border:1px solid #1d465f;background:#082132;border-radius:999px;padding:6px 9px;color:#70d7ff;font-size:11px;font-weight:900}
  .fdce-privacy{margin-top:14px;padding:11px 12px;border-radius:13px;background:#06111b;border:1px solid #14293b;color:#7892aa;font-size:11px;line-height:1.5}
  @media(min-width:721px){#fdce-sheet{bottom:50%;transform:translate(-50%,50%);border-radius:26px;max-height:88vh}}
  @media(max-width:390px){.fdce-grid,.fdce-row{grid-template-columns:1fr}.fdce-tab{font-size:11px;padding:9px 2px}}
  `;

  document.head.insertAdjacentHTML("beforeend", `<style id="fdce-style">${css}</style>`);
  document.body.insertAdjacentHTML("beforeend", `
    <button id="fdce-btn" type="button" aria-label="Smart kalórie"><span>kcal<br><span style="font-size:9px;opacity:.8">SMART</span></span></button>
    <div id="fdce-modal" aria-hidden="true">
      <div id="fdce-sheet" role="dialog" aria-modal="true" aria-label="Smart kalórie">
        <div class="fdce-head">
          <div><div class="fdce-title">Smart kalórie</div><div class="fdce-sub">Jedlo • BMR/TDEE • silový tréning</div></div>
          <button class="fdce-close" id="fdce-close" type="button">×</button>
        </div>
        <div class="fdce-tabs">
          <button class="fdce-tab on" data-tab="overview">Dnes</button>
          <button class="fdce-tab" data-tab="food">Jedlo</button>
          <button class="fdce-tab" data-tab="training">Tréning</button>
          <button class="fdce-tab" data-tab="profile">Profil</button>
        </div>
        <section class="fdce-pane on" data-pane="overview"></section>
        <section class="fdce-pane" data-pane="food"></section>
        <section class="fdce-pane" data-pane="training"></section>
        <section class="fdce-pane" data-pane="profile"></section>
      </div>
    </div>`);

  const $ = (q, root=document) => root.querySelector(q);
  const $$ = (q, root=document) => [...root.querySelectorAll(q)];
  const modal = $("#fdce-modal");
  const button = $("#fdce-btn");

  function overviewHtml(){
    const d=dayData();
    const bal = round(d.balance);
    const haveProfile = bmr()>0;
    return `
      <div class="fdce-grid">
        <div class="fdce-card"><div class="fdce-label">Zjedené</div><div class="fdce-big">${round(d.eaten)} <span class="fdce-unit">kcal</span></div></div>
        <div class="fdce-card"><div class="fdce-label">Výdaj dnes</div><div class="fdce-big">${haveProfile?round(d.expenditure):"—"} <span class="fdce-unit">kcal</span></div></div>
        <div class="fdce-card"><div class="fdce-label">Silový tréning</div><div class="fdce-big fdce-blue">${round(d.training)} <span class="fdce-unit">kcal</span></div></div>
        <div class="fdce-card"><div class="fdce-label">Bilancia</div><div class="fdce-big ${bal<=0?"fdce-good":"fdce-warn"}">${haveProfile?(bal>0?"+":"")+bal:"—"} <span class="fdce-unit">kcal</span></div></div>
      </div>
      <div class="fdce-section">Makrá dnes</div>
      <div class="fdce-card">
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;text-align:center">
          <div><div class="fdce-label">Bielkoviny</div><div style="font-size:20px;font-weight:900;margin-top:3px">${round(d.protein)} g</div></div>
          <div><div class="fdce-label">Sacharidy</div><div style="font-size:20px;font-weight:900;margin-top:3px">${round(d.carbs)} g</div></div>
          <div><div class="fdce-label">Tuky</div><div style="font-size:20px;font-weight:900;margin-top:3px">${round(d.fat)} g</div></div>
        </div>
      </div>
      <div class="fdce-section">Výpočet výdaja</div>
      <div class="fdce-card">
        <div style="display:flex;justify-content:space-between;gap:12px"><span class="fdce-label">BMR</span><strong>${haveProfile?round(bmr())+" kcal":"Doplň profil"}</strong></div>
        <div style="display:flex;justify-content:space-between;gap:12px;margin-top:9px"><span class="fdce-label">Základ bez tréningu</span><strong>${haveProfile?round(d.sb.value)+" kcal":"—"}</strong></div>
        <div style="margin-top:10px"><span class="fdce-chip">${d.sb.active?"SMART KALIBRÁCIA AKTÍVNA":"SMART KALIBRÁCIA SA UČÍ"}</span></div>
        <div class="fdce-note">${esc(d.sb.note)}. Silový tréning sa pripočítava osobitne, aby sa nepočítal dvakrát.</div>
      </div>
      ${!haveProfile?`<button class="fdce-primary" style="width:100%;margin-top:12px" data-jump="profile">Nastaviť profil</button>`:""}
      <div class="fdce-privacy">Výpočty prebiehajú priamo v zariadení. BMR/TDEE aj kalórie zo silového tréningu sú odhady, nie laboratórne meranie. Smart kalibrácia sa spresňuje z trendu hmotnosti a reálne zaznamenaného príjmu.</div>
    `;
  }

  function foodHtml(){
    const d=dayData();
    return `
      <div class="fdce-card">
        <div class="fdce-form">
          <div class="fdce-field"><label>Názov jedla</label><input id="fdce-food-name" placeholder="napr. kuracie prsia + ryža"></div>
          <div class="fdce-row">
            <div class="fdce-field"><label>Kalórie</label><input id="fdce-food-kcal" inputmode="decimal" type="number" min="0" placeholder="kcal"></div>
            <div class="fdce-field"><label>Gramáž (voliteľné)</label><input id="fdce-food-grams" inputmode="decimal" type="number" min="0" value="100"></div>
          </div>
          <div class="fdce-row">
            <div class="fdce-field"><label>Bielkoviny (g)</label><input id="fdce-food-p" inputmode="decimal" type="number" min="0"></div>
            <div class="fdce-field"><label>Sacharidy (g)</label><input id="fdce-food-c" inputmode="decimal" type="number" min="0"></div>
          </div>
          <div class="fdce-field"><label>Tuky (g)</label><input id="fdce-food-f" inputmode="decimal" type="number" min="0"></div>
          <button class="fdce-primary" id="fdce-add-food" type="button">Pridať jedlo</button>
        </div>
      </div>
      <div class="fdce-section">Bezplatný čiarový kód</div>
      <div class="fdce-card">
        <div class="fdce-row">
          <div class="fdce-field"><label>EAN / čiarový kód</label><input id="fdce-barcode" inputmode="numeric" placeholder="napr. 5449000000996"></div>
          <div style="display:flex;align-items:end"><button class="fdce-secondary" id="fdce-load-barcode" style="width:100%" type="button">Načítať produkt</button></div>
        </div>
        <div class="fdce-note" id="fdce-barcode-note">Údaje sa načítajú z otvorenej databázy Open Food Facts. Potom môžeš upraviť gramáž a hodnoty.</div>
      </div>
      <div class="fdce-section">Dnes • ${round(d.eaten)} kcal</div>
      <div class="fdce-list">
        ${d.foods.length ? d.foods.slice().reverse().map(x=>`
          <div class="fdce-item"><div><strong>${esc(x.name||"Jedlo")}</strong><small>${round(x.kcal)} kcal • P ${round(x.protein)} g • S ${round(x.carbs)} g • T ${round(x.fat)} g</small></div><button class="fdce-del" data-del-food="${esc(x.id)}">Zmazať</button></div>`).join("") :
          `<div class="fdce-note">Dnes zatiaľ nemáš zapísané žiadne jedlo.</div>`}
      </div>`;
  }

  function trainingHtml(){
    const w = num(state.profile.weight);
    const d = dayData();
    return `
      <div class="fdce-card">
        <div class="fdce-form">
          <div class="fdce-row">
            <div class="fdce-field"><label>Dĺžka tréningu (min)</label><input id="fdce-tr-min" type="number" inputmode="numeric" min="1" value="60"></div>
            <div class="fdce-field"><label>Intenzita</label><select id="fdce-tr-int"><option value="light">Ľahší • 3,5 MET</option><option value="moderate" selected>Stredný • 5,0 MET</option><option value="hard">Ťažký • 6,0 MET</option></select></div>
          </div>
          <button class="fdce-primary" id="fdce-add-workout" type="button" ${w>0?"":"disabled"}>${w>0?"Vypočítať a pridať tréning":"Najprv doplň hmotnosť v Profile"}</button>
        </div>
        <div class="fdce-note">Používa transparentný MET výpočet podľa tvojej hmotnosti a intenzity. Ukladá stred odhadu, pričom zobrazuje aj realistické rozpätie.</div>
      </div>
      <div class="fdce-section">Dnešné tréningy • ${round(d.training)} kcal</div>
      <div class="fdce-list">
        ${d.workouts.length ? d.workouts.slice().reverse().map(x=>`
          <div class="fdce-item"><div><strong>${esc(x.label||"Silový tréning")}</strong><small>${x.minutes} min • odhad ${round(x.low)}–${round(x.high)} kcal</small></div><button class="fdce-del" data-del-workout="${esc(x.id)}">Zmazať</button></div>`).join("") :
          `<div class="fdce-note">Dnes zatiaľ nemáš zapísaný silový tréning.</div>`}
      </div>`;
  }

  function profileHtml(){
    const p=state.profile;
    const latest = state.weights.slice().sort((a,b)=>b.date.localeCompare(a.date))[0];
    return `
      <div class="fdce-card">
        <div class="fdce-form">
          <div class="fdce-row">
            <div class="fdce-field"><label>Pohlavie pre BMR vzorec</label><select id="fdce-sex"><option value="male" ${p.sex==="male"?"selected":""}>Muž</option><option value="female" ${p.sex==="female"?"selected":""}>Žena</option></select></div>
            <div class="fdce-field"><label>Vek</label><input id="fdce-age" type="number" min="14" max="100" value="${esc(p.age)}"></div>
          </div>
          <div class="fdce-row">
            <div class="fdce-field"><label>Hmotnosť (kg)</label><input id="fdce-weight" type="number" step="0.1" min="30" max="300" value="${esc(p.weight)}"></div>
            <div class="fdce-field"><label>Výška (cm)</label><input id="fdce-height" type="number" min="120" max="230" value="${esc(p.height)}"></div>
          </div>
          <div class="fdce-field"><label>Telesný tuk % (voliteľné — ak ho poznáš)</label><input id="fdce-bf" type="number" step="0.1" min="3" max="60" value="${esc(p.bodyFat)}" placeholder="bez tejto hodnoty sa použije Mifflin–St Jeor"></div>
          <div class="fdce-field"><label>Bežná aktivita mimo tréningu</label><select id="fdce-act"><option value="1.20" ${p.activity==="1.20"?"selected":""}>Sedavý deň • ×1,20</option><option value="1.30" ${p.activity==="1.30"?"selected":""}>Ľahký pohyb • ×1,30</option><option value="1.40" ${p.activity==="1.40"?"selected":""}>Aktívny deň • ×1,40</option><option value="1.55" ${p.activity==="1.55"?"selected":""}>Veľmi aktívna práca • ×1,55</option></select></div>
          <button class="fdce-primary" id="fdce-save-profile" type="button">Uložiť profil</button>
        </div>
      </div>
      <div class="fdce-section">Smart kalibrácia podľa váhy</div>
      <div class="fdce-card">
        <div class="fdce-row">
          <div class="fdce-field"><label>Dnešná hmotnosť (kg)</label><input id="fdce-weight-log" type="number" step="0.1" min="30" max="300" value="${latest?.date===today()?esc(latest.kg):esc(p.weight)}"></div>
          <div style="display:flex;align-items:end"><button class="fdce-secondary" id="fdce-save-weight" style="width:100%" type="button">Zapísať váhu</button></div>
        </div>
        <div class="fdce-note">${esc(smartBase().note)}. Pre stabilnejší odhad používame trend viacerých vážení, nie rozdiel medzi dvoma dňami.</div>
      </div>
      <div class="fdce-privacy">BMR: Mifflin–St Jeor; ak zadáš % tuku, použije sa Katch–McArdle. Smart TDEE koriguje základ len postupne a korekciu obmedzuje, aby krátkodobé zmeny vody nerozhodili výsledok.</div>`;
  }

  function render(){
    $('[data-pane="overview"]').innerHTML=overviewHtml();
    $('[data-pane="food"]').innerHTML=foodHtml();
    $('[data-pane="training"]').innerHTML=trainingHtml();
    $('[data-pane="profile"]').innerHTML=profileHtml();
    bindDynamic();
  }

  function setTab(name){
    $$(".fdce-tab").forEach(x=>x.classList.toggle("on",x.dataset.tab===name));
    $$(".fdce-pane").forEach(x=>x.classList.toggle("on",x.dataset.pane===name));
  }

  function bindDynamic(){
    $$("[data-jump]").forEach(x=>x.onclick=()=>setTab(x.dataset.jump));

    const addFood=$("#fdce-add-food");
    if(addFood) addFood.onclick=()=>{
      const kcal=num($("#fdce-food-kcal").value,NaN);
      if(!(kcal>=0)){ $("#fdce-food-kcal").focus(); return; }
      state.foods.push({
        id:crypto.randomUUID?crypto.randomUUID():String(Date.now()+Math.random()),
        date:today(),
        name:$("#fdce-food-name").value.trim()||"Jedlo",
        kcal,
        protein:num($("#fdce-food-p").value),
        carbs:num($("#fdce-food-c").value),
        fat:num($("#fdce-food-f").value)
      });
      save(); render(); setTab("food");
    };

    const barcodeBtn=$("#fdce-load-barcode");
    if(barcodeBtn) barcodeBtn.onclick=async()=>{
      const code=$("#fdce-barcode").value.trim();
      const note=$("#fdce-barcode-note");
      if(!code){ note.textContent="Zadaj čiarový kód."; return; }
      barcodeBtn.disabled=true; note.textContent="Načítavam produkt…";
      try{
        const r=await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json`);
        const j=await r.json();
        if(!j.product) throw new Error("Produkt sa nenašiel");
        const p=j.product, n=p.nutriments||{};
        const grams=Math.max(1,num($("#fdce-food-grams").value,100));
        const factor=grams/100;
        const kcal=num(n["energy-kcal_100g"],NaN);
        if(!Number.isFinite(kcal)) throw new Error("Produkt nemá údaj o kcal");
        $("#fdce-food-name").value=p.product_name_sk||p.product_name||p.generic_name||"Produkt";
        $("#fdce-food-kcal").value=(kcal*factor).toFixed(0);
        $("#fdce-food-p").value=(num(n.proteins_100g)*factor).toFixed(1);
        $("#fdce-food-c").value=(num(n.carbohydrates_100g)*factor).toFixed(1);
        $("#fdce-food-f").value=(num(n.fat_100g)*factor).toFixed(1);
        note.textContent=`Načítané pre ${grams} g. Skontroluj etiketu a podľa potreby hodnoty uprav.`;
      }catch(e){ note.textContent=`Nepodarilo sa načítať: ${e.message||"chyba"}. Hodnoty môžeš zadať ručne.`; }
      finally{ barcodeBtn.disabled=false; }
    };

    const addWorkout=$("#fdce-add-workout");
    if(addWorkout) addWorkout.onclick=()=>{
      const mins=num($("#fdce-tr-min").value);
      const weight=num(state.profile.weight);
      if(!(mins>0&&weight>0)) return;
      const intensity=$("#fdce-tr-int").value;
      const x=strengthEstimate(mins,intensity,weight);
      const labels={light:"Ľahší silový tréning",moderate:"Silový tréning",hard:"Ťažký silový tréning"};
      state.workouts.push({
        id:crypto.randomUUID?crypto.randomUUID():String(Date.now()+Math.random()),
        date:today(), label:labels[intensity], minutes:mins, intensity,
        kcal:x.mid, low:x.low, high:x.high, met:x.met
      });
      save(); render(); setTab("training");
    };

    const saveProfile=$("#fdce-save-profile");
    if(saveProfile) saveProfile.onclick=()=>{
      state.profile={
        sex:$("#fdce-sex").value,
        age:$("#fdce-age").value,
        weight:$("#fdce-weight").value,
        height:$("#fdce-height").value,
        bodyFat:$("#fdce-bf").value,
        activity:$("#fdce-act").value
      };
      save(); render(); setTab("profile");
    };

    const saveWeight=$("#fdce-save-weight");
    if(saveWeight) saveWeight.onclick=()=>{
      const kg=num($("#fdce-weight-log").value);
      if(!(kg>0)) return;
      const i=state.weights.findIndex(x=>x.date===today());
      const row={date:today(),kg};
      if(i>=0) state.weights[i]=row; else state.weights.push(row);
      state.profile.weight=String(kg);
      save(); render(); setTab("profile");
    };

    $$("[data-del-food]").forEach(x=>x.onclick=()=>{
      state.foods=state.foods.filter(y=>y.id!==x.dataset.delFood);save();render();setTab("food");
    });
    $$("[data-del-workout]").forEach(x=>x.onclick=()=>{
      state.workouts=state.workouts.filter(y=>y.id!==x.dataset.delWorkout);save();render();setTab("training");
    });
  }

  function open(){
    render();
    modal.classList.add("open");
    modal.setAttribute("aria-hidden","false");
    document.documentElement.style.overflow="hidden";
  }
  function close(){
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden","true");
    document.documentElement.style.overflow="";
  }
  button.onclick=open;
  $("#fdce-close").onclick=close;
  modal.addEventListener("click",e=>{ if(e.target===modal) close(); });
  $$(".fdce-tab").forEach(x=>x.onclick=()=>setTab(x.dataset.tab));

  function updateButtonVisibility(){
    const gate=document.querySelector(".gate");
    let visibleGate=false;
    if(gate){
      const s=getComputedStyle(gate);
      visibleGate=s.display!=="none"&&s.visibility!=="hidden"&&gate.getClientRects().length>0;
    }
    button.hidden=visibleGate;
  }
  updateButtonVisibility();
  new MutationObserver(updateButtonVisibility).observe(document.body,{attributes:true,subtree:true,attributeFilter:["class","style"]});
  setInterval(updateButtonVisibility,2000);
})();