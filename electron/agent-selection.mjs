// Shared by the main process and tests: which AI agent writes lyrics and which one can
// produce album art, derived from installation, subscription billing and the user's choice.
export function resolveAgents({settings={},codexStatus,claudeStatus,localImage}={}) {
  const status={codex:codexStatus||{state:'checking'},claude:claudeStatus||{state:'checking'}};
  const state=id=>status[id].state||'checking';
  // usable === false: installed but not on a subscription login (API key, cloud provider, logged out).
  const blocked=id=>state(id)==='installed'&&status[id].usable===false;
  const installed={codex:state('codex')==='installed',claude:state('claude')==='installed'};
  const available={codex:installed.codex&&!blocked('codex'),claude:installed.claude&&!blocked('claude')};
  const present=id=>state(id)!=='missing'&&!blocked(id);
  const checking=state('codex')==='checking'||state('claude')==='checking';
  const preferred=['codex','claude'].includes(settings.agentProvider)?settings.agentProvider:'';
  const order=preferred?[preferred,preferred==='codex'?'claude':'codex']:['codex','claude'];
  // Keep the user's agent through a transient check failure; switch only when it is gone or blocked.
  const active=preferred&&present(preferred)?preferred:order.find(id=>available[id])||order.find(present)||'';
  const blockedMessage=['claude','codex'].filter(blocked).map(id=>status[id].message).find(Boolean);
  // Album art: the agent engine is Codex's own image tool (Claude has none). The local engine renders
  // a description written by the active agent (Claude or Codex) with an installed local model.
  const imageEngine=settings.imageEngine==='local'?'local':'agent';
  const local=imageEngine==='local'&&{
    imageAgent:active&&localImage?.ready?active:'',
    imageReason:localImage?.checking?'로컬 이미지 모델을 확인하고 있습니다. 잠시 후 다시 시도하세요.':!localImage?.ready?'선택한 로컬 이미지 모델이 설치되어 있지 않습니다. 환경설정의 앨범아트 이미지에서 모델을 설치하세요.':active?'':blockedMessage||'앨범아트 설명문을 쓸 AI 에이전트(Claude Code 또는 Codex)가 필요합니다.',
  };
  return {
    installed,available,checking,active,imageEngine,
    // Ask once when both can be used and the user has not chosen yet; a single agent starts directly.
    needsChoice:!checking&&available.codex&&available.claude&&!settings.agentChoiceConfirmed,
    ...(local||{
      imageAgent:present('codex')?'codex':'',
      imageReason:present('codex')?'':blocked('codex')?status.codex.message:installed.claude?'Claude는 이미지를 직접 생성하지 않습니다. 앨범아트를 만들려면 Codex를 설치하거나 로컬 이미지 모델을 사용하세요.':'앨범아트 생성에는 Codex 또는 로컬 이미지 모델이 필요합니다.',
    }),
    reason:active?'':blockedMessage||'Claude Code 또는 Codex를 설치한 뒤 다시 확인하세요.',
  };
}
