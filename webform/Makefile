CLI_BINARY = webform
DIST_DIR = dist
VERSION ?= dev
LDFLAGS = -ldflags "-s -w -X main.version=$(VERSION)"

.PHONY: build cross test clean

build:
	go build $(LDFLAGS) -o $(CLI_BINARY) ./cmd/webform

cross:
	mkdir -p $(DIST_DIR)
	GOOS=darwin GOARCH=arm64 go build $(LDFLAGS) -o $(DIST_DIR)/$(CLI_BINARY)-darwin-arm64 ./cmd/webform
	GOOS=darwin GOARCH=amd64 go build $(LDFLAGS) -o $(DIST_DIR)/$(CLI_BINARY)-darwin-amd64 ./cmd/webform
	GOOS=linux GOARCH=amd64 go build $(LDFLAGS) -o $(DIST_DIR)/$(CLI_BINARY)-linux-amd64 ./cmd/webform

test:
	go test ./...

clean:
	rm -f $(CLI_BINARY)
	rm -rf $(DIST_DIR)
