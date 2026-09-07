import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, existsSync, writeFileSync, openSync, closeSync, unlinkSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const ACTIVE = new Set(['created', 'build_in_progress', 'pre_deploy_in_progress', 'update_in_progress']);
const FAILED = new Set(['build_failed', 'pre_deploy_failed', 'update_failed', 'canceled', 'deactivated']);
const repoURL = (value) => String(value ?? '').replace(/\.git$/, '').replace(/\/$/, '');

export async function withReleaseLock(path, action) {
  let handle;
  try { handle = openSync(path, 'wx'); }
  catch (error) {
    if (error.code === 'EEXIST') throw new Error('A release lock already exists. Check the recorded process and Render deployment before removing a stale lock.');
    throw error;
  }
  try {
    writeFileSync(handle, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
    return await action();
  } finally { closeSync(handle); unlinkSync(path); }
}

export function runReleaseRulesGate(spawn = spawnSync, workspace = fileURLToPath(new URL('../imperium-like-digital-prototype/', import.meta.url))) {
  const command = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const result = spawn(command, ['run', 'verify:rules'], { cwd: workspace, encoding: 'utf8', timeout: 10 * 60 * 1000 });
  if (result.status !== 0) throw new Error('Local rules verification failed. Deployment was not started.');
}

async function listAll(api, path, limit) {
  const results = [];
  const cursors = new Set();
  let cursor;
  for (let page = 0; page < 100; page += 1) {
    const entries = await api('GET', `${path}?limit=${limit}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
    if (!Array.isArray(entries)) throw new Error('Render returned an invalid list.');
    results.push(...entries);
    if (entries.length < limit) return results;
    cursor = entries.at(-1)?.cursor;
    if (typeof cursor !== 'string' || !cursor || cursors.has(cursor)) throw new Error('Render pagination could not be verified.');
    cursors.add(cursor);
  }
  throw new Error('Render pagination exceeded its safety limit.');
}

export function validateRelease(config) {
  if (!/^[a-f0-9]{40}$/.test(config.commit ?? '')) throw new Error('A full 40-character commit SHA is required.');
  if (!/^srv-[a-z0-9]+$/.test(config.serviceId ?? '')) throw new Error('An explicit Render service ID is required.');
  const url = new URL(config.baseURL);
  if (url.protocol !== 'https:' || url.origin !== config.baseURL || url.username || url.password) throw new Error('An HTTPS production origin is required.');
  if (!/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/.test(repoURL(config.repo))) throw new Error('Expected an HTTPS GitHub repository URL.');
  if (config.remoteCommit !== config.commit) throw new Error('Requested commit is not the verified remote branch tip.');
}

export async function runRelease(config, deps) {
  validateRelease(config);
  const report = { version: 1, commit: config.commit, serviceId: config.serviceId, baseURL: config.baseURL,
    status: 'checking', checks: [], manualRemaining: ['Admin close/end rehearsal', 'Private storage backup and restore rehearsal'] };
  if (config.previous?.commit === config.commit && ['submitting', 'submission-uncertain'].includes(config.previous.status)) report.status = 'submission-uncertain';
  const record = () => deps.record?.(structuredClone(report));
  const base = `/services/${config.serviceId}`;
  try {
    const service = await deps.api('GET', base);
    if (repoURL(service.repo) !== repoURL(config.repo) || service.branch !== config.branch || service.serviceDetails?.url !== config.baseURL) throw new Error('Service repository, branch, or origin mismatch.');
    const vars = await listAll(deps.api, `${base}/env-vars`, 100);
    const env = Object.fromEntries(vars.map((entry) => [entry.envVar.key, String(entry.envVar.value).trim()]));
    const drift = [];
    if (env.POLITY_SERVER_ORIGIN !== config.baseURL) drift.push('POLITY_SERVER_ORIGIN');
    if (env.POLITY_STORAGE_PATH !== '/var/data/polity-engine') drift.push('POLITY_STORAGE_PATH');
    if (env.VITE_SHOW_PRIVATE_CARD_DEBUG && env.VITE_SHOW_PRIVATE_CARD_DEBUG !== 'false') drift.push('VITE_SHOW_PRIVATE_CARD_DEBUG');
    if (service.serviceDetails?.disk?.mountPath !== '/var/data') drift.push('persistent-disk');
    if (env.POLITY_BUILD_COMMIT && env.POLITY_BUILD_COMMIT !== config.commit) drift.push('POLITY_BUILD_COMMIT');
    if (service.rootDir !== 'imperium-like-digital-prototype') drift.push('rootDir');
    if (service.serviceDetails?.runtime !== 'node') drift.push('runtime');
    if (service.serviceDetails?.envSpecificDetails?.buildCommand !== 'npm ci && npm run build -w app && npm run typecheck') drift.push('buildCommand');
    if (service.serviceDetails?.envSpecificDetails?.startCommand !== 'npm run start') drift.push('startCommand');
    if (service.serviceDetails?.healthCheckPath !== '/polity/accounts/health') drift.push('healthCheckPath');
    if (drift.length) { report.drift = drift; throw new Error('Production configuration drift.'); }
    report.checks.push('remote-commit', 'service-identity', 'configuration');
    if (config.dryRun) { report.status = 'dry-run-ready'; record(); return report; }
    const list = await listAll(deps.api, `${base}/deploys`, 20);
    const deployments = list.map((entry) => entry.deploy);
    if (deployments.some((d) => ACTIVE.has(d.status) && d.commit?.id !== config.commit)) throw new Error('Another commit is deploying. Retry after it finishes.');
    let deployment = deployments.find((d) => d.commit?.id === config.commit && (ACTIVE.has(d.status) || d.status === 'live'));
    if (!deployment) {
      if (config.previous?.commit === config.commit && ['submitting', 'submission-uncertain'].includes(config.previous.status)) throw new Error('Previous submission is uncertain. Inspect Render before retrying deployment.');
      report.status = 'submitting'; record();
      try { deployment = await deps.api('POST', `${base}/deploys`, { commitId: config.commit, clearCache: 'do_not_clear' }); }
      catch { report.status = 'submission-uncertain'; throw new Error('Deployment submission is uncertain. Inspect Render before retrying.'); }
    }
    if (!/^dep-[a-z0-9]+$/.test(deployment?.id ?? '')) { report.status = 'submission-uncertain'; throw new Error('Invalid deployment response. Inspect Render before retrying.'); }
    report.deploymentId = deployment.id;
    report.status = 'deploying'; record();
    const deadline = deps.now() + (config.timeoutMs ?? 15 * 60 * 1000);
    while (deployment.status !== 'live') {
      if (FAILED.has(deployment.status)) throw new Error('Render deployment failed. Inspect deployment logs.');
      if (deps.now() >= deadline) { report.status = 'timeout'; throw new Error('Deployment timed out; rerunning will reuse a matching active deployment.'); }
      await deps.sleep(15000);
      deployment = await deps.api('GET', `${base}/deploys/${report.deploymentId}`);
    }
    if (deployment.commit?.id !== config.commit) throw new Error('Render deployed a different commit.');
    report.status = 'verifying'; report.checks.push('deployment-live'); record();
    await deps.prove('origin-and-commit', config); report.checks.push('origin-and-commit'); record();
    await deps.prove('smoke', config); report.checks.push('smoke'); record();
    await deps.prove('browser', config); report.checks.push('browser');
    await deps.prove('origin-and-commit', config);
    report.status = 'verified'; record(); return report;
  } catch (error) {
    if (!['submission-uncertain', 'timeout'].includes(report.status)) report.status = 'failed';
    // Reports contain controlled status/check names only, not HTTP bodies or credentials.
    record(); throw error;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const get = (flag) => args[args.indexOf(flag) + 1];
  for (const flag of ['--commit', '--service', '--origin']) if (!args.includes(flag)) throw new Error(`Missing ${flag}.`);
  const workspace = fileURLToPath(new URL('../imperium-like-digital-prototype/', import.meta.url));
  const git = (...gitArgs) => {
    const result = spawnSync('git', gitArgs, { cwd: workspace, encoding: 'utf8', timeout: 60000 });
    if (result.status !== 0) throw new Error('Git remote verification failed.');
    return result.stdout.trim();
  };
  const branch = 'main';
  const config = { commit: get('--commit'), serviceId: get('--service'), baseURL: get('--origin'), branch,
    repo: git('remote', 'get-url', 'origin'), remoteCommit: git('ls-remote', 'origin', `refs/heads/${branch}`).split(/\s+/)[0], dryRun: args.includes('--dry-run') };
  validateRelease(config);
  runReleaseRulesGate();
  if (!process.env.RENDER_API_KEY) throw new Error('RENDER_API_KEY is required.');
  const reportDir = resolve(workspace, 'tmp', 'releases'); mkdirSync(reportDir, { recursive: true });
  const reportPath = resolve(reportDir, `${config.serviceId}-${config.commit}${config.dryRun ? '-dry-run' : ''}.json`);
  const api = async (method, endpoint, body) => {
    let response;
    try { response = await fetch(`https://api.render.com/v1${endpoint}`, {
      method, headers: { Authorization: `Bearer ${process.env.RENDER_API_KEY}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30000)
    }); } catch { throw new Error('Render request failed or timed out.'); }
    if (!response.ok) throw new Error(`Render returned HTTP ${response.status}.`);
    try { return await response.json(); } catch { throw new Error('Render returned an invalid JSON response.'); }
  };
  const prove = async (check, current) => {
    if (check === 'origin-and-commit') {
      const version = await fetch(`${current.baseURL}/polity/accounts/version`, { signal: AbortSignal.timeout(30000) });
      const data = await version.json();
      if (!version.ok || data.ok !== true || data.buildCommit !== current.commit) throw new Error('Live commit verification failed.');
      const cors = await fetch(`${current.baseURL}/games`, { headers: { Origin: current.baseURL }, signal: AbortSignal.timeout(30000) });
      if (!cors.ok || cors.headers.get('access-control-allow-origin') !== current.baseURL) throw new Error('Live origin verification failed.');
      return;
    }
    const script = fileURLToPath(new URL(check === 'smoke' ? './hosted-smoke.mjs' : './hosted-browser-qa.mjs', import.meta.url));
    const result = spawnSync(process.execPath, [script], { cwd: workspace, encoding: 'utf8', timeout: 10 * 60 * 1000,
      env: { ...process.env, POLITY_HOSTED_BASE_URL: current.baseURL, POLITY_BROWSER_QA_BASE_URL: current.baseURL, POLITY_EXPECTED_COMMIT: current.commit } });
    if (result.status !== 0) throw new Error(`Hosted ${check} verification failed; rerun the corresponding QA command for diagnostics.`);
  };
  const report = await withReleaseLock(resolve(reportDir, `${config.serviceId}.lock`), async () => {
    if (existsSync(reportPath)) config.previous = JSON.parse(readFileSync(reportPath, 'utf8'));
    return runRelease(config, { api, prove, now: Date.now, sleep: (ms) => new Promise((done) => setTimeout(done, ms)),
      record: (value) => { writeFileSync(reportPath, JSON.stringify(value, null, 2)); console.log(`Release: ${value.status}`); } });
  });
  console.log(JSON.stringify({ ...report, reportPath }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((error) => {
  console.error(error.message); process.exitCode = 1;
});
