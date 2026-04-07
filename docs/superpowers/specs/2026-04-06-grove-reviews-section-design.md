# Grove Reviews Section

## Overview

Grove 사이드바에 Projects, Missions에 이어 세 번째 섹션인 **Reviews**를 추가한다. PR 단위 리뷰 워크스페이스를 제공하여, 코드 리뷰 → 후속 처리까지의 전체 흐름을 하나의 공간에서 관리할 수 있게 한다.

## 배경

Projects에서 리뷰용 worktree가 작업용 worktree와 섞이면서 브랜치가 많아지고 구분이 안 되는 문제. 리뷰 전용 섹션을 분리하여 리뷰에 집중할 수 있는 환경을 만든다.

## Scope

**하는 것:**
- PR 별 Review 워크스페이스 (worktree + 터미널 + WebView)
- 사용자가 터미널(AI) 또는 WebView(GitHub UI)를 통해 코드 리뷰 진행, 코멘트 작성, 리뷰 제출
- 코멘트 관리 UI: 내가 남긴 코멘트 리스트 (Resolved/Unresolved), 스레드 보기, reply CRUD, resolve/unresolve
- AI 기반 팔로업 Issue 생성 (코멘트 → Issue, 크로스 링크)

**안 하는 것:**
- 리뷰 코멘트 생성을 도와주는 커스텀 UI (코멘트 생성은 WebView 또는 AI CLI로)

## 데이터 모델

### Review

```typescript
interface Review {
  id: string;
  prUrl: string;                       // GitHub PR URL (source of truth)
  projectId: string;                   // 연결된 Project
  worktreePath: string;                // ~/.grove/reviews/{review-id}/
  branch: string;                      // PR 브랜치

  // PR metadata (gh API에서 fetch)
  prNumber: number;
  prTitle: string;
  prAuthor: string;
  prState: "open" | "merged" | "closed";

  // Stacked PR chain
  linkedPrs: LinkedPr[];

  // 부가 리소스
  resources: ReviewResource[];

  // 상태
  status: "active" | "resolved";
  collapsed: boolean;                  // 하위 항목 접기/펼치기
  createdAt: string;
}

interface LinkedPr {
  prUrl: string;
  reviewId: string | null;            // Grove에 Review로 등록되어 있으면 ID
  prNumber: number;
  prTitle: string;
}

interface ReviewResource {
  id: string;
  type: "link" | "file" | "directory";
  uri: string;
  label: string;
}
```

### ReviewComment

```typescript
interface ReviewComment {
  id: string;                          // GitHub comment ID
  prUrl: string;
  path: string;                        // 파일 경로
  line: number | null;
  body: string;
  author: string;
  isResolved: boolean;
  threadId: string;                    // GitHub review thread ID
  replies: ReviewCommentReply[];
  createdAt: string;
  updatedAt: string;
}

interface ReviewCommentReply {
  id: string;
  body: string;
  author: string;
  createdAt: string;
}
```

Persist: `~/.grove/reviews.json`. 코멘트는 캐시만 하고 source of truth는 GitHub.

## Worktree 경로

```
~/.grove/reviews/{review-id}/         # Project worktrees와 독립된 경로
```

Project의 `~/.grove/{host}/{org}/{repo}/worktrees/` 와 분리되어 Projects 사이드바에 리뷰용 worktree가 노출되지 않는다.

## Review 생성

### From Project

```
1. Projects 사이드바에서 프로젝트 컨텍스트 메뉴 → "Create Review"
2. 브랜치 선택
3. gh API: 해당 브랜치에 open PR 존재 여부 체크
   - 없음 → 에러 알림 ("No open PR found for this branch")
   - 있음 → worktree 생성 → Review 엔티티 생성 → sidebar를 Reviews로 전환 → 해당 Review 선택
```

### From PR URL

```
1. Reviews 섹션에서 + 버튼 → PR URL 입력
2. URL 파싱 (org, repo, PR number)
3. gh API: PR 메타데이터 fetch (title, author, branch, state)
4. Projects에 해당 repo 존재 확인
   - 있음 → 해당 project 기반으로 worktree 생성
   - 없음 → Project 자동 등록 (clone) → worktree 생성
5. Review 엔티티 생성 → 해당 Review 선택
```

### Review 삭제

```
1. Review 컨텍스트 메뉴 → "Remove Review"
2. worktree 제거 (WorktreeLifecycle.cleanup() 재활용)
3. Review 엔티티 삭제
4. Project는 유지
```

## Sidebar 구조

### sidebarMode 확장

`"projects" | "missions"` → `"projects" | "missions" | "reviews"`

`PanelModeSwitch` 컴포넌트에 Reviews 탭 추가.

### Reviews 트리

```
Reviews
├── Review (PR #123: "feat: add auth")
│   ├── 🔗 Linked PR #120 "feat: auth-base"
│   ├── 🔗 Linked PR #118 "refactor: user-model"
│   ├── 📄 design-doc.md
│   └── 🔗 https://figma.com/...
├── Review (PR #456: "fix: cache bug")
│   └── 📄 perf-report.pdf
```

### Review Store

```typescript
interface ReviewStore {
  reviews: Review[];
  selectedReviewId: string | null;

  loadReviews(): Promise<void>;
  createReviewFromPr(prUrl: string): Promise<Review>;
  createReviewFromProject(projectId: string, branch: string): Promise<Review>;
  removeReview(reviewId: string): Promise<void>;

  addLinkedPr(reviewId: string, prUrl: string): Promise<void>;
  removeLinkedPr(reviewId: string, prUrl: string): void;

  addResource(reviewId: string, resource: ReviewResource): void;
  removeResource(reviewId: string, resourceId: string): void;

  fetchComments(reviewId: string): Promise<ReviewComment[]>;
  resolveComment(reviewId: string, threadId: string): Promise<void>;
  unresolveComment(reviewId: string, threadId: string): Promise<void>;
  replyToComment(reviewId: string, threadId: string, body: string): Promise<void>;
  deleteReply(reviewId: string, replyId: string): Promise<void>;
  updateReply(reviewId: string, replyId: string, body: string): Promise<void>;
  createIssueFromComment(reviewId: string, threadId: string): Promise<string>;
}
```

## 레이아웃

Review 선택 시: 기존 Projects와 동일한 메인 영역(터미널) + **PR WebView 고정 패널** 추가.

WebView는 `https://github.com/{org}/{repo}/pull/{number}/files` 를 로드.

## WebView 통합

### GitHub 인증

- Review 최초 사용 시 WebView에서 GitHub 로그인 (1회)
- WebView 자체 cookie store에 세션 유지 (앱 재시작 시에도 유지)
- Preferences > Developer에서 `gh` CLI 토큰 관리
- WebView 스크립트 주입으로 github.com/settings/tokens 페이지에서 토큰 발급 자동화, org별 토큰 저장

### Platform Abstraction

```typescript
// platform/types.ts 확장
createWebView(url: string): Promise<void>;
destroyWebView(): Promise<void>;
navigateWebView(url: string): Promise<void>;
injectScript(script: string): Promise<any>;
onWebViewEvent(callback: (event: any) => void): void;
```

Tauri는 `wry` WebView, Electron은 `BrowserView`. 기존 platform abstraction 패턴을 따른다.

## 코멘트 관리 UI

Review 워크스페이스 내 코멘트 패널:

```
Comment Panel
├── Filter: [All] [Unresolved] [Resolved]
├── Comment Thread 1 (file: src/auth.ts:42)
│   ├── 내 코멘트: "이 부분 race condition 있을 수 있음"
│   ├── 작성자 답변: "좋은 지적, 수정했습니다"
│   ├── [Resolve] [Reply] [Create Issue]
│   └── Status: ✅ Resolved
├── Comment Thread 2 (file: src/cache.ts:18)
│   ├── 내 코멘트: "캐시 TTL 설정 필요"
│   ├── 작성자 답변: "다음 PR에서 하겠습니다"
│   ├── [Resolve] [Reply] [Create Issue]
│   └── Status: ⏳ Unresolved
```

**액션:**
- Resolve/Unresolve → `gh` API
- Reply 추가/삭제/수정 → `gh` API
- Create Issue → AI 호출 (아래 참조)

모든 데이터는 `gh` API에서 fetch. 로컬 캐시하되 source of truth는 GitHub.

## AI Issue 생성

코멘트 패널에서 "Create Issue" 클릭 시:

### 프롬프트 템플릿

시스템 프롬프트에 팔로업 이슈 작성 지침을 포함:
- title: `[follow-up] {AI가 자동 추출}`
- body 구성: Context (이슈 생성 배경), Code State (문제 코드 상세 설명), Follow-up Work (변경 방향), Acceptance Criteria (수락 기준), Links (원본 코멘트 링크)

### Output Schema

```json
{
  "title": "[follow-up] ...",
  "body": "## Context\n...\n\n## Code State\n...\n\n## Follow-up Work\n...\n\n## Acceptance Criteria\n- [ ] ...\n\n## Links\n- ...",
  "labels": ["follow-up"]
}
```

AI가 `gh issue create`에 직접 매핑 가능한 형태로 출력. body는 완성된 markdown.

### 실행 플로우

```
1. "Create Issue" 클릭
2. Backend에서 프롬프트 조립 (템플릿 + comment thread + diff + PR 정보)
3. claude CLI 호출 (subprocess):
   claude --print --output-format json -p "..." --context "..."
4. JSON 파싱 → gh issue create:
   gh issue create --repo {org/repo} \
     --title "{title}" \
     --body "{body}" \
     --label follow-up \
     --assignee {review.prAuthor}
5. 생성된 issue URL → 원본 코멘트에 reply 추가 (크로스 링크)
```

assignee는 AI output에 포함하지 않고, backend에서 `review.prAuthor`를 직접 주입.

## Rust Backend

```
grove-core/src/
├── git_project.rs      # 기존
├── mission.rs          # 기존
└── review.rs           # 신규
```

`review.rs`가 담당하는 것:
- Review CRUD (create, read, update, delete)
- Worktree 생성/삭제 (독립 경로)
- `gh` API 래퍼: PR 메타데이터 fetch, 코멘트 fetch, resolve/unresolve, reply CRUD, issue create
- claude CLI subprocess 호출 (issue 생성용)
