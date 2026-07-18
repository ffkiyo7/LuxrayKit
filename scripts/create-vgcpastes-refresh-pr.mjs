import { execFile } from 'node:child_process';
import { readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const baseBranch = process.env.VGCPASTES_REFRESH_BASE_BRANCH ?? 'main';
const refreshBranch = process.env.VGCPASTES_REFRESH_BRANCH ?? 'automation/vgcpastes-team-refresh';
const commitMessage = 'data: refresh VGCPastes team library';
const prTitle = 'data: refresh VGCPastes team library';
const dryRun = process.argv.includes('--dry-run');
const requestedRegulations = (
  process.argv.find((argument) => argument.startsWith('--reg='))?.slice('--reg='.length) ?? 'mb'
)
  .split(',')
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean);

// These floors and the issue ceiling are intentionally conservative. The curation
// runbook owns raising them as the library grows; crossing one stops publication.
const MAX_AUDIT_ISSUES = 10;
const MIN_IMPORTED_TEAMS = { ma: 90, mb: 20 };

const regulationConfig = {
  ma: {
    label: 'M-A',
    npmScript: 'data:vgcpastes:champions-ma',
    samplePath: 'src/data/external/vgcpastes/reg_ma_champions_ma_team_samples.json',
    auditPath: 'src/data/external/vgcpastes/reg_ma_champions_ma_audit.json',
  },
  mb: {
    label: 'M-B',
    npmScript: 'data:vgcpastes:champions-mb',
    samplePath: 'src/data/external/vgcpastes/reg_mb_champions_mb_team_samples.json',
    auditPath: 'src/data/external/vgcpastes/reg_mb_champions_mb_audit.json',
  },
};
const generatedSnapshotPaths = Object.values(regulationConfig).flatMap(({ samplePath, auditPath }) => [
  samplePath,
  auditPath,
]);

const command = (name) => (process.platform === 'win32' && name === 'npm' ? 'npm.cmd' : name);

function printable(commandName, args) {
  return [commandName, ...args].join(' ');
}

async function run(commandName, args, options = {}) {
  console.log(`$ ${printable(commandName, args)}`);
  try {
    return await execFileAsync(command(commandName), args, {
      cwd: ROOT,
      windowsHide: true,
      maxBuffer: 16 * 1024 * 1024,
      ...options,
    });
  } catch (error) {
    if (error.stdout) process.stdout.write(error.stdout);
    if (error.stderr) process.stderr.write(error.stderr);
    throw error;
  }
}

async function capture(commandName, args, options = {}) {
  const { stdout } = await run(commandName, args, options);
  return stdout.trim();
}

async function commandExists(commandName, args = ['--version']) {
  try {
    await execFileAsync(command(commandName), args, {
      cwd: ROOT,
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    });
    return true;
  } catch {
    return false;
  }
}

function validateArguments() {
  const unknown = requestedRegulations.filter((regulation) => !(regulation in regulationConfig));
  if (requestedRegulations.length === 0 || unknown.length > 0) {
    throw new Error(`Invalid --reg value. Use --reg=mb (default) or --reg=mb,ma.`);
  }
  if (new Set(requestedRegulations).size !== requestedRegulations.length) {
    throw new Error('Duplicate regulation in --reg value.');
  }
}

async function ensureRequiredCommands() {
  const missing = [];
  if (!(await commandExists('git'))) missing.push('git');
  if (!dryRun && !(await commandExists('gh'))) missing.push('gh');
  if (!(await commandExists('npm', ['--version']))) missing.push('npm');
  if (missing.length > 0) throw new Error(`Missing required command(s): ${missing.join(', ')}`);
}

async function ensureCleanWorkingTree() {
  const status = await capture('git', ['status', '--porcelain']);
  if (status) {
    throw new Error('Refusing to rebuild the automation branch from a dirty working tree.');
  }
}

async function readAudit(regulation) {
  const config = regulationConfig[regulation];
  const audit = JSON.parse(await readFile(resolve(ROOT, config.auditPath), 'utf8'));
  if (!Array.isArray(audit.issues)) {
    throw new Error(`${config.label} audit has no issues array.`);
  }
  for (const field of ['inputRows', 'filteredRows', 'importedTeams']) {
    if (!Number.isInteger(audit[field]) || audit[field] < 0) {
      throw new Error(`${config.label} audit has an invalid ${field} value.`);
    }
  }
  return {
    regulation,
    label: config.label,
    inputRows: audit.inputRows,
    filteredRows: audit.filteredRows,
    importedTeams: audit.importedTeams,
    issueCount: audit.issues.length,
  };
}

function assertHealthy(report) {
  const failures = [];
  if (report.issueCount > MAX_AUDIT_ISSUES) {
    failures.push(`${report.issueCount} audit issues exceeds ${MAX_AUDIT_ISSUES}`);
  }
  if (report.importedTeams < MIN_IMPORTED_TEAMS[report.regulation]) {
    failures.push(`${report.importedTeams} imported teams is below ${MIN_IMPORTED_TEAMS[report.regulation]}`);
  }
  if (failures.length > 0) {
    throw new Error(`VGCPastes ${report.label} health gate failed: ${failures.join('; ')}`);
  }
}

function printReports(reports) {
  console.log('\nVGCPastes refresh report');
  reports.forEach((report) => {
    console.log(
      `- ${report.label}: input ${report.inputRows}, filtered ${report.filteredRows}, imported ${report.importedTeams}, issues ${report.issueCount}`,
    );
  });
}

function prBody(reports) {
  return [
    'Generated by the LuxrayKit VPS VGCPastes team-library refresher.',
    '',
    ...reports.map(
      (report) =>
        `- ${report.label}: input rows ${report.inputRows}; filtered rows ${report.filteredRows}; imported teams ${report.importedTeams}; issues ${report.issueCount}.`,
    ),
    '',
    '- Commits only generated VGCPastes sample and audit JSON files.',
    '- CI validates the data contract, application build, rendered team library, and Worker bundle.',
    '',
    `Refresher host: \`${os.hostname()}\``,
    `Generated at: \`${new Date().toISOString()}\``,
  ].join('\n');
}

async function changedGeneratedFiles() {
  const output = await capture('git', ['diff', '--name-only', '--', ...generatedSnapshotPaths]);
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

async function snapshotGeneratedFiles() {
  return Promise.all(
    generatedSnapshotPaths.map(async (filePath) => ({
      filePath,
      contents: await readFile(resolve(ROOT, filePath)).catch((error) => {
        if (error?.code === 'ENOENT') return undefined;
        throw error;
      }),
    })),
  );
}

async function restoreGeneratedFiles(snapshot) {
  await Promise.all(
    snapshot.map(({ filePath, contents }) =>
      contents === undefined
        ? rm(resolve(ROOT, filePath), { force: true })
        : writeFile(resolve(ROOT, filePath), contents),
    ),
  );
}

async function runIngestion() {
  for (const regulation of requestedRegulations) {
    await run('npm', ['run', regulationConfig[regulation].npmScript]);
  }
  const reports = await Promise.all(requestedRegulations.map(readAudit));
  printReports(reports);
  reports.forEach(assertHealthy);
  return reports;
}

async function main() {
  validateArguments();
  await ensureRequiredCommands();

  if (dryRun) {
    const snapshot = await snapshotGeneratedFiles();
    try {
      await runIngestion();
      const changedFiles = await changedGeneratedFiles();
      console.log(`\nWould commit: ${changedFiles.length > 0 ? changedFiles.join(', ') : '(no changed files)'}`);
    } finally {
      await restoreGeneratedFiles(snapshot);
    }
    console.log('Dry run complete. Git branch, index, and worktree were left unchanged.');
    return;
  }

  await ensureCleanWorkingTree();
  await run('git', ['fetch', 'origin']);
  await run('git', ['switch', '-C', refreshBranch, `origin/${baseBranch}`]);

  let reports;
  try {
    reports = await runIngestion();
  } catch (error) {
    // Generated JSON is fully reproducible and the cron log already contains the
    // failure report. Restore it so one bad upstream run cannot wedge later cron runs.
    await run('git', ['restore', '--worktree', '--', ...generatedSnapshotPaths]);
    throw error;
  }
  const changedFiles = await changedGeneratedFiles();
  if (changedFiles.length === 0) {
    console.log('VGCPastes generated snapshots already match remote data. No PR update needed.');
    return;
  }

  await run('git', ['add', '--', ...generatedSnapshotPaths]);
  const stagedFiles = (await capture('git', ['diff', '--cached', '--name-only']))
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const unexpectedFiles = stagedFiles.filter((file) => !generatedSnapshotPaths.includes(file));
  if (unexpectedFiles.length > 0) {
    throw new Error(`Refusing to commit unexpected file(s): ${unexpectedFiles.join(', ')}`);
  }

  await run('git', ['commit', '-m', commitMessage]);
  await run('git', ['push', '--force-with-lease', 'origin', refreshBranch]);

  const existingPrs = JSON.parse(
    (await capture('gh', [
      'pr',
      'list',
      '--base',
      baseBranch,
      '--head',
      refreshBranch,
      '--state',
      'open',
      '--limit',
      '1',
      '--json',
      'number,isDraft',
    ])) || '[]',
  );
  const existingPr = existingPrs[0];

  if (existingPr) {
    if (existingPr.isDraft) await run('gh', ['pr', 'ready', String(existingPr.number)]);
    // Use REST rather than gh pr edit: older distro builds of gh query the
    // deprecated Projects (classic) GraphQL field and reject fine-grained PATs.
    await run('gh', [
      'api',
      '--method',
      'PATCH',
      `repos/{owner}/{repo}/pulls/${existingPr.number}`,
      '-f',
      `title=${prTitle}`,
      '-f',
      `body=${prBody(reports)}`,
      '--silent',
    ]);
    console.log(`Updated ready PR #${existingPr.number}.`);
    return;
  }

  await run('gh', [
    'pr',
    'create',
    '--base',
    baseBranch,
    '--head',
    refreshBranch,
    '--title',
    prTitle,
    '--body',
    prBody(reports),
  ]);
  console.log('Created a ready-for-review automation PR.');
}

await main();
