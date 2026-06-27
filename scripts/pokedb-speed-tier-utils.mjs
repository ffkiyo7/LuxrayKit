const LABEL_MAP = {
  最速: { label: '极速', color: '#ff6f61' },
  準速: { label: '满速', color: '#6c8cff' },
  無振: { label: '0速', color: '#4fd1a0' },
  最遅: { label: '极限0速', color: '#b292ff' },
};

const decodeHtml = (value) =>
  value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');

const textContent = (value) => decodeHtml(value.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();

const normalizeChipName = (value) => value.normalize('NFKC').replace(/\s+/g, '').trim();

export const isPlaceholderSpeedChip = ({ form, japaneseName }) => {
  const normalizedName = normalizeChipName(japaneseName);
  return form !== '00' && normalizedName.startsWith('メガ') && normalizedName.endsWith('Z');
};

// Each chip is <a class="speed-chip" href="/pokemon/show/0903-00?...">
//   <i class="... dex-0903-00-96"></i>
//   <div class="speed-chip__name">オオニューラ</div>
//   <div class="speed-chip__note ...">かるわざ</div>
// </a>
// We keep the raw identity (national dex no + form + Japanese name); the dex→id
// mapping stays on the TS side so this script never depends on the catalog.
const parseChips = (group) => {
  const chips = [];
  for (const match of group.matchAll(/<a class="speed-chip"([^>]*)>([\s\S]*?)<\/a>/g)) {
    const attributes = match[1] ?? '';
    const inner = match[2] ?? '';
    const dexSource = attributes.match(/\/pokemon\/show\/(\d{3,4})-(\d{2})/) ?? inner.match(/dex-(\d{3,4})-(\d{2})/);
    const dexNo = dexSource ? Number(dexSource[1]) : 0;
    const form = dexSource ? dexSource[2] : '00';
    const japaneseName = textContent(inner.match(/<div class="speed-chip__name">([\s\S]*?)<\/div>/)?.[1] ?? '');
    if (isPlaceholderSpeedChip({ form, japaneseName })) continue;
    chips.push({ dexNo, form, japaneseName });
  }
  return chips;
};

export function parsePokeDbSpeedTable(html, rule) {
  const tiers = [];
  const rowMatches = [
    ...html.matchAll(/<div class="speed-table__row">([\s\S]*?)(?=<div class="speed-table__row">|<\/section>|<footer|$)/g),
  ];

  for (const rowMatch of rowMatches) {
    const row = rowMatch[1];
    const speed = Number(row.match(/speed-table__speed[^>]*>[\s\S]*?<span[^>]*>\s*(\d+)\s*<\/span>/)?.[1] ?? 0);
    if (!Number.isInteger(speed) || speed <= 0) continue;

    const labels = [...row.matchAll(/<div class="speed-chips-group__label">([\s\S]*?)<\/div>/g)];
    labels.forEach((match, index) => {
      const original = Object.keys(LABEL_MAP).find((label) => match[1].includes(`>${label}<`));
      if (!original) return;
      const start = match.index ?? 0;
      const end = labels[index + 1]?.index ?? row.length;
      const group = row.slice(start, end);
      const pokemon = parseChips(group);
      if (pokemon.length === 0) return;

      const mapped = LABEL_MAP[original];
      const label = textContent(match[1])
        .replace(original, mapped.label)
        .replace(/こだわりスカーフ/g, '讲究围巾')
        .replace(new RegExp(`${mapped.label}\\s+(?=\\d)`), mapped.label);
      const code = label.match(/(\d+)族/)?.[1] ?? String(speed);
      tiers.push({ speed, label, count: pokemon.length, code, color: mapped.color, pokemon });
    });
  }

  return {
    rule,
    tiers: tiers.sort((left, right) => right.speed - left.speed || left.label.localeCompare(right.label, 'zh-CN')),
  };
}
