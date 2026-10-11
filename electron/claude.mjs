import {resolveClaudeExecutable} from './claude-discovery.mjs';
import {runLyricsPipeline} from './lyrics-generation.mjs';
import {artPromptRequest,cleanArtPrompt} from './art-prompt.mjs';
import {claudeBilling,withoutBillingCredentials} from './cli-billing.mjs';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

// The CLI runs locally with the user's own Claude subscription login; requests go to their account.
// Claude has no built-in image generation, so album art stays with Codex.
export const claudeModels = Object.freeze([
  {id:'fable',name:'Fable · 최상위 모델'},
  {id:'opus',name:'Opus · 깊이 있는 창작'},
  {id:'sonnet',name:'Sonnet · 속도와 품질의 균형'},
  {id:'haiku',name:'Haiku · 빠른 응답'},
]);
export const claudeEfforts = Object.freeze(['medium','high','xhigh','max']);
export const agentProviders = Object.freeze(['codex','claude']);
const active = new Set();
const cancelled = () => Object.assign(new Error('작업이 취소되었습니다.'), { name: 'AbortError' });

export function validateClaudeSettings(current, payload) {
  const pick = key => payload[key] === undefined ? current[key] : payload[key];
  const agentProvider = pick('agentProvider') ?? '', claudeModel = pick('claudeModel') ?? '', claudeReasoning = pick('claudeReasoning') || 'medium';
  if (agentProvider !== '' && !agentProviders.includes(agentProvider)) throw new Error('AI 에이전트는 Claude 또는 Codex 중에서 선택하세요.');
  if (typeof claudeModel !== 'string' || (claudeModel && !claudeModels.some(model => model.id === claudeModel))) throw new Error('Claude 모델은 목록에서 선택하세요.');
  if (!claudeEfforts.includes(claudeReasoning)) throw new Error('Claude 추론 수준은 보통, 높음, 매우 높음, 최대 중에서 선택하세요.');
  return { agentProvider, claudeModel, claudeReasoning };
}

// When the app itself is started from a Claude Code session (development), the parent's
// session identity must not leak into the child CLI. Billing credentials are always removed
// so the CLI can only use the subscription login; other user configuration is preserved.
const parentSession = /^(CLAUDECODE|CLAUDE_PID|CLAUDE_PREVIEW_CLASSIFIER_FLOOR|CLAUDE_AGENT_SDK_.+|CLAUDE_CODE_(ENTRYPOINT|SSE_PORT|SESSION_.+|CHILD_SESSION|HOST_SESSION_ID|MESSAGING_.+|SDK_.+|SIMPLE|TERMINAL_MCP_TOOLS|REPORT_FINDINGS|EMIT_TOOL_USE_SUMMARIES|ENABLE_ASK_USER_QUESTION_TOOL|ENABLE_SDK_FILE_CHECKPOINTING|DESKTOP_APP_VERSION|EAGER_FLUSH|ACCOUNT_UUID|ORGANIZATION_UUID|USER_EMAIL|OAUTH_SCOPES|AUTOUPDATER_DISABLED_BY_HOST|DISABLE_CRON|DISABLE_TERMINAL_TITLE))$/i;
export function claudeEnvironment(env = process.env, extra = {}) {
  const next = withoutBillingCredentials(env);
  for (const key of Object.keys(next)) if (parentSession.test(key)) delete next[key];
  return { ...next, ...extra };
}

function stop(child) {
  if (!child.pid || child.exitCode !== null) return;
  if (process.platform === 'win32') {
    const killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, shell: false, stdio: 'ignore' });
    killer.on('error', () => child.kill());
  } else {
    try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); }
  }
}
export function cancelClaudeProcesses() { for (const child of active) stop(child); }
function launch(args, cwd) {
  const target = resolveClaudeExecutable();
  const child = spawn(target.command, [...target.args, ...args], { cwd, env: claudeEnvironment(process.env, target.env), shell: false, windowsHide: true, detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'] });
  active.add(child);
  child.on('close', () => active.delete(child));
  child.stdin.on('error', () => {});
  return child;
}
function processError(error) {
  return Object.assign(new Error(error.code === 'ENOENT' ? 'Claude 실행 파일 또는 작업 폴더에 접근할 수 없습니다. 설치 상태를 다시 확인하세요.' : `Claude 실행 오류: ${error.message}`), { code: error.code });
}
function capture(args, timeoutMs, label, input = '') {
  return new Promise((resolve, reject) => {
    const child = launch(args); let stdout = '', stderr = '';
    const timer = setTimeout(() => { stop(child); reject(new Error(`${label} 시간이 초과되었습니다.`)); }, timeoutMs);
    child.stdout.on('data', chunk => { stdout = (stdout + chunk).slice(-64000); });
    child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-2000); });
    child.on('error', error => { clearTimeout(timer); reject(processError(error)); });
    child.on('close', code => { clearTimeout(timer); resolve({ code, stdout: stdout.trim(), stderr: stderr.trim() }); });
    child.stdin.end(input, 'utf8');
  });
}
// Only these flags are ever passed for prompts: no tools, no user customizations, no saved session.
const isolated = ['--safe-mode', '--tools', '', '--no-session-persistence'];
const meteredMessage = source => claudeBilling({ loggedIn: true, authMethod: 'api_key', apiKeySource: source }).message;

export async function inspectClaudeInstallation() {
  try {
    const version = await capture(['--version'], 8000, 'Claude 실행 확인');
    if (version.code !== 0 || !/claude/i.test(version.stdout)) throw new Error(`Claude 실행 확인 실패 (${version.code}). ${version.stderr}`);
    let auth = null;
    try { auth = JSON.parse((await capture(['auth', 'status'], 10000, 'Claude 로그인 확인')).stdout); } catch {}
    const billing = claudeBilling(auth);
    // Only the login state, plan and billing kind are kept; account identifiers stay in the CLI.
    return { state: 'installed', version: version.stdout.replace(/\s*\(Claude Code\)\s*$/i, ''), loggedIn: auth ? auth.loggedIn === true : null, ...(typeof auth?.subscriptionType === 'string' ? { plan: auth.subscriptionType } : {}),
      ...billing, message: billing.message || version.stdout };
  } catch (error) {
    return { state: error.code === 'CLAUDE_NOT_FOUND' ? 'missing' : 'error', message: error.message };
  }
}

// Plan windows from a request's rate_limit_event (utilization reported as a 0–1 fraction).
export function claudeUsage(info, observedAt = Date.now()) {
  const percent = window => { const value = Number(window?.utilization); if (!Number.isFinite(value)) return null; return Math.min(100, Math.max(0, value <= 1 ? value * 100 : value)); };
  const windows = info?.unifiedWindows || {};
  const week = percent(windows.seven_day), session = percent(windows.five_hour);
  if (week === null && session === null) return { state: 'unavailable', message: '사용량 정보가 제공되지 않았습니다.' };
  return { state: 'ready', observedAt, ...(week !== null ? { usedPercent: week, ...(Number.isFinite(windows.seven_day?.resetsAt) ? { resetsAt: windows.seven_day.resetsAt } : {}) } : {}),
    ...(session !== null ? { sessionPercent: session, ...(Number.isFinite(windows.five_hour?.resetsAt) ? { sessionResetsAt: windows.five_hour.resetsAt } : {}) } : {}) };
}

const monthIndex = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
function zoneParts(time, zone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' }).formatToParts(time).map(part => [part.type, Number(part.value)]));
  return { year: parts.year, month: parts.month - 1, day: parts.day, hour: parts.hour % 24, minute: parts.minute };
}
function zonedEpoch(year, month, day, hour, minute, zone) {
  const wall = Date.UTC(year, month, day, hour, minute);
  const offset = time => { const p = zoneParts(time, zone); return Date.UTC(p.year, p.month, p.day, p.hour, p.minute) - Math.floor(time / 60000) * 60000; };
  let time = wall - offset(wall);
  const corrected = wall - offset(time);
  if (corrected !== time) time = corrected;
  return time;
}
/** "Oct 14, 2:59pm (Asia/Seoul)" or "5:39pm (Asia/Seoul)" → epoch seconds of the next such moment. */
export function parseResetTime(text, now = Date.now()) {
  const match = String(text || '').trim().match(/^(?:([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(?:at\s+)?)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b(?:\s*\(([^)]+)\))?/i);
  if (!match) return null;
  let zone = match[6];
  try { if (zone) new Intl.DateTimeFormat('en-US', { timeZone: zone }); } catch { zone = undefined; }
  const hour = Number(match[3]) % 12 + (match[5].toLowerCase() === 'pm' ? 12 : 0), minute = Number(match[4] || 0);
  const today = zoneParts(now, zone);
  const month = match[1] ? monthIndex[match[1].toLowerCase()] : today.month, day = match[2] ? Number(match[2]) : today.day;
  if (month === undefined || hour > 23 || minute > 59) return null;
  let at = zonedEpoch(today.year, month, day, hour, minute, zone);
  // A reset is always ahead: a passed date belongs to next year, a passed time of day to tomorrow.
  if (match[1] ? at < now - 12 * 3600000 : at < now - 5 * 60000) at = match[1] ? zonedEpoch(today.year + 1, month, day, hour, minute, zone) : at + 86400000;
  return Math.round(at / 1000);
}
/** Text of the CLI `/usage` command → plan usage (all models week, five-hour session, per-model weeks). */
export function parseClaudeUsageText(text, now = Date.now()) {
  const source = String(text || '');
  const pattern = /^\s*Current (session|week(?: \(([^)]+)\))?):\s*<?\s*([\d.]+)\s*%\s*used\b(?:\s*[·•,\-–—]?\s*resets?\s+(.+?))?[\s.]*$/gim;
  let week = null, session = null; const models = [];
  for (const match of source.matchAll(pattern)) {
    const entry = { percent: Math.min(100, Math.max(0, Number(match[3]))), ...(match[4] ? { resetsAt: parseResetTime(match[4], now) ?? undefined, resetText: match[4].trim() } : {}) };
    if (!Number.isFinite(entry.percent)) continue;
    if (/^session$/i.test(match[1])) session = entry;
    else if (!match[2] || /all models/i.test(match[2])) week = entry;
    else models.push({ label: match[2], ...entry });
  }
  if (!week && !session) return { state: 'unavailable', message: 'Claude 사용량 정보를 해석하지 못했습니다.' };
  return { state: 'ready', source: 'usage', observedAt: now,
    ...(week ? { usedPercent: week.percent, ...(week.resetsAt ? { resetsAt: week.resetsAt } : {}) } : {}),
    ...(session ? { sessionPercent: session.percent, ...(session.resetsAt ? { sessionResetsAt: session.resetsAt } : {}) } : {}),
    ...(models.length ? { models } : {}) };
}

/**
 * Runs the CLI's built-in `/usage` command. It answers locally from the plan service without a model
 * turn (verified: zero turns and zero cost), and its init event proves which credential would be used.
 */
let usageCommandRetired = '';
export async function readClaudeUsage({ timeoutMs = 30000 } = {}) {
  // If a CLI version ever answers /usage with a model turn, never poll it again in this session.
  if (usageCommandRetired) throw new Error(usageCommandRetired);
  const { code, stdout, stderr } = await capture(['-p', '--output-format', 'stream-json', '--verbose', ...isolated], timeoutMs, 'Claude 사용량 확인', '/usage');
  let init = null, result = null;
  for (const line of stdout.split(/\r?\n/)) { try { const event = JSON.parse(line); if (event.type === 'system' && event.subtype === 'init') init = event; if (event.type === 'result') result = event; } catch {} }
  if (init?.apiKeySource && init.apiKeySource !== 'none') throw new Error(meteredMessage(init.apiKeySource));
  if (!result || result.is_error) throw new Error(`Claude 사용량을 확인하지 못했습니다. ${(typeof result?.result === 'string' && result.result) || stderr.slice(-400) || `종료 코드 ${code}`}`);
  if (result.num_turns > 0 || result.total_cost_usd > 0) throw new Error(usageCommandRetired = '이 Claude Code 버전은 사용량 확인을 모델 호출로 처리하므로 자동 확인을 중단했습니다. Claude 작업 응답의 사용량으로 표시합니다.');
  if (!/using your subscription/i.test(result.result || '')) throw new Error('Claude 구독 사용량 정보를 받지 못했습니다. 구독 계정 로그인을 확인하세요.');
  return parseClaudeUsageText(result.result);
}

const systemPrompt = 'You are the songwriting assistant inside the Boks Music desktop app. You have no tools. Follow the instructions in the user message exactly and reply with only the requested output.';
export function claudeArgs({ model, reasoningEffort = 'medium' } = {}) {
  if (!claudeEfforts.includes(reasoningEffort)) throw new Error('Claude 추론 수준은 보통, 높음, 매우 높음, 최대 중에서 선택하세요.');
  if (model && !claudeModels.some(item => item.id === model)) throw new Error('Claude 모델은 목록에서 선택하세요.');
  return ['-p', '--output-format', 'stream-json', '--verbose', ...isolated, '--system-prompt', systemPrompt, '--effort', reasoningEffort, ...(model ? ['--model', model] : [])];
}

async function execute({ prompt, model, reasoningEffort = 'medium', cwd, signal, onProgress, onUsage, timeoutMs = 600000 }) {
  if (signal?.aborted) throw cancelled();
  if (!cwd || !path.isAbsolute(cwd)) throw new Error('AI 작업 폴더는 절대 경로여야 합니다.');
  await mkdir(cwd, { recursive: true });
  const args = claudeArgs({ model, reasoningEffort });
  return new Promise((resolve, reject) => {
    const child = launch(args, cwd);
    let settled = false, stderr = '', result = null, failure = '';
    const lines = createInterface({ input: child.stdout });
    const finish = (error, value) => {
      if (settled) return;
      settled = true; clearTimeout(timer); signal?.removeEventListener('abort', abort); lines.close();
      if (error) { stop(child); reject(error); } else resolve(value);
    };
    const abort = () => finish(cancelled());
    const timer = setTimeout(() => finish(new Error('Claude 생성 시간이 초과되었습니다. 다시 시도하세요.')), timeoutMs);
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) { abort(); return; }
    child.on('error', e => finish(processError(e)));
    child.stderr.on('data', data => { stderr = (stderr + data).slice(-12000); });
    lines.on('line', line => {
      let event; try { event = JSON.parse(line); } catch { return; }
      if (event.type === 'system' && event.subtype === 'init') {
        // The init event arrives only after the prompt was sent, so this detects rather than prevents:
        // prevention is the auth check right before every run. A detected API key still ends the run at once.
        if (event.apiKeySource && event.apiKeySource !== 'none') return finish(new Error(meteredMessage(event.apiKeySource)));
        onProgress?.({ stage: 'Claude 연결됨' });
      }
      else if (event.type === 'assistant') onProgress?.({ stage: '텍스트 작업 중' });
      else if (event.type === 'rate_limit_event') { const usage = claudeUsage(event.rate_limit_info); if (usage.state === 'ready') onUsage?.(usage); }
      else if (event.type === 'result') {
        onProgress?.({ stage: '생성 결과 확인 중' });
        if (event.is_error || event.subtype !== 'success') failure = (typeof event.result === 'string' && event.result) || (Array.isArray(event.errors) && event.errors.join(' ')) || (event.subtype ? `응답이 완료되지 않았습니다 (${event.subtype}).` : '응답이 완료되지 않았습니다.');
        else result = typeof event.result === 'string' ? event.result.trim() : '';
      }
    });
    child.on('close', code => {
      if (signal?.aborted) return finish(cancelled());
      if (code === 0 && !failure && result) return finish(null, result);
      if (code === 0 && !failure) return finish(new Error(result === '' ? 'Claude가 빈 결과를 반환했습니다.' : 'Claude가 결과를 반환하지 않았습니다. 다시 시도하세요.'));
      finish(new Error(`Claude 생성에 실패했습니다. ${failure || stderr.slice(-1600) || `종료 코드 ${code}`}`));
    });
    child.stdin.end(prompt, 'utf8');
  });
}

export async function generateLyrics(options) {
  return runLyricsPipeline(options, execute);
}

// Album art description for the local image model (Claude does not render images itself).
export async function writeArtPrompt({ title, lyrics, style, ...options }) {
  return cleanArtPrompt(await execute({ ...options, prompt: artPromptRequest({ title, lyrics, style }), timeoutMs: 300000 }));
}
