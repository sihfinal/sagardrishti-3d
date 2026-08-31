import json

m = json.load(open("public/data/manifest.json"))
p = json.load(open("public/data/profiles.json"))

assert m["grid"]["nLat"] == len(m["grid"]["lats"])
assert m["grid"]["nLon"] == len(m["grid"]["lons"])
for v in m["variables"]:
    import os
    n = os.path.getsize(f"public/data/{v['file']}")
    expect = (v["dims"]["nDepth"] * v["dims"].get("nTime", 1)
              * m["grid"]["nLat"] * m["grid"]["nLon"])
    assert n == expect, f"{v['id']}: {n} != {expect}"
    print(f"OK {v['id']}: {v['dims']['nDepth']} depths, "
          f"[{v['globalMin']}, {v['globalMax']}] {v['unit']}")

plats = p["platforms"]
argo = [x for x in plats if x["type"] == "argo"]
gliders = [x for x in plats if x["type"] == "glider"]
print(f"platforms: {len(plats)} ({len(argo)} argo, {len(gliders)} glider)")
assert len(argo) >= 20 and len(gliders) >= 1

deep = 0
for pl in plats:
    for c in pl["cycles"]:
        for pt in c["profile"]:
            if pt["depthM"] > 500 and pt["tempC"] is not None:
                deep += 1
                break
        else:
            continue
        break
print(f"platforms with non-null temp below 500 m: {deep}")
assert deep >= 1

sst = next(v for v in m["variables"] if v["id"] == "sst_monthly")
print("sst months:", sst.get("times"))
print("GATE 1 PASS")
