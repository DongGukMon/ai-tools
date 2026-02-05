# redit - Claude 사용 가이드

## 개요

`redit`은 원격 문서(Confluence, Notion 등)를 효율적으로 편집하기 위한 로컬 캐시 레이어입니다.
부분 수정이 불가능한 API에 대해, 로컬에서 효율적으로 편집 후 한 번의 업데이트만 수행합니다.

## 핵심 원칙

1. **MCP로 가져오고, redit으로 편집하고, MCP로 업데이트**
2. **Edit 도구로 부분 수정** - 전체 재생성 없이 필요한 부분만 수정
3. **dirty일 때만 커밋** - 변경 없으면 API 호출 스킵

## 명령어

```bash
redit init <key>     # stdin → 원본+사본 생성, 사본 경로 반환
redit get <key>      # 사본 경로 반환
redit read <key>     # 사본 내용 출력 (stdout)
redit status <key>   # dirty/clean 상태
redit diff <key>     # 원본 vs 사본 차이
redit reset <key>    # 사본을 원본으로 복원
redit drop <key>     # 삭제
redit list           # 목록
```

## 워크플로우

### 기본 패턴

```
1. MCP로 문서 가져오기
   content = mcp__xxx__get_document(id)

2. redit에 저장
   path = $(echo "$content" | redit init "<service>:<id>")

3. Edit 도구로 부분 수정 (여러 번 가능)
   Edit <path>: old_string → new_string

4. 상태 확인
   redit status "<service>:<id>"  # dirty면 계속

5. 최종 내용으로 MCP 업데이트
   final = $(redit read "<service>:<id>")
   mcp__xxx__update_document(id, final)

6. 정리
   redit drop "<service>:<id>"
```

### key 네이밍 규칙

AI가 자유롭게 결정하되, 일관성 유지:
- `<service>:<id>` - 기본 형식
- `<service>:<id>:<version>` - 버전/캐시 구분 필요시

예시:
- `confluence:12345`
- `notion:page-abc-def`
- `confluence:12345:1705312200` (updated_at 포함)

## 사용 케이스

### Case 1: Confluence 문서 특정 섹션 수정

사용자: "Confluence 페이지 12345의 '개요' 섹션을 업데이트해줘"

```bash
# 1. 문서 가져오기
content=$(mcp__atlassian__get_page --id "12345")

# 2. redit에 저장
path=$(echo "$content" | redit init "confluence:12345")
# → /Users/xxx/.redit/abc123/working

# 3. 부분 수정 (Edit 도구 사용)
# Edit path: "## 개요\n기존 내용" → "## 개요\n새로운 내용"

# 4. 변경 확인
redit diff "confluence:12345"

# 5. 커밋
final=$(redit read "confluence:12345")
mcp__atlassian__update_page --id "12345" --content "$final"

# 6. 정리
redit drop "confluence:12345"
```

### Case 2: 여러 섹션 순차 수정

```bash
# init 후
path=$(echo "$content" | redit init "confluence:12345")

# 여러 번 Edit
# Edit: Section 1 수정
# Edit: Section 2 수정
# Edit: Section 3 수정

# 한 번에 커밋
redit status "confluence:12345"  # dirty
final=$(redit read "confluence:12345")
mcp__atlassian__update_page(...)
```

### Case 3: 수정 중 실수 → 복구

```bash
# 수정하다가 망침
redit status "confluence:12345"  # dirty

# 원본으로 되돌리기
redit reset "confluence:12345"
redit status "confluence:12345"  # clean

# 다시 수정 시작
```

### Case 4: 변경 없음 → 스킵

```bash
# 확인만 하고 수정 안 함
redit status "confluence:12345"  # clean

# API 호출 불필요 - drop만
redit drop "confluence:12345"
```

## 주의사항

1. **init 전에 기존 key 확인**
   - 이미 존재하면 에러 발생
   - 필요시 먼저 `drop` 후 `init`

2. **커밋 후 반드시 drop**
   - 메모리/디스크 정리
   - 다음 편집 사이클 준비

3. **긴 문서는 Edit의 context 활용**
   - 충분한 surrounding context로 unique match 보장

4. **캐시 전략은 AI가 판단**
   - updated_at 변경 감지 시 새 key로 init
   - 같은 key 재사용은 drop 후 init

## 바이너리 위치

```
/Users/airenkang/Desktop/side/ai-tools/redit/redit
```

또는 PATH에 추가 후:
```
redit <command>
```
