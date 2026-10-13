#!/usr/bin/env bash
# curl -fsSL https://raw.githubusercontent.com/hyuntroll/oh-my-dots/main/install.sh | bash
set -euo pipefail

main() {
    local repo='https://github.com/hyuntroll/oh-my-dots.git'
    local dest="${HOME}/.ohmydots" system arch runtime python='' candidate version archive tmp checksum
    while [ "$#" -gt 0 ]; do
        case "$1" in
            --dir) [ "$#" -ge 2 ] || { echo 'Missing --dir value' >&2; return 1; }; dest="$2"; shift 2 ;;
            --help|-h) echo 'OhMyDots installer: bash install.sh [--dir /absolute/install/path]'; return ;;
            *) echo "Unknown option: $1" >&2; return 1 ;;
        esac
    done
    case "$dest" in /*) ;; *) echo '--dir must be an absolute path.' >&2; return 1 ;; esac
    system="$(uname -s)"
    case "$system" in Darwin|Linux) ;; *) echo 'Use macOS or Linux (Windows: WSL2 + Docker).' >&2; return 1 ;; esac
    [ "$(id -u)" -ne 0 ] || { echo 'Run as your regular user, without sudo.' >&2; return 1; }
    # A curl pipe owns stdin: every prompt and password must use the controlling terminal.
    if ! { exec 3<>/dev/tty; } 2>/dev/null; then
        echo 'An interactive terminal is required. Download install.sh and run it in a terminal.' >&2
        return 1
    fi
    printf '\n  OhMyDots · 내 컴퓨터에 설치하는 AI 작업 공간\n\n'
    for candidate in git curl tar docker; do
        command -v "$candidate" >/dev/null || { echo "Required: $candidate. See https://github.com/hyuntroll/oh-my-dots/blob/main/docs/SELF-HOSTING.md" >&2; return 1; }
    done
    if ! docker info >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
        echo 'Start Docker Desktop (macOS) or Docker Engine + Compose (Linux), then run this installer again.' >&2
        return 1
    fi
    printf '설치 폴더 [%s]: ' "$dest" >&3
    local answer
    IFS= read -r answer <&3
    dest="${answer:-$dest}"
    case "$dest" in /*) ;; *) echo 'Use an absolute installation path.' >&2; return 1 ;; esac
    if [ -e "$dest" ]; then
        [ -d "$dest/.git" ] || { echo 'This folder is not an OhMyDots checkout; choose another folder.' >&2; return 1; }
        [ "$(git -C "$dest" remote get-url origin)" = "$repo" ] || { echo 'The existing repository has a different origin; refusing to overwrite it.' >&2; return 1; }
        [ "$(git -C "$dest" branch --show-current)" = main ] || { echo 'Switch this checkout to main before updating.' >&2; return 1; }
        [ -z "$(git -C "$dest" status --porcelain --untracked-files=normal)" ] || { echo 'Save your checkout changes before updating; no files were reset.' >&2; return 1; }
        if [ -f "$dest/.local/hosting/server.pid" ]; then
            echo 'Run ohmydots stop before running the installer again (systemd: stop the user service).' >&2
            return 1
        fi
        git -C "$dest" pull --ff-only </dev/null
    else
        git clone --branch main --single-branch "$repo" "$dest" </dev/null
    fi
    runtime="$dest/.local/runtime"
    mkdir -p "$runtime/bin"
    chmod 700 "$runtime"
    export PATH="$runtime/bin:$PATH"
    for candidate in python3.14 python3.13 python3.12 python3.11 python3; do
        if command -v "$candidate" >/dev/null && "$candidate" -c 'import sys, venv; assert sys.version_info >= (3, 11)' 2>/dev/null; then
            python="$(command -v "$candidate")"; break
        fi
    done
    tmp="$(mktemp -d)"
    trap "$(printf 'rm -rf -- %q' "$tmp")" EXIT
    if [ -z "$python" ]; then
        echo 'Python 3.12를 사용자 폴더에 준비합니다…'
        curl --fail --show-error --silent --location --proto '=https' --tlsv1.2 https://astral.sh/uv/install.sh -o "$tmp/uv-install.sh"
        UV_INSTALL_DIR="$runtime/uv" UV_NO_MODIFY_PATH=1 sh "$tmp/uv-install.sh" </dev/null
        export UV_PYTHON_INSTALL_DIR="$runtime/python"
        export UV_PYTHON_BIN_DIR="$runtime/bin"
        "$runtime/uv/uv" python install 3.12 </dev/null
        python="$("$runtime/uv/uv" python find --managed-python 3.12)"
        ln -sf "$python" "$runtime/bin/python3"
    fi
    if ! command -v node >/dev/null || ! node -e 'if (+process.versions.node.split(".")[0] < 24) process.exit(1)' 2>/dev/null || ! command -v npm >/dev/null; then
        echo 'Node.js 24를 사용자 폴더에 준비합니다…'
        arch="$(uname -m)"
        case "$arch" in arm64|aarch64) arch=arm64 ;; x86_64) arch=x64 ;; *) echo 'Managed Node supports x64 and arm64; install Node.js 24+ manually.' >&2; return 1 ;; esac
        case "$system" in Darwin) system=darwin ;; Linux) system=linux ;; esac
        version='v24.19.0'
        archive="node-$version-$system-$arch.tar.gz"
        curl -fsSL --proto '=https' --tlsv1.2 "https://nodejs.org/dist/$version/$archive" -o "$tmp/$archive"
        curl -fsSL --proto '=https' --tlsv1.2 "https://nodejs.org/dist/$version/SHASUMS256.txt" -o "$tmp/SHASUMS256.txt"
        checksum="$(awk -v file="$archive" '$2 == file { print $1 }' "$tmp/SHASUMS256.txt")"
        "$python" -c 'import hashlib,sys; actual=hashlib.sha256(open(sys.argv[1], "rb").read()).hexdigest(); assert len(sys.argv[2]) == 64 and actual == sys.argv[2], "Node checksum mismatch"' "$tmp/$archive" "$checksum"
        tar -xzf "$tmp/$archive" -C "$runtime"
        for candidate in node npm npx; do
            ln -sf "$runtime/node-$version-$system-$arch/bin/$candidate" "$runtime/bin/$candidate"
        done
    fi
    "$python" "$dest/scripts/cli.py" setup <&3
}

main "$@"
