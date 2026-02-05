# redit 사용법

## 설치

```bash
cd ai-tools/redit
go build -o redit ./cmd/redit

# (선택) PATH에 추가
sudo ln -s $(pwd)/redit /usr/local/bin/redit
```

## 명령어 레퍼런스

### init

stdin에서 내용을 읽어 원본과 작업 사본을 생성합니다.

```bash
echo "content" | redit init <key>
# 출력: 작업 파일 경로
```

- 이미 존재하는 key면 에러
- 원본(origin)과 사본(working) 두 파일 생성

### get

작업 파일 경로를 반환합니다.

```bash
redit get <key>
# 출력: /Users/xxx/.redit/hash/working
```

### read

작업 파일 내용을 stdout으로 출력합니다.

```bash
redit read <key>
# 출력: 파일 내용
```

### status

원본 대비 변경 여부를 확인합니다.

```bash
redit status <key>
# 출력: dirty 또는 clean
```

### diff

원본과 작업 파일의 차이를 unified diff 형식으로 출력합니다.

```bash
redit diff <key>
# 출력: unified diff 또는 "no changes"
```

### reset

작업 파일을 원본으로 되돌립니다.

```bash
redit reset <key>
# 출력: reset complete
```

### drop

key에 해당하는 모든 파일을 삭제합니다.

```bash
redit drop <key>
# 출력: dropped
```

### list

관리 중인 모든 key 목록을 출력합니다.

```bash
redit list
# 출력:
# KEY            STATUS  PATH
# confluence:123 dirty   /Users/xxx/.redit/abc/working
# notion:456     clean   /Users/xxx/.redit/def/working
```

## 저장 구조

```
~/.redit/
└── <key-hash>/
    ├── meta.json   # {"key": "...", "created_at": "..."}
    ├── origin      # 원본 (불변)
    └── working     # 작업 사본 (Edit 대상)
```

## 에러 처리

| 에러 | 원인 | 해결 |
|------|------|------|
| key already exists | 이미 init된 key | drop 후 다시 init |
| key not found | 존재하지 않는 key | init 먼저 실행 |

## 팁

1. **key는 의미있게**: `service:id` 형식 권장
2. **버전 구분 필요시**: `service:id:version` 형식
3. **작업 완료 후 정리**: 항상 drop으로 마무리
