import { abilities, items, moves } from '../data';
import type { PokemonType, Team } from '../types';
import { getMemberBattleForm } from './pokemonForms';

const typeLabels: Record<PokemonType, string> = {
  Normal: '一般',
  Fire: '火',
  Water: '水',
  Electric: '电',
  Grass: '草',
  Ice: '冰',
  Fighting: '格斗',
  Poison: '毒',
  Ground: '地面',
  Flying: '飞行',
  Psychic: '超能',
  Bug: '虫',
  Rock: '岩石',
  Ghost: '幽灵',
  Dragon: '龙',
  Dark: '恶',
  Steel: '钢',
  Fairy: '妖精',
};

const typeColors: Record<PokemonType, string> = {
  Normal: '#a8a77a',
  Fire: '#ee8130',
  Water: '#6390f0',
  Electric: '#f7d02c',
  Grass: '#7ac74c',
  Ice: '#96d9d6',
  Fighting: '#c22e28',
  Poison: '#a33ea1',
  Ground: '#e2bf65',
  Flying: '#a98ff3',
  Psychic: '#f95587',
  Bug: '#a6b91a',
  Rock: '#b6a136',
  Ghost: '#735797',
  Dragon: '#6f35fc',
  Dark: '#705746',
  Steel: '#b7b7ce',
  Fairy: '#d685ad',
};

export type TeamShareSlot = {
  pokemonName: string;
  iconRef?: string;
  types: PokemonType[];
  itemName: string;
  itemIconRef?: string;
  abilityName: string;
  nature: string;
  moveNames: string[];
};

export type TeamShareImage = {
  dataUrl: string;
  filename: string;
};

type TeamShareImageOptions = {
  now?: Date;
  assetBaseUrl?: string;
  assetMap?: Record<string, string>;
};

const escapeXml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const resolveAsset = (ref: string | undefined, assetBaseUrl?: string, assetMap?: Record<string, string>) => {
  if (!ref) return undefined;
  if (assetMap?.[ref]) return assetMap[ref];
  if (!assetBaseUrl || ref.startsWith('data:') || ref.startsWith('http://') || ref.startsWith('https://')) return ref;
  return new URL(ref, assetBaseUrl).href;
};

const formatTimestamp = (date: Date) =>
  new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
    .format(date)
    .replace(/\//g, '-');

const slugTeamName = (name: string) => {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'team';
};

export function resolveTeamShareSlots(team: Team): TeamShareSlot[] {
  return Array.from({ length: 6 }).map((_, index) => {
    const member = team.members[index];
    if (!member) {
      return {
        pokemonName: '空位',
        types: [],
        itemName: '无道具',
        abilityName: '未选择',
        nature: '-',
        moveNames: [],
      };
    }

    const form = getMemberBattleForm(member);
    const item = items.find((candidate) => candidate.id === member.itemId);
    const ability = abilities.find((candidate) => candidate.id === member.abilityId);
    const moveNames = member.moveIds
      .map((moveId) => moves.find((candidate) => candidate.id === moveId)?.chineseName)
      .filter((moveName): moveName is string => Boolean(moveName))
      .slice(0, 4);

    return {
      pokemonName: form?.chineseName ?? '未配置',
      iconRef: form?.artworkRef ?? form?.iconRef,
      types: form?.types ?? [],
      itemName: item?.chineseName ?? '无道具',
      itemIconRef: item?.iconRef,
      abilityName: ability?.chineseName ?? '未选择',
      nature: member.nature,
      moveNames,
    };
  });
}

function renderTypeBadges(types: PokemonType[], x: number, y: number) {
  return types
    .slice(0, 2)
    .map((type, index) => {
      const badgeX = x + index * 58;
      return `
        <rect x="${badgeX}" y="${y}" width="48" height="22" rx="11" fill="${typeColors[type]}" opacity="0.94" />
        <text x="${badgeX + 24}" y="${y + 15}" text-anchor="middle" font-size="12" font-weight="700" fill="#ffffff">${escapeXml(typeLabels[type])}</text>
      `;
    })
    .join('');
}

function renderMoves(moveNames: string[], x: number, y: number) {
  const slots = Array.from({ length: 4 }).map((_, index) => moveNames[index] ?? '空招式位');
  return slots
    .map((moveName, index) => {
      const row = Math.floor(index / 2);
      const col = index % 2;
      const moveX = x + col * 150;
      const moveY = y + row * 32;
      return `
        <rect x="${moveX}" y="${moveY}" width="138" height="24" rx="7" fill="#161616" stroke="#2c2c2c" />
        <text x="${moveX + 10}" y="${moveY + 16}" font-size="13" fill="#e9e9e9">${escapeXml(moveName)}</text>
      `;
    })
    .join('');
}

function renderSlot(slot: TeamShareSlot, index: number, options: TeamShareImageOptions) {
  const col = index % 3;
  const row = Math.floor(index / 3);
  const x = 36 + col * 388;
  const y = 118 + row * 314;
  const imageHref = resolveAsset(slot.iconRef, options.assetBaseUrl, options.assetMap);
  const itemHref = resolveAsset(slot.itemIconRef, options.assetBaseUrl, options.assetMap);

  return `
    <g>
      <rect x="${x}" y="${y}" width="352" height="276" rx="18" fill="#1a1a1a" stroke="#343434" />
      <rect x="${x + 14}" y="${y + 14}" width="96" height="96" rx="18" fill="#262626" />
      ${
        imageHref
          ? `<image href="${escapeXml(imageHref)}" x="${x + 20}" y="${y + 18}" width="84" height="84" preserveAspectRatio="xMidYMid meet" />`
          : `<text x="${x + 62}" y="${y + 68}" text-anchor="middle" font-size="24" fill="#0169cc">?</text>`
      }
      <text x="${x + 124}" y="${y + 42}" font-size="24" font-weight="800" fill="#f4f4f5">${escapeXml(slot.pokemonName)}</text>
      ${renderTypeBadges(slot.types, x + 124, y + 58)}
      <text x="${x + 124}" y="${y + 96}" font-size="14" fill="#b9b9bd">性格 ${escapeXml(slot.nature)} · 特性 ${escapeXml(slot.abilityName)}</text>

      <rect x="${x + 14}" y="${y + 126}" width="324" height="44" rx="12" fill="#101010" stroke="#2c2c2c" />
      ${
        itemHref
          ? `<image href="${escapeXml(itemHref)}" x="${x + 26}" y="${y + 134}" width="28" height="28" preserveAspectRatio="xMidYMid meet" />`
          : `<rect x="${x + 26}" y="${y + 136}" width="24" height="24" rx="6" fill="#303030" />`
      }
      <text x="${x + 64}" y="${y + 154}" font-size="15" font-weight="700" fill="#e5e5e5">${escapeXml(slot.itemName)}</text>

      ${renderMoves(slot.moveNames, x + 14, y + 190)}
    </g>
  `;
}

export function createTeamShareImage(
  team: Team,
  options: TeamShareImageOptions = {},
): TeamShareImage {
  const now = options.now ?? new Date();
  const generatedAt = formatTimestamp(now);
  const slots = resolveTeamShareSlots(team);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="760" viewBox="0 0 1200 760">
      <rect width="1200" height="760" fill="#0d0d0d" />
      <rect x="24" y="24" width="1152" height="712" rx="28" fill="#111111" stroke="#2b2b2b" />
      <text x="48" y="66" font-size="34" font-weight="850" fill="#f5f5f5">${escapeXml(team.name)}</text>
      <text x="48" y="96" font-size="16" fill="#a1a1aa">Champions Tool · 生成时间 ${escapeXml(generatedAt)}</text>
      <text x="1030" y="94" font-size="16" text-anchor="end" fill="#6fa8ff">${team.members.length}/6</text>
      ${slots.map((slot, index) => renderSlot(slot, index, options)).join('')}
    </svg>
  `;
  const day = now.toISOString().slice(0, 10);
  return {
    dataUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    filename: `champions-team-${slugTeamName(team.name)}-${day}.svg`,
  };
}

const blobToDataUrl = async (blob: Blob) => {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(index, index + chunkSize));
  }
  return `data:${blob.type || 'application/octet-stream'};base64,${btoa(binary)}`;
};

const fetchAssetDataUrl = async (ref: string, assetBaseUrl?: string) => {
  const url = resolveAsset(ref, assetBaseUrl);
  if (!url || url.startsWith('data:')) return url;
  try {
    const response = await fetch(url);
    if (!response.ok) return url;
    return await blobToDataUrl(await response.blob());
  } catch {
    return url;
  }
};

export async function createTeamShareImageWithEmbeddedAssets(
  team: Team,
  options: Omit<TeamShareImageOptions, 'assetMap'> = {},
): Promise<TeamShareImage> {
  const slots = resolveTeamShareSlots(team);
  const refs = Array.from(new Set(slots.flatMap((slot) => [slot.iconRef, slot.itemIconRef]).filter((ref): ref is string => Boolean(ref))));
  const entries = await Promise.all(refs.map(async (ref) => [ref, await fetchAssetDataUrl(ref, options.assetBaseUrl)] as const));
  const assetMap = entries.reduce<Record<string, string>>((acc, [ref, value]) => {
    if (value) acc[ref] = value;
    return acc;
  }, {});

  return createTeamShareImage(team, { ...options, assetMap });
}
