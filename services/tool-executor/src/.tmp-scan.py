import re, pathlib
SRC = pathlib.Path(".")
bad = []
for p in sorted(SRC.rglob("*.ts")):
    t = p.read_text()
    for m in re.finditer(r"(?:from|import|require\()\s*(?P<q>['\"])(?P<s>[^'\"\n]*)(?P=q)", t):
        s = m.group("s")
        if any(c.isspace() for c in s) or (s.startswith(".") and len(s) > 1 and "/" in s and " " in s):
            line = t[:m.start()].count("\n") + 1
            bad.append((p, line, s))
for p, line, s in bad:
    print(f"{p}:{line}: {s[:90]!r}")
print("total", len(bad))
