CLI_BINARY = rewind
DIST_DIR = dist
VERSION ?= dev
LDFLAGS = -ldflags "-s -w -X main.version=$(VERSION)"

.PHONY: build web-build cross test clean

build: web-build
	go build $(LDFLAGS) -o $(CLI_BINARY) ./cmd/rewind

web-build:
	cd web && COREPACK_ENABLE_AUTO_PIN=0 pnpm install && COREPACK_ENABLE_AUTO_PIN=0 pnpm build

cross: web-build
	mkdir -p $(DIST_DIR)
	GOOS=darwin GOARCH=arm64 go build $(LDFLAGS) -o $(DIST_DIR)/$(CLI_BINARY)-darwin-arm64 ./cmd/rewind
	GOOS=darwin GOARCH=amd64 go build $(LDFLAGS) -o $(DIST_DIR)/$(CLI_BINARY)-darwin-amd64 ./cmd/rewind
	GOOS=linux GOARCH=amd64 go build $(LDFLAGS) -o $(DIST_DIR)/$(CLI_BINARY)-linux-amd64 ./cmd/rewind

test: web-build
	go test ./...

clean:
	rm -f $(CLI_BINARY)
	rm -rf $(DIST_DIR)
	rm -rf web/dist web/node_modules
