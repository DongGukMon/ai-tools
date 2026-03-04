CLI_BINARY = claude-irc
DIST_DIR = dist

PLATFORMS = darwin-arm64 darwin-amd64 linux-amd64 windows-amd64

.PHONY: build cross test clean

build:
	go build -o $(CLI_BINARY) ./cmd/claude-irc

cross:
	mkdir -p $(DIST_DIR)
	GOOS=darwin GOARCH=arm64 go build -o $(DIST_DIR)/$(CLI_BINARY)-darwin-arm64 ./cmd/claude-irc
	GOOS=darwin GOARCH=amd64 go build -o $(DIST_DIR)/$(CLI_BINARY)-darwin-amd64 ./cmd/claude-irc
	GOOS=linux GOARCH=amd64 go build -o $(DIST_DIR)/$(CLI_BINARY)-linux-amd64 ./cmd/claude-irc
	GOOS=windows GOARCH=amd64 go build -o $(DIST_DIR)/$(CLI_BINARY)-windows-amd64.exe ./cmd/claude-irc

test:
	go test ./...

clean:
	rm -f $(CLI_BINARY)
	rm -rf $(DIST_DIR)
