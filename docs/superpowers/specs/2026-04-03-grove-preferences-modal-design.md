# Grove Preferences Modal

## Overview

Grove에 글로벌 Preferences 모달을 추가한다. 기존에 분산되어 있던 설정 UI(ThemeSettings 슬라이드 패널)를 하나의 모달로 통합하고, 아직 UI가 없던 preferences 항목(link open mode, preferred IDE)에 접근 가능하게 한다.

## Entry Point

- **위치**: AppTabBar 우측, PR 버튼 옆에 gear(⚙) 아이콘 버튼 추가
- **기존 ThemeSettings 버튼 제거**: 터미널 툴바의 settings 아이콘을 삭제하고 이 모달로 통합

## Modal Structure

좌측 탭 네비게이션 + 우측 콘텐츠 영역의 2-pane 레이아웃.

### General 탭

| 항목 | UI | 설명 |
|------|-----|------|
| Preferred IDE | Dropdown selector | 프로젝트를 열 때 사용할 IDE 선택 |

### Terminal 탭

| 항목 | UI | 설명 |
|------|-----|------|
| Link Open Mode | Dropdown selector (옵션별 설명 포함) | 터미널 링크 클릭 시 열리는 위치 |

**Link Open Mode 옵션:**

| 값 | 레이블 | 설명 |
|----|--------|------|
| `external` | External Browser | 모든 링크를 외부 브라우저에서 열기 |
| `internal` | Grove Browser | 모든 링크를 Grove 내장 브라우저에서 열기 |
| `external-with-localhost-internal` | Localhost in Grove, others External | localhost 링크만 내장 브라우저, 나머지는 외부 브라우저 |

**Appearance 섹션** (divider로 구분):

기존 ThemeSettings 컴포넌트의 기능을 그대로 이관한다.

| 항목 | UI |
|------|-----|
| Theme | Preset 선택 (색상 블록) |
| Font | Font family input + size input |
| ANSI Colors | 8색 컬러 팔레트 편집 |

## Scope

### 새로 만들 것
- `PreferencesModal` 컴포넌트 (모달 + 탭 네비게이션 + 각 탭 콘텐츠)
- AppTabBar에 gear 아이콘 버튼

### 수정할 것
- `AppTabBar.tsx` — 우측 영역에 gear 버튼 추가

### 제거할 것
- `ThemeSettings.tsx` 슬라이드 패널 컴포넌트 (또는 내부 로직만 추출 후 컴포넌트 삭제)
- 터미널 툴바의 ThemeSettings 아이콘 버튼

### 유지 (변경 없음)
- Zustand store (`store/preferences.ts`) — 기존 get/set 로직 그대로 사용
- Tauri 백엔드 커맨드 (`get_grove_preferences`, `save_grove_preferences`, `get_app_config`, `save_app_config`)
- TypeScript 타입 (`GrovePreferences`, `AppConfig`, `TerminalTheme`)

## Data Flow

```
User interaction in Modal
  → Zustand store setter (setTerminalLinkOpenMode / setPreferredIde / theme setters)
    → Platform layer (saveGrovePreferences / saveAppConfig)
      → Tauri command
        → grove-core config persistence (~/.grove/config.json)
```

기존 auto-persist 패턴을 그대로 따른다. 모달에서 값을 변경하면 즉시 저장된다.
