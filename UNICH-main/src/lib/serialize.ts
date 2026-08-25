/* eslint-disable @typescript-eslint/no-explicit-any */

export function toJSON<T extends Record<string, any>>(doc: T | null | undefined) {
  if (!doc) return null;
  const obj = typeof (doc as any).toObject === "function" ? (doc as any).toObject() : { ...doc };
  const id = String(obj._id ?? obj.id);
  delete obj._id;
  delete obj.__v;
  return { ...obj, id } as T & { id: string };
}

export function toJSONList<T extends Record<string, any>>(docs: T[]) {
  return docs.map((d) => toJSON(d)!);
}
