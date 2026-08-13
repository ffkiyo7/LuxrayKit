# 第三方内容与许可边界

仓库根目录的 [MIT License](./LICENSE) 适用于 Luxray Kit 作者和贡献者创作的原创源代码与原创文档。它不授予本项目无权授予的商标、角色、图像、文本、数据集或其他第三方材料权利。

## 不属于 MIT 授权范围的内容

| 类别 | 主要位置 | 来源与边界 |
| --- | --- | --- |
| Pokémon 名称、商标、角色图像和道具图标 | `public/assets/pokemon/**`、`public/assets/items/**`、PWA 图标及包含这些素材的截图 | 来源包括 PokeAPI sprites、PokéBase、Serebii 和相关权利方。它们仍归各自权利方所有，不因进入本仓库而改为 MIT。 |
| 外部环境统计与队伍样本 | `src/data/external/**`、`public/data/pokedb/**` | 来源包括 PokeDB、VGCPastes 及原队伍作者。仓库保留来源标记；再使用时还需遵守对应来源的条款。 |
| 外部整理的名称、描述、规则与图鉴数据 | `src/data/seed/regMA/**`、`src/data/pokemonFacts.ts` | 来源包括 Pokémon 官方页面、PokeAPI、PokéBase、神奇宝贝百科及其他公开资料。事实字段与引用文本的权利状态不同，本项目不对外部内容重新授权。 |
| npm 依赖 | `package.json`、`package-lock.json` | 每个依赖继续适用其自身许可证；安装包中的许可证和版权声明必须保留。 |

详细来源与风险分级记录在 [`src/data/seed/regMA/metadata.ts`](./src/data/seed/regMA/metadata.ts) 的 `dataSourceManifest` 和 [`docs/research/ASSET_SOURCE_AUDIT.md`](./docs/research/ASSET_SOURCE_AUDIT.md)。

如果你复制、再发布或商用本项目，请自行确认你对所保留第三方内容拥有必要权利；无法确认时，应替换或移除相应素材与数据。项目名称和说明中对 Pokémon、Luxray 及其他商标的提及只用于识别非官方粉丝工具，不构成商标许可、官方关联、授权或认可。

如你是权利方并认为仓库中的内容使用不当，请通过 [GitHub Issues](https://github.com/ffkiyo7/LuxrayKit/issues) 联系维护者；安全问题请改用 [`SECURITY.md`](./SECURITY.md) 中的私下渠道。
