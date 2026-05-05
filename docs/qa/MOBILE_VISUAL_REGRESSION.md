# 移动端视觉回归

更新时间：2026-05-06

## 策略

- Playwright 使用 390px 移动视口做 smoke 级截图回归。
- 测试使用本机 Chrome channel。
- 视觉测试会阻止 service worker，避免旧缓存影响截图。
- 基线截图位于 `tests/pwa/visual.spec.ts-snapshots/`。

## 覆盖范围

- 组队页缩略态 / 展开态。
- 队伍成员编辑与 SP picker。
- 计算页进攻方 / 防守方选择与配置入口。
- 速度线。
- 图鉴列表、详情、属性筛选。
- 设置页。
- 当前规则详情。

## 命令

```bash
npm run test:visual
npm run test:visual -- --update-snapshots
```

完整 PWA 回归：

```bash
npm run test:pwa
```

## 当前边界

- 只覆盖核心移动端 smoke flow，不替代所有交互测试。
- 计算页仍在快速迭代，涉及卡片层级、头像、折叠面板时需要更新必要 snapshot。
- 属性展示使用项目化中文胶囊，不依赖属性 PNG 图标。
