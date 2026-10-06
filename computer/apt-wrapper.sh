#!/bin/sh
# Keep desktop apps unprivileged; elevate only the system package manager.
exec sudo -n "/usr/bin/${0##*/}" "$@"
