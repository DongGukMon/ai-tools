# ai-tools 프로젝트 목록 정리

`/Users/airenkang/Desktop/side/ai-tools`의 최상위 디렉토리를 기준으로 정리했다. 설명은 각 프로젝트의 `README.md`, `go.mod`, `package.json`, `action.yml`, 스크립트 내용을 바탕으로 요약했다.

## 프로젝트 요약

| 디렉토리 | 언어/프레임워크 | 간단한 설명 | 주요 기능 / 용도 |
| --- | --- | --- | --- |
| `claude-irc` | Go, Cobra CLI | Claude Code 세션끼리 실시간으로 메시지와 구조화된 컨텍스트를 주고받게 하는 IRC 스타일 협업 도구 | 세션 join/who/msg/inbox, topic 공유, peer presence 확인, 다중 에이전트 협업 |
| `redit` | Go, Cobra CLI | Confluence/Notion 같은 원격 문서를 로컬 캐시로 받아 부분 수정 후 다시 반영하게 돕는 도구 | 원본/작업본 분리 저장, diff/status/reset/drop, 원격 문서 편집 워크플로우 지원 |
| `vaultkey` | Go, Cobra CLI | Git 저장소 기반 암호화 시크릿 매니저 | AES-256-GCM 암호화 저장, scope/key 구조 관리, `push`/`pull`로 머신 간 동기화 |
| `webform` | Go 백엔드 + 내장 웹 UI(HTML/CSS/JS) | 터미널 대신 브라우저 폼으로 구조화된 입력을 수집하는 도구 | 스키마 기반 폼 생성, 비밀번호/셀렉트/파일 등 다양한 입력 지원, 제출 결과를 JSON으로 반환 |
| `whip` | Go CLI/TUI + React 19, Vite, Tailwind 4 웹 대시보드 | Claude Code 작업을 태스크 단위로 분해하고 병렬 에이전트를 orchestration 하는 도구 | 태스크 생성/할당/의존성 관리, tmux 세션 기반 에이전트 실행, TUI 및 웹 대시보드, `claude-irc` 연동 |
| `vaultkey-action` | GitHub Actions Composite Action, Bash/YAML | GitHub Actions에서 `vaultkey`를 설치하고 시크릿을 환경 변수로 로드하는 액션 | CI에서 vault 초기화, 비밀번호 주입, 원하는 시크릿을 `GITHUB_ENV`로 노출 |
| `shared` | Go 라이브러리 | 여러 CLI가 공통으로 사용하는 내부 공유 모듈 | 현재는 GitHub Release 기반 바이너리 업그레이드 로직(`shared/upgrade`) 제공 |
| `scripts` | Bash | 저장소 전반에서 재사용하는 공통 스크립트 모음 | 각 도구의 `ensure-binary.sh` 생성, 설치/업그레이드 스크립트 공통 로직 관리 |

## 디렉토리별 메모

### `claude-irc`
- `go.mod` 기준 독립 Go 모듈이다.
- `README.md`에서 "inter-session communication"을 핵심 가치로 설명한다.
- `skills/peer-session`, `.claude-plugin`까지 포함되어 있어 Claude Code 플러그인/스킬 배포 단위로도 보인다.

### `redit`
- 원격 문서 API가 부분 업데이트를 지원하지 않을 때를 겨냥한 로컬 캐시 편집 도구다.
- `~/.redit/<key-hash>/origin`, `working` 구조로 원본과 수정본을 분리한다.
- 문서 편집 작업용 유틸리티 성격이 강하다.

### `vaultkey`
- README에 보안 특성이 비교적 명확히 적혀 있다: AES-256-GCM, PBKDF2-SHA256, 600,000 iterations.
- 애플리케이션/환경별 scope(`menulens/prod` 등)로 시크릿을 관리하도록 설계되어 있다.
- 개인/팀용 로컬 시크릿 저장소에 가깝다.

### `webform`
- Go 서버가 로컬 HTTP 서버를 띄우고, 브라우저에 폼을 렌더링한 뒤, 제출 결과를 JSON으로 반환한다.
- `web/` 디렉토리에 정적 프런트엔드 자산이 들어 있어 CLI + 웹 UI 혼합 구조다.
- 단순 프롬프트보다 복잡한 사용자 입력 수집에 적합하다.

### `whip`
- 저장소 안에서 가장 큰 프로젝트다.
- Go 기반 메인 CLI 외에 `dashboard-web/` 하위에 React/Vite 기반 웹 대시보드가 별도로 들어 있다.
- 태스크 라이프사이클(`created → assigned → in_progress → completed/failed`)과 원격/헤드리스 운영까지 포함해 운영 도구 성격이 강하다.

### `vaultkey-action`
- 별도 소스 코드 디렉토리 없이 `action.yml` 하나로 구성된 GitHub Actions용 배포 단위다.
- `vaultkey` 설치, vault 초기화, 시크릿 로딩까지 CI에 연결하는 접착제 역할이다.

### `shared`
- 최상위 제품이라기보다 내부 공용 라이브러리 디렉토리다.
- 현재 확인되는 하위 프로젝트는 `shared/upgrade` 하나이며, 각 CLI의 `upgrade` 명령 구현에 재사용된다.

### `scripts`
- 사용자 대상 제품은 아니고 저장소 유지보수용 스크립트 디렉토리다.
- `generate-ensure-binary.sh`가 각 도구의 설치 보조 스크립트를 생성하고, `lib/ensure-binary-lib.sh`가 공통 설치/업그레이드 로직을 제공한다.

## 숨김/설정 디렉토리

아래 디렉토리는 프로젝트 본체라기보다 저장소 설정 또는 메타데이터 용도다.

| 디렉토리 | 용도 |
| --- | --- |
| `.claude` | Claude Code 로컬 설정 및 작업 계획 메모(`settings*.json`, `whip-plans/`) |
| `.git` | Git 저장소 메타데이터 |
| `.github` | GitHub Actions/저장소 설정 |
| `.claude-plugin` | 루트 레벨 Claude Code 플러그인 메타데이터 |

추가로 `whip/` 및 `whip/dashboard-web/` 하위에도 별도의 `.claude` 디렉토리가 있어, 프로젝트별 로컬 설정을 따로 두는 구조로 보인다.

## 한눈에 보는 결론

- 실사용 도구 중심 프로젝트: `claude-irc`, `redit`, `vaultkey`, `webform`, `whip`
- 배포/연동 보조 프로젝트: `vaultkey-action`
- 내부 공용 인프라: `shared`, `scripts`
- 저장소 설정 디렉토리: `.claude`, `.git`, `.github`, `.claude-plugin`
