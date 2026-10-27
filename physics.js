// ===== 立水瓶物理核心（纯函数，无 DOM） =====
const PHY = (() => {
  const G = 9.81;
  const H = 0.20;          // 瓶高 m
  const R = 0.030;         // 半径 m（2D 中半宽）
  const MB = 0.025;        // 空瓶质量 kg
  const RHO = 1000;
  const AREA = Math.PI * R * R;
  const VOL = AREA * H;    // ≈ 565 mL
  const SMAX = 0.8;        // 水最多有多少比例能被“甩”到瓶口端
  const CSPREAD = 45;      // 再分布速率常数：ds/dt = (SMAX - s)·ω²/C
  const CAP_Y = 0.42;      // 出手时瓶盖高度
  const THETA0 = -0.35;    // 出手时瓶身后仰角（rad）
  const WATER_DAMP = 0.75;
  const KAPPA = 0.3;
  const E_SHELL = 0.5;     // 空瓶壳撞击恢复系数
  const V_BOUNCE_MAX = 0.55;       // 水段动量传递给瓶体刚体转动的比例 // 摇摆碰撞中水晃动额外耗散（按含水比例插值）

  // 水沿瓶轴分成两段：底部段 + 甩到瓶口的顶部段
  function config(f, s) {
    const mw = RHO * VOL * f;
    const parts = [];
    parts.push({ m: MB, z: H / 2, Io: MB * (H * H / 12 + R * R / 2) });
    if (mw > 0) {
      const m1 = mw * (1 - s / 2), m2 = mw * s / 2;
      const L1 = f * H * (1 - s / 2), L2 = f * H * s / 2;
      parts.push({ m: m1, z: L1 / 2, Io: m1 * (L1 * L1 / 12 + R * R / 4) });
      if (m2 > 0) parts.push({ m: m2, z: H - L2 / 2, Io: m2 * (L2 * L2 / 12 + R * R / 4) });
    }
    let M = 0, mz = 0;
    for (const p of parts) { M += p.m; mz += p.m * p.z; }
    const zc = mz / M;
    let I = 0;
    for (const p of parts) I += p.Io + p.m * (p.z - zc) ** 2;
    return { M, zc, I, mw, parts };
  }

  const axis = th => [-Math.sin(th), Math.cos(th)];   // 瓶底→瓶盖
  const norm = th => [Math.cos(th), Math.sin(th)];    // 横向

  function corners(cx, cy, th, zc) {
    const u = axis(th), n = norm(th);
    const bx = cx - zc * u[0], by = cy - zc * u[1];
    const tx = bx + H * u[0], ty = by + H * u[1];
    return [
      { x: bx - R * n[0], y: by - R * n[1], end: 'bottom', side: -1 },
      { x: bx + R * n[0], y: by + R * n[1], end: 'bottom', side: 1 },
      { x: tx - R * n[0], y: ty - R * n[1], end: 'top', side: -1 },
      { x: tx + R * n[0], y: ty + R * n[1], end: 'top', side: 1 },
    ];
  }

  function launch(p) {
    return { vx: 0.12 + 0.30 * p, vy: 1.8+2.0*p, w: 13+26*p };
  }

  const wrap = a => { a = (a + Math.PI) % (2 * Math.PI); if (a < 0) a += 2 * Math.PI; return a - Math.PI; };

  // 主模拟。record=true 时返回逐帧数据用于播放
  function simulate(p, f, record) {
    const dt = 0.0004;
    const L0 = launch(p);
    let s = 0;
    let c = config(f, s);
    const L = c.I * L0.w;                    // 角动量守恒量（关于质心）
    let th = THETA0;
    const u0 = axis(th);
    let cx = 0 - (H - c.zc) * u0[0], cy = CAP_Y - (H - c.zc) * u0[1];
    let vx = L0.vx, vy = L0.vy;
    let t = 0, w = L0.w;
    const frames = [], series = [];
    const recEvery = 10; let k = 0;
    // ---------- 飞行段 ----------
    while (t < 3) {
      const ds = (SMAX - s) * w * w / CSPREAD;
      const sNew = Math.min(SMAX, s + ds * dt);
      // 质心沿轴相对瓶身移动，但世界系质心轨迹不变（内力）
      s = sNew;
      c = config(f, s);
      w = L / c.I;
      th += w * dt;
      vy -= G * dt;
      cx += vx * dt; cy += vy * dt;
      t += dt;
      if (record && (k++ % recEvery === 0)) {
        frames.push({ t, cx, cy, th, zc: c.zc, s, phase: 'fly' });
        series.push({ t, w, I: c.I, s });
      }
      if (vy < 0) {
        const cs = corners(cx, cy, th, c.zc);
        let low = cs[0];
        for (const q of cs) if (q.y < low.y) low = q;
        if (low.y <= 0) { return land({ cx, cy, vx, vy, th, w, c, low, t, f, frames, series, record, s }); }
      }
    }
    return { ok: false, reason: '超时', frames, series };
  }

  function land(st) {
    const { cx, cy, vx, vy, th, w, c, low, t, f, frames, series, record } = st;
    const thm = wrap(th);
    const impact = { theta: thm, w, vx, vy, t };
    if (low.end === 'top') {
      return finishTumble(st, thm, low, Math.abs(thm) > 2.2 ? '瓶盖先着地' : '侧身着地', impact);
    }
    // 底角着地：关于接触点 P 的角动量守恒（完全非弹性碰撞）
    const sig = thm >= 0 ? 1 : -1;            // +1：左底角为支点
    const Px = low.x;
    const rx = cx - Px, ry = cy - low.y;
    // 逐段求关于 P 的角动量；水段撞击瓶底时大部分动量在内部耗散（κ）
    const u = axis(th);
    const room = Math.max(0, Math.min(1, (1 - f) / 0.5)); // 剩余空间：满瓶时水无法晃动
    const kap = 1 - (1 - KAPPA) * room;
    let LP = 0;
    c.parts.forEach((pt, i) => {
      const dz = pt.z - c.zc;
      const qx = rx + dz * u[0], qy = ry + dz * u[1];
      const pvx = vx - w * dz * u[1], pvy = vy + w * dz * u[0];
      const Li = pt.Io * w + pt.m * (qx * pvy - qy * pvx);
      LP += i === 0 ? Li : kap * Li;
    });
    const c0 = config(f, 0);                  // 水迅速塌回瓶底
    const h = c0.zc, b = R;
    const d = Math.hypot(h, b), alpha = Math.atan(b / h);
    const IP = c0.I + c0.M * d * d;
    const wP = LP / IP;
    // 竖直反弹：只有瓶壳回弹，水吸收自己的动量
    const vBounce = E_SHELL * Math.abs(vy) * (MB + c0.mw * (1 - room)) / c0.M;
    if (vBounce > V_BOUNCE_MAX) {
      return finishTumble(st, thm, low, '瓶底弹起，翻倒', { ...impact, vBounce });
    }
    let phi = Math.abs(thm), dphi = sig * wP;
    let sg = sig, px = Px;
    const housner = 1 - 2 * c0.M * b * b / IP;
    const wfrac = c0.mw / c0.M;
    const restit = housner * (1 - (1 - WATER_DAMP) * wfrac * room);
    const k1 = c0.M * G * d / IP;
    const dt = 0.0004;
    let tt = 0, kk = 0, maxPhi = phi, bounces = 0;
    let result = null;
    const pose = () => {
      const a = sg * phi, n = norm(a), u = axis(a);
      const bx = px + sg * b * n[0], by = sg * b * n[1];
      return { cx: bx + h * u[0], cy: by + h * u[1], th: a, zc: h };
    };
    while (tt < 4) {
      dphi += k1 * Math.sin(phi - alpha) * dt;
      phi += dphi * dt;
      tt += dt;
      if (phi <= 0 && dphi < 0) {
        bounces++;
        const v = -dphi * restit;
        const bxW = px + sg * b;
        sg = -sg; px = bxW - sg * b;
        phi = 0; dphi = v;
        if (v < 0.05) { result = 'stand'; }
      }
      if (phi > maxPhi) maxPhi = phi;
      if (phi >= Math.PI / 2) { phi = Math.PI / 2; result = 'fall'; }
      if (record && (kk++ % 10 === 0)) {
        const ps = pose();
        frames.push({ t: t + tt, ...ps, s: Math.max(0, st.s * (1 - tt / 0.12)), phase: 'rock' });
      }
      if (result) break;
    }
    if (!result) result = phi < alpha ? 'stand' : 'fall';
    if (record) {
      const ps = pose();
      frames.push({ t: t + tt, ...ps, s: 0, phase: 'rest' });
    }
    return {
      ok: result === 'stand',
      reason: result === 'stand' ? (bounces > 1 ? '晃了几下，立住了' : '稳稳立住') : (Math.abs(thm) < 0.15 ? '落得太猛，晃倒了' : thm < 0 ? '转得不够，倒下' : '转过头，倒下'),
      impact: { ...impact, wPivot: wP, alpha, maxPhi, restit },
      frames, series,
    };
  }

  // 瓶盖或侧身先着地：绕接触角倒向最近的侧躺姿态（仅视觉）
  function finishTumble(st, thm, low, reason, impact) {
    const { frames, series, record, t, c } = st;
    if (record) {
      const target = thm >= 0 ? Math.PI / 2 : -Math.PI / 2;
      const start = st.th - thm + thm; // 当前角
      const base = st.th - thm;
      const dur = 0.4;
      // 以接触点为支点旋转
      const rx = st.cx - low.x, ry = st.cy - low.y;
      for (let i = 1; i <= 40; i++) {
        const e = i / 40;
        const ease = 1 - Math.pow(1 - e, 3);
        const a = thm + (target - thm) * ease;
        const da = a - thm;
        const cs = Math.cos(da), sn = Math.sin(da);
        let nx = low.x + rx * cs - ry * sn, ny = low.y + rx * sn + ry * cs;
        frames.push({ t: t + e * dur, cx: nx, cy: ny, th: base + a, zc: c.zc, s: st.s * (1 - e), phase: 'tumble' });
      }
      // 落平：让最低点贴地
      const last = frames[frames.length - 1];
      const cs2 = corners(last.cx, last.cy, last.th, last.zc);
      const mn = Math.min(...cs2.map(q => q.y));
      for (let i = frames.length - 40; i < frames.length; i++) {
        const e = (i - (frames.length - 40) + 1) / 40;
        frames[i].cy -= mn * e;
      }
    }
    return { ok: false, reason, impact, frames, series };
  }

  return { simulate, config, launch, corners, axis, norm, H, R, MB, VOL, THETA0, CAP_Y, G, SMAX, CSPREAD, wrap };
})();
if (typeof module !== 'undefined') module.exports = PHY;
