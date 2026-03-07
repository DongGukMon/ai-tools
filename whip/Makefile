CLI_BINARY = whip
DIST_DIR = dist
VERSION ?= dev
LDFLAGS = -ldflags "-s -w -X main.version=$(VERSION)"

.PHONY: build cross test clean

build:
	go build $(LDFLAGS) -o $(CLI_BINARY) ./cmd/whip

cross:
	mkdir -p $(DIST_DIR)
	GOOS=darwin GOARCH=arm64 go build $(LDFLAGS) -o $(DIST_DIR)/$(CLI_BINARY)-darwin-arm64 ./cmd/whip
	GOOS=darwin GOARCH=amd64 go build $(LDFLAGS) -o $(DIST_DIR)/$(CLI_BINARY)-darwin-amd64 ./cmd/whip
	GOOS=linux GOARCH=amd64 go build $(LDFLAGS) -o $(DIST_DIR)/$(CLI_BINARY)-linux-amd64 ./cmd/whip

test:
	go test ./...

clean:
	rm -f $(CLI_BINARY)
	rm -rf $(DIST_DIR)
