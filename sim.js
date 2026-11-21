// 행성 착륙 미션 — 게임 규칙과 물리 (브라우저/Node 공용)
(function (root) {
  'use strict';

  // ───── 기본 상수 ─────
  const BUDGET = 100;            // 예산 (억 원)
  const G0 = 9.80665;            // 표준 중력 (m/s²)
  const EARTH_G = 9.81;
  const EARTH_RHO = 1.225;       // 지구 해수면 대기 밀도 (kg/m³)
  const SCALE_H = 7200;          // 대기 척도 높이 (m): 이만큼 올라갈 때마다 공기가 약 2.7배 옅어짐
  const BASE_ALT = 25000;        // 하강 시작 고도 (m). 대기가 짙으면 더 높은 곳에서 시작
  const THRUST = 2.0e6;          // 엔진 최대 추력 (N)
  const ISP = 340;               // 비추력 (s)
  const MDOT = THRUST / (ISP * G0);   // 최대 추력일 때 초당 연료 소모 (kg/s) ≈ 600
  const CD_A = 1.1 * 20;         // 항력계수 × 정면 면적 (m²)
  const NOSE = 2;                // 앞부분 곡률 반지름 (m) — 공력 가열 계산용
  const CORE_MASS = 5000;        // 엔진·조종석·생명유지장치 (kg)
  const SIGMA = 5.670e-8, EMISS = 0.85, T_AMB = 250;
  const HEAT_SCALE = 14;         // 게임용 가열 배율 (실제 공식 × 14)
  const HEAT_K = 120;            // 내열 한계 초과 시 피해 계수 (내구도/초)
  const PRESS_K = 30;            // 내압 한계 초과 시 피해 계수 (내구도/초)
  const FUEL_PER_DAY = 30;       // 여정 중 궤도 수정에 쓰는 연료 (kg/일)
  const STARVE_DAYS = 3;         // 음식이 떨어진 뒤 버틸 수 있는 날

  // 가격 (억 원)과 무게
  const PRICE = { crew: 3, fuel: 0.5 /* t당 */, o2: 0.01 /* kg당 */, food: 0.005 /* kg당 */, kit: 1.5 /* 개당 */ };
  const MASS = { crew: 300 /* 1명+좌석+장비 kg */, kit: 150 };
  const RATE = { o2: 1, food: 2 };   // 1명이 하루에 쓰는 양 (kg)
  const LIMITS = { crew: 10, fuel: 80, o2: 4000, food: 8000, kits: 10 };

  // ───── 선체 재료 ─────
  // cost: 억 원, mass: t, hp: 내구도, heat: 견디는 온도(℃), pressure: 견디는 기압(atm)
  // safeV: 다치지 않고 닿을 수 있는 착지 속도 (m/s), fail: 고장 잘 나는 정도 (1 = 보통)
  const MATERIALS = [
    { id: 'aluminum', name: '알루미늄', cost: 6, mass: 10, hp: 80, heat: 400, pressure: 15, safeV: 3, fail: 1.4,
      color: '#d7dde4', desc: '가장 싸고 가볍지만 열·압력에 약하고 고장이 잦아요.' },
    { id: 'steel', name: '강철', cost: 10, mass: 32, hp: 130, heat: 1000, pressure: 60, safeV: 4, fail: 1.0,
      color: '#8d9aa8', desc: '싸고 튼튼하지만 아주 무거워서 연료가 많이 들어요.' },
    { id: 'carbon', name: '탄소섬유', cost: 20, mass: 7, hp: 90, heat: 500, pressure: 30, safeV: 3, fail: 1.0,
      color: '#3d434c', desc: '매우 가벼워요. 대신 뜨거운 대기에 들어가면 금방 상해요.' },
    { id: 'titanium', name: '티타늄', cost: 26, mass: 15, hp: 150, heat: 1300, pressure: 90, safeV: 5, fail: 0.8,
      color: '#aab8cc', desc: '가볍고 튼튼한 만능 재료. 값이 조금 비싸요.' },
    { id: 'ceramic', name: '세라믹 복합재', cost: 22, mass: 18, hp: 70, heat: 2000, pressure: 40, safeV: 2, fail: 1.1,
      color: '#efe6d6', desc: '열에는 아주 강하지만 충격에 쉽게 깨져요.' },
    { id: 'tungsten', name: '텅스텐', cost: 32, mass: 60, hp: 200, heat: 3000, pressure: 150, safeV: 4, fail: 0.7,
      color: '#5f6b78', desc: '녹는점이 가장 높은 금속. 엄청나게 무거워요.' },
    { id: 'graphene', name: '그래핀', cost: 48, mass: 5, hp: 170, heat: 1800, pressure: 220, safeV: 5, fail: 0.6,
      color: '#27303a', desc: '가장 가볍고 강한 신소재. 비싸요.' },
    { id: 'vibranium', name: '비브라늄', cost: 65, mass: 9, hp: 260, heat: 2800, pressure: 450, safeV: 12, fail: 0.4,
      color: '#8b6cff', desc: '충격을 흡수하는 전설의 금속. 예산의 절반 넘게 들어요.' },
  ];

  // ───── 행성 ─────
  // g: 중력가속도 (m/s²), air: 대기 밀도 (지구 = 1), days: 지구에서 가는 데 걸리는 날
  const PLANETS = [
    { id: 'moon', name: '달', g: 1.62, air: 0, days: 3, color: '#c9c4bb',
      desc: '공기가 없어서 오로지 엔진으로만 속도를 줄여야 해요.' },
    { id: 'mercury', name: '수성', g: 3.7, air: 0, days: 20, color: '#a39587',
      desc: '공기가 없고 달보다 중력이 두 배 넘게 세요.' },
    { id: 'mars', name: '화성', g: 3.71, air: 0.016, days: 45, color: '#d0643b',
      desc: '공기가 아주 옅어서 거의 도움이 안 돼요.' },
    { id: 'titan', name: '타이탄', g: 1.35, air: 4.4, days: 120, color: '#d9a441',
      desc: '토성의 위성. 중력은 약하고 공기는 지구보다 짙어요. 아주 멀어요.' },
    { id: 'venus', name: '금성', g: 8.87, air: 53, days: 30, color: '#e8c56d',
      desc: '숨 막히게 짙은 대기. 엄청난 압력과 열을 견뎌야 해요.' },
    { id: 'aqua', name: '아쿠아-9', g: 15, air: 3, days: 150, color: '#3fa7d6',
      desc: '지구보다 1.5배 무거운 바다 행성. (가상의 행성)' },
    { id: 'heavyon', name: '헤비론', g: 26, air: 0.05, days: 180, color: '#7a5c8f',
      desc: '중력이 지구의 2.6배. 공기도 거의 없어요. (가상의 행성)' },
    { id: 'inferno', name: '인페르노', g: 30, air: 100, days: 200, color: '#ff5a36',
      desc: '최고 난이도. 최대 중력, 최대 대기. (가상의 행성)' },
  ];
  const CUSTOM_RANGE = { g: [0.5, 30], air: [0, 100], days: [1, 200] };

  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

  // 지표 기압 (atm). 지구 = 1. 공기가 짙고 중력이 셀수록 높아진다.
  function surfacePressure(p) { return p.air * p.g / EARTH_G; }
  // 하강 시작 속도 (m/s): 중력이 센 행성일수록 빨리 떨어지며 들어온다.
  function entrySpeed(p) { return 150 + 60 * p.g; }
  function startAlt(p) { return BASE_ALT + SCALE_H * Math.log(Math.max(1, p.air)); }

  // 난이도 0~1 → 보상 10억 ~ 10조 (1000배)
  function difficulty(p) {
    const gD = clamp(Math.log(p.g / 0.5) / Math.log(60), 0, 1);
    let aD;
    if (p.air < 1) aD = 0.3 * (1 - p.air);          // 공기가 없으면 감속을 엔진에만 의존
    else aD = clamp(Math.log10(p.air) / 2, 0, 1);   // 너무 짙으면 열과 압력
    const dD = clamp(p.days / 200, 0, 1);
    return clamp(0.6 * gD + 0.3 * aD + 0.1 * dD, 0, 1);
  }
  function niceRound(x) {   // 유효숫자 2자리
    if (x <= 0) return 0;
    const e = Math.pow(10, Math.floor(Math.log10(x)) - 1);
    return Math.round(x / e) * e;
  }
  // 10억 × 10000^(난이도^1.5): 쉬운 행성은 10억 근처, 가장 어려운 행성은 10조
  function reward(p) { return niceRound(10 * Math.pow(10000, Math.pow(difficulty(p), 1.5))); }   // 억 원

  function planetInfo(p) {
    return {
      pressure: surfacePressure(p), v0: entrySpeed(p), alt0: startAlt(p),
      difficulty: difficulty(p), reward: reward(p),
    };
  }

  // ───── 우주선 설정 ─────
  // cfg: { planet, material(id), crew, fuel(t), o2(kg), food(kg), kits, mode }
  function material(id) { return MATERIALS.find(m => m.id === id) || MATERIALS[0]; }

  function costOf(cfg) {
    const c = {
      hull: material(cfg.material).cost,
      crew: cfg.crew * PRICE.crew,
      fuel: cfg.fuel * PRICE.fuel,
      o2: cfg.o2 * PRICE.o2,
      food: cfg.food * PRICE.food,
      kits: cfg.kits * PRICE.kit,
    };
    c.total = c.hull + c.crew + c.fuel + c.o2 + c.food + c.kits;
    return c;
  }

  function dryMass(cfg) {   // 연료를 뺀 질량 (kg)
    return CORE_MASS + material(cfg.material).mass * 1000 + cfg.crew * MASS.crew
      + cfg.o2 + cfg.food + cfg.kits * MASS.kit;
  }
  function totalMass(cfg) { return dryMass(cfg) + cfg.fuel * 1000; }

  // 출발 전 참고 수치
  function preview(cfg) {
    const p = cfg.planet;
    const m = totalMass(cfg);
    return {
      mass: m,
      twr: THRUST / (m * p.g),                 // 추력 대 무게 비 (1보다 커야 뜰 수 있다)
      burnTime: cfg.fuel * 1000 / MDOT,        // 최대 추력으로 분사 가능한 시간 (s)
      deltaV: ISP * G0 * Math.log(m / Math.max(1, m - cfg.fuel * 1000)),
      o2Days: cfg.crew > 0 ? cfg.o2 / (cfg.crew * RATE.o2) : Infinity,
      foodDays: cfg.crew > 0 ? cfg.food / (cfg.crew * RATE.food) : Infinity,
      travelFuel: p.days * FUEL_PER_DAY / 1000,   // t
    };
  }

  // ───── 미션 상태 ─────
  function createMission(cfg) {
    const mat = material(cfg.material);
    return {
      cfg, mat, planet: cfg.planet, info: planetInfo(cfg.planet),
      crew: cfg.crew, crewAlive: cfg.crew,
      o2: cfg.o2, food: cfg.food, fuel: cfg.fuel * 1000, kits: cfg.kits,
      hp: mat.hp, hpMax: mat.hp, engine: 1,
      day: 0, starve: 0, phase: 'travel', log: [], end: null,
      stats: { breakdowns: 0, repaired: 0, kitsUsed: 0 },
    };
  }

  function massNow(ms) {
    return CORE_MASS + ms.mat.mass * 1000 + ms.crew * MASS.crew + ms.o2 + ms.food + ms.kits * MASS.kit + ms.fuel;
  }

  function finish(ms, ok, code, text) {
    ms.phase = 'end';
    ms.end = { ok, code, text };
  }

  // 고장 종류: 고치지 못하면 apply가 실행된다
  const BREAKDOWNS = [
    { id: 'o2leak', name: '산소 탱크 누출', fail: '산소 30%를 잃었어요',
      apply: ms => { ms.o2 *= 0.7; } },
    { id: 'food', name: '식량 저장고 냉각 장치 고장', fail: '음식 30%가 상했어요',
      apply: ms => { ms.food *= 0.7; } },
    { id: 'fuelleak', name: '연료 파이프 누출', fail: '연료 20%가 새어 나갔어요',
      apply: ms => { ms.fuel *= 0.8; } },
    { id: 'hull', name: '운석 파편 충돌', fail: '선체 내구도가 25% 줄었어요',
      apply: ms => { ms.hp -= ms.hpMax * 0.25; } },
    { id: 'engine', name: '엔진 노즐 손상', fail: '엔진 추력이 15% 약해졌어요',
      apply: ms => { ms.engine *= 0.85; } },
  ];

  function repairChance(crewAlive) { return Math.min(0.95, 0.5 + 0.1 * crewAlive); }

  // 하루 진행. 일어난 일들을 [{type, text}] 로 돌려준다.
  function travelDay(ms, rnd) {
    rnd = rnd || Math.random;
    const ev = [];
    if (ms.phase !== 'travel') return ev;
    ms.day++;

    // 1) 궤도 수정 연료
    ms.fuel = Math.max(0, ms.fuel - FUEL_PER_DAY);

    // 2) 산소
    const needO2 = ms.crewAlive * RATE.o2;
    if (ms.o2 >= needO2) ms.o2 -= needO2;
    else {
      ms.o2 = 0;
      ev.push({ type: 'death', text: `산소가 바닥났어요. 선원 ${ms.crewAlive}명이 모두 숨졌어요.` });
      ms.crewAlive = 0;
    }

    // 3) 음식
    if (ms.crewAlive > 0) {
      const needFood = ms.crewAlive * RATE.food;
      if (ms.food >= needFood) { ms.food -= needFood; ms.starve = 0; }
      else {
        if (ms.starve === 0) ev.push({ type: 'warn', text: '음식이 떨어졌어요! 선원들이 굶기 시작했어요.' });
        ms.food = 0;
        ms.starve++;
        if (ms.starve > STARVE_DAYS) {
          ms.crewAlive--;
          ev.push({ type: 'death', text: `굶주림으로 선원 1명이 숨졌어요. (남은 선원 ${ms.crewAlive}명)` });
        }
      }
    }

    if (ms.crewAlive <= 0) {
      finish(ms, false, 'crew', '선원이 모두 숨져 우주선이 목적지에 닿지 못했어요.');
      return ev;
    }

    // 4) 고장
    if (rnd() < 0.035 * ms.mat.fail) {
      const b = BREAKDOWNS[Math.floor(rnd() * BREAKDOWNS.length)];
      ms.stats.breakdowns++;
      let fixed = false, tries = 0;
      while (!fixed && ms.kits > 0) {
        ms.kits--; tries++; ms.stats.kitsUsed++;
        if (rnd() < repairChance(ms.crewAlive)) fixed = true;
      }
      if (fixed) {
        ms.stats.repaired++;
        ev.push({ type: 'fix', text: `고장: ${b.name} → 수리 성공! (수리도구 ${tries}개 사용)` });
      } else {
        b.apply(ms);
        const why = tries > 0 ? `수리도구 ${tries}개를 다 썼지만 실패` : '수리도구가 없어 못 고침';
        ev.push({ type: 'break', text: `고장: ${b.name} → ${why}. ${b.fail}.` });
        if (ms.hp <= 0) {
          ms.hp = 0;
          finish(ms, false, 'hull', '선체가 부서져 우주선이 우주에서 산산조각 났어요.');
          return ev;
        }
      }
    }

    // 5) 도착
    if (ms.day >= ms.planet.days) {
      if (ms.fuel <= 0) {
        ev.push({ type: 'death', text: '연료가 하나도 없어요. 감속하지 못하고 행성으로 추락했어요!' });
        ms.crewAlive = 0; ms.hp = 0;
        finish(ms, false, 'nofuel', '여정 중에 연료를 다 써서, 행성에 도착하자마자 감속하지 못하고 추락했어요.');
        return ev;
      }
      ev.push({ type: 'info', text: `${ms.planet.name}에 도착했어요! 착륙을 준비하세요.` });
      ms.phase = 'landing';
      startDescent(ms);
    }
    return ev;
  }

  // ───── 하강 (1차원: 위아래만) ─────
  function startDescent(ms) {
    const p = ms.planet;
    ms.d = {
      h: ms.info.alt0, h0: ms.info.alt0, vy: -ms.info.v0, t: 0,
      throttle: 0, rho: 0, pressure: 0, q: 0, tempC: -23, G: 0,
      heatDmg: 0, pressDmg: 0, impactDmg: 0, maxTemp: -273, maxG: 0, maxPress: 0,
      g: p.g, rho0: p.air * EARTH_RHO, p0: surfacePressure(p),
      fuelOutWarned: false, touchV: 0,
    };
  }

  function tempOf(q) { return Math.pow(q / (EMISS * SIGMA) + Math.pow(T_AMB, 4), 0.25) - 273.15; }

  // throttle 0~1. 반환: 'fly' | 'landed' | 'crashed'
  function descentStep(ms, throttle, dt) {
    const d = ms.d;
    if (ms.fuel <= 0) throttle = 0;
    d.throttle = throttle;
    const m = massNow(ms);
    const F = THRUST * ms.engine * throttle;

    // 대기
    d.rho = d.rho0 * Math.exp(-d.h / SCALE_H);
    d.pressure = d.p0 * Math.exp(-d.h / SCALE_H);

    // 중력 + 추력
    let vy = d.vy + (F / m - d.g) * dt;
    // 항력: 반음함수로 풀어서 짙은 대기에서도 발산하지 않게
    const k = 0.5 * d.rho * CD_A / m;
    const vBefore = vy;
    vy = vy / (1 + k * Math.abs(vy) * dt);
    const aDrag = (vy - vBefore) / dt;
    d.G = Math.abs(F / m + aDrag) / G0;

    // 연료 소모
    if (F > 0) {
      ms.fuel = Math.max(0, ms.fuel - MDOT * throttle * dt);
    }

    // 공력 가열 (Sutton–Graves)
    const v = Math.abs(vy);
    d.q = HEAT_SCALE * 1.7415e-4 * Math.sqrt(d.rho / NOSE) * v * v * v;
    d.tempC = tempOf(d.q);
    const limK = ms.mat.heat + 273.15, TK = d.tempC + 273.15;
    if (TK > limK) {
      const dmg = HEAT_K * (TK / limK - 1) * dt;
      ms.hp -= dmg; d.heatDmg += dmg;
    }
    if (d.pressure > ms.mat.pressure) {
      const dmg = PRESS_K * (d.pressure / ms.mat.pressure - 1) * dt;
      ms.hp -= dmg; d.pressDmg += dmg;
    }
    d.maxTemp = Math.max(d.maxTemp, d.tempC);
    d.maxG = Math.max(d.maxG, d.G);
    d.maxPress = Math.max(d.maxPress, d.pressure);

    d.vy = vy;
    d.h += vy * dt;
    d.t += dt;

    if (ms.hp <= 0) {
      ms.hp = 0; ms.crewAlive = 0;
      const why = d.pressDmg > d.heatDmg ? '대기 압력에 짓눌려' : '대기와의 마찰열에 녹아';
      finish(ms, false, d.pressDmg > d.heatDmg ? 'pressure' : 'heat', `선체가 ${why} 부서졌어요.`);
      return 'crashed';
    }

    if (d.h <= 0) {
      d.h = 0;
      const vt = Math.abs(d.vy);
      d.touchV = vt;
      d.vy = 0;
      const safe = ms.mat.safeV;
      if (vt <= safe) {
        // 무사히 착지
      } else if (vt <= safe * 3) {
        const dmg = ms.hpMax * (vt - safe) / (2 * safe);
        ms.hp -= dmg; d.impactDmg = dmg;
      } else {
        d.impactDmg = ms.hp; ms.hp = 0;
      }
      if (ms.hp <= 0) {
        ms.hp = 0; ms.crewAlive = 0;
        const fuelOut = ms.fuel <= 0 ? ' 연료가 떨어져 속도를 줄이지 못했어요.' : '';
        finish(ms, false, 'impact', `초속 ${vt.toFixed(1)} m로 땅에 부딪혀 우주선이 부서졌어요.${fuelOut}`);
        return 'crashed';
      }
      const bonus = 0.1 * ms.crewAlive;
      ms.reward = { base: ms.info.reward, bonus: niceRound(ms.info.reward * bonus) || 0 };
      ms.reward.total = ms.reward.base + ms.reward.bonus;
      finish(ms, true, 'landed', vt <= safe ? '사뿐히 착륙했어요!' : '쿵! 조금 거칠었지만 착륙에 성공했어요.');
      return 'landed';
    }
    return 'fly';
  }

  // 자동 조종: 지금 속도가 "남은 높이에서 멈출 수 있는 속도"보다 빠르면 엔진을 켠다.
  function autopilot(ms) {
    const d = ms.d;
    const m = massNow(ms);
    const aNet = THRUST * ms.engine / m - d.g;
    if (aNet <= 0) return 1;
    const down = -d.vy;
    const target = Math.sqrt(2 * aNet * 0.8 * Math.max(0, d.h - 3)) + 1.5;
    return down > target ? 1 : 0;
  }

  // 한 번에 끝까지 (테스트·미리보기용)
  function runMission(cfg, opts) {
    opts = opts || {};
    const ms = createMission(cfg);
    const rnd = opts.rnd || Math.random;
    while (ms.phase === 'travel') travelDay(ms, rnd);
    const dt = 1 / 60;
    while (ms.phase === 'landing') descentStep(ms, autopilot(ms), dt);
    return ms;
  }

  // 돈 표시 (단위: 억 원)
  function fmtMoney(x) {
    const neg = x < 0; x = Math.abs(x);
    let s;
    if (x >= 10000) {
      const jo = Math.floor(x / 10000), eok = Math.round(x - jo * 10000);
      s = eok ? `${jo}조 ${eok.toLocaleString('ko-KR')}억` : `${jo}조`;
    } else if (x >= 1 || x === 0) {
      s = (Math.round(x * 10) / 10).toLocaleString('ko-KR') + '억';
    } else {
      s = Math.round(x * 10000).toLocaleString('ko-KR') + '만';
    }
    return (neg ? '-' : '') + s;
  }

  const API = {
    BUDGET, THRUST, ISP, MDOT, PRICE, MASS, RATE, LIMITS, FUEL_PER_DAY, STARVE_DAYS, SCALE_H,
    MATERIALS, PLANETS, CUSTOM_RANGE, BREAKDOWNS,
    material, planetInfo, surfacePressure, entrySpeed, difficulty, reward, niceRound,
    costOf, dryMass, totalMass, preview, repairChance,
    createMission, travelDay, startDescent, descentStep, autopilot, massNow, runMission, fmtMoney,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.Sim = API;
})(typeof window !== 'undefined' ? window : globalThis);
