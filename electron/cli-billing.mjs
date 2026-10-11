import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// AI agents run only through their local CLIs on subscription logins. Credentials that
// would switch a CLI to metered API or cloud-provider billing never reach child processes.
export const billingVariables = Object.freeze(['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX', 'CLAUDE_CODE_USE_FOUNDRY', 'OPENAI_API_KEY', 'CODEX_API_KEY']);
export function withoutBillingCredentials(env = process.env) {
  const blocked = new Set(billingVariables);
  return Object.fromEntries(Object.entries(env).filter(([key]) => !blocked.has(key.toUpperCase())));
}
// Removes the variables from this process so every spawned CLI (including Codex) inherits a clean environment.
export function removeBillingCredentials(env = process.env) {
  for (const key of Object.keys(env)) if (billingVariables.includes(key.toUpperCase())) delete env[key];
}

const claudeLogin = '터미널에서 claude를 실행한 뒤 /login으로 Claude 구독 계정에 로그인하세요.';
/** `claude auth status` JSON → whether prompts would be covered by the subscription. */
export function claudeBilling(auth) {
  if (!auth || typeof auth !== 'object') return unknown('Claude');
  if (auth.loggedIn !== true) return { usable: false, billing: 'none', message: `Claude 로그인이 필요합니다. ${claudeLogin}` };
  if (auth.apiProvider && auth.apiProvider !== 'firstParty') return { usable: false, billing: 'metered', message: `Claude Code가 외부 클라우드 공급자(${auth.apiProvider})로 설정되어 있어 사용하지 않습니다. ${claudeLogin}` };
  if (auth.authMethod !== 'claude.ai' || (auth.apiKeySource && auth.apiKeySource !== 'none')) return { usable: false, billing: 'metered', message: `Claude Code가 API 키${auth.apiKeySource && auth.apiKeySource !== 'none' ? `(${auth.apiKeySource})` : ''}로 인증되어 있어 API 요금이 청구될 수 있으므로 사용하지 않습니다. ${claudeLogin}` };
  return { usable: true, billing: 'subscription' };
}

const codexLogin = '터미널에서 codex login을 실행해 ChatGPT 계정으로 로그인하세요.';
// usable: true = subscription confirmed, false = would bill or cannot log in, null = not determinable right now.
// Prompts require true; null keeps the user's choice but still blocks every run until it is confirmed.
const unknown = agent => ({ usable: null, billing: 'unknown', message: `로그인 방식을 확인하지 못했습니다. 확인될 때까지 ${agent}로 요청을 보내지 않습니다.` });
/** `codex login status` text plus the effective provider and auth mode from config.toml. */
export function codexBilling(loginText, config = {}) {
  const text = String(loginText || '');
  if (config.unresolvedProfile) return { usable: false, billing: 'unknown', message: `Codex 기본 프로필(${config.unresolvedProfile}) 설정을 찾지 못해 사용하지 않습니다. ~/.codex/config.toml을 확인하세요.` };
  if (config.provider && config.provider !== 'openai') return { usable: false, billing: 'metered', message: `Codex가 외부 모델 공급자(${config.provider})로 설정되어 있어 사용하지 않습니다. ~/.codex/config.toml의 model_provider를 확인하세요.` };
  if (/^api(key)?$/i.test(config.authMode || '')) return { usable: false, billing: 'metered', message: `Codex가 API 키 로그인 방식으로 설정되어 있어 사용하지 않습니다. ${codexLogin}` };
  if (/logged in using chatgpt/i.test(text)) return { usable: true, billing: 'subscription' };
  if (/api key/i.test(text)) return { usable: false, billing: 'metered', message: `Codex가 API 키로 로그인되어 있어 API 요금이 청구될 수 있으므로 사용하지 않습니다. ${codexLogin}` };
  if (/not logged in/i.test(text)) return { usable: false, billing: 'none', message: `Codex 로그인이 필요합니다. ${codexLogin}` };
  return unknown('Codex');
}
/** Effective model provider (top level, overridden by the default profile) and login preference. */
export function codexConfig(toml) {
  const tables = new Map([['', '']]); let current = '';
  for (const line of String(toml || '').split(/\r?\n/)) {
    const header = line.match(/^\s*\[\s*([^\]]+?)\s*\]\s*(?:#.*)?$/);
    if (header) { current = header[1].replace(/["'\s]/g, ''); tables.set(current, tables.get(current) || ''); continue; }
    tables.set(current, tables.get(current) + line + '\n');
  }
  const value = (table, key) => (tables.get(table) || '').match(new RegExp(`^\\s*["']?${key}["']?\\s*=\\s*["']([^"']*)["']`, 'm'))?.[1] || '';
  const profile = value('', 'profile');
  if (profile && !tables.has(`profiles.${profile}`)) return { provider: value('', 'model_provider'), unresolvedProfile: profile };
  return { provider: (profile && value(`profiles.${profile}`, 'model_provider')) || value('', 'model_provider'), authMode: value('', 'forced_login_method') || value('', 'preferred_auth_method'), ...(profile ? { profile } : {}) };
}

function capture(command, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false, windowsHide: true, env: withoutBillingCredentials(), stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error('로그인 확인 시간이 초과되었습니다.')); }, timeoutMs);
    child.stdout.on('data', chunk => { output = (output + chunk).slice(-4000); });
    child.stderr.on('data', chunk => { output = (output + chunk).slice(-4000); });
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', () => { clearTimeout(timer); resolve(output); });
  });
}
export async function inspectCodexBilling(executable, { env = process.env, home = os.homedir(), run = capture } = {}) {
  try {
    const configFile = path.join(env.CODEX_HOME || path.join(home, '.codex'), 'config.toml');
    const config = codexConfig(await readFile(configFile, 'utf8').catch(() => ''));
    return codexBilling(await run(executable, ['login', 'status'], 10000), config);
  } catch (error) {
    return { ...unknown('Codex'), detail: error.message };
  }
}
