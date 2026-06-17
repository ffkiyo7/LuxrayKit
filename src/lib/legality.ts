import { abilities, items, moves, pokemon } from '../data';
import type { LegalityStatus, Team, TeamMember } from '../types';
import { findBattleForm, findMegaFormByItem } from './pokemonForms';
import { MAX_STAT_POINTS_PER_STAT, MAX_TOTAL_STAT_POINTS, statPointKeys, statPointTotal } from './statPoints';

export type LegalityIssue = {
  code:
    | 'missing-pokemon'
    | 'missing-required-field'
    | 'pokemon-not-in-rule'
    | 'item-not-in-rule'
    | 'duplicate-held-item'
    | 'ability-mismatch'
    | 'move-mismatch'
    | 'mega-item-mismatch'
    | 'stat-points-over-limit'
    | 'seed-data-needs-review';
  severity: 'error' | 'review';
  message: string;
};

export type LegalityResult = {
  status: LegalityStatus;
  issues: LegalityIssue[];
};

const needsReview = (message: string, code: LegalityIssue['code'] = 'seed-data-needs-review'): LegalityIssue => ({
  code,
  severity: 'review',
  message,
});

const error = (message: string, code: LegalityIssue['code']): LegalityIssue => ({
  code,
  severity: 'error',
  message,
});

export function evaluateMemberLegality(member: TeamMember, team?: Team): LegalityResult {
  const issues: LegalityIssue[] = [];

  if (!member.pokemonId) {
    return {
      status: 'missing-config',
      issues: [error('缺少 Pokémon 配置。', 'missing-pokemon')],
    };
  }

  const entry = pokemon.find((candidate) => candidate.id === member.pokemonId);
  if (!entry) {
    return {
      status: 'illegal',
      issues: [error('当前 Pokémon 不存在于本地数据版本。', 'pokemon-not-in-rule')],
    };
  }

  const isBlankConfiguration =
    !member.abilityId &&
    member.moveIds.length === 0 &&
    !member.nature &&
    statPointTotal(member.statPoints) === 0;
  if (isBlankConfiguration) {
    return {
      status: 'missing-config',
      issues: [],
    };
  }

  if (!entry.legalInCurrentRule) {
    issues.push(error('当前 Pokémon 不在当前规则可用范围内。', 'pokemon-not-in-rule'));
  }
  const selectedForm = findBattleForm(entry.id, member.formId);
  if (member.formId && member.formId !== entry.id && !selectedForm?.isMega) {
    issues.push(error('当前形态不存在于本地数据版本。', 'mega-item-mismatch'));
  }

  if (!member.abilityId || member.moveIds.length === 0 || member.level <= 0) {
    issues.push(error('缺少特性、招式或等级等必要字段。', 'missing-required-field'));
  }

  const allowedAbilities = new Set([...(entry.abilities ?? []), ...(selectedForm?.abilities ?? [])]);
  if (member.abilityId && !allowedAbilities.has(member.abilityId)) {
    issues.push(error('特性与当前 Pokémon 不匹配。', 'ability-mismatch'));
  }

  member.moveIds.forEach((moveId) => {
    const move = moves.find((candidate) => candidate.id === moveId);
    if (!move || !move.legalInCurrentRule || !move.learnableByPokemonIds.includes(entry.id)) {
      issues.push(error(`招式 ${moveId} 与当前 Pokémon 或规则不匹配。`, 'move-mismatch'));
    }
  });

  if (member.itemId) {
    const item = items.find((candidate) => candidate.id === member.itemId);
    if (!item || !item.legalInCurrentRule) {
      issues.push(error('道具不存在或不在当前规则可用范围内。', 'item-not-in-rule'));
    } else if (item.isMegaStone && !item.applicablePokemonIds.includes(entry.id)) {
      issues.push(error('Mega Stone 与当前 Pokémon 不匹配。', 'mega-item-mismatch'));
    } else if (item.isMegaStone) {
      const itemMegaForm = findMegaFormByItem(entry, item.id);
      if (!itemMegaForm) {
        issues.push(error('Mega Stone 缺少对应 Mega 形态数据。', 'mega-item-mismatch'));
      } else if (selectedForm?.isMega && selectedForm.id !== itemMegaForm.id) {
        issues.push(error('Mega 形态与携带的 Mega Stone 不匹配。', 'mega-item-mismatch'));
      }
    }

    const duplicateItem = team?.members.some((candidate) => candidate.id !== member.id && candidate.itemId === member.itemId);
    if (duplicateItem) {
      issues.push(error('当前规则不允许同队重复携带相同道具。', 'duplicate-held-item'));
    }
  }

  if (selectedForm?.isMega) {
    if (!selectedForm.legalInCurrentRule) {
      issues.push(error('当前 Mega 形态不在当前规则可用范围内。', 'pokemon-not-in-rule'));
    }
    if (!member.itemId || member.itemId !== selectedForm.requiredItemId) {
      issues.push(error('选择 Mega 形态时必须携带对应 Mega Stone。', 'mega-item-mismatch'));
    }
  }

  if (statPointKeys.some((key) => Number(member.statPoints[key] ?? 0) > MAX_STAT_POINTS_PER_STAT) || statPointTotal(member.statPoints) > MAX_TOTAL_STAT_POINTS) {
    issues.push(error('Champions SP 单项最多 32，总量最多 66。', 'stat-points-over-limit'));
  }

  if (entry.sourceRefs.includes('manual-seed-review')) {
    issues.push(needsReview('该条目仍是 seed data，需要完成 Reg M-A 复核后才能给出强合法结论。'));
  }

  const hasError = issues.some((issue) => issue.severity === 'error');
  if (hasError) return { status: 'illegal', issues };
  if (issues.length > 0) return { status: 'needs-review', issues };
  return { status: 'legal', issues };
}

export function evaluateTeamLegality(team: Team): Record<string, LegalityResult> {
  return Object.fromEntries(team.members.map((member) => [member.id, evaluateMemberLegality(member, team)]));
}

export function catalogNeedsReview() {
  return [...pokemon, ...moves, ...items, ...abilities].some((entry) => entry.sourceRefs.includes('manual-seed-review'));
}
