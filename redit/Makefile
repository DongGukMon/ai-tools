CLI_BINARY = redit
DIST_DIR = dist
VERSION ?= dev
LDFLAGS = -ldflags "-s -w -X main.version=$(VERSION)"

PLATFORMS = darwin-arm64 darwin-amd64 linux-amd64 windows-amd64

.PHONY: build build-cli cross test clean

build: build-cli

build-cli:
	go build $(LDFLAGS) -o $(CLI_BINARY) ./cmd/redit

cross:
	mkdir -p $(DIST_DIR)
	GOOS=darwin GOARCH=arm64 go build $(LDFLAGS) -o $(DIST_DIR)/$(CLI_BINARY)-darwin-arm64 ./cmd/redit
	GOOS=darwin GOARCH=amd64 go build $(LDFLAGS) -o $(DIST_DIR)/$(CLI_BINARY)-darwin-amd64 ./cmd/redit
	GOOS=linux GOARCH=amd64 go build $(LDFLAGS) -o $(DIST_DIR)/$(CLI_BINARY)-linux-amd64 ./cmd/redit
	GOOS=windows GOARCH=amd64 go build $(LDFLAGS) -o $(DIST_DIR)/$(CLI_BINARY)-windows-amd64.exe ./cmd/redit

test:
	go test ./...

clean:
	rm -f $(CLI_BINARY)
	rm -rf $(DIST_DIR)
