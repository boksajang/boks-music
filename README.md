# Boks Music by @boksajang

프로젝트 단위로 AI 음악을 만들고 관리하는 데스크톱 앱입니다. 음악 생성, Cover, Stem 분리, AI 작사, 앨범아트, 가사 영상 제작을 한 곳에서 처리합니다. 현재 개발 프리뷰입니다.

## 요구 사항

| 항목 | 내용 |
|---|---|
| 운영체제 | Windows 10/11 (NVIDIA GPU 권장, CUDA) · macOS Apple Silicon (Metal, 실제 설치·추론 미검증) |
| Node.js | 22.12 이상 |
| 메모리 | RAM 16GB 이상, 음악 모델 구성에 따라 VRAM 6GB 이상 |
| 디스크 | 음악 모델 구성에 따라 35~39GB 이상 여유 공간 |
| AI 작사·앨범아트 설명문 | 구독 계정으로 로그인한 Claude Code CLI 또는 Codex CLI (선택) |

## 실행

```powershell
npm ci
npm run dev
```

테스트는 `npm test`, 타입 검사는 `npm run typecheck`로 실행합니다.

## 처음 사용하기

1. **환경설정**에서 감지한 GPU·VRAM과 추천 음악 모델 구성(Music·VAE·Cover·Backend·Stem)을 확인하고 **자동 설치**를 누릅니다. 직접 고르려면 모델 콤보박스에서 YuE2 구성 하나를 선택합니다. 필요한 실행 엔진, Cover 분석 모델, Stem 분리 모델, FFmpeg, Python 환경을 앱이 함께 설치합니다.
2. **Project**를 만들고 스타일 프리셋을 고른 뒤 가사를 입력하거나 AI 작사를 사용합니다. Instrumental을 켜면 가사가 필요 없습니다.
3. 1~4곡을 생성합니다. 결과를 재생하고 곡 메뉴에서 Cover, Stem 추출, 앨범아트, 내보내기를 사용합니다.

음원 가져오기·재생·Project 관리에는 음악 모델이 필요하지 않습니다.

## 음악 모델

| 구성 | VRAM 기준 | 여유 공간 기준 |
|---|---:|---:|
| YuE2 3B · BF16 | 12GB 이상 | 39GB 이상 |
| YuE2 3B · Q8_0 | 8GB 이상 | 36GB 이상 |
| YuE2 3B · Q6_K | 7GB 이상 | 35GB 이상 |
| YuE2 3B · Q5_K_M | 6GB 이상 | 35GB 이상 |

설치할 수 없는 구성도 목록에 표시하고 이유를 안내합니다. 모든 엔진·모델·다운로드 캐시는 프로젝트의 `engine-packages` 폴더에 설치되며 저장소에는 포함되지 않습니다.

## 주요 기능

- **음악 가져오기**: 로컬 파일과 YouTube URL(단일 영상)에서 오디오를 가져와 WAV 또는 MP3 320kbps로 저장합니다.
- **Stem 분리**: BS-RoFormer로 Vocal/Instrumental을 분리합니다.
- **AI 작사**: Claude Code 또는 Codex CLI가 작사합니다. 둘 다 설치되어 있으면 처음 한 번 사용할 에이전트를 고릅니다.
- **앨범아트**: 환경설정 › 앨범아트 이미지에서 이미지 생성 엔진을 고릅니다.
  - 에이전트: Codex의 이미지 도구로 생성합니다.
  - 로컬 모델: AI 에이전트가 설명문을 쓰고 로컬 모델(Z-Image Turbo 또는 FLUX.2 klein 4B, stable-diffusion.cpp)이 그립니다. 설치 창에서 PC 사양에 맞는 모델을 추천합니다.
- **가사 영상**: 플레이리스트로 가사 영상을 만듭니다. 가사 시간은 자동으로 맞추고, 불확실한 줄만 음악을 들으며 확인합니다. LRC/SRT 파일을 올려 가사 시간을 바로 적용할 수도 있습니다. 영상 템플릿을 추가하는 방법은 [video-templates/README.md](video-templates/README.md)를 참고하세요.

## 사용 엔진과 모델

모두 앱의 설치 화면에서 검증된 사전 빌드본과 모델 파일(크기·SHA-256 고정)을 `engine-packages`에 내려받습니다.

| 역할 | Windows | macOS Apple Silicon |
|---|---|---|
| 음악 생성 · Instrumental | yue2.cpp (CUDA, [YuE2-Studio](https://github.com/timoncool/YuE2-Studio) 배포본) + YuE2 3B GGUF · VAE | [audio.cpp](https://github.com/0xShug0/audio.cpp) (Metal) + YuE2 3B GGUF · VAE |
| Cover 분석 | SheetSage2 GGUF | SheetSage2 GGUF |
| Vocal/Instrumental · 멀티트랙 Stem | BS-RoFormer ([python-audio-separator](https://github.com/nomadkaraoke/python-audio-separator), CUDA) | BS-RoFormer (MPS) |
| 가사 시간 정렬 | Qwen3-ASR-1.7B · Qwen3-ForcedAligner-0.6B + 가사 기반 onset 추정 | 동일 |
| 앨범아트(로컬) | [stable-diffusion.cpp](https://github.com/leejet/stable-diffusion.cpp) (CUDA / Vulkan / CPU) + Z-Image Turbo · FLUX.2 klein 4B GGUF | stable-diffusion.cpp (Metal) |
| 가사 영상 렌더링 | HyperFrames(HTML 템플릿) · 내장 Canvas 장면(GPU) + FFmpeg | 동일 |
| YouTube 가져오기 | yt-dlp + FFmpeg | 동일 |
| AI 작사 · 앨범아트 설명문 | Claude Code CLI / Codex CLI (구독 로그인) | 동일 |

## 소스 구성

| 경로 | 내용 |
|---|---|
| `electron/` | 메인 프로세스: 작업 대기열, 엔진 설치·실행, 에이전트 연동, 가사 정렬·영상 제작, 저장소 |
| `src/` | 렌더러(React + TypeScript): 화면과 컴포넌트, 스타일 |
| `engines/` | Python 엔진 스크립트(Stem 분리, 가사 정렬)와 모델 카탈로그 |
| `video-templates/` | 가사 영상 템플릿(HTML/CSS) |
| `assets/` | 앱 아이콘 |
| `tests/` | 자동 테스트(`npm test`) |
| `scripts/` | 개발 실행(`dev.mjs`), 아이콘 생성, 스모크 테스트 |

## AI 에이전트와 과금

- 에이전트는 로컬 CLI의 **구독 로그인**으로만 실행하며 외부 유료 API를 직접 호출하지 않습니다.
- 앱은 `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `CODEX_API_KEY` 같은 API 키·클라우드 제공자 변수를 하위 프로세스에 전달하지 않습니다. 실행할 때마다 구독 인증인지 확인하고, API 키 인증이면 사용하지 않습니다.
- CLI 실행 파일은 자동으로 찾습니다. 필요하면 `BOKS_CLAUDE_PATH`, `BOKS_CODEX_PATH`에 절대 경로를 지정합니다.
- AI 요청은 연결된 계정의 서비스로 전송됩니다. 로컬 CLI 실행이 오프라인 추론을 뜻하지는 않습니다.

## 데이터 저장

- 목록·설정·작업 상태는 사용자 데이터 폴더의 `library.json`에 저장하고, 이전 저장본은 `library.json.bak`에 보존합니다.
- Project 파일은 환경설정에서 지정한 저장 위치에 저장합니다. 위치를 바꾸면 이후 만드는 Project부터 적용됩니다.
- 곡을 삭제하면 휴지통으로 이동합니다. 휴지통에서 복원하거나 영구 삭제할 수 있습니다.
- 강제 종료된 작업은 다음 실행 때 중단 상태로 복구하며 자동으로 다시 실행하지 않습니다.
