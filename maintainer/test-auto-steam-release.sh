#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=auto-steam-release.sh
source "$SCRIPT_DIR/auto-steam-release.sh"

tests=0
pass() { tests=$((tests + 1)); printf 'ok %d - %s\n' "$tests" "$1"; }
fail() { printf 'not ok %d - %s\n' "$((tests + 1))" "$1" >&2; exit 1; }
assert_eq() { [[ "$1" == "$2" ]] || fail "$3 (got '$1', expected '$2')"; pass "$3"; }
assert_true() { "$@" || fail "${TEST_NAME:-command failed}"; pass "${TEST_NAME:-command succeeded}"; }
assert_false() { if "$@" >/dev/null 2>&1; then fail "${TEST_NAME:-command unexpectedly succeeded}"; fi; pass "${TEST_NAME:-command failed as expected}"; }

temp="$(mktemp -d "${TMPDIR:-/tmp}/auto-steam-tests.XXXXXXXX")"
trap 'rm -rf -- "$temp"' EXIT

assert_eq "$(repo_from_remote_url git@github.com:pponce/streamline-js.git)" "pponce/streamline-js" "parse SSH remote"
assert_eq "$(repo_from_remote_url https://github.com/pponce/streamline-js.git)" "pponce/streamline-js" "parse HTTPS remote"
assert_eq "$(repo_from_remote_url ssh://git@github.com/pponce/streamline-js.git)" "pponce/streamline-js" "parse ssh:// remote"

printf 'alpha  \nbeta\t\n' >"$temp/a"
printf 'alpha\nbeta\n' >"$temp/b"
printf 'alpha\ngamma\n' >"$temp/c"
TEST_NAME="allow trailing-whitespace-only generated difference" assert_true normalized_equal "$temp/a" "$temp/b"
TEST_NAME="reject meaningful generated difference" assert_false normalized_equal "$temp/a" "$temp/c"

cat >"$temp/manifest.json" <<'JSON'
{"id":"streamline.js","name":"Streamline","description":"official","version":"0.0.0","extra":true}
JSON
set_manifest_identity "$temp/manifest.json" "0.1.112"
assert_eq "$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["id"])' "$temp/manifest.json")" "$EXPECTED_SKIN_ID" "preserve Auto Steam identity"
assert_eq "$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["version"])' "$temp/manifest.json")" "0.1.112" "set official manifest version"
assert_eq "$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["extra"])' "$temp/manifest.json")" "True" "preserve unknown manifest fields"

mkdir -p "$temp/valid/src/modules"
printf '<!doctype html>\n' >"$temp/valid/index.html"
cp "$temp/manifest.json" "$temp/valid/skin-manifest.json"
printf 'export {}\n' >"$temp/valid/src/modules/app.js"
(cd "$temp/valid" && zip -qr "$temp/valid.zip" index.html skin-manifest.json src)
TEST_NAME="accept valid release archive" assert_true verify_archive "$temp/valid.zip" "0.1.112"

cp "$temp/valid.zip" "$temp/corrupt.zip"
printf 'damage' >>"$temp/corrupt.zip"
# Appending data is legal ZIP structure, so truncate the central directory.
python3 - "$temp/corrupt.zip" <<'PY'
import pathlib, sys
p = pathlib.Path(sys.argv[1])
p.write_bytes(p.read_bytes()[:-32])
PY
TEST_NAME="reject corrupted release archive" assert_false verify_archive "$temp/corrupt.zip" "0.1.112"

cp -R "$temp/valid" "$temp/unexpected"
printf secret >"$temp/unexpected/notes.txt"
(cd "$temp/unexpected" && zip -qr "$temp/unexpected.zip" index.html skin-manifest.json src notes.txt)
TEST_NAME="reject non-whitelisted archive path" assert_false verify_archive "$temp/unexpected.zip" "0.1.112"

(cd "$temp/valid" && zip -q "$temp/missing-index.zip" skin-manifest.json)
TEST_NAME="reject archive missing index" assert_false verify_archive "$temp/missing-index.zip" "0.1.112"

python3 - "$temp/valid/skin-manifest.json" <<'PY'
import json, pathlib, sys
p=pathlib.Path(sys.argv[1]); d=json.loads(p.read_text()); d["id"]="streamline.js"; p.write_text(json.dumps(d))
PY
(cd "$temp/valid" && zip -qr "$temp/wrong-id.zip" index.html skin-manifest.json src)
TEST_NAME="reject official skin identity" assert_false verify_archive "$temp/wrong-id.zip" "0.1.112"

json='{"tag_name":"v0.1.112","draft":false,"prerelease":false}'
assert_eq "$(latest_release_field "$json" tag_name)" "v0.1.112" "read latest release tag"
assert_eq "$(latest_release_field "$json" draft)" "false" "read release draft boolean"

git init -q --bare "$temp/remote.git"
git init -q "$temp/repo"
git -C "$temp/repo" remote add origin "$temp/remote.git"
git -C "$temp/repo" config user.name test
git -C "$temp/repo" config user.email test@example.invalid
printf base >"$temp/repo/file"
git -C "$temp/repo" add file
git -C "$temp/repo" commit -qm base
git -C "$temp/repo" branch -M main
git -C "$temp/repo" push -q origin main
assert_eq "$(next_release_tag "$temp/repo" 0.1.112)" "auto-steam-0.1.112-1" "choose first fork revision"
git -C "$temp/repo" tag auto-steam-0.1.112-1
git -C "$temp/repo" tag auto-steam-0.1.112-2
git -C "$temp/repo" push -q origin --tags
assert_eq "$(next_release_tag "$temp/repo" 0.1.112)" "auto-steam-0.1.112-3" "increment fork revision"

[[ "$tests" -eq 17 ]] || fail "expected 17 maintenance cases, ran $tests"
printf '1..%d\n' "$tests"
