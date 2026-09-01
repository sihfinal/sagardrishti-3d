import type { FieldMeta } from "@/types"
import { fetchFieldBinary } from "./api"

const cache = new Map<string, Promise<Uint8Array>>()

export function getFieldData(meta: FieldMeta): Promise<Uint8Array> {
  let p = cache.get(meta.id)
  if (!p) {
    p = fetchFieldBinary(meta).then((buf) => new Uint8Array(buf))
    cache.set(meta.id, p)
  }
  return p
}
