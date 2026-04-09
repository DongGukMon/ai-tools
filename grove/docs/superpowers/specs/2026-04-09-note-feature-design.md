# Note Feature Design Spec

## Overview

Grove 사이드바의 context menu 대상(SOT, Worktree, Mission)에 종속된 텍스트 노트 기능.
바빠서 띄워놓고 current status를 기록하거나 follow-up item을 트래킹할 때 사용.

## Scope

### 대상 (Context Menu가 나타나는 모든 항목)
- **DefaultBranchItem (SOT)** — project의 source path
- **WorktreeItem** — worktree의 path
- **MissionItem** — mission의 directory

각 대상과 note는 1:1 관계.

## Data Model & Persistence

### 저장소
- 파일: `~/.grove/notes.json`
- 기존 `missions.json`, `terminal-layouts.json`과 동일한 독립 JSON 파일 패턴

### 구조
```json
{
  "notes": {
    "project::<projectId>::sot": "API 마이그레이션 진행중\n- v2 endpoint 테스트 필요",
    "project::<projectId>::worktree::<worktreeName>": "리뷰 대기중",
    "mission::<missionId>": "Sprint 42 follow-up items"
  }
}
```

### Note Key 규칙
| 대상 | Key format |
|------|------------|
| SOT | `project::<projectId>::sot` |
| Worktree | `project::<projectId>::worktree::<worktreeName>` |
| Mission | `mission::<missionId>` |

### Rust 타입 (grove-core)
```rust
struct NoteStore {
    notes: HashMap<String, String>,
}
```

값이 빈 문자열이면 해당 key 삭제.

## Backend (Tauri Commands)

3개 command:

| Command | Signature | 설명 |
|---------|-----------|------|
| `list_notes` | `() → HashMap<String, String>` | 앱 시작 시 전체 로드 |
| `save_note` | `(key: String, content: String)` | Upsert. 빈 문자열이면 delete |
| `delete_note` | `(key: String)` | Key 삭제 |

grove-core에서 `~/.grove/notes.json` serde 로드/저장 처리.

## Frontend

### Zustand Store (`useNoteStore`)

```typescript
interface NoteStore {
  notes: Record<string, string>;
  init(): Promise<void>;              // list_notes 호출
  saveNote(key: string, content: string): void;  // optimistic + debounce 500ms
  deleteNote(key: string): void;      // state 제거 + backend 호출
  getNote(key: string): string | undefined;
  hasNote(key: string): boolean;
}
```

### Note Key 생성 유틸리티

```typescript
function getNoteKey(item: { type: 'sot'; projectId: string }
  | { type: 'worktree'; projectId: string; worktreeName: string }
  | { type: 'mission'; missionId: string }
): string;
```

각 sidebar item이 자신의 noteKey를 생성하여 `SidebarContextMenu`에 전달.

### Platform 추상화

`tauri.ts` / `electron.ts` 양쪽에 wrapper 추가:
- `listNotes(): Promise<Record<string, string>>`
- `saveNote(key: string, content: string): Promise<void>`
- `deleteNote(key: string): Promise<void>`

## UI

### Context Menu 변경

`SidebarContextMenu`에 `noteKey: string` prop 추가.
기존 common items(Open in Finder, Open in Global Terminal) 아래에 "Note" 메뉴 아이템 추가.
클릭 시 해당 item 위치에 note popover open.

### Note Icon (Indicator)

- 위치: sidebar item 이름 바로 옆 (오른쪽)
- 조건: `hasNote(key) === true` 일 때만 표시
- 아이콘: Lucide `StickyNote` (또는 유사 아이콘)
- 클릭: note popover open (event.stopPropagation으로 item 선택과 분리)

### Note Popover

- 컴포넌트: Radix `Popover`
- Trigger 2가지:
  1. Note icon 클릭
  2. Context menu "Note" 선택
- 내용:
  - 헤더: 대상 이름 표시
  - `<textarea>`: auto-save (onChange → debounced saveNote 500ms)
  - 삭제 버튼: deleteNote 호출 후 popover 닫기
  - "Auto-saved" 표시
- 닫기: 외부 클릭 또는 Escape

## Flow

### Note 생성
1. 대상 우클릭 → Context menu → "Note" 클릭
2. 빈 textarea가 있는 popover 열림
3. 텍스트 입력 → 500ms debounce 후 자동 저장
4. 저장 완료 시 sidebar item 이름 옆에 note icon 표시

### Note 조회/수정
1. Note icon 클릭 (또는 context menu "Note")
2. 기존 내용이 있는 popover 열림
3. 수정 → 자동 저장

### Note 삭제
1. Popover 내 삭제 버튼 클릭
2. Note 삭제 → popover 닫힘 → icon 사라짐
