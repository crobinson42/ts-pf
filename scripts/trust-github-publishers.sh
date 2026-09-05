#!/usr/bin/env bash
# Create a GitHub Actions trusted publisher on every published @ts-pf/* package.
# Run locally with interactive 2FA (npm login / web auth). A granular access
# token with bypass-2FA cannot call `npm trust`.
#
# First prompt: complete 2FA and enable "skip 2FA for 5 minutes" on npmjs.com.
# Requires npm 11.15.0+.
set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)
repo=crobinson42/ts-pf
file=release.yml

npm_ver=$(npm --version)
IFS=. read -r maj min _ <<<"$npm_ver"
if (( maj < 11 || (maj == 11 && min < 15) )); then
  echo "npm $npm_ver is too old for npm trust (need 11.15.0+). Run: npm install -g npm@latest" >&2
  exit 1
fi

pkgs=()
for pkg_json in "$root"/packages/*/package.json; do
  name=$(node -p "require(process.argv[1]).name" "$pkg_json")
  private=$(node -p "Boolean(require(process.argv[1]).private)" "$pkg_json")
  if [[ $private == true ]]; then
    continue
  fi
  pkgs+=("$name")
done

if [[ ${#pkgs[@]} -eq 0 ]]; then
  echo "no public packages found under packages/" >&2
  exit 1
fi

echo "Creating GitHub trusted publishers:"
echo "  repo $repo  workflow $file  --allow-publish"
printf '  %s\n' "${pkgs[@]}"
echo

for pkg in "${pkgs[@]}"; do
  echo "== $pkg"
  npm trust github "$pkg" --file "$file" --repo "$repo" --allow-publish -y
  sleep 2
done

echo "done. Re-run the GitHub Actions release workflow."
