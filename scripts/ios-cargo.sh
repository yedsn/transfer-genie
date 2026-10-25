#!/bin/sh
set -eu

project_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
export CARGO_HOME="${TRANSFER_GENIE_IOS_CARGO_HOME:-$project_root/.cargo-ios}"

exec cargo "$@"
