CLI_BINARY = redit
MCP_BINARY = redit-mcp
DIST_DIR = dist
BIN_DIR = bin
VERSION ?= dev
LDFLAGS = -ldflags "-s -w -X main.version=$(VERSION)"

PLATFORMS = darwin-arm64 darwin-amd64 linux-amd64 windows-amd64

.PHONY: build build-cli build-mcp cross test clean

build: build-cli build-mcp

build-cli:
	go build $(LDFLAGS) -o $(CLI_BINARY) ./cmd/redit

build-mcp:
	mkdir -p $(BIN_DIR)
	go build $(LDFLAGS) -o $(BIN_DIR)/$(MCP_BINARY) ./cmd/redit-mcp

cross:
	mkdir -p $(DIST_DIR)
	GOOS=darwin GOARCH=arm64 go build $(LDFLAGS) -o $(DIST_DIR)/$(CLI_BINARY)-darwin-arm64 ./cmd/redit
	GOOS=darwin GOARCH=amd64 go build $(LDFLAGS) -o $(DIST_DIR)/$(CLI_BINARY)-darwin-amd64 ./cmd/redit
	GOOS=linux GOARCH=amd64 go build $(LDFLAGS) -o $(DIST_DIR)/$(CLI_BINARY)-linux-amd64 ./cmd/redit
	GOOS=windows GOARCH=amd64 go build $(LDFLAGS) -o $(DIST_DIR)/$(CLI_BINARY)-windows-amd64.exe ./cmd/redit
	GOOS=darwin GOARCH=arm64 go build $(LDFLAGS) -o $(DIST_DIR)/$(MCP_BINARY)-darwin-arm64 ./cmd/redit-mcp
	GOOS=darwin GOARCH=amd64 go build $(LDFLAGS) -o $(DIST_DIR)/$(MCP_BINARY)-darwin-amd64 ./cmd/redit-mcp
	GOOS=linux GOARCH=amd64 go build $(LDFLAGS) -o $(DIST_DIR)/$(MCP_BINARY)-linux-amd64 ./cmd/redit-mcp
	GOOS=windows GOARCH=amd64 go build $(LDFLAGS) -o $(DIST_DIR)/$(MCP_BINARY)-windows-amd64.exe ./cmd/redit-mcp

test:
	go test ./...

clean:
	rm -f $(CLI_BINARY)
	rm -rf $(DIST_DIR)
	rm -rf $(BIN_DIR)
