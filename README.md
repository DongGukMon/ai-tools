# ai-tools

Claude Code가 효율적으로 동작할 수 있도록 필요한 도구들의 모음.

## 도구 목록

### redit

원격 문서 편집을 위한 로컬 캐시 레이어.

- **문제**: 부분 업데이트를 지원하지 않는 API (Confluence, Notion 등)
- **해결**: 로컬에서 부분 수정 후 한 번의 API 호출로 업데이트

```bash
# 설치
cd redit && go build -o redit ./cmd/redit

# 사용
echo "$content" | redit init "confluence:12345"
# Edit으로 수정...
redit read "confluence:12345" | mcp_update
redit drop "confluence:12345"
```

자세한 내용: [redit/CLAUDE.md](redit/CLAUDE.md)

## 설계 원칙

1. **빠른 실행**: Go로 작성, cold start 최소화
2. **단순함**: 각 도구는 한 가지 일을 잘 함
3. **AI 친화적**: Claude Code가 쉽게 활용할 수 있는 인터페이스
4. **조합 가능**: 기존 MCP, 도구들과 자연스럽게 조합

## 프로젝트 구조

```
ai-tools/
├── README.md
├── redit/
│   ├── CLAUDE.md      # Claude 사용 가이드
│   ├── go.mod
│   ├── cmd/redit/     # CLI 진입점
│   ├── internal/      # 내부 구현
│   └── docs/          # 상세 문서
└── (future tools...)
```
