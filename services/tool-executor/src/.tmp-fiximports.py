import re, pathlib, subprocess, sys

ROOT = pathlib.Path("/mnt/1tbHD/ckt_web/stage7")
SRC = ROOT / "services/tool-executor/src"

out = subprocess.run(
    ["git", "diff", "--cached", "-M", "--name-status", "--", "services/tool-executor/src"],
    cwd=ROOT, capture_output=True, text=True).stdout

# module path (no extension) -> new module path
RENAME = {}
for line in out.splitlines():
    parts = line.split("\t")
    if parts[0].startswith("R") and len(parts) == 3:
        old, new = parts[1], parts[2]
        for p in (old, new):
            assert p.startswith("services/tool-executor/src/"), p
        RENAME[old[len("services/tool-executor/src/"):].rsplit(".",1)[0]] = \
              new[len("services/tool-executor/src/"):].rsplit(".",1)[0]

def normalise(parts):
    out = []
    for part in parts:
        if part in (".", ""):
            continue
        if part == "..":
            if out: out.pop()
            else: out.append("..")
        else:
            out.append(part)
    return out

def map_module(mod):
    """Map a module path that predates the relocation to its new home."""
    if mod in RENAME:
        return RENAME[mod].split("/")
    parts = mod.split("/")
    # data/skills/<assistant>/<rest> where <rest> may itself be a moved module
    if len(parts) >= 3 and parts[0] == "data" and parts[1] == "skills":
        tail = "/".join(parts[2:])
        if tail in RENAME:
            return RENAME["data/skills/" + tail].split("/")
        return ["__unmapped__"] + parts[2:]
    return parts

def relativise(target_parts, from_dir_parts):
    common = 0
    while common < min(len(target_parts), len(from_dir_parts)) and target_parts[common] == from_dir_parts[common]:
        common += 1
    ups = len(from_dir_parts) - common
    rest = target_parts[common:]
    if not rest:
        return "./" if ups == 0 else "../" * ups
    return ("../" * ups + "/".join(rest)) if ups else "./" + "/".join(rest)

changed = unmapped = 0
for path in sorted(SRC.rglob("*.ts")) + sorted(SRC.rglob("*.js")):
    rel = path.relative_to(SRC)
    old_rel = None
    for oldmod, newmod in RENAME.items():
        if newmod == str(rel).rsplit(".",1)[0]:
            old_rel = oldmod
            break
    if old_rel is None:
        continue

    old_dir = normalise(old_rel.split("/")[:-1])
    new_dir = rel.parts[:-1]
    text = path.read_text()
    orig = text

    def rewrite(m):
        global unmapped
        quote, spec = m.group(1), m.group(2)
        if not spec.startswith("."):
            return m.group(0)
        old_target = normalise(old_dir + spec.split("/"))
        mapped = map_module("/".join(old_target))
        if mapped[0] == "__unmapped__":
            unmapped += 1
            print(f"UNMAPPED {rel}: {spec} -> {'/'.join(old_target)}", file=sys.stderr)
            return m.group(0)
        return quote + relativise(mapped, new_dir) + quote

    text = re.sub(r"(?P<q>['\"])(\.[^'\"]*)(?P=q)", rewrite, text)
    if text != orig:
        path.write_text(text)
        changed += 1

print(f"rewrote {changed} files; {unmapped} unmapped")
