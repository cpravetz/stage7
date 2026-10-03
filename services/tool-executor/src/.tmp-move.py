import re, pathlib, subprocess, sys

SRC = pathlib.Path("/mnt/1tbHD/ckt_web/stage7/services/tool-executor/src")
out = subprocess.run(["git","status","--porcelain","-M"], cwd=SRC.parent.parent, capture_output=True, text=True).stdout
RENAME = {}
for line in out.splitlines():
    p = line[3:].split(" -> ")
    if len(p)==2 and p[1].startswith("services/tool-executor/src/"):
        new = p[1][len("services/tool-executor/src/"):]
        RENAME[new.rsplit(".",1)[0]] = new

def norm(parts):
    o=[]
    for part in parts:
        if part in (".",""): continue
        if part=="..":
            o.pop() if o else o.append("..")
        else: o.append(part)
    return o

def rel(target, frm):
    c=0
    while c<min(len(target),len(frm)) and target[c]==frm[c]: c+=1
    ups=len(frm)-c; rest=target[c:]
    if not rest: return "./" if ups==0 else "../"*ups
    return ("../"*ups+"/".join(rest)) if ups else "./"+"/".join(rest)

moves = {
 "career": {"skills": ["career-application-execution-orchestrator","career-ats-providers-source","career-collector-source","career-feed-providers-source","career-job-discovery-fit-ranking","career-pipeline-outcome-tracker","career-runtime-source"]},
 "content": {"tools": ["content-external-schema"]},
 "event": {"skills": ["day-of-operations"]},
 "hotel": {"skills": ["reservations-manager"], "tools": ["hotel-external-common"]},
 "legal": {"skills": ["document-ops"]},
 "marketing": {"skills": ["campaign-execution-orchestrator"]},
 "restaurant": {"skills": ["manage-reservation"]},
}
for assistant, buckets in moves.items():
    for bucket, files in buckets.items():
        d = SRC/"assistants"/assistant/bucket
        d.mkdir(parents=True, exist_ok=True)
        for name in files:
            old = SRC/"assistants"/assistant/f"{name}.ts"
            if not old.exists(): print("skip", old); continue
            new = d/f"{name}.ts"
            subprocess.run(["git","mv",str(old),str(new)], cwd=SRC.parent.parent, check=True)
            rel_new = new.relative_to(SRC).with_suffix("").as_posix()
            if rel_new in RENAME:
                old_dir = norm(RENAME[rel_new].split("/")[:-1])
            else:
                old_dir = list(new.relative_to(SRC).parts[:-1])
            new_dir = list(new.relative_to(SRC).parts[:-1])
            t = new.read_text()
            def rw(m):
                q, spec = m.group(1), m.group(2)
                if not spec.startswith("."): return m.group(0)
                return q + rel(norm(old_dir + spec.split("/")), new_dir) + q
            t = re.sub(r"(?P<q>['\"])(\.[^'\"]*)(?P=q)", rw, t)
            new.write_text(t)
            print("moved", new.relative_to(SRC))
