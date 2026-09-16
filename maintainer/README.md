# Auto Steam fork maintenance

This branch contains private-use maintainer tooling for
[`pponce/streamline-js`](https://github.com/pponce/streamline-js). It is kept
off `main`, and the official skin packaging whitelist only includes
`index.html`, `skin-manifest.json`, and `src/`, so these files cannot enter a
skin ZIP.

## Run an update

Prerequisites: an authenticated GitHub CLI (`gh`), Git, Node/npm, and Python 3.
Run this from a local clone with SSH or HTTPS push access to the fork:

```bash
git fetch origin fork-maintenance
git switch fork-maintenance
./maintainer/auto-steam-release.sh
```

The script:

1. asks GitHub for the latest **published, non-prerelease** release of
   `decentespresso/streamline-js`;
2. fetches and merges that exact tag, never unreleased upstream `main`;
3. works in an isolated temporary worktree, leaving the checked-out
   `fork-maintenance` branch alone;
4. preserves the Auto Steam skin ID/name and sets the manifest version to the
   official version;
5. runs `npm ci`, the build, all tests, and `git diff --check`;
6. accepts the known generated ECharts difference only when it is provably
   trailing-whitespace-only;
7. archives only `index.html`, `skin-manifest.json`, and `src/`;
8. verifies ZIP integrity, contents, ID, version, the uploaded SHA-256, and the
   final GitHub release;
9. atomically pushes the merge commit and tag only if `origin/main` did not
   change during the run.

Tags use `auto-steam-<official-version>-<revision>`, for example
`auto-steam-0.1.112-1`. The skin manifest version remains the official version,
which is enough for Decaid to detect each official-version update while the
separate skin ID allows it to coexist with official Streamline.

## Merge conflicts or failed checks

On failure the script does not push anything and preserves the temporary
worktree. For a merge conflict, repair files in the displayed worktree, stage
them with `git add`, then run the exact resume command printed by the script:

```bash
./maintainer/auto-steam-release.sh --resume /tmp/streamline-auto-steam.XXXXXXXX/repo
```

The manifest conflict is resolved automatically in favor of the Auto Steam
identity. The generated ECharts bundle is auto-resolved only when the two sides
differ solely by trailing whitespace. All other conflicts require review so an
upstream change cannot silently remove or corrupt Auto Steam behavior.

If GitHub `main` changes while checks are running, the script stops before the
push. Remove the abandoned worktree with `git worktree remove <path>` and start
a fresh run.

The calculator remains a separate project and updates independently through
Decaid's plugin controls:
[`pponce/decentAutoSteamCalculator`](https://github.com/pponce/decentAutoSteamCalculator).
