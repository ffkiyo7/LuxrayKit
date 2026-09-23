# scripts/archive — 历史脚本，不要运行

这里的脚本只作为数据来源的出处记录保留（`src/data/seed/regMA/metadata.ts` 的 `sourcePath` 指向 `generate-natures` 与 `generate-mega-forms`）。它们都是某次规则上线时的一次性工具，**不代表现状**：

- 产物在生成之后被手工改过，重跑会冲掉手改（均在 `src/data/seed/regMA/`：`generate-natures` → `currentRuleCatalog.ts`，`generate-form-catalog` → `catalog-forms.ts`，`generate-mega-forms` → `mega-catalog.ts`）。
- 资源脚本（`update-mb-assets` / `update-mc-assets`）写死了当时的图片 URL，运行会无条件覆盖 `dataAudit.test.ts` 已固定哈希的 PNG。
- 移动目录后，脚本内的相对路径不再成立。

现行的数据脚本与用法见 `package.json` 的 `data:*` 与 [`docs/DEVELOPER_GUIDE.md` §7](../../docs/DEVELOPER_GUIDE.md)。下一次规则上线要抓新资源时，以 `update-mc-assets.mjs` 为参考在 `scripts/` 下新写，而不是在这里改。
