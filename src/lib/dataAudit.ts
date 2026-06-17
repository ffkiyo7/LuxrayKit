import {
  abilities,
  currentDataVersion,
  currentRuleSet,
  dataSourceManifest,
  defaultTeams,
  items,
  moves,
  pokemon,
  currentRuleSelectableItemIds,
  currentRuleNatureOptions,
  regMaPokemonAllowlist,
  regMaPokemonAllowlistExpectedCount,
  regMaMegaAllowlist,
  regMaMegaAllowlistExpectedCount,
  speedBenchmarks,
} from '../data';

export type DataAuditIssue = {
  code:
    | 'missing-source-ref'
    | 'unresolved-source-ref'
    | 'blocked-source-ref'
    | 'allowlist-count-mismatch'
    | 'duplicate-allowlist-entry'
    | 'allowlist-catalog-mismatch'
    | 'mega-allowlist-catalog-mismatch'
    | 'version-mismatch'
    | 'missing-pokemon-ref'
    | 'missing-ability-ref'
    | 'missing-move-ref'
    | 'missing-item-ref'
    | 'current-rule-item-mismatch'
    | 'current-rule-nature-missing'
    | 'invalid-mega-ref'
    | 'default-team-rule-mismatch';
  message: string;
};

const issue = (code: DataAuditIssue['code'], message: string): DataAuditIssue => ({ code, message });

const sourceRefsById = new Map(dataSourceManifest.sources.map((sourceRef) => [sourceRef.id, sourceRef]));

export function auditSourceRefs(label: string, sourceRefs: string[]): DataAuditIssue[] {
  const issues: DataAuditIssue[] = [];

  if (sourceRefs.length === 0 || sourceRefs.some((sourceRef) => !sourceRef)) {
    issues.push(issue('missing-source-ref', `${label} is missing sourceRefs.`));
  }

  sourceRefs.filter(Boolean).forEach((sourceRefId) => {
    const sourceRef = sourceRefsById.get(sourceRefId);
    if (!sourceRef) {
      issues.push(issue('unresolved-source-ref', `${label} references unknown sourceRef ${sourceRefId}.`));
      return;
    }

    if (sourceRef.licenseRisk === 'blocked') {
      issues.push(issue('blocked-source-ref', `${label} references blocked sourceRef ${sourceRefId}.`));
    }
  });

  return issues;
}

export function auditSeedData(): DataAuditIssue[] {
  const issues: DataAuditIssue[] = [];
  const pokemonIds = new Set(pokemon.map((entry) => entry.id));
  const abilityIds = new Set(abilities.map((entry) => entry.id));
  const moveIds = new Set(moves.map((entry) => entry.id));
  const itemIds = new Set(items.map((entry) => entry.id));
  const selectableItemIds = new Set<string>(currentRuleSelectableItemIds);
  const allowlistChampionsFormIds = new Set<string>();
  const megaAllowlistIds = new Set<string>();

  if (regMaPokemonAllowlist.length !== regMaPokemonAllowlistExpectedCount) {
    issues.push(
      issue(
        'allowlist-count-mismatch',
        `Current-rule allowlist has ${regMaPokemonAllowlist.length} rows, expected ${regMaPokemonAllowlistExpectedCount}.`,
      ),
    );
  }

  if (regMaMegaAllowlist.length !== regMaMegaAllowlistExpectedCount) {
    issues.push(
      issue(
        'allowlist-count-mismatch',
        `Current-rule Mega allowlist has ${regMaMegaAllowlist.length} rows, expected ${regMaMegaAllowlistExpectedCount}.`,
      ),
    );
  }

  pokemon.forEach((entry) => {
    issues.push(...auditSourceRefs(`Pokemon ${entry.id}`, entry.sourceRefs));

    entry.abilities.forEach((abilityId) => {
      if (!abilityIds.has(abilityId)) issues.push(issue('missing-ability-ref', `Pokemon ${entry.id} references unknown ability ${abilityId}.`));
    });

    entry.learnableMoves.forEach((moveId) => {
      if (!moveIds.has(moveId)) issues.push(issue('missing-move-ref', `Pokemon ${entry.id} references unknown move ${moveId}.`));
    });

    entry.megaForms.forEach((form) => {
      issues.push(...auditSourceRefs(`Mega form ${form.id}`, form.sourceRefs));
      if (form.requiredItemId && !itemIds.has(form.requiredItemId)) {
        issues.push(issue('missing-item-ref', `Mega form ${form.id} references unknown item ${form.requiredItemId}.`));
      }
      if (form.pokemonId !== entry.id) {
        issues.push(issue('invalid-mega-ref', `Mega form ${form.id} does not point back to ${entry.id}.`));
      }
    });
  });

  moves.forEach((entry) => {
    issues.push(...auditSourceRefs(`Move ${entry.id}`, entry.sourceRefs));
    entry.learnableByPokemonIds.forEach((pokemonId) => {
      if (!pokemonIds.has(pokemonId)) issues.push(issue('missing-pokemon-ref', `Move ${entry.id} references unknown Pokemon ${pokemonId}.`));
    });
  });

  items.forEach((entry) => {
    issues.push(...auditSourceRefs(`Item ${entry.id}`, entry.sourceRefs));
    entry.applicablePokemonIds.forEach((pokemonId) => {
      if (!pokemonIds.has(pokemonId)) issues.push(issue('missing-pokemon-ref', `Item ${entry.id} references unknown Pokemon ${pokemonId}.`));
    });
    if (entry.legalInCurrentRule && !selectableItemIds.has(entry.id)) {
      issues.push(issue('current-rule-item-mismatch', `Item ${entry.id} is legalInCurrentRule but missing from the selectable current-rule item pool.`));
    }
  });

  currentRuleSelectableItemIds.forEach((itemId) => {
    const item = items.find((entry) => entry.id === itemId);
    if (!item) {
      issues.push(issue('missing-item-ref', `Selectable current-rule item pool references unknown item ${itemId}.`));
    } else if (!item.legalInCurrentRule) {
      issues.push(issue('current-rule-item-mismatch', `Selectable current-rule item ${itemId} is not marked legalInCurrentRule.`));
    }
  });

  if (Array.from(currentRuleNatureOptions).length === 0) {
    issues.push(issue('current-rule-nature-missing', 'Current rule nature selector has no options.'));
  }

  abilities.forEach((entry) => {
    issues.push(...auditSourceRefs(`Ability ${entry.id}`, entry.sourceRefs));
    entry.pokemonIds.forEach((pokemonId) => {
      if (!pokemonIds.has(pokemonId)) issues.push(issue('missing-pokemon-ref', `Ability ${entry.id} references unknown Pokemon ${pokemonId}.`));
    });
  });

  regMaPokemonAllowlist.forEach((entry) => {
    issues.push(...auditSourceRefs(`Allowlist ${entry.id}`, entry.sourceRefs));

    if (allowlistChampionsFormIds.has(entry.championsFormId)) {
      issues.push(issue('duplicate-allowlist-entry', `Allowlist form ${entry.championsFormId} appears more than once.`));
    }
    allowlistChampionsFormIds.add(entry.championsFormId);

    if (entry.pokemonId && !pokemonIds.has(entry.pokemonId)) {
      issues.push(issue('allowlist-catalog-mismatch', `Allowlist ${entry.id} maps to unknown Pokemon ${entry.pokemonId}.`));
    }

    if (!entry.championsFormId.startsWith(entry.nationalDexNo.toString().padStart(4, '0'))) {
      issues.push(issue('allowlist-catalog-mismatch', `Allowlist ${entry.id} does not match its National Dex number.`));
    }
  });

  regMaMegaAllowlist.forEach((entry) => {
    issues.push(...auditSourceRefs(`Mega allowlist ${entry.id}`, entry.sourceRefs));
    if (megaAllowlistIds.has(entry.id)) {
      issues.push(issue('duplicate-allowlist-entry', `Mega allowlist entry ${entry.id} appears more than once.`));
    }
    megaAllowlistIds.add(entry.id);
    if (entry.basePokemonId && !pokemonIds.has(entry.basePokemonId)) {
      issues.push(issue('mega-allowlist-catalog-mismatch', `Mega allowlist ${entry.id} maps to unknown Pokemon ${entry.basePokemonId}.`));
    }
    if (entry.formId) {
      const base = pokemon.find((candidate) => candidate.id === entry.basePokemonId);
      if (!base?.megaForms.some((form) => form.id === entry.formId)) {
        issues.push(issue('mega-allowlist-catalog-mismatch', `Mega allowlist ${entry.id} maps to unknown form ${entry.formId}.`));
      }
    }
  });

  speedBenchmarks.forEach((entry) => {
    if (entry.dataVersionId !== currentDataVersion.id) {
      issues.push(issue('version-mismatch', `Benchmark ${entry.id} uses ${entry.dataVersionId}, expected ${currentDataVersion.id}.`));
    }
    if (!pokemonIds.has(entry.pokemonId)) {
      issues.push(issue('missing-pokemon-ref', `Benchmark ${entry.id} references unknown Pokemon ${entry.pokemonId}.`));
    }
  });

  defaultTeams.forEach((team) => {
    if (team.ruleSetId !== currentRuleSet.id || team.dataVersionId !== currentDataVersion.id) {
      issues.push(issue('default-team-rule-mismatch', `Default team ${team.id} does not match the current rule/data version.`));
    }
    team.members.forEach((member) => {
      if (member.pokemonId && !pokemonIds.has(member.pokemonId)) {
        issues.push(issue('missing-pokemon-ref', `Default team ${team.id} references unknown Pokemon ${member.pokemonId}.`));
      }
      if (member.abilityId && !abilityIds.has(member.abilityId)) {
        issues.push(issue('missing-ability-ref', `Default team ${team.id} references unknown ability ${member.abilityId}.`));
      }
      if (member.itemId && !itemIds.has(member.itemId)) {
        issues.push(issue('missing-item-ref', `Default team ${team.id} references unknown item ${member.itemId}.`));
      }
      member.moveIds.forEach((moveId) => {
        if (!moveIds.has(moveId)) issues.push(issue('missing-move-ref', `Default team ${team.id} references unknown move ${moveId}.`));
      });
    });
  });

  return issues;
}
