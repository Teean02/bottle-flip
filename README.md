# 立水瓶 Bottle Flip

一个基于物理模型的“立水瓶”网页小游戏。长按蓄力，松手把水瓶甩出去，让它落地后立在桌上。

**在线试玩：** `https://Teean02.github.io/bottle-flip/`（部署后替换）

- `index.html`：小游戏版。每回合随机给一个水位，玩家只控制投掷力度。
- `full.html`：原理版。可以自由选水位，附带飞行曲线、成功相图和模型推导。

> A physics-based bottle-flip web game. Flight dynamics use angular-momentum conservation with water redistribution (moment of inertia grows mid-air, so spin slows); landing uses impulse about the contact corner followed by a Housner rocking-block model. Single-file HTML, no build step, works on mobile.

## 物理模型

| 阶段 | 模型 |
|---|---|
| 飞行 | 重力对质心不产生力矩，关于质心的角动量守恒：`L = I(t)·ω(t)`；质心做抛体运动 |
| 水的再分布 | 在随瓶转动的参考系里，离心效应把水推向瓶子两端：`ds/dt = (s_max − s)·ω²/C`。转动惯量 `I(s)` 由瓶身和两段液柱按平行轴定理求和 |
| 着地 | 瓶底一角先触地，关于该支点的角动量守恒；水段的动量按比例 κ 传给瓶体，其余在水内部耗散 |
| 摇摆 | Housner 摇摆块模型：`I_P·φ̈ = M·g·d·sin(φ − α)`，临界角 `α = arctan(R/h_c)`；换支点时乘以恢复系数 `(1 − 2MR²/I_P)·η` |

模型可以复现的趋势：
- 水位在 30%–40% 时，转动惯量在空中能涨到 3–5 倍，最容易立住。
- 满瓶时水没有空间移动，空瓶时水太少，两种情况下转速都几乎不减，很难立住。
- 水位越低，质心越低，临界角越大，落地越宽容。

### 简化说明

- 瓶子按 2D 刚体处理，水用两段液柱近似，没有求解 Navier–Stokes 方程。
- `C`、`s_max`、`κ`、`η` 是为了复现实验趋势调出来的唯象参数，不是由第一性原理推出的。
- 瓶子参数：高 20 cm、半径 3 cm、空瓶 25 g，容积约 565 mL。

参考文献：
- P. J. Dekker et al., “Water bottle flipping physics,” *Am. J. Phys.* 86, 733 (2018)
- G. W. Housner, “The behavior of inverted pendulum structures during earthquakes,” *Bull. Seismol. Soc. Am.* 53, 403 (1963)

## 文件结构

```
index.html   小游戏版（单文件，可直接打开）
full.html    原理版（单文件，可直接打开）
physics.js   物理核心源码，已内联进两个 HTML，单独放出来方便阅读
```

两个 HTML 都不依赖构建工具，只从 Google Fonts 加载字体；字体加载失败时会退回系统字体，游戏照常运行。

## 本地运行

直接双击 `index.html`，用浏览器打开即可。

## 操作

- 鼠标或手指：按住蓄力，松开出手
- 键盘：按住空格蓄力，松开出手
