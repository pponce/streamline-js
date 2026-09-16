#!/usr/bin/env bash
set -Eeuo pipefail

# Update pponce/streamline-js from the latest published official release and
# publish a verified Auto Steam skin release. This file lives only on the
# fork-maintenance branch and is outside the skin release whitelist.

readonly FORK_REPO="${AUTO_STEAM_FORK_REPO:-pponce/streamline-js}"
readonly UPSTREAM_REPO="${AUTO_STEAM_UPSTREAM_REPO:-decentespresso/streamline-js}"
readonly EXPECTED_SKIN_ID="pponce.streamline-auto-steam"
readonly SKIN_NAME="Streamline.js — Auto Steam"
readonly SKIN_DESCRIPTION="Streamline test skin with the independently installed Auto Steam Calculator"
readonly CHARTS_PATH="src/modules/echarts-streamline.min.js"
readonly CSS_PATH="src/css/app.css"
readonly STATE_FILE=".auto-steam-maintenance-state.json"
readonly GH_BIN="${AUTO_STEAM_GH_BIN:-gh}"
readonly NPM_BIN="${AUTO_STEAM_NPM_BIN:-npm}"

SCRIPT_PATH="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)/$(basename -- "${BASH_SOURCE[0]}")"
SOURCE_REPO=""
WORKTREE=""
SUCCESS=0

say() { printf '%s\n' "$*"; }
die() { printf '\nSTOPPED: %s\n' "$*" >&2; exit 1; }

on_error() {
  local status=$?
  trap - ERR
  set +e
  printf '\nSTOPPED: a command failed (exit %d).\n' "$status" >&2
  if [[ -n "$WORKTREE" && -d "$WORKTREE" && -f "$WORKTREE/$STATE_FILE" ]]; then
    printf 'The worktree was preserved. After correcting the problem, run:\n  "%s" --resume "%s"\n' \
      "$SCRIPT_PATH" "$WORKTREE" >&2
  fi
  exit "$status"
}

usage() {
  cat <<'EOF'
Usage:
  ./auto-steam-release.sh
  ./auto-steam-release.sh --resume /absolute/path/to/worktree

The normal command creates an isolated temporary worktree from origin/main,
merges the latest published official release tag, preserves the Auto Steam
skin identity, runs the full test/build, pushes main plus a unique tag, and
publishes a verified GitHub release.

If a merge conflict or check stops the run, repair the printed worktree and
then use the printed --resume command. Nothing is force-pushed or overwritten.
EOF
}

need_command() {
  command -v "$1" >/dev/null 2>&1 || die "Required command not found: $1"
}

repo_from_remote_url() {
  local url=${1%.git}
  url=${url#git@github.com:}
  url=${url#ssh://git@github.com/}
  url=${url#https://github.com/}
  url=${url#http://github.com/}
  printf '%s\n' "$url"
}

assert_remote_repo() {
  local repo=$1 remote=$2 actual_url actual_repo
  actual_url="$(git -C "$repo" remote get-url "$remote" 2>/dev/null)" || \
    die "Git remote '$remote' is missing."
  actual_repo="$(repo_from_remote_url "$actual_url")"
  [[ "$actual_repo" == "$3" ]] || \
    die "Remote '$remote' points to '$actual_repo', expected '$3'."
}

write_state() {
  local base_sha=$1 upstream_tag=$2 upstream_sha=$3 version=$4 release_tag=$5 asset_name=$6
  python3 - "$WORKTREE/$STATE_FILE" "$base_sha" "$upstream_tag" "$upstream_sha" \
    "$version" "$release_tag" "$asset_name" <<'PY'
import json, pathlib, sys
path = pathlib.Path(sys.argv[1])
keys = ("base_sha", "upstream_tag", "upstream_sha", "version", "release_tag", "asset_name")
path.write_text(json.dumps(dict(zip(keys, sys.argv[2:])), indent=2) + "\n")
PY
}

read_state() {
  local key=$1
  python3 - "$WORKTREE/$STATE_FILE" "$key" <<'PY'
import json, pathlib, sys
data = json.loads(pathlib.Path(sys.argv[1]).read_text())
value = data.get(sys.argv[2])
if not isinstance(value, str) or not value:
    raise SystemExit(f"invalid or missing state field: {sys.argv[2]}")
print(value)
PY
}

normalized_equal() {
  python3 - "$1" "$2" <<'PY'
import pathlib, sys
def normalized(path):
    return [line.rstrip() for line in pathlib.Path(path).read_text().splitlines()]
raise SystemExit(0 if normalized(sys.argv[1]) == normalized(sys.argv[2]) else 1)
PY
}

next_release_tag() {
  local repo=$1 version=$2 highest=0 tag suffix
  while IFS= read -r tag; do
    tag=${tag#refs/tags/}
    tag=${tag%\^\{\}}
    [[ "$tag" =~ ^auto-steam-${version//./\.}-([0-9]+)$ ]] || continue
    suffix=${BASH_REMATCH[1]}
    (( suffix > highest )) && highest=$suffix
  done < <(git -C "$repo" ls-remote --tags origin "refs/tags/auto-steam-${version}-*" | awk '{print $2}')
  printf 'auto-steam-%s-%d\n' "$version" "$((highest + 1))"
}

set_manifest_identity() {
  local manifest=$1 version=$2
  python3 - "$manifest" "$version" "$EXPECTED_SKIN_ID" "$SKIN_NAME" "$SKIN_DESCRIPTION" <<'PY'
import json, pathlib, sys
path = pathlib.Path(sys.argv[1])
data = json.loads(path.read_text())
data.update({
    "id": sys.argv[3],
    "name": sys.argv[4],
    "description": sys.argv[5],
    "version": sys.argv[2],
})
path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
PY
}

verify_archive() {
  local asset=$1 expected_version=$2
  python3 - "$asset" "$expected_version" "$EXPECTED_SKIN_ID" <<'PY'
import json, pathlib, sys, zipfile
path = pathlib.Path(sys.argv[1])
try:
    with zipfile.ZipFile(path) as archive:
        bad = archive.testzip()
        if bad is not None:
            raise RuntimeError(f"ZIP integrity failure at {bad}")
        names = archive.namelist()
        if "index.html" not in names or "skin-manifest.json" not in names:
            raise RuntimeError("ZIP is missing index.html or skin-manifest.json")
        unexpected = [n for n in names if n not in {"index.html", "skin-manifest.json"} and not n.startswith("src/")]
        if unexpected:
            raise RuntimeError(f"ZIP contains unexpected path: {unexpected[0]}")
        manifest = json.loads(archive.read("skin-manifest.json"))
        if manifest.get("id") != sys.argv[3]:
            raise RuntimeError(f"unexpected skin id: {manifest.get('id')!r}")
        if manifest.get("version") != sys.argv[2]:
            raise RuntimeError(f"unexpected skin version: {manifest.get('version')!r}")
except (OSError, zipfile.BadZipFile, json.JSONDecodeError, RuntimeError) as exc:
    print(exc, file=sys.stderr)
    raise SystemExit(1)
PY
}

latest_release_field() {
  local json=$1 field=$2
  python3 - "$field" "$json" <<'PY'
import json, sys
data = json.loads(sys.argv[2])
value = data.get(sys.argv[1])
if value is None or value == "":
    raise SystemExit(f"missing release field: {sys.argv[1]}")
if isinstance(value, bool):
    print("true" if value else "false")
else:
    print(value)
PY
}

release_exists() {
  "$GH_BIN" release view "$1" --repo "$FORK_REPO" >/dev/null 2>&1
}

release_is_draft() {
  [[ "$("$GH_BIN" release view "$1" --repo "$FORK_REPO" --json isDraft --jq .isDraft)" == "true" ]]
}

release_asset_names() {
  "$GH_BIN" release view "$1" --repo "$FORK_REPO" --json assets \
    --jq '.assets[].name'
}

remote_tag_commit() {
  local repo=$1 tag=$2 lines ref sha fallback=""
  lines="$(git -C "$repo" ls-remote --tags origin "refs/tags/$tag" "refs/tags/$tag^{}")"
  while read -r sha ref; do
    [[ -n "${sha:-}" ]] || continue
    if [[ "$ref" == "refs/tags/$tag^{}" ]]; then
      printf '%s\n' "$sha"
      return 0
    fi
    fallback=$sha
  done <<<"$lines"
  [[ -n "$fallback" ]] && printf '%s\n' "$fallback"
}

sha256_file() {
  python3 - "$1" <<'PY'
import hashlib, pathlib, sys
print(hashlib.sha256(pathlib.Path(sys.argv[1]).read_bytes()).hexdigest())
PY
}

auto_resolve_known_conflicts() {
  local conflict tmp_ours tmp_theirs
  mapfile -t conflicts < <(git -C "$WORKTREE" diff --name-only --diff-filter=U)
  for conflict in "${conflicts[@]:-}"; do
    case "$conflict" in
      skin-manifest.json)
        git -C "$WORKTREE" checkout --ours -- "$conflict"
        git -C "$WORKTREE" add -- "$conflict"
        ;;
      "$CHARTS_PATH")
        tmp_ours="$(mktemp)"
        tmp_theirs="$(mktemp)"
        git -C "$WORKTREE" show ":2:$conflict" >"$tmp_ours"
        git -C "$WORKTREE" show ":3:$conflict" >"$tmp_theirs"
        if normalized_equal "$tmp_ours" "$tmp_theirs"; then
          git -C "$WORKTREE" checkout --theirs -- "$conflict"
          git -C "$WORKTREE" add -- "$conflict"
          say "Auto-resolved whitespace-only $conflict conflict using the official release copy."
        fi
        rm -f -- "$tmp_ours" "$tmp_theirs"
        ;;
    esac
  done
}

stop_for_conflicts() {
  git -C "$WORKTREE" status --short
  cat >&2 <<EOF

Merge conflicts need your review. The worktree has been preserved at:
  $WORKTREE

Repair the files there, git add each resolved file, then run:
  "$SCRIPT_PATH" --resume "$WORKTREE"
EOF
  exit 2
}

prepare_new_run() {
  SOURCE_REPO="$(git -C "$(dirname -- "$SCRIPT_PATH")" rev-parse --show-toplevel 2>/dev/null)" || \
    die "Run this script from a clone of $FORK_REPO."
  assert_remote_repo "$SOURCE_REPO" origin "$FORK_REPO"

  if git -C "$SOURCE_REPO" remote get-url upstream >/dev/null 2>&1; then
    assert_remote_repo "$SOURCE_REPO" upstream "$UPSTREAM_REPO"
  else
    git -C "$SOURCE_REPO" remote add upstream "https://github.com/$UPSTREAM_REPO.git"
  fi

  "$GH_BIN" auth status >/dev/null
  git -C "$SOURCE_REPO" fetch --prune origin main

  local release_json upstream_tag upstream_sha version base_sha release_tag asset_name temp_root
  release_json="$("$GH_BIN" api "repos/$UPSTREAM_REPO/releases/latest")"
  [[ "$(latest_release_field "$release_json" draft)" == "false" ]] || die "Official latest release is a draft."
  [[ "$(latest_release_field "$release_json" prerelease)" == "false" ]] || die "Official latest release is a prerelease."
  upstream_tag="$(latest_release_field "$release_json" tag_name)"
  [[ "$upstream_tag" =~ ^v([0-9]+\.[0-9]+\.[0-9]+([.-][0-9A-Za-z.-]+)?)$ ]] || \
    die "Unexpected official release tag: $upstream_tag"
  version=${BASH_REMATCH[1]}

  git -C "$SOURCE_REPO" fetch upstream \
    "+refs/tags/$upstream_tag:refs/auto-steam-upstream/tags/$upstream_tag"
  upstream_sha="$(git -C "$SOURCE_REPO" rev-parse "refs/auto-steam-upstream/tags/$upstream_tag^{commit}")"
  base_sha="$(git -C "$SOURCE_REPO" rev-parse refs/remotes/origin/main)"

  if git -C "$SOURCE_REPO" merge-base --is-ancestor "$upstream_sha" "$base_sha"; then
    die "origin/main already contains official release $upstream_tag; there is no newer official release to merge."
  fi

  release_tag="$(next_release_tag "$SOURCE_REPO" "$version")"
  asset_name="streamline-${release_tag}.zip"
  temp_root="$(mktemp -d "${TMPDIR:-/tmp}/streamline-auto-steam.XXXXXXXX")"
  WORKTREE="$temp_root/repo"
  git -C "$SOURCE_REPO" worktree add --detach "$WORKTREE" "$base_sha"
  write_state "$base_sha" "$upstream_tag" "$upstream_sha" "$version" "$release_tag" "$asset_name"

  say "Merging official $upstream_tag ($upstream_sha) into fork main ($base_sha)."
  if ! git -C "$WORKTREE" merge --no-ff --no-commit "$upstream_sha"; then
    auto_resolve_known_conflicts
  fi
}

prepare_resume() {
  WORKTREE="$(cd -- "$1" 2>/dev/null && pwd -P)" || die "Resume worktree does not exist: $1"
  [[ -f "$WORKTREE/$STATE_FILE" ]] || die "No maintenance state found in $WORKTREE."
  SOURCE_REPO="$(git -C "$WORKTREE" rev-parse --path-format=absolute --git-common-dir)"
  SOURCE_REPO="$(dirname -- "$SOURCE_REPO")"
  assert_remote_repo "$WORKTREE" origin "$FORK_REPO"
  "$GH_BIN" auth status >/dev/null
  auto_resolve_known_conflicts
  say "Resuming Auto Steam update in $WORKTREE"
}

finish_merge_and_checks() {
  local version=$1 upstream_tag=$2 indexed_chart
  if [[ -n "$(git -C "$WORKTREE" diff --name-only --diff-filter=U)" ]]; then
    stop_for_conflicts
  fi

  set_manifest_identity "$WORKTREE/skin-manifest.json" "$version"
  git -C "$WORKTREE" add -- skin-manifest.json

  "$NPM_BIN" --prefix "$WORKTREE" ci
  "$NPM_BIN" --prefix "$WORKTREE" run build

  if [[ -f "$WORKTREE/$CHARTS_PATH" ]]; then
    indexed_chart="$(mktemp)"
    git -C "$WORKTREE" show ":$CHARTS_PATH" >"$indexed_chart"
    if ! cmp -s "$indexed_chart" "$WORKTREE/$CHARTS_PATH"; then
      if normalized_equal "$indexed_chart" "$WORKTREE/$CHARTS_PATH"; then
        cp -- "$indexed_chart" "$WORKTREE/$CHARTS_PATH"
        say "Discarded the verified trailing-whitespace-only ECharts rebuild difference."
      else
        git -C "$WORKTREE" add -- "$CHARTS_PATH"
      fi
    fi
    rm -f -- "$indexed_chart"
  fi
  [[ -f "$WORKTREE/$CSS_PATH" ]] && git -C "$WORKTREE" add -- "$CSS_PATH"

  "$NPM_BIN" --prefix "$WORKTREE" test
  git -C "$WORKTREE" diff --check

  if git -C "$WORKTREE" rev-parse -q --verify MERGE_HEAD >/dev/null; then
    git -C "$WORKTREE" commit -m "Merge official Streamline $upstream_tag into Auto Steam"
  fi

  [[ "$(python3 - "$WORKTREE/skin-manifest.json" <<'PY'
import json, pathlib, sys
print(json.loads(pathlib.Path(sys.argv[1]).read_text()).get("id", ""))
PY
)" == "$EXPECTED_SKIN_ID" ]] || die "Auto Steam skin identity was not preserved."
  [[ -z "$(git -C "$WORKTREE" status --porcelain --untracked-files=no)" ]] || {
    git -C "$WORKTREE" status --short
    die "Tracked changes remain after checks."
  }
}

build_asset_and_notes() {
  local version=$1 release_tag=$2 asset_name=$3 output_dir=$4 commit=$5 upstream_tag=$6
  mkdir -p -- "$output_dir"
  git -C "$WORKTREE" archive --format=zip --output="$output_dir/$asset_name" HEAD -- \
    index.html skin-manifest.json src
  verify_archive "$output_dir/$asset_name" "$version"

  cat >"$output_dir/release-notes.md" <<EOF
Experimental Streamline skin with Auto Steam Calculator support, updated through official Streamline $upstream_tag.

## Install and test
1. In Decaid's settings dashboard, enter \`pponce/streamline-js\` under Install Skin.
2. Install and select **Streamline.js — Auto Steam**.
3. Open **Settings → Extensions → Auto Steam Calculator**.
4. Install and enable the calculator, configure pitchers and calibration, then save.
5. Select Auto on the shot page, weigh the filled pitcher and tap its preset to calculate.

Manual Flow and Time remain available. No custom Decaid APK is required.
The calculator estimates duration; it does not measure milk temperature.
Auto Off is a reminder, not a hard start interlock. Hardware testing is ongoing.

This skin can coexist with official Streamline.
Use **Check for Skin Updates** for subsequent releases.
The calculator updates independently through Decaid's plugin controls.

- [Official Streamline $upstream_tag](https://github.com/$UPSTREAM_REPO/releases/tag/$upstream_tag)
- [Calculator](https://github.com/pponce/decentAutoSteamCalculator)
- [Documentation and API](https://github.com/pponce/decentAutoSteamCalculator/blob/main/docs/CalibratedSteam.md)

Credit to Damian / Damian-AU for the original DSx2 calculator and pitcher heuristics.

Source commit: \`$commit\`
EOF
}

push_and_publish() {
  local base_sha=$1 version=$2 upstream_tag=$3 release_tag=$4 asset_name=$5
  local commit output_dir downloaded remote_main latest_json
  commit="$(git -C "$WORKTREE" rev-parse HEAD)"
  output_dir="$(dirname -- "$WORKTREE")/release"
  build_asset_and_notes "$version" "$release_tag" "$asset_name" "$output_dir" "$commit" "$upstream_tag"

  git -C "$WORKTREE" fetch origin main
  remote_main="$(git -C "$WORKTREE" rev-parse refs/remotes/origin/main)"
  if [[ "$remote_main" == "$base_sha" ]]; then
    if [[ -n "$(remote_tag_commit "$WORKTREE" "$release_tag")" ]]; then
      die "Remote tag $release_tag already exists; nothing was overwritten."
    fi
    git -C "$WORKTREE" show-ref --verify --quiet "refs/tags/$release_tag" || \
      git -C "$WORKTREE" tag -a "$release_tag" -m "Auto Steam release $release_tag" "$commit"
    git -C "$WORKTREE" push --atomic origin "HEAD:refs/heads/main" "refs/tags/$release_tag"
  elif [[ "$remote_main" == "$commit" && "$(remote_tag_commit "$WORKTREE" "$release_tag")" == "$commit" ]]; then
    say "The commit and tag were already pushed; resuming GitHub release publication."
  else
    die "origin/main changed during this run ($base_sha -> $remote_main). Nothing was overwritten. Start a fresh run."
  fi

  if ! release_exists "$release_tag"; then
    "$GH_BIN" release create "$release_tag" "$output_dir/$asset_name" \
      --repo "$FORK_REPO" --verify-tag --title "Auto Steam $version" \
      --notes-file "$output_dir/release-notes.md" --draft
  elif ! release_is_draft "$release_tag"; then
    say "Release $release_tag is already published; verifying its asset."
  fi

  if ! release_asset_names "$release_tag" | grep -Fxq -- "$asset_name"; then
    if release_is_draft "$release_tag"; then
      "$GH_BIN" release upload "$release_tag" "$output_dir/$asset_name" --repo "$FORK_REPO"
    else
      die "Published release $release_tag is missing $asset_name; it was not modified."
    fi
  fi

  downloaded="$output_dir/download-check"
  mkdir -p -- "$downloaded"
  rm -f -- "$downloaded/$asset_name"
  "$GH_BIN" release download "$release_tag" --repo "$FORK_REPO" \
    --pattern "$asset_name" --dir "$downloaded"
  [[ "$(sha256_file "$output_dir/$asset_name")" == "$(sha256_file "$downloaded/$asset_name")" ]] || \
    die "Uploaded ZIP mismatch; the GitHub release was left as-is for inspection."

  if release_is_draft "$release_tag"; then
    "$GH_BIN" release edit "$release_tag" --repo "$FORK_REPO" \
      --draft=false --prerelease=false --latest
  fi

  latest_json="$("$GH_BIN" api "repos/$FORK_REPO/releases/latest")"
  [[ "$(latest_release_field "$latest_json" tag_name)" == "$release_tag" ]] || \
    die "Publication verification failed: $release_tag is not the latest release."
  [[ "$(latest_release_field "$latest_json" draft)" == "false" ]] || \
    die "Publication verification failed: release is still a draft."

  SUCCESS=1
  say ""
  say "PUBLISHED SUCCESSFULLY: https://github.com/$FORK_REPO/releases/tag/$release_tag"
  say "Install in the Decaid dashboard using: $FORK_REPO"
}

cleanup_success() {
  (( SUCCESS == 1 )) || return 0
  local parent parent_name
  parent="$(dirname -- "$WORKTREE")"
  parent_name="$(basename -- "$parent")"
  if [[ "$(basename -- "$WORKTREE")" != "repo" || ! "$parent_name" =~ ^streamline-auto-steam\.[A-Za-z0-9]+$ ]]; then
    say "Safety check kept the completed worktree at: $WORKTREE"
    return 0
  fi
  git -C "$SOURCE_REPO" worktree remove --force "$WORKTREE"
  rm -rf -- "$parent"
}

main() {
  trap on_error ERR
  need_command git
  need_command python3
  need_command "$GH_BIN"
  need_command "$NPM_BIN"

  case ${1:-} in
    "") prepare_new_run ;;
    --resume)
      [[ $# -eq 2 ]] || { usage; exit 64; }
      prepare_resume "$2"
      ;;
    -h|--help) usage; exit 0 ;;
    *) usage; exit 64 ;;
  esac
  trap cleanup_success EXIT

  local base_sha upstream_tag upstream_sha version release_tag asset_name
  base_sha="$(read_state base_sha)"
  upstream_tag="$(read_state upstream_tag)"
  upstream_sha="$(read_state upstream_sha)"
  version="$(read_state version)"
  release_tag="$(read_state release_tag)"
  asset_name="$(read_state asset_name)"

  [[ "$(git -C "$WORKTREE" rev-parse "$upstream_sha^{commit}")" == "$upstream_sha" ]] || \
    die "Saved upstream commit can no longer be resolved."
  finish_merge_and_checks "$version" "$upstream_tag"
  push_and_publish "$base_sha" "$version" "$upstream_tag" "$release_tag" "$asset_name"
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
