// 행성 착륙 미션 — 화면과 조작
(function () {
  'use strict';
  const S = window.Sim;
  const $ = id => document.getElementById(id);
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const money = S.fmtMoney;

  // ───── 저장 ─────
  const KEY_REC = 'landing-mission-record-v1';
  const KEY_CFG = 'landing-mission-config-v1';
  function load(key, def) {
    try { return Object.assign({}, def, JSON.parse(localStorage.getItem(key) || '{}')); } catch (e) { return Object.assign({}, def); }
  }
  function save(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) { /* 저장 불가 */ } }

  const record = load(KEY_REC, { total: 0, wins: 0, tries: 0 });
  const st = load(KEY_CFG, {
    planetId: 'moon', custom: { g: 9.8, air: 1, days: 30 },
    material: 'steel', crew: 3, fuel: 10, o2: 20, food: 30, kits: 2, mode: 'manual',
  });

  // ───── 보조 함수 ─────
  const fmtKg = kg => kg < 1000 ? `${Math.round(kg)} kg` : `${(kg / 1000).toFixed(kg < 10000 ? 2 : 1)} t`;
  const fmtNum = (x, d = 1) => (Math.round(x * Math.pow(10, d)) / Math.pow(10, d)).toLocaleString('ko-KR');
  const fmtAlt = h => h >= 1000 ? [fmtNum(h / 1000, 1), 'km'] : [String(Math.round(h)), 'm'];
  const airFromSlider = p => p <= 0 ? 0 : Math.pow(10, (p - 50) / 25);
  const sliderFromAir = a => a <= 0 ? 0 : clamp(Math.round(25 * Math.log10(a) + 50), 1, 100);
  const fmtAir = a => a <= 0 ? '없음' : a < 0.1 ? `${a.toFixed(3)}배` : a < 10 ? `${a.toFixed(2)}배` : `${a.toFixed(0)}배`;
  const stars = d => { const n = clamp(Math.ceil(d * 5), 1, 5); return '★'.repeat(n) + '☆'.repeat(5 - n); };

  function currentPlanet() {
    if (st.planetId === 'custom') {
      const c = st.custom;
      const hue = Math.round((200 + c.g * 9 - Math.log10(c.air + 0.01) * 30) % 360);
      return { id: 'custom', name: '나만의 행성', g: c.g, air: c.air, days: c.days,
        color: `hsl(${hue}, 45%, 56%)`, desc: '중력, 대기, 거리를 직접 정한 행성이에요.' };
    }
    return S.PLANETS.find(p => p.id === st.planetId) || S.PLANETS[0];
  }
  function cfg() {
    return { planet: currentPlanet(), material: st.material, crew: st.crew, fuel: st.fuel,
      o2: st.o2, food: st.food, kits: st.kits, mode: st.mode };
  }
  function fillAmount(kind) {
    const p = currentPlanet();
    const rate = kind === 'o2' ? S.RATE.o2 : S.RATE.food;
    const max = kind === 'o2' ? S.LIMITS.o2 : S.LIMITS.food;
    return Math.min(max, Math.ceil(p.days * st.crew * rate * 1.2 / 10) * 10);
  }

  function personSvg(alive, dead) {
    const c = dead ? '#4a5170' : alive ? '#4fd1ff' : '#26325f';
    const x = dead ? '<path d="M7 9l12 12M19 9L7 21" stroke="#ff5c6c" stroke-width="2.5" stroke-linecap="round"/>' : '';
    return `<svg viewBox="0 0 26 34" aria-hidden="true"><circle cx="13" cy="8" r="6" fill="${c}"/><path d="M2 33c0-9 5-14 11-14s11 5 11 14z" fill="${c}"/>${x}</svg>`;
  }

  // ───── 준비 화면 ─────
  const COST_COLORS = { hull: '#a78bfa', crew: '#4fd1ff', fuel: '#ff9f43', o2: '#7dd3fc', food: '#3ee08f', kits: '#ffd166' };
  const COST_NAMES = { hull: '선체', crew: '선원', fuel: '연료', o2: '산소', food: '음식·물', kits: '수리도구' };

  function buildPlanetList() {
    const box = $('planetList');
    const list = S.PLANETS.concat([{ id: 'custom', name: '직접 만들기', custom: true }]);
    box.innerHTML = list.map(p => {
      const pp = p.custom ? currentPlanet() : p;
      const info = S.planetInfo(pp);
      const halo = pp.air >= 1 ? ' halo' : '';
      const orb = p.custom
        ? `<div class="orb" style="background:conic-gradient(#ff5a36,#ffd166,#3ee08f,#4fd1ff,#a78bfa,#ff5a36)"></div>`
        : `<div class="orb${halo}" style="background:radial-gradient(circle at 35% 35%, #fff6, transparent 45%), ${p.color}"></div>`;
      return `<button type="button" class="planet" data-planet="${p.id}">${orb}<b>${p.name}</b>
        <span class="stars">${stars(info.difficulty)}</span><small>${money(info.reward)}</small></button>`;
    }).join('');
    box.querySelectorAll('.planet').forEach(b => b.addEventListener('click', () => {
      st.planetId = b.dataset.planet; refresh();
    }));
  }

  function buildMaterials() {
    const box = $('matList');
    const maxOf = k => Math.max(...S.MATERIALS.map(m => m[k]));
    const mx = { mass: maxOf('mass'), hp: maxOf('hp'), heat: maxOf('heat'), pressure: maxOf('pressure'), safeV: maxOf('safeV'), fail: maxOf('fail') };
    const failText = f => f >= 1.3 ? '잦음' : f >= 0.95 ? '보통' : f >= 0.6 ? '적음' : '아주 적음';
    box.innerHTML = S.MATERIALS.map(m => {
      const row = (label, val, frac, text, bad) =>
        `<dt>${label}</dt><dd><div class="bar"><i class="${bad ? 'bad' : ''}" style="width:${Math.round(clamp(frac, 0.04, 1) * 100)}%"></i></div></dd><dd class="v">${text}</dd>`;
      return `<button type="button" class="mat" data-mat="${m.id}">
        <div class="head"><span class="swatch" style="background:${m.color}"></span><b>${m.name}</b><small>${money(m.cost)}</small></div>
        <p>${m.desc}</p>
        <dl>
          ${row('무게', m.mass, m.mass / mx.mass, `${m.mass} t`, true)}
          ${row('내구도', m.hp, m.hp / mx.hp, `${m.hp}`)}
          ${row('내열', m.heat, m.heat / mx.heat, `${m.heat.toLocaleString()}℃`)}
          ${row('내압', m.pressure, Math.log(m.pressure) / Math.log(mx.pressure), `${m.pressure}기압`)}
          ${row('충격', m.safeV, m.safeV / mx.safeV, `${m.safeV} m/s`)}
          ${row('고장', m.fail, m.fail / mx.fail, failText(m.fail), true)}
        </dl>
      </button>`;
    }).join('');
    box.querySelectorAll('.mat').forEach(b => b.addEventListener('click', () => { st.material = b.dataset.mat; refresh(); }));
  }

  function bindPrep() {
    $('crewMinus').onclick = () => { st.crew = Math.max(1, st.crew - 1); refresh(); };
    $('crewPlus').onclick = () => { st.crew = Math.min(S.LIMITS.crew, st.crew + 1); refresh(); };
    $('kitMinus').onclick = () => { st.kits = Math.max(0, st.kits - 1); refresh(); };
    $('kitPlus').onclick = () => { st.kits = Math.min(S.LIMITS.kits, st.kits + 1); refresh(); };
    $('sO2').oninput = e => { st.o2 = +e.target.value; refresh(); };
    $('sFood').oninput = e => { st.food = +e.target.value; refresh(); };
    $('sFuel').oninput = e => { st.fuel = +e.target.value; refresh(); };
    $('cG').oninput = e => { st.custom.g = +e.target.value; refresh(); };
    $('cA').oninput = e => { st.custom.air = airFromSlider(+e.target.value); refresh(); };
    $('cD').oninput = e => { st.custom.days = +e.target.value; refresh(); };
    document.querySelectorAll('[data-fill]').forEach(b => b.onclick = () => {
      st[b.dataset.fill] = fillAmount(b.dataset.fill); refresh();
    });
    document.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => { st.mode = b.dataset.mode; refresh(); });
    $('launch').onclick = launch;
  }

  function refresh() {
    const c = cfg(), p = c.planet, info = S.planetInfo(p), mat = S.material(c.material);
    const cost = S.costOf(c), pv = S.preview(c);
    save(KEY_CFG, st);

    // 행성
    buildPlanetList();
    document.querySelectorAll('.planet').forEach(b => b.classList.toggle('on', b.dataset.planet === st.planetId));
    $('customBox').hidden = st.planetId !== 'custom';
    $('cG').value = st.custom.g; $('oCg').textContent = `${st.custom.g.toFixed(1)} m/s²`;
    $('cA').value = sliderFromAir(st.custom.air); $('oCa').textContent = fmtAir(st.custom.air);
    $('cD').value = st.custom.days; $('oCd').textContent = `${st.custom.days}일`;
    $('planetDetail').innerHTML = `
      <p class="desc"><b style="color:var(--text)">${p.name}</b> — ${p.desc}</p>
      <div class="chips">
        <span>중력<b>${p.g.toFixed(2)} m/s²</b> (지구의 ${(p.g / 9.81).toFixed(2)}배)</span>
        <span>대기 밀도<b>${p.air <= 0 ? '없음' : '지구의 ' + fmtAir(p.air)}</b></span>
        <span>땅의 기압<b>${info.pressure < 0.01 ? '거의 0' : fmtNum(info.pressure, info.pressure < 10 ? 2 : 0)}기압</b></span>
        <span>여정<b>${p.days}일</b></span>
        <span>진입 속도<b>${Math.round(info.v0).toLocaleString()} m/s</b></span>
      </div>
      <div class="reward-box"><span>착륙 성공 보상</span><b>${money(info.reward)}</b></div>
      <div class="diff">난이도 <div class="track"><i style="width:${Math.max(3, info.difficulty * 100)}%"></i></div>${Math.round(info.difficulty * 100)}점</div>`;

    // 재료
    document.querySelectorAll('.mat').forEach(b => b.classList.toggle('on', b.dataset.mat === st.material));

    // 선원
    $('crewNum').textContent = st.crew;
    $('crewMinus').disabled = st.crew <= 1; $('crewPlus').disabled = st.crew >= S.LIMITS.crew;
    let icons = '';
    for (let i = 0; i < S.LIMITS.crew; i++) icons += personSvg(i < st.crew, false);
    $('crewIcons').innerHTML = icons;
    $('crewInfo').innerHTML = `1명당 <b>${money(S.PRICE.crew)}</b>, ${S.MASS.crew} kg (좌석·장비 포함) · 수리 성공률 <b>${Math.round(S.repairChance(st.crew) * 100)}%</b> · 살아서 착륙한 선원 1명당 탐사 보너스 <b>+10%</b>`;

    // 보급품
    $('sO2').value = st.o2; $('oO2').textContent = `${fmtKg(st.o2)} · ${money(cost.o2)}`;
    $('sFood').value = st.food; $('oFood').textContent = `${fmtKg(st.food)} · ${money(cost.food)}`;
    const daysBar = (bar, label, days) => {
      const frac = clamp(days / (p.days * 1.5), 0, 1);
      $(bar).style.width = `${frac * 100}%`;
      $(bar).classList.toggle('low', days < p.days);
      $(label).textContent = `${Math.floor(days)}일분 / 여정 ${p.days}일`;
    };
    daysBar('barO2', 'dO2', pv.o2Days);
    daysBar('barFood', 'dFood', pv.foodDays);
    $('kitNum').textContent = st.kits;
    $('kitMinus').disabled = st.kits <= 0; $('kitPlus').disabled = st.kits >= S.LIMITS.kits;
    const expBreak = p.days * 0.035 * mat.fail;
    $('kitInfo').innerHTML = `1개 <b>${money(S.PRICE.kit)}</b>, ${S.MASS.kit} kg · 고장 1번 고치는 데 1개씩 써요 (실패하면 1개 더). 이번 여정 예상 고장 <b>약 ${expBreak < 1 ? fmtNum(expBreak, 1) : Math.round(expBreak)}회</b>`;

    // 연료
    $('sFuel').value = st.fuel; $('oFuel').textContent = `${fmtNum(st.fuel, 1)} t · ${money(cost.fuel)}`;
    const landFuel = Math.max(0, st.fuel - pv.travelFuel);
    const arrMass = pv.mass - pv.travelFuel * 1000 - Math.min(st.o2, p.days * st.crew) - Math.min(st.food, p.days * st.crew * 2);
    const dv = S.ISP * 9.80665 * Math.log(arrMass / Math.max(1, arrMass - landFuel * 1000));
    const twrArr = S.THRUST / (arrMass * p.g);
    $('fuelInfo').innerHTML = `
      <div><span>여정에 쓸 연료</span><b>${fmtNum(pv.travelFuel, 2)} t</b></div>
      <div class="${landFuel <= 0 ? 'bad' : ''}"><span>착륙에 쓸 연료</span><b>${fmtNum(landFuel, 2)} t</b></div>
      <div><span>엔진 최대 분사 시간</span><b>${fmtNum(landFuel * 1000 / S.MDOT, 1)}초</b></div>
      <div class="${dv < info.v0 ? 'bad' : 'ok'}"><span>줄일 수 있는 속도</span><b>${Math.round(dv).toLocaleString()} m/s</b></div>
      <div class="${twrArr < 1 ? 'bad' : twrArr < 1.5 ? '' : 'ok'}"><span>추력 ÷ 무게 (도착 때)</span><b>${fmtNum(twrArr, 2)}배</b></div>`;

    // 예산
    const over = cost.total > S.BUDGET + 1e-9;
    const left = S.BUDGET - cost.total;
    $('left').textContent = money(left); $('left').classList.toggle('over', over);
    $('spent').textContent = money(cost.total);
    const denom = Math.max(S.BUDGET, cost.total);
    $('budgetBar').innerHTML = Object.keys(COST_NAMES).map(k =>
      `<i style="width:${cost[k] / denom * 100}%;background:${COST_COLORS[k]}" title="${COST_NAMES[k]}"></i>`).join('');
    const detail = {
      hull: mat.name, crew: `${st.crew}명`, fuel: `${fmtNum(st.fuel, 1)} t`,
      o2: fmtKg(st.o2), food: fmtKg(st.food), kits: `${st.kits}개`,
    };
    $('receipt').innerHTML = Object.keys(COST_NAMES).map(k =>
      `<li><i class="dot" style="background:${COST_COLORS[k]}"></i><span>${COST_NAMES[k]} · ${detail[k]}</span><b>${money(cost[k])}</b></li>`).join('');

    $('summary').innerHTML = `
      <dt>출발 무게</dt><dd>${fmtNum(pv.mass / 1000, 1)} t</dd>
      <dt>산소</dt><dd>${isFinite(pv.o2Days) ? Math.floor(pv.o2Days) : 0}일분</dd>
      <dt>음식·물</dt><dd>${isFinite(pv.foodDays) ? Math.floor(pv.foodDays) : 0}일분</dd>
      <dt>예상 고장</dt><dd>약 ${fmtNum(expBreak, 1)}회</dd>
      <dt>성공 보상</dt><dd style="color:var(--yellow)">${money(info.reward)}</dd>`;

    const W = [];
    if (over) W.push(['stop', `예산을 ${money(-left)} 넘었어요. 무언가를 줄여야 발사할 수 있어요.`]);
    if (pv.o2Days < p.days) W.push(['warn', `산소가 ${Math.floor(pv.o2Days)}일분뿐이에요. 여정(${p.days}일) 중에 모두 숨져요.`]);
    if (pv.foodDays + S.STARVE_DAYS < p.days) W.push(['warn', `음식이 ${Math.floor(pv.foodDays)}일분뿐이에요. 도중에 굶어서 선원이 숨져요.`]);
    if (landFuel <= 0) W.push(['warn', '연료가 여정에 쓸 양보다 적어요. 도착하자마자 추락해요.']);
    else if (twrArr < 1) W.push(['warn', '우주선이 너무 무거워요. 엔진을 다 켜도 이 행성의 중력을 이기지 못해요.']);
    else if (dv < info.v0) W.push(['warn', `연료로 줄일 수 있는 속도(${Math.round(dv)} m/s)가 진입 속도(${Math.round(info.v0)} m/s)보다 작아요. 공기의 도움이 없으면 부딪혀요.`]);
    if (info.pressure > mat.pressure) W.push(['warn', `${mat.name}은(는) ${mat.pressure}기압까지만 견뎌요. 이 행성 땅의 기압은 ${fmtNum(info.pressure, 0)}기압이에요.`]);
    if (st.kits === 0 && expBreak >= 0.3) W.push(['warn', '수리도구가 없어요. 고장이 나면 고칠 수 없어요.']);
    if (!W.length) W.push(['good', '준비 완료! 이제 발사해 보세요.']);
    $('warnings').innerHTML = W.map(([k, t]) => `<li class="${k}">${t}</li>`).join('');

    document.querySelectorAll('[data-mode]').forEach(b => b.classList.toggle('on', b.dataset.mode === st.mode));
    $('modeHint').textContent = st.mode === 'manual'
      ? '착륙할 때 엔진을 직접 켜고 꺼요. 일찍 감속하면 대기 마찰열을 줄일 수 있어요.'
      : '컴퓨터가 땅에 닿기 직전에 알아서 감속해요. 대신 마찰열은 신경 쓰지 않아요.';
    $('launch').disabled = over;
    $('launch').textContent = over ? '예산 초과' : `발사! → ${p.name}`;
  }

  function showRecord() {
    $('recTotal').textContent = money(record.total);
    $('recWins').textContent = `${record.wins} / ${record.tries}`;
  }

  // ───── 비행 ─────
  const canvas = $('view'), ctx = canvas.getContext('2d');
  let W = 0, H = 0, DPR = 1;
  let ms = null;               // 진행 중인 미션
  let mode = 'travel';         // travel | ready | descent | over
  let tspeed = 1, dayClock = 0;
  let autoOn = false, engineDown = false, warpSel = 'auto', warpNow = 1;
  let starsBg = [], terrain = [], particles = [];
  let shake = 0, flash = 0, lastHp = 0, endTimer = 0;
  let warned = {};
  let lastCfg = null;

  function resize() {
    const r = canvas.getBoundingClientRect();
    DPR = Math.min(2, window.devicePixelRatio || 1);
    W = r.width; H = r.height;
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  window.addEventListener('resize', () => { if (!$('flight').hidden) resize(); });

  function rng(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function launch() {
    const c = cfg();
    if (S.costOf(c).total > S.BUDGET + 1e-9) return;
    lastCfg = JSON.parse(JSON.stringify(st));
    startMission(c);
  }

  function startMission(c) {
    ms = S.createMission(c);
    record.tries++; save(KEY_REC, record); showRecord();
    mode = 'travel'; dayClock = 0; autoOn = c.mode === 'auto'; engineDown = false; warpSel = 'auto';
    particles = []; shake = 0; flash = 0; endTimer = 0; warned = {};
    $('prep').hidden = true; $('flight').hidden = false;
    $('hudTravel').hidden = false; $('hudLand').hidden = true;
    $('travelCtl').hidden = false; $('landCtl').hidden = true;
    $('landReady').hidden = true; $('result').hidden = true;
    $('log').innerHTML = ''; $('ticker').innerHTML = '';
    $('tDest').textContent = c.planet.name; $('tDays').textContent = `/ ${c.planet.days}일`;
    const r = rng(Math.floor(Math.random() * 1e9));
    starsBg = Array.from({ length: 220 }, () => ({ x: r(), y: r(), s: r() * 1.6 + 0.3, tw: r() * 6.28 }));
    terrain = [];
    for (let i = 0; i <= 60; i++) terrain.push(Math.sin(i * 0.7 + r() * 2) * 6 + r() * 10 + (i % 13 === 0 ? 18 * r() : 0));
    resize();
    addLog(`${c.planet.name}(으)로 출발! 선원 ${c.crew}명, ${S.material(c.material).name} 우주선.`, 'info', 'D+0');
    updateSide();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function addLog(text, type, stamp) {
    const li = document.createElement('li');
    li.className = type || '';
    li.innerHTML = `<em>${stamp}</em>${text}`;
    $('log').prepend(li);
  }
  function tick(text, type) {
    const box = $('ticker');
    const d = document.createElement('div');
    d.className = type || ''; d.textContent = text;
    box.appendChild(d);
    while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => d.remove(), 3800);
  }
  function stampT() {
    const t = ms.d ? ms.d.t : 0;
    return `T+${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
  }

  function meter(id, frac, text) {
    const el = $(id);
    el.querySelector('b').textContent = text;
    el.querySelector('i').style.width = `${clamp(frac, 0, 1) * 100}%`;
    el.classList.toggle('low', frac < 0.4 && frac >= 0.15);
    el.classList.toggle('crit', frac < 0.15);
  }
  function updateSide() {
    const c = ms.cfg, p = ms.planet;
    meter('mHp', ms.hp / ms.hpMax, `${Math.max(0, Math.round(ms.hp / ms.hpMax * 100))}%`);
    meter('mFuel', c.fuel > 0 ? ms.fuel / (c.fuel * 1000) : 0, fmtKg(ms.fuel));
    const left = Math.max(0, p.days - ms.day);
    const o2d = ms.crewAlive ? ms.o2 / (ms.crewAlive * S.RATE.o2) : 0;
    const fd = ms.crewAlive ? ms.food / (ms.crewAlive * S.RATE.food) : 0;
    meter('mO2', c.o2 > 0 ? ms.o2 / c.o2 : 0, `${fmtKg(ms.o2)} · ${Math.floor(o2d)}일분`);
    meter('mFood', c.food > 0 ? ms.food / c.food : 0, `${fmtKg(ms.food)} · ${Math.floor(fd)}일분`);
    $('mO2').classList.toggle('crit', mode === 'travel' && o2d < left);
    $('mFood').classList.toggle('crit', mode === 'travel' && fd < left);
    $('fKits').textContent = `${ms.kits}개`;
    $('fEngine').textContent = `${Math.round(ms.engine * 100)}%`;
    let icons = '';
    for (let i = 0; i < ms.crew; i++) icons += personSvg(i < ms.crewAlive, i >= ms.crewAlive);
    $('fCrew').innerHTML = icons;
  }

  // 여정 하루씩
  function travelUpdate(dt) {
    const days = ms.planet.days;
    const dayLen = clamp(12 / days, 0.06, 0.8) / tspeed;
    dayClock += dt;
    while (dayClock >= dayLen && ms.phase === 'travel') {
      dayClock -= dayLen;
      const hpBefore = ms.hp;
      const ev = S.travelDay(ms);
      for (const e of ev) {
        addLog(e.text, e.type, `D+${ms.day}`);
        if (e.type !== 'info') tick(e.text, e.type);
        if (e.type === 'break' || e.type === 'death') flash = 1;
        if (e.type === 'fix') flash = Math.max(flash, 0.5);
      }
      if (ms.hp < hpBefore) shake = 0.6;
    }
    $('tDay').textContent = `D+${ms.day}`;
    if (ms.phase === 'landing') { dayClock = 0; showReady(); }
    else if (ms.phase === 'end') { mode = 'over'; endTimer = 1.4; }
  }

  function showReady() {
    mode = 'ready';
    const d = ms.d;
    $('readyTitle').textContent = `${ms.planet.name} 도착!`;
    $('readyText').innerHTML = `고도 <b>${fmtNum(d.h / 1000, 1)} km</b>에서 초속 <b>${Math.round(-d.vy)} m</b>로 떨어지기 시작해요.<br>
      남은 연료 <b>${fmtKg(ms.fuel)}</b> · 선체 내구도 <b>${Math.round(ms.hp / ms.hpMax * 100)}%</b> · 선원 <b>${ms.crewAlive}명</b>`;
    $('readySafe').textContent = ms.mat.safeV;
    syncModeButtons();
    $('landReady').hidden = false;
  }
  function syncModeButtons() {
    document.querySelectorAll('#landReady [data-mode]').forEach(b => b.classList.toggle('on', (b.dataset.mode === 'auto') === autoOn));
    $('autoBtn').classList.toggle('on', autoOn);
    $('autoBtn').innerHTML = autoOn ? '자동 조종 끄기 <kbd>A</kbd>' : '자동 조종 켜기 <kbd>A</kbd>';
  }

  function beginDescent() {
    $('landReady').hidden = true;
    $('hudTravel').hidden = true; $('hudLand').hidden = false;
    $('travelCtl').hidden = true; $('landCtl').hidden = false;
    mode = 'descent'; lastHp = ms.hp;
    addLog(`하강 시작 (${autoOn ? '자동 조종' : '직접 조종'})`, 'info', stampT());
    syncWarp();
  }

  function setAuto(on) {
    if (mode !== 'descent' && mode !== 'ready') return;
    if (autoOn === on) return;
    autoOn = on;
    syncModeButtons();
    if (mode === 'descent') {
      tick(on ? '자동 조종으로 바꿨어요' : '직접 조종으로 바꿨어요', 'info');
      addLog(on ? '자동 조종 켬' : '직접 조종으로 전환', 'info', stampT());
    }
  }

  // 자동 배속: 땅에 닿을 때까지 남은 시간이 길면 빨리 감는다. 엔진을 켜는 동안과 낮은 고도에서는 ×1.
  function autoWarp() {
    const d = ms.d;
    if (d.h < 400 || d.throttle > 0 || (!autoOn && engineDown)) return 1;
    const v = Math.max(5, Math.abs(d.vy));
    return clamp(Math.round(d.h / v / 10), 1, d.vy > 0 ? 5 : 40);
  }
  function syncWarp() {
    document.querySelectorAll('[data-warp]').forEach(b => b.classList.toggle('on', b.dataset.warp === String(warpSel)));
  }

  function descentUpdate(dt) {
    warpNow = warpSel === 'auto' ? autoWarp() : +warpSel;
    $('warpNow').textContent = `×${warpNow}`;
    const simT = dt * warpNow;
    const n = Math.max(1, Math.ceil(simT / (1 / 120)));
    const h = simT / n;
    let res = 'fly';
    for (let i = 0; i < n && res === 'fly'; i++) {
      const thr = autoOn ? S.autopilot(ms) : (engineDown ? 1 : 0);
      res = S.descentStep(ms, thr, h);
    }
    const d = ms.d;
    if (ms.hp < lastHp - 0.05) shake = Math.min(1, shake + 0.15);
    lastHp = ms.hp;

    // 알림
    const once = (k, text, type) => { if (!warned[k]) { warned[k] = 1; tick(text, type); addLog(text, type, stampT()); } };
    if (d.tempC > ms.mat.heat) once('heat', `선체가 견딜 수 있는 온도(${ms.mat.heat}℃)를 넘었어요!`, 'break');
    else if (d.tempC > ms.mat.heat * 0.8) once('heat80', '선체가 뜨겁게 달아오르고 있어요.', 'warn');
    if (d.pressure > ms.mat.pressure) once('press', `바깥 기압이 선체 한계(${ms.mat.pressure}기압)를 넘었어요!`, 'break');
    if (ms.fuel <= 0) once('fuel', '연료가 바닥났어요!', 'death');
    if (ms.hp / ms.hpMax < 0.5) once('hp50', '선체 내구도가 절반 아래로 떨어졌어요.', 'warn');
    if (ms.hp / ms.hpMax < 0.2) once('hp20', '선체가 부서지기 직전이에요!', 'break');

    if (res !== 'fly') {
      mode = 'over'; endTimer = res === 'landed' ? 1.6 : 2.0;
      engineDown = false; $('engineBtn').classList.remove('on');
      const x = W / 2, y = altY(0);
      if (res === 'landed') {
        for (let i = 0; i < 50; i++) particles.push({ x: x + (Math.random() - 0.5) * 30, y, vx: (Math.random() - 0.5) * 160, vy: -Math.random() * 50, life: 1 + Math.random(), c: ms.planet.color, r: 2 + Math.random() * 3 });
        addLog(ms.end.text, 'fix', stampT());
      } else {
        const yy = d.h <= 0 ? y : altY(d.h);
        for (let i = 0; i < 120; i++) {
          const a = Math.random() * 6.28, sp = Math.random() * 260;
          particles.push({ x, y: yy - 15, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60, life: 0.8 + Math.random() * 1.2,
            c: Math.random() < 0.5 ? '#ffb347' : (Math.random() < 0.5 ? '#ff5c6c' : ms.mat.color), r: 2 + Math.random() * 4 });
        }
        shake = 1;
        addLog(ms.end.text, 'death', stampT());
      }
    }
    updateLandHud();
  }

  function updateLandHud() {
    const d = ms.d;
    const [a, u] = fmtAlt(d.h);
    $('lAlt').textContent = a; $('lAltU').textContent = u;
    const down = -d.vy;
    $('lSpd').textContent = (down < 0 ? '↑' : '') + fmtNum(Math.abs(down), Math.abs(down) < 100 ? 1 : 0);
    $('lTemp').textContent = Math.round(d.tempC).toLocaleString();
    $('lTempLim').textContent = `/ ${ms.mat.heat.toLocaleString()}℃`;
    $('lPress').textContent = d.pressure < 0.01 ? '0' : fmtNum(d.pressure, d.pressure < 10 ? 2 : 0);
    $('lPressLim').textContent = `/ ${ms.mat.pressure} atm`;
    const lvl = (el, frac) => { $(el).classList.toggle('warn', frac > 0.8 && frac <= 1); $(el).classList.toggle('danger', frac > 1); };
    lvl('gTemp', (d.tempC + 273) / (ms.mat.heat + 273));
    lvl('gPress', d.pressure / ms.mat.pressure);
    const spdEl = $('lSpd').parentElement;
    spdEl.classList.toggle('danger', d.h < 600 && down > ms.mat.safeV * 3);
    spdEl.classList.toggle('warn', d.h < 600 && down > ms.mat.safeV && down <= ms.mat.safeV * 3);
    $('engineBtn').disabled = ms.fuel <= 0 || mode !== 'descent';
    $('engineBtn').classList.toggle('on', mode === 'descent' && ms.d.throttle > 0);
  }

  // ───── 결과 ─────
  const TIPS = {
    crew: '산소와 음식은 "선원 수 × 여정 일수"만큼 필요해요. 고장으로 잃을 수도 있으니 여유분과 수리도구를 챙겨 보세요.',
    hull: '수리도구를 더 싣거나, 고장이 덜 나고 내구도가 높은 재료를 골라 보세요.',
    nofuel: '여정 중에도 하루 30 kg씩 연료를 써요. 착륙에 쓸 연료까지 넉넉히 실어야 해요.',
    heat: '빠르게 대기에 들어갈수록 뜨거워져요. 내열 온도가 높은 재료를 쓰거나, 직접 조종으로 일찍 엔진을 켜서 속도를 줄여 보세요.',
    pressure: '이 행성 땅의 기압을 견딜 수 있는 재료(내압)를 골라야 해요.',
    impactFuel: '연료가 떨어져서 감속하지 못했어요. 연료를 더 싣거나, 짐을 줄여서 우주선을 가볍게 만들어 보세요.',
    impactHeavy: '우주선이 너무 무거워 엔진으로 버티지 못했어요. 가벼운 재료를 쓰거나 짐을 줄여 보세요.',
    impact: '땅에 닿기 전에 속도를 충분히 줄여야 해요. 자동 조종을 써 보거나, 엔진을 조금 더 일찍 켜 보세요.',
    landed: '성공! 더 어려운 행성에 도전하거나, 더 적은 돈으로 같은 행성에 가 보세요.',
  };

  function showResult() {
    const e = ms.end, d = ms.d, c = ms.cfg;
    const card = $('result').querySelector('.card');
    card.classList.toggle('win', e.ok); card.classList.toggle('lose', !e.ok);
    $('resKicker').textContent = e.ok ? 'MISSION COMPLETE' : 'MISSION FAILED';
    $('resTitle').textContent = e.ok ? `${ms.planet.name} 착륙 성공!` : '미션 실패';
    $('resText').textContent = e.text;
    if (e.ok) {
      record.total += ms.reward.total; record.wins++; save(KEY_REC, record); showRecord();
      $('resReward').hidden = false;
      $('resReward').innerHTML = `<span class="big">+${money(ms.reward.total)}</span>
        <small>기본 보상 ${money(ms.reward.base)} + 탐사 보너스 ${money(ms.reward.bonus)} (생존 선원 ${ms.crewAlive}명 × 10%)</small>`;
    } else {
      $('resReward').hidden = true;
    }
    const rows = [
      ['행성', ms.planet.name], ['선체', ms.mat.name],
      ['생존 선원', `${ms.crewAlive} / ${ms.crew}명`], ['여정', `${ms.day} / ${ms.planet.days}일`],
      ['고장', `${ms.stats.breakdowns}회 (수리 ${ms.stats.repaired}회)`], ['남은 연료', fmtKg(ms.fuel)],
    ];
    if (d) {
      rows.push(['착지 속도', d.touchV ? `${fmtNum(d.touchV, 1)} m/s` : '-'], ['최고 온도', `${Math.round(d.maxTemp).toLocaleString()}℃`],
        ['최대 기압', `${fmtNum(d.maxPress, d.maxPress < 10 ? 2 : 0)}기압`], ['하강 시간', `${Math.round(d.t)}초`]);
    }
    rows.push(['사용 예산', money(S.costOf(c).total)], ['남은 선체', `${Math.round(ms.hp / ms.hpMax * 100)}%`]);
    $('resGrid').innerHTML = rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
    let tip = TIPS[e.code] || '';
    if (e.code === 'impact') {
      const twr = S.THRUST * ms.engine / (S.massNow(ms) * ms.planet.g);
      tip = ms.fuel <= 0 ? TIPS.impactFuel : twr < 1 ? TIPS.impactHeavy : TIPS.impact;
    }
    $('resTip').textContent = tip;
    $('result').hidden = false;
  }

  // ───── 그리기 ─────
  function hexToRgb(col) {
    const tmp = document.createElement('canvas').getContext('2d');
    tmp.fillStyle = col; const h = tmp.fillStyle;   // 정규화된 #rrggbb
    return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  }
  const rgbCache = {};
  function rgb(col) { return rgbCache[col] || (rgbCache[col] = hexToRgb(col)); }
  const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
  const css = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

  function drawStars(alpha, time) {
    for (const s of starsBg) {
      const a = alpha * (0.5 + 0.5 * Math.sin(time * 1.5 + s.tw));
      if (a <= 0.02) continue;
      ctx.fillStyle = `rgba(255,255,255,${a})`;
      ctx.fillRect(s.x * W, s.y * H, s.s, s.s);
    }
  }

  function drawShip(x, y, ang, scale, opts) {
    ctx.save();
    ctx.translate(x, y); ctx.rotate(ang); ctx.scale(scale, scale);
    const col = ms.mat.color;
    // 불꽃 (아래쪽 = +y)
    if (opts.flame) {
      const L = 26 + Math.random() * 18;
      const g = ctx.createLinearGradient(0, 14, 0, 14 + L);
      g.addColorStop(0, 'rgba(255,255,220,1)'); g.addColorStop(0.3, 'rgba(255,170,60,.95)'); g.addColorStop(1, 'rgba(255,60,30,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(-8, 14); ctx.quadraticCurveTo(0, 14 + L * 1.1, 8, 14); ctx.closePath(); ctx.fill();
    }
    // 착륙 다리
    ctx.strokeStyle = '#9aa6c8'; ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.moveTo(-10, 6); ctx.lineTo(-17, 18); ctx.moveTo(10, 6); ctx.lineTo(17, 18); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-20, 18); ctx.lineTo(-14, 18); ctx.moveTo(14, 18); ctx.lineTo(20, 18); ctx.stroke();
    // 몸체
    ctx.fillStyle = col; ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-6, -24); ctx.lineTo(6, -24); ctx.lineTo(15, 8); ctx.lineTo(-15, 8); ctx.closePath();
    ctx.fill(); ctx.stroke();
    // 방열판
    ctx.fillStyle = '#3a2a22';
    ctx.beginPath(); ctx.ellipse(0, 9, 16, 4, 0, 0, Math.PI * 2); ctx.fill();
    // 노즐
    ctx.fillStyle = '#555c70'; ctx.fillRect(-5, 11, 10, 4);
    // 창문
    ctx.fillStyle = '#0d1430'; ctx.beginPath(); ctx.arc(0, -10, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(79,209,255,.85)'; ctx.beginPath(); ctx.arc(-1.2, -11.2, 2.2, 0, Math.PI * 2); ctx.fill();
    // 열기
    if (opts.heat > 0) {
      const hh = Math.min(1.4, opts.heat);
      const g = ctx.createRadialGradient(0, 12, 2, 0, 12, 30 + hh * 20);
      g.addColorStop(0, `rgba(255,240,200,${0.8 * Math.min(1, hh)})`);
      g.addColorStop(0.4, `rgba(255,120,40,${0.55 * Math.min(1, hh)})`);
      g.addColorStop(1, 'rgba(255,60,20,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, 12, 30 + hh * 20, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  function drawTravel(time) {
    ctx.fillStyle = '#03050d'; ctx.fillRect(0, 0, W, H);
    drawStars(1, time);
    const ex = W * 0.14, ey = H * 0.66, px = W * 0.84, py = H * 0.4;
    const cx = W * 0.5, cy = H * 0.08;
    const pr = 26 + ms.planet.g * 1.4;
    // 경로
    const total = ms.planet.days;
    const prog = clamp((ms.day + (mode === 'travel' ? dayClock / (clamp(12 / total, 0.06, 0.8) / tspeed) : 0)) / total, 0, 1);
    const bez = t => [(1 - t) * (1 - t) * ex + 2 * (1 - t) * t * cx + t * t * px, (1 - t) * (1 - t) * ey + 2 * (1 - t) * t * cy + t * t * py];
    ctx.setLineDash([4, 8]); ctx.strokeStyle = 'rgba(143,155,199,.45)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(ex, ey); ctx.quadraticCurveTo(cx, cy, px, py); ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(79,209,255,.9)'; ctx.lineWidth = 3;
    ctx.beginPath();
    for (let i = 0; i <= 60; i++) { const [x, y] = bez(prog * i / 60); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.stroke();
    // 지구
    let g = ctx.createRadialGradient(ex - 12, ey - 12, 4, ex, ey, 44);
    g.addColorStop(0, '#9be7ff'); g.addColorStop(0.6, '#2f7fd6'); g.addColorStop(1, '#123a75');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(ex, ey, 40, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#3ecf7a';
    ctx.beginPath(); ctx.ellipse(ex - 10, ey - 6, 12, 8, 0.6, 0, Math.PI * 2); ctx.ellipse(ex + 14, ey + 12, 9, 6, -0.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#8f9bc7'; ctx.font = '600 13px "Noto Sans KR"'; ctx.textAlign = 'center';
    ctx.fillText('지구', ex, ey + 62);
    // 목적지 행성
    const pc = rgb(ms.planet.color);
    if (ms.planet.air >= 0.5) {
      const ha = clamp(Math.log10(ms.planet.air + 1) / 2, 0.15, 0.6);
      g = ctx.createRadialGradient(px, py, pr * 0.9, px, py, pr * 1.45);
      g.addColorStop(0, css(pc, ha)); g.addColorStop(1, css(pc, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py, pr * 1.45, 0, Math.PI * 2); ctx.fill();
    }
    g = ctx.createRadialGradient(px - pr * 0.35, py - pr * 0.35, 3, px, py, pr);
    g.addColorStop(0, css(mix(pc, [255, 255, 255], 0.45))); g.addColorStop(0.7, css(pc)); g.addColorStop(1, css(mix(pc, [0, 0, 0], 0.5)));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py, pr, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e8edff'; ctx.font = '700 14px "Noto Sans KR"';
    ctx.fillText(ms.planet.name, px, py + pr + 24);
    // 우주선
    const [sx, sy] = bez(prog);
    const [nx, ny] = bez(Math.min(1, prog + 0.01));
    const ang = Math.atan2(ny - sy, nx - sx) + Math.PI / 2;   // 기수를 진행 방향으로
    const jx = shake > 0 ? (Math.random() - 0.5) * 10 * shake : 0;
    if (flash > 0) {
      ctx.strokeStyle = `rgba(255,92,108,${flash})`; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(sx, sy, 26 + (1 - flash) * 30, 0, Math.PI * 2); ctx.stroke();
    }
    if (ms.phase !== 'end' || ms.hp > 0) drawShip(sx + jx, sy, ang, 0.8, { flame: mode === 'travel' && Math.sin(time * 3) > 0.6, heat: 0 });
    // 진행 표시
    ctx.fillStyle = 'rgba(8,12,26,.7)'; ctx.fillRect(20, H - 34, W - 40, 10);
    ctx.fillStyle = '#4fd1ff'; ctx.fillRect(20, H - 34, (W - 40) * prog, 10);
  }

  let h0Draw = 25000;
  function altY(h) {
    const top = 86, ground = H - 64;
    return Math.max(52, ground - (ground - top) * Math.log10(1 + h / 10) / Math.log10(1 + h0Draw / 10));
  }

  function drawDescent(time) {
    const d = ms.d, p = ms.planet;
    h0Draw = d.h0;
    const pc = rgb(p.color);
    const haze = p.air <= 0 ? 0 : clamp(Math.log10(p.air * 30 + 1) / 3.2, 0.06, 0.92);
    // 하늘
    const skyTop = mix([3, 5, 13], mix(pc, [40, 70, 140], 0.4), haze * 0.55);
    const skyBot = mix([6, 8, 20], mix(pc, [150, 190, 255], p.air > 0.5 && p.air < 3 ? 0.4 : 0.1), haze);
    let g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, css(skyTop)); g.addColorStop(1, css(skyBot));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    drawStars(1 - haze, time);

    const jx = shake > 0 ? (Math.random() - 0.5) * 12 * shake : 0, jy = shake > 0 ? (Math.random() - 0.5) * 8 * shake : 0;
    ctx.save(); ctx.translate(jx, jy);

    // 고도 눈금
    ctx.font = '500 11px Orbitron, sans-serif'; ctx.textAlign = 'left';
    const marks = [50000, 20000, 10000, 5000, 2000, 1000, 500, 200, 100, 50, 20, 10];
    for (const m of marks) {
      if (m > d.h0) continue;
      const y = altY(m);
      ctx.strokeStyle = 'rgba(255,255,255,.08)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(64, y); ctx.lineTo(W, y); ctx.stroke();
      ctx.fillStyle = 'rgba(232,237,255,.5)';
      ctx.fillText(m >= 1000 ? `${m / 1000} km` : `${m} m`, 12, y + 4);
    }

    // 땅
    const ground = H - 64;
    const groundCol = mix(pc, [0, 0, 0], 0.35), groundTop = mix(pc, [255, 255, 255], 0.1);
    ctx.fillStyle = css(groundCol);
    ctx.beginPath(); ctx.moveTo(0, H);
    const n = terrain.length - 1;
    for (let i = 0; i <= n; i++) {
      const x = i / n * W;
      const flat = Math.abs(x - W / 2) < 60;
      const y = ground + (flat ? 0 : -terrain[i] * 0.9);
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = css(groundTop); ctx.lineWidth = 2; ctx.stroke();
    // 착륙 지점
    ctx.fillStyle = 'rgba(255,209,102,.8)';
    for (let i = -3; i <= 3; i++) ctx.fillRect(W / 2 + i * 14 - 3, ground + 2, 6, 3);

    // 우주선
    const y = altY(Math.max(0, d.h));
    const heat = (d.tempC - 250) / Math.max(1, ms.mat.heat - 250);
    const alive = !(ms.end && !ms.end.ok && ms.phase === 'end' && ms.hp <= 0);
    if (alive) {
      // 열 꼬리
      if (heat > 0.15) {
        const L = 40 + heat * 90;
        g = ctx.createLinearGradient(0, y - 30, 0, y - 30 - L);
        g.addColorStop(0, `rgba(255,150,60,${clamp(heat * 0.5, 0, 0.6)})`); g.addColorStop(1, 'rgba(255,80,40,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.moveTo(W / 2 - 14, y - 22); ctx.lineTo(W / 2, y - 30 - L); ctx.lineTo(W / 2 + 14, y - 22); ctx.fill();
      }
      drawShip(W / 2, y - 18, 0, 1, { flame: d.throttle > 0 && ms.fuel > 0, heat: heat > 0.15 ? heat : 0 });
      // 속도 표시
      if (mode === 'descent') {
        const down = -d.vy;
        ctx.textAlign = 'left'; ctx.font = '700 13px Orbitron, sans-serif';
        ctx.fillStyle = d.h < 2000 ? (down <= ms.mat.safeV ? '#3ee08f' : down <= ms.mat.safeV * 3 ? '#ffd166' : '#ff5c6c') : 'rgba(232,237,255,.8)';
        ctx.fillText(`${down < 0 ? '↑' : '↓'} ${fmtNum(Math.abs(down), Math.abs(down) < 100 ? 1 : 0)} m/s`, W / 2 + 30, y - 18);
        if (autoOn) { ctx.fillStyle = '#4fd1ff'; ctx.font = '700 11px "Noto Sans KR"'; ctx.fillText('자동 조종', W / 2 + 30, y - 2); }
      }
    }
    // 파티클
    for (const q of particles) {
      ctx.globalAlpha = clamp(q.life, 0, 1);
      ctx.fillStyle = q.c; ctx.beginPath(); ctx.arc(q.x, q.y, q.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // 화면 아래: 안전 속도
    if (mode === 'descent') {
      ctx.fillStyle = 'rgba(8,12,26,.6)'; ctx.fillRect(W - 210, H - 48, 196, 34);
      ctx.fillStyle = '#8f9bc7'; ctx.font = '500 12px "Noto Sans KR"'; ctx.textAlign = 'left';
      ctx.fillText(`안전 착지 속도  ≤ ${ms.mat.safeV} m/s`, W - 198, H - 26);
    }
  }

  function stepParticles(dt) {
    const g = ms ? ms.planet.g * 4 : 40;
    for (const q of particles) { q.x += q.vx * dt; q.y += q.vy * dt; q.vy += g * dt; q.vx *= 0.98; q.life -= dt * 0.7; }
    particles = particles.filter(q => q.life > 0);
  }

  // ───── 메인 루프 ─────
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const time = now / 1000;
    if (ms && !$('flight').hidden) {
      if (mode === 'travel') travelUpdate(dt);
      else if (mode === 'descent') descentUpdate(dt);
      else if (mode === 'over') {
        endTimer -= dt;
        if (endTimer <= 0 && $('result').hidden) showResult();
      }
      shake = Math.max(0, shake - dt * 1.5);
      flash = Math.max(0, flash - dt * 1.2);
      stepParticles(dt);
      if (ms.d && mode !== 'travel') drawDescent(time);
      else drawTravel(time);
      updateSide();
    }
    requestAnimationFrame(frame);
  }

  // ───── 입력 ─────
  function engine(on) {
    if (mode !== 'descent') { engineDown = false; return; }
    if (on && autoOn) setAuto(false);
    engineDown = on;
  }
  window.addEventListener('keydown', e => {
    if ($('flight').hidden) return;
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
      e.preventDefault();
      if (mode === 'ready' && e.code === 'Space') return;
      engine(true);
    } else if (e.code === 'KeyA' && !e.repeat) {
      if (mode === 'descent' || mode === 'ready') setAuto(!autoOn);
    } else if (e.code === 'Enter' && mode === 'ready') {
      beginDescent();
    }
  });
  window.addEventListener('keyup', e => {
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') engine(false);
  });
  window.addEventListener('blur', () => engine(false));
  const eb = $('engineBtn');
  eb.addEventListener('pointerdown', e => { e.preventDefault(); eb.setPointerCapture(e.pointerId); engine(true); });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(t => eb.addEventListener(t, () => engine(false)));
  eb.addEventListener('contextmenu', e => e.preventDefault());
  $('autoBtn').onclick = () => setAuto(!autoOn);
  document.querySelectorAll('#landReady [data-mode]').forEach(b => b.onclick = () => { autoOn = b.dataset.mode === 'auto'; syncModeButtons(); });
  $('startDescent').onclick = beginDescent;
  document.querySelectorAll('[data-tspeed]').forEach(b => b.onclick = () => {
    tspeed = +b.dataset.tspeed;
    document.querySelectorAll('[data-tspeed]').forEach(x => x.classList.toggle('on', x === b));
  });
  document.querySelectorAll('[data-warp]').forEach(b => b.onclick = () => { warpSel = b.dataset.warp === 'auto' ? 'auto' : +b.dataset.warp; syncWarp(); });
  $('retry').onclick = () => { Object.assign(st, lastCfg); startMission(cfg()); };
  $('backPrep').onclick = () => {
    $('flight').hidden = true; $('prep').hidden = false; ms = null; refresh();
  };

  // ───── 시작 ─────
  // 저장된 설정 정리
  if (!S.MATERIALS.some(m => m.id === st.material)) st.material = 'steel';
  st.crew = clamp(Math.round(st.crew) || 1, 1, S.LIMITS.crew);
  st.kits = clamp(Math.round(st.kits) || 0, 0, S.LIMITS.kits);
  if (!localStorage.getItem(KEY_CFG)) { st.o2 = fillAmount('o2'); st.food = fillAmount('food'); }
  document.querySelector('[data-tspeed="1"]').classList.add('on');
  buildMaterials();
  bindPrep();
  refresh();
  showRecord();
  requestAnimationFrame(frame);
})();
