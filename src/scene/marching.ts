/**
 * Marching tetrahedra on a coarse regular grid.
 *
 * values: Float32Array(nx*ny*nz), NaN or masked cells are skipped.
 * Axes: x = lon index, y = lat index, z = depth index.
 * posAt maps indices -> world coordinates (already exaggerated).
 */
export function marchingTetrahedra(
  values: Float32Array,
  valid: Uint8Array,
  nx: number,
  ny: number,
  nz: number,
  posAt: (ix: number, iy: number, iz: number) => [number, number, number],
  iso: number
): Float32Array {
  const tris: number[] = []

  // cube corner offsets: bottom face (z), then top (z+1)
  const CORNERS: [number, number, number][] = [
    [0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0],
    [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1],
  ]
  // 6-tetrahedron decomposition of the cube (all share diagonal v0-v6)
  const TETS = [
    [0, 5, 1, 6],
    [0, 1, 2, 6],
    [0, 2, 3, 6],
    [0, 3, 7, 6],
    [0, 7, 4, 6],
    [0, 4, 5, 6],
  ]

  const idx = (x: number, y: number, z: number) => x + nx * (y + ny * z)

  function corner(x: number, y: number, z: number, c: number) {
    const o = CORNERS[c]
    return {
      gx: x + o[0], gy: y + o[1], gz: z + o[2],
      v: values[idx(x + o[0], y + o[1], z + o[2])],
      ok: valid[idx(x + o[0], y + o[1], z + o[2])] === 1,
    }
  }

  function interp(a: ReturnType<typeof corner>, b: ReturnType<typeof corner>) {
    const t = (iso - a.v) / (b.v - a.v)
    return posAt(
      a.gx + (b.gx - a.gx) * t,
      a.gy + (b.gy - a.gy) * t,
      a.gz + (b.gz - a.gz) * t
    )
  }

  const cache = new Map<number, ReturnType<typeof corner>>()
  function C(x: number, y: number, z: number, c: number) {
    return corner(x, y, z, c)
  }
  void cache

  for (let z = 0; z < nz - 1; z++) {
    for (let y = 0; y < ny - 1; y++) {
      for (let x = 0; x < nx - 1; x++) {
        for (let ti = 0; ti < TETS.length; ti++) {
          const tet = TETS[ti]
          const cs = [
            C(x, y, z, tet[0]),
            C(x, y, z, tet[1]),
            C(x, y, z, tet[2]),
            C(x, y, z, tet[3]),
          ]
          if (!cs.every((c) => c.ok && Number.isFinite(c.v))) continue

          let mask = 0
          for (let i = 0; i < 4; i++) if (cs[i].v >= iso) mask |= 1 << i
          if (mask === 0 || mask === 15) continue

          // edges of a tetra: all 6 pairs
          const EDGES = [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]]
          const pts: [number, number, number][] = []
          for (const [a, b] of EDGES) {
            const inA = (mask >> a) & 1
            const inB = (mask >> b) & 1
            if (inA !== inB) pts.push(interp(cs[a], cs[b]))
          }

          if (pts.length === 3) {
            pushTri(tris, pts[0], pts[1], pts[2])
          } else if (pts.length === 4) {
            // choose split keeping consistent-ish winding
            if (ti % 2 === 0) {
              pushTri(tris, pts[0], pts[1], pts[2])
              pushTri(tris, pts[0], pts[2], pts[3])
            } else {
              pushTri(tris, pts[0], pts[1], pts[3])
              pushTri(tris, pts[0], pts[3], pts[2])
            }
          }
        }
      }
    }
  }

  return new Float32Array(tris)
}

function pushTri(arr: number[], a: number[], b: number[], c: number[]) {
  arr.push(...a, ...b, ...c)
}
