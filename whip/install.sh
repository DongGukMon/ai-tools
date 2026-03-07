#!/bin/bash
set -e

REPO="bang9/ai-tools"
INSTALL_DIR="$HOME/.local/bin"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
NC='\033[0m'

info() { echo -e "${GREEN}$1${NC}"; }
warn() { echo -e "${YELLOW}$1${NC}"; }
error() { echo -e "${RED}$1${NC}" >&2; exit 1; }
step() { echo -e "${CYAN}→${NC} $1"; }

detect_os() {
    case "$(uname -s)" in
        Darwin) echo "darwin" ;;
        Linux)  echo "linux" ;;
        MINGW*|MSYS*|CYGWIN*) echo "windows" ;;
        *) error "Unsupported operating system: $(uname -s)" ;;
    esac
}

detect_arch() {
    local arch
    arch="$(uname -m)"

    if [ "$(uname -s)" = "Darwin" ] && [ "$arch" = "x86_64" ]; then
        if sysctl -n sysctl.proc_translated 2>/dev/null | grep -q 1; then
            arch="arm64"
        fi
    fi

    case "$arch" in
        x86_64|amd64) echo "amd64" ;;
        arm64|aarch64) echo "arm64" ;;
        *) error "Unsupported architecture: $arch" ;;
    esac
}

get_latest_version() {
    local version
    version=$(curl -sfSL "https://api.github.com/repos/${REPO}/releases/latest" | grep '"tag_name"' | head -1 | cut -d'"' -f4)
    if [ -z "$version" ]; then
        error "Failed to fetch latest version from GitHub"
    fi
    echo "$version"
}

ensure_path() {
    local shell_profile=""

    if [ -n "$ZSH_VERSION" ] || [ "$(basename "$SHELL")" = "zsh" ]; then
        shell_profile="$HOME/.zshrc"
    elif [ -n "$BASH_VERSION" ] || [ "$(basename "$SHELL")" = "bash" ]; then
        if [ -f "$HOME/.bash_profile" ]; then
            shell_profile="$HOME/.bash_profile"
        else
            shell_profile="$HOME/.bashrc"
        fi
    fi

    if echo "$PATH" | tr ':' '\n' | grep -qx "$INSTALL_DIR"; then
        return 0
    fi

    if [ -n "$shell_profile" ]; then
        if ! grep -q "$INSTALL_DIR" "$shell_profile" 2>/dev/null; then
            echo "" >> "$shell_profile"
            echo "# Added by whip installer" >> "$shell_profile"
            echo "export PATH=\"$INSTALL_DIR:\$PATH\"" >> "$shell_profile"
            warn "Added $INSTALL_DIR to PATH in $shell_profile"
            warn "Run 'source $shell_profile' or restart your terminal"
        fi
    else
        warn "Could not detect shell profile. Add $INSTALL_DIR to your PATH manually."
    fi
}

install_binary() {
    local name=$1 os=$2 arch=$3 version=$4
    local download_name="${name}-${os}-${arch}"
    local binary_name="$name"

    if [ "$os" = "windows" ]; then
        download_name="${download_name}.exe"
        binary_name="${name}.exe"
    fi

    local download_url="https://github.com/${REPO}/releases/download/${version}/${download_name}"

    step "Installing ${name} ${version}..."
    if ! curl -fsSL -o "${INSTALL_DIR}/${binary_name}" "$download_url"; then
        warn "Failed to download ${name}. It will be installed on first use via plugin hook."
        return 1
    fi
    chmod +x "${INSTALL_DIR}/${binary_name}"
    info "  ${name} installed"
    return 0
}

main() {
    echo ""
    echo -e "${CYAN}Setting up whip — Task Orchestrator for Claude Code${NC}"
    echo ""

    local os arch version

    os=$(detect_os)
    arch=$(detect_arch)
    version=$(get_latest_version)

    echo "  Version:      $version"
    echo "  Platform:     ${os}/${arch}"
    echo "  Install path: ${INSTALL_DIR}"
    echo ""

    mkdir -p "$INSTALL_DIR"

    # Install whip
    install_binary "whip" "$os" "$arch" "$version"

    # Install required tools
    echo ""
    step "Installing required tools..."

    if ! command -v claude-irc &> /dev/null && ! [ -x "${INSTALL_DIR}/claude-irc" ]; then
        install_binary "claude-irc" "$os" "$arch" "$version" || true
    else
        info "  claude-irc already installed"
    fi

    if ! command -v webform &> /dev/null && ! [ -x "${INSTALL_DIR}/webform" ]; then
        install_binary "webform" "$os" "$arch" "$version" || true
    else
        info "  webform already installed"
    fi

    ensure_path

    echo ""
    info "whip ${version} installed successfully!"
    echo ""
    echo "  Quick start:"
    echo "    whip create \"My Task\" --desc \"Description here\""
    echo "    whip assign <id>"
    echo "    whip dashboard"
    echo ""
}

main
