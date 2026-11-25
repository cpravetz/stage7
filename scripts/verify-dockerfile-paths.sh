#!/usr/bin/env bash
# Static verification of Docker build definitions (no docker daemon required).
# 1. Every COPY/ADD source path in every Dockerfile must exist in the repo tree.
# 2. Every service built with `npx tsc` must have package.json + tsconfig.json.
# 3. docker-compose.yaml build.dockerfile paths must exist.
set -u

cd "$(git rev-parse --show-toplevel)"
fail=0
dockerfiles=$(find . \( -path ./.git -o -path '*/node_modules' \) -prune -o -type f -iname '[Dd]ockerfile*' -print | sort)

for df in $dockerfiles; do
  echo "=== $df ==="
  while IFS= read -r line; do
    lineno=${line%%:*}
    instr=${line#*:}
    if echo "$instr" | grep -q -- '--from='; then
      echo "  SKIP (stage copy, line $lineno)"
      continue
    fi
    # strip the COPY/ADD verb and its flags, then drop the final token (dest)
    rest=$(echo "$instr" | sed -E 's/^(COPY|ADD)([[:space:]]+--[a-zA-Z=,"_ .\/-]+)*[[:space:]]+//')
    srcs=$(echo "$rest" | awk '{$NF=""; print}' | tr -d '"' | tr ' ' '\n' | grep -v '^$')
    for s in $srcs; do
      if [ -e "$s" ] || compgen -G "$s" > /dev/null 2>&1; then
        echo "  OK   $s"
      else
        echo "  FAIL $s (missing) [$df:$lineno]"
        fail=1
      fi
    done
  done < <(grep -nE '^[[:space:]]*(COPY|ADD)[[:space:]]' "$df")
done

echo "=== tsc build targets (package.json + tsconfig.json present) ==="
for df in $dockerfiles; do
  while IFS= read -r svc; do
    [ -z "$svc" ] && continue
    for f in "$svc/package.json" "$svc/tsconfig.json"; do
      if [ -e "$f" ]; then
        echo "  OK   $f"
      else
        echo "  FAIL $f (missing, needed by $df)"
        fail=1
      fi
    done
  done < <(grep -oE 'cd services/[a-z-]+' "$df" | sed 's|cd ||' | sort -u)
done

echo "=== docker-compose.yaml build definitions ==="
if python3 - <<'EOF'
import sys, os
try:
    import yaml
except ImportError:
    print("  SKIP (pyyaml unavailable)"); sys.exit(0)
with open('docker-compose.yaml') as f:
    compose = yaml.safe_load(f)
ok = True
for name, svc in compose.get('services', {}).items():
    build = svc.get('build') or {}
    if not build:
        print(f"  SKIP {name} (no build)")
        continue
    dfile = build.get('dockerfile')
    if dfile is None:
        print(f"  OK   {name} (context-only build)")
        continue
    p = os.path.join(build.get('context', '.'), dfile)
    if os.path.exists(p):
        print(f"  OK   {name}: {p}")
    else:
        print(f"  FAIL {name}: {p} (missing)")
        ok = False
sys.exit(0 if ok else 1)
EOF
then :; else fail=1; fi

echo
if [ "$fail" -eq 0 ]; then echo "RESULT: ALL CHECKS PASSED"; else echo "RESULT: FAILURES DETECTED"; fi
exit $fail
