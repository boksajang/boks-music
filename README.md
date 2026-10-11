# Boks Music by @boksajang

프로젝트 단위로 AI 음악을 만들고 관리하는 Electron 데스크톱 앱입니다.

## 요구 사항

| 항목 | 내용 |
|---|---|
| 운영체제 | Windows 10/11 (NVIDIA GPU, CUDA 권장) · macOS Apple Silicon (Metal) |
| Node.js | 22.12 이상 |
| 메모리 | RAM 16GB 이상, 음악 모델 구성에 따라 VRAM 6GB 이상 |
| 디스크 | 음악 모델 구성에 따라 35~39GB 이상 여유 공간 |
| AI 에이전트(선택) | 구독 계정으로 로그인한 Claude Code CLI 또는 Codex CLI |

## 실행

```powershell
npm ci
npm run dev
```
## 설치 구조

엔진과 모델은 저장소에 포함되지 않습니다. 앱의 **환경설정**에서 PC 사양(GPU·VRAM·RAM·디스크)을 분석해 추천 구성을 보여 주고, **자동 설치** 또는 모델 콤보박스에서 YuE2 구성 하나를 고르면 필요한 실행 엔진·Cover·Stem·FFmpeg·Python 환경을 함께 설치합니다. 내려받는 파일은 모두 크기와 SHA-256이 고정된 사전 빌드본이며, 설치할 수 없는 구성은 이유와 함께 표시합니다.

| 경로 | 내용 |
|---|---|
| `engine-packages/runtimes/` | 실행 엔진: yue2.cpp, Stem 분리 Python 환경(FFmpeg 포함), 가사 정렬, stable-diffusion.cpp, 영상 렌더러 |
| `engine-packages/gguf/` | YuE2 음악 모델·VAE, SheetSage2 Cover 분석 모델 |
| `engine-packages/models/` | 가사 정렬 모델, 로컬 이미지 모델 |
| `engine-packages/stems/` | BS-RoFormer 분리 모델 |
| `engine-packages/tools/` | yt-dlp |
| `engine-packages/downloads/`, `cache/` | 내려받기 임시 파일과 캐시 |
| 사용자 데이터 폴더 `Boks Music/` | `library.json`(목록·설정·작업 상태)과 `library.json.bak` |
| Project 저장 위치(환경설정) | 생성·가져온 음원, Stem, 앨범아트, 영상 |

## 음악 모델 구성

| 구성 | VRAM 기준 | 여유 공간 기준 |
|---|---:|---:|
| YuE2 3B · BF16 | 12GB 이상 | 39GB 이상 |
| YuE2 3B · Q8_0 | 8GB 이상 | 36GB 이상 |
| YuE2 3B · Q6_K | 7GB 이상 | 35GB 이상 |
| YuE2 3B · Q5_K_M | 6GB 이상 | 35GB 이상 |

## 사용 엔진과 모델

| 역할 | Windows | macOS Apple Silicon |
|---|---|---|
| 음악 생성 · Instrumental | yue2.cpp (CUDA, [YuE2-Studio](https://github.com/timoncool/YuE2-Studio) 배포본) + YuE2 3B GGUF · VAE | [audio.cpp](https://github.com/0xShug0/audio.cpp) (Metal) + YuE2 3B GGUF · VAE |
| Cover 분석 | SheetSage2 GGUF | SheetSage2 GGUF |
| Vocal/Instrumental · 멀티트랙 Stem | BS-RoFormer ([python-audio-separator](https://github.com/nomadkaraoke/python-audio-separator), CUDA) | BS-RoFormer (MPS) |
| 가사 시간 정렬 | Qwen3-ASR-1.7B · Qwen3-ForcedAligner-0.6B + 가사 기반 onset 추정 | 동일 |
| 앨범아트(로컬) | [stable-diffusion.cpp](https://github.com/leejet/stable-diffusion.cpp) (CUDA / Vulkan / CPU) + Z-Image Turbo · FLUX.2 klein 4B GGUF | stable-diffusion.cpp (Metal) |
| 앨범아트(에이전트) | Codex CLI 이미지 도구 | 동일 |
| 가사 영상 렌더링 | HyperFrames(HTML 템플릿) · 내장 Canvas 장면(GPU) + FFmpeg | 동일 |
| YouTube 가져오기 | yt-dlp + FFmpeg | 동일 |
| AI 작사 · 앨범아트 설명문 | Claude Code CLI / Codex CLI | 동일 |

AI 에이전트는 로컬 CLI의 구독 로그인으로만 실행하며 유료 API를 직접 호출하지 않습니다. 앱은 API 키·클라우드 제공자 환경 변수를 하위 프로세스에 전달하지 않고, API 키로 인증된 CLI는 사용하지 않습니다. CLI 실행 파일은 자동으로 찾으며, 필요하면 `BOKS_CLAUDE_PATH`, `BOKS_CODEX_PATH`에 절대 경로를 지정합니다.

## 소스 구성

| 경로 | 내용 |
|---|---|
| `electron/` | 메인 프로세스: 작업 대기열, 엔진 설치·실행, 에이전트 연동, 가사 정렬·영상 제작, 저장소 |
| `src/` | 렌더러(React + TypeScript): 화면과 컴포넌트, 스타일 |
| `engines/` | Python 엔진 스크립트(Stem 분리, 가사 정렬)와 모델 카탈로그 |
| `video-templates/` | 가사 영상 템플릿(HTML/CSS). 추가 방법은 [video-templates/README.md](video-templates/README.md) |
| `assets/` | 앱 아이콘 |
| `scripts/` | 개발 실행(`dev.mjs`), 아이콘 생성(`icons.mjs`) |
