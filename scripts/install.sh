#!/usr/bin/env bash
set -euo pipefail

REPO="nicholascostadev/jira-time-tracker"
INSTALL_DIR="${INSTALL_DIR:-$HOME/.local/bin}"

os_name="$(uname -s)"
arch_name="$(uname -m)"

case "$os_name" in
  Linux)
    os="linux"
    ;;
  Darwin)
    os="macos"
    ;;
  *)
    echo "Unsupported operating system: $os_name"
    exit 1
    ;;
esac

case "$arch_name" in
  x86_64)
    arch="x64"
    ;;
  arm64|aarch64)
    arch="arm64"
    ;;
  *)
    echo "Unsupported architecture: $arch_name"
    exit 1
    ;;
esac

if [ "$os" = "linux" ] && [ "$arch" != "x64" ]; then
  echo "Linux release binary is currently available for x64 only"
  exit 1
fi

if [ "$os" = "macos" ] && [ "$arch" != "arm64" ]; then
  echo "macOS release binary is currently available for arm64 only"
  exit 1
fi

latest_tag="$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" | sed -n 's/.*"tag_name": "\([^"]*\)".*/\1/p' | head -n 1)"

if [ -z "$latest_tag" ]; then
  echo "Unable to determine latest release tag"
  exit 1
fi

asset_name="jtt-${latest_tag}-${os}-${arch}.tar.gz"
asset_url="https://github.com/$REPO/releases/download/$latest_tag/$asset_name"

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

echo "Downloading $asset_name"
curl -fsSL "$asset_url" -o "$tmp_dir/$asset_name"
tar -xzf "$tmp_dir/$asset_name" -C "$tmp_dir"

mkdir -p "$INSTALL_DIR"
install -m 755 "$tmp_dir/jtt" "$INSTALL_DIR/jtt"

echo "Installed jtt to $INSTALL_DIR/jtt"
echo "Run: jtt --help"

case ":$PATH:" in
  *":$INSTALL_DIR:"*) ;;
  *)
    echo
    echo "Note: $INSTALL_DIR is not in your PATH."
    echo "Add this line to your shell profile:"
    echo "  export PATH=\"$INSTALL_DIR:\$PATH\""
    ;;
esac
