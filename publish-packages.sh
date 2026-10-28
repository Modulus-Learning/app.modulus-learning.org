#!/usr/bin/env bash
#
# publish-packages.sh — publish the @modulus-learning/* lockstep set to npm
# under passkey 2FA.
#
# Why this exists: `pnpm publish` / `changeset publish` cannot publish under
# passkey-only 2FA — pnpm's OTP pre-check accepts only a typed numeric code and
# dead-ends at ERR_PNPM_OTP_NON_INTERACTIVE. Plain `npm publish` honours the
# bypass token in ~/.npmrc silently. But plain npm does NOT rewrite pnpm's
# `workspace:*` deps — so we `pnpm pack` first (which rewrites them into real
# versions) and `npm publish <tarball>` the result.
#
# The publish set is `fixed[0]` in .changeset/config.json: every package in it
# shares one version. Packages publish in dependency order, so a partial run
# never leaves a published package whose dependency is missing.
#
# This script is meant to run AFTER the release commit (`chore(release): X.Y.Z`)
# is made and pushed — i.e. between Step 7 and the umbrella release of /release.
# It builds, packs, publishes, and pushes per-package tags. It is idempotent:
# packages already live at the current version are skipped, and existing tags
# are not recreated — so re-running after a partial failure just finishes the job.
#
# The npm dist-tag follows the version: a prerelease (`X.Y.Z-next.N`) publishes
# under `next`, anything else under `latest`. `--tag` overrides that, but a
# prerelease is never published under `latest`.
#
# Usage:
#   ./publish-packages.sh            # build, publish, tag, push (prompts before publishing)
#   ./publish-packages.sh --dry-run  # pack + verify only; no publish, no tags, no push
#   ./publish-packages.sh --no-build # skip the turbo build (use existing dist/)
#   ./publish-packages.sh --yes      # skip the confirmation prompt
#   ./publish-packages.sh --tag next # override the inferred dist-tag
#
set -euo pipefail

# ---- options --------------------------------------------------------------
DRY_RUN=0
DO_BUILD=1
ASSUME_YES=0
DIST_TAG=""
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    --no-build) DO_BUILD=0 ;;
    --yes|-y) ASSUME_YES=1 ;;
    --tag) shift; DIST_TAG="${1:-}" ;;
    --tag=*) DIST_TAG="${1#--tag=}" ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
  shift
done

# ---- colours --------------------------------------------------------------
if [ -t 1 ]; then
  BOLD=$'\033[1m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'; RED=$'\033[31m'; DIM=$'\033[2m'; RESET=$'\033[0m'
else
  BOLD=""; GREEN=""; YELLOW=""; RED=""; DIM=""; RESET=""
fi
info()  { echo "${BOLD}$*${RESET}"; }
ok()    { echo "${GREEN}$*${RESET}"; }
warn()  { echo "${YELLOW}$*${RESET}"; }
die()   { echo "${RED}error: $*${RESET}" >&2; exit 1; }

# ---- locate repo ----------------------------------------------------------
REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

command -v node >/dev/null || die "node not found on PATH"
command -v npm  >/dev/null || die "npm not found on PATH"
command -v pnpm >/dev/null || die "pnpm not found on PATH"

# ---- package set: fixed[0], in dependency order ----------------------------
# Prints "name<TAB>dir<TAB>version" per package, dependencies first.
mapfile -t PKG_LINES < <(node - <<'NODE'
const fs = require('fs')
const path = require('path')
const cfg = JSON.parse(fs.readFileSync('.changeset/config.json', 'utf8'))
const fixed = (cfg.fixed && cfg.fixed[0]) || []
const dirs = ['packages', 'apps'].flatMap((root) =>
  fs.existsSync(root) ? fs.readdirSync(root).map((d) => path.join(root, d)) : []
)
const byName = {}
for (const dir of dirs) {
  const pj = path.join(dir, 'package.json')
  if (!fs.existsSync(pj)) continue
  const p = JSON.parse(fs.readFileSync(pj, 'utf8'))
  if (fixed.includes(p.name)) byName[p.name] = { dir, p }
}
for (const name of fixed) {
  if (!byName[name]) { console.error('MISSING_DIR ' + name); process.exit(3) }
  if (byName[name].p.private) { console.error('PRIVATE ' + name); process.exit(3) }
}
const ordered = []
const visit = (name, seen = new Set()) => {
  if (ordered.includes(name)) return
  if (seen.has(name)) { console.error('CYCLE ' + name); process.exit(3) }
  seen.add(name)
  const { p } = byName[name]
  for (const dep of Object.keys({ ...p.dependencies, ...p.peerDependencies })) {
    if (byName[dep]) visit(dep, seen)
  }
  ordered.push(name)
}
for (const name of fixed) visit(name)
for (const name of ordered) console.log([name, byName[name].dir, byName[name].p.version].join('\t'))
NODE
)
[ "${#PKG_LINES[@]}" -gt 0 ] || die "no packages found in .changeset/config.json fixed[0]"

# ---- version (lockstep) ---------------------------------------------------
VERSION="$(printf '%s\n' "${PKG_LINES[@]}" | cut -f3 | sort -u)"
[ "$(printf '%s\n' "$VERSION" | wc -l | tr -d ' ')" = 1 ] \
  || die "packages in the fixed group have different versions:
$(printf '%s\n' "${PKG_LINES[@]}" | cut -f1,3)"

# ---- dist-tag -------------------------------------------------------------
if [ -z "$DIST_TAG" ]; then
  case "$VERSION" in *-*) DIST_TAG=next ;; *) DIST_TAG=latest ;; esac
fi
case "$DIST_TAG" in
  latest)
    case "$VERSION" in *-*) die "refusing to publish prerelease ${VERSION} under 'latest'" ;; esac ;;
  next) ;;
  *) die "unsupported dist-tag '${DIST_TAG}' (use latest or next)" ;;
esac

# ---- preflight reporting --------------------------------------------------
ANCHOR="$(git rev-parse HEAD)"
ANCHOR_SHORT="$(git rev-parse --short HEAD)"
HEAD_SUBJECT="$(git log -1 --pretty=%s)"

info "Modulus lockstep publish"
echo "  repo:     $REPO_ROOT"
echo "  version:  ${BOLD}${VERSION}${RESET}"
echo "  dist-tag: ${BOLD}${DIST_TAG}${RESET}"
echo "  anchor:   ${ANCHOR_SHORT}  ${DIM}${HEAD_SUBJECT}${RESET}"
echo "  packages: ${#PKG_LINES[@]}  (from .changeset/config.json fixed[0], in dependency order)"
[ "$DRY_RUN" -eq 1 ] && warn "  mode:     DRY RUN (no publish / no tags / no push)"
echo

# Soft check: HEAD should be the release commit.
case "$HEAD_SUBJECT" in
  "chore(release): $VERSION") : ;;
  *) warn "HEAD subject is not 'chore(release): $VERSION' — make sure you're on the release commit before tagging." ;;
esac

if [ -n "$(git status --porcelain)" ]; then
  warn "Working tree is not clean:"
  git status --short
  warn "Tags will point at $ANCHOR_SHORT regardless. Commit the version bump (and stash/revert unrelated changes) before tagging."
  echo
fi

# ---- determine work: what's already published -----------------------------
TO_PUBLISH=()   # "name\tdir\tversion"
ALREADY=()      # name
for line in "${PKG_LINES[@]}"; do
  name="${line%%$'\t'*}"
  published="$(npm view "${name}@${VERSION}" version 2>/dev/null || true)"
  if [ "$published" = "$VERSION" ]; then
    ALREADY+=("$name")
  else
    TO_PUBLISH+=("$line")
  fi
done

if [ "${#ALREADY[@]}" -gt 0 ]; then
  echo "${DIM}Already published at ${VERSION} (skipping):${RESET}"
  for n in "${ALREADY[@]}"; do echo "  ${DIM}- $n${RESET}"; done
  echo
fi

if [ "${#TO_PUBLISH[@]}" -eq 0 ]; then
  ok "All ${#PKG_LINES[@]} packages already published at ${VERSION}."
else
  info "To publish (${#TO_PUBLISH[@]}), in order:"
  for line in "${TO_PUBLISH[@]}"; do echo "  - ${line%%$'\t'*}"; done
  echo
fi

# ---- confirm --------------------------------------------------------------
if [ "$DRY_RUN" -eq 0 ] && [ "${#TO_PUBLISH[@]}" -gt 0 ] && [ "$ASSUME_YES" -eq 0 ]; then
  read -r -p "Publish ${#TO_PUBLISH[@]} package(s) at ${VERSION} under '${DIST_TAG}' to npm? This is not reversible. [y/N] " reply
  case "$reply" in [yY]|[yY][eE][sS]) : ;; *) die "aborted by user" ;; esac
  echo
fi

# Sweep any pack tarballs on exit (normal, error, or interrupt) so a failed
# publish never leaves a stray *.tgz behind in a package dir.
cleanup_tarballs() {
  for line in "${PKG_LINES[@]}"; do
    dir="$(printf '%s' "$line" | cut -f2)"
    find "$REPO_ROOT/$dir" -maxdepth 1 -name '*.tgz' -delete 2>/dev/null || true
  done
}
trap cleanup_tarballs EXIT INT TERM

# ---- build ----------------------------------------------------------------
if [ "$DO_BUILD" -eq 1 ] && { [ "${#TO_PUBLISH[@]}" -gt 0 ] || [ "$DRY_RUN" -eq 1 ]; }; then
  info "Building packages…"
  FILTERS=()
  for line in "${PKG_LINES[@]}"; do FILTERS+=("--filter=${line%%$'\t'*}"); done
  pnpm turbo run build "${FILTERS[@]}"
  echo
fi

# ---- pack + publish -------------------------------------------------------
TAGS_TO_PUSH=()

ensure_tag() {
  local tag="$1"
  if git rev-parse -q --verify "refs/tags/${tag}" >/dev/null 2>&1; then
    local at; at="$(git rev-list -n1 "${tag}")"
    if [ "$at" != "$ANCHOR" ]; then
      warn "tag ${tag} exists but points at ${at:0:8}, not ${ANCHOR_SHORT} — leaving as-is"
    fi
  else
    git tag "${tag}" "${ANCHOR}"
    echo "  tagged ${tag}"
  fi
  TAGS_TO_PUSH+=("${tag}")
}

# A dry run packs and verifies the whole set, whatever the registry reports;
# skipping already-published versions applies only to a real publish.
if [ "$DRY_RUN" -eq 1 ]; then
  PACK_LINES=("${PKG_LINES[@]}")
else
  PACK_LINES=("${TO_PUBLISH[@]}")
fi

# Repository-only files that must never ship (see scripts/check-packages.sh).
FORBIDDEN='\.(test|itest)(\.node)?\.(js|d\.ts)|/test-support/|/fixtures/|/database/seeds/'

for line in "${PACK_LINES[@]}"; do
  name="$(printf '%s' "$line" | cut -f1)"
  dir="$(printf '%s' "$line" | cut -f2)"
  echo "${BOLD}── ${name} ──${RESET}"
  (
    cd "$dir"
    rm -f ./*.tgz
    pnpm pack >/dev/null 2>&1 || { echo "${RED}pnpm pack failed${RESET}"; exit 1; }
    tgz="$(ls -t ./*.tgz 2>/dev/null | head -1)"
    [ -n "$tgz" ] || { echo "${RED}no tarball produced${RESET}"; exit 1; }
    # Guard: no unrewritten workspace: deps may ship.
    if tar -xzO -f "$tgz" package/package.json | grep -q '"workspace:'; then
      echo "${RED}WORKSPACE LEAK in $tgz — refusing to publish${RESET}"; exit 1
    fi
    # Guard: the build output must be in the tarball (e.g. not --no-build
    # without a prior build).
    if ! tar -tzf "$tgz" | grep -q '^package/dist/'; then
      echo "${RED}no dist/ in $tgz — build the package first${RESET}"; exit 1
    fi
    # Guard: no tests, test support, fixtures or development seeds.
    if tar -tzf "$tgz" | grep -qE "$FORBIDDEN"; then
      echo "${RED}repository-only files in $tgz — refusing to publish:${RESET}"
      tar -tzf "$tgz" | grep -E "$FORBIDDEN" | head -10
      exit 1
    fi
    if [ "$DRY_RUN" -eq 1 ]; then
      echo "  ${DIM}dry-run: packed $(basename "$tgz"), verified clean (not publishing)${RESET}"
    else
      # `set -e` is suppressed inside a command list tested by `||` (this
      # subshell is), so a failed publish would otherwise fall through to the
      # trailing `rm` and the subshell would exit 0. Propagate npm's status.
      npm publish "$tgz" --access public --tag "$DIST_TAG" || exit 1
    fi
    rm -f ./*.tgz
  ) || die "failed on ${name} — fix and re-run (already-published packages will be skipped)"

  [ "$DRY_RUN" -eq 0 ] && ensure_tag "${name}@${VERSION}"
  echo
done

# Also ensure tags for packages that were already published (idempotent
# top-up), so a resumed run still completes the tag set.
if [ "$DRY_RUN" -eq 0 ]; then
  for n in "${ALREADY[@]}"; do ensure_tag "${n}@${VERSION}"; done
fi

# ---- push tags ------------------------------------------------------------
if [ "$DRY_RUN" -eq 0 ] && [ "${#TAGS_TO_PUSH[@]}" -gt 0 ]; then
  info "Pushing ${#TAGS_TO_PUSH[@]} per-package tag(s)…"
  git push origin "${TAGS_TO_PUSH[@]}"
  echo
fi

# ---- done -----------------------------------------------------------------
if [ "$DRY_RUN" -eq 1 ]; then
  ok "Dry run complete — all tarballs packed and verified clean. Nothing published."
else
  ok "Done: ${#PKG_LINES[@]} packages live at ${VERSION} under '${DIST_TAG}', tags pushed."
  echo
  warn "Registry propagation can take up to 5 minutes."
  echo "  ${DIM}A package missing from a post-publish check is NOT proof it failed —${RESET}"
  echo "  ${DIM}npm's registry views are CDN-cached. Wait and re-check before${RESET}"
  echo "  ${DIM}re-running this script. A real failure exits non-zero here instead.${RESET}"
  echo
  info "Next — hand back to Claude for the umbrella release:"
  echo "  • fast-forward main to ${ANCHOR_SHORT} (if not already) and push"
  echo "  • create + push the umbrella tag  v${VERSION}"
  echo "  • create the GitHub release  v${VERSION}  with the cycle notes"
  echo
  echo "  ${DIM}(or finish /release at Step 10 onward)${RESET}"
fi
