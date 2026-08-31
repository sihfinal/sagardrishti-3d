"""Run the full ingestion pipeline: WOA23 + Argo + Glider -> public/data."""
from __future__ import annotations

import os
import sys
import traceback
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from common import DATA_DIR, ensure_data_dir, finalize_manifest, write_json  # noqa: E402


def main():
    ensure_data_dir()
    stages = set(sys.argv[1:]) or {"woa", "profiles"}
    variables = []
    grid = None

    if "woa" in stages:
        import fetch_woa
        try:
            fetch_woa.main()
            import json
            meta = json.load(open(fetch_woa.CACHE / "woa_meta.json"))
            variables = meta["variables"]
            grid = meta["grid"]
        except Exception as e:  # noqa: BLE001
            print(f"WOA FAILED: {e}")
            traceback.print_exc()

    platforms = []
    counts = {"argo": 0, "glider": 0}
    if "profiles" in stages:
        try:
            from fetch_argo import fetch_argo
            argo = fetch_argo(max_cycles=3, max_points=120)
            counts["argo"] = len(argo)
            platforms.extend(argo)
        except Exception as e:  # noqa: BLE001
            print(f"ARGO FAILED: {e}")
            traceback.print_exc()

        try:
            from fetch_glider import fetch_glider
            gliders = fetch_glider(max_cycles=4, max_points=120)
            counts["glider"] = len(gliders)
            platforms.extend(gliders)
        except Exception as e:  # noqa: BLE001
            print(f"GLIDER FAILED: {e}")
            traceback.print_exc()

        write_json("profiles.json", {"platforms": platforms})

    if grid is None:
        import json
        meta_path = Path(__file__).resolve().parent / "_cache_woa" / "woa_meta.json"
        if meta_path.exists():
            meta = json.load(open(meta_path))
            grid = meta["grid"]
            variables = meta["variables"]
            print("using cached WOA meta for manifest")
        else:
            print("no grid available — keeping previous manifest if present")
            return 1

    total = sum(os.path.getsize(DATA_DIR / f["file"]) for f in variables)
    # always derive profile meta from the artifact itself so partial runs
    # never clobber correct provenance
    import json
    prof_path = DATA_DIR / "profiles.json"
    if prof_path.exists():
        plats = json.load(open(prof_path))["platforms"]
        counts = {"argo": 0, "glider": 0}
        for pl in plats:
            counts[pl["type"]] = counts.get(pl["type"], 0) + 1
        platforms = plats
    profiles_meta = {
        "file": "profiles.json",
        "count": len(platforms),
        "platformsByType": counts,
    }
    finalize_manifest(grid, variables, profiles_meta)
    print(f"manifest written; field bins total {total/1024:.0f} KB; "
          f"profiles {len(platforms)} ({counts})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
