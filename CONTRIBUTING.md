# 参与贡献

感谢你愿意改进 Luxray Kit。项目面向 Pokémon Champions 玩家，业务机制与主线游戏并不完全相同；动手前请先阅读 [`AGENTS.md`](./AGENTS.md) 的高风险规则，工程现状以 [`docs/DEVELOPER_GUIDE.md`](./docs/DEVELOPER_GUIDE.md) 为准。

## 开发环境

需要 Node 24。请使用锁文件安装依赖：

```bash
npm ci
npm run dev
```

不要提交 `.env`、API token、Cloudflare 凭据或其他本地配置。需要新增依赖、改变公开接口、修改数据格式或涉及认证/权限时，请先开 Issue 说明影响。

## 改动原则

- 先搜索并复用职责一致的现有实现，不复制一份相似逻辑并存。
- 错误应明确暴露；不要吞异常、静默重试或返回空值伪装成功。
- 只实现当前改动需要的行为，不预建插件、兼容层或未来扩展点。
- 带 `Auto-generated` 头的文件、`src/data/speedTiers.ts`、`src/data/external/**`、`public/data/pokedb/*.json` 和 Worker 类型声明都由 `scripts/` 或 Wrangler 生成。请改生成脚本并运行对应的 `package.json` 命令，不直接手改产物。
- 新增外部数据、文本或图片时必须记录来源和许可风险；无法确认再分发权利的内容不要提交。现有边界见 [`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md)。
- 用户可见行为、配置、命令或数据格式变化时，同一个 PR 内同步更新现有文档。

## 验证

所有 PR 至少运行：

```bash
npm test
```

涉及前端行为时还要运行：

```bash
npm run build
```

涉及 PWA 流程时运行相关 Playwright 用例。视觉回归只能由 CI 的 `visual` job 校验；需要更新基线时，在功能分支手动运行 `visual-baseline.yml`，不要在 macOS 本地重建 Linux 快照。

请在 PR 描述中写明改了什么、为什么改、实际运行了哪些验证，以及仍未验证的风险。功能 PR 默认提交为 Draft，由维护者决定何时合并。

## 贡献许可

除明确注明为第三方来源的内容外，你提交的原创贡献将按仓库根目录的 [MIT License](./LICENSE) 提供。提交 PR 即表示你有权提供这些贡献，并同意按该许可证授权。
