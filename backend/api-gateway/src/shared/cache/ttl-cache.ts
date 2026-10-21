/** 단순 TTL 캐시: 같은 국가·지표를 반복 조회할 때 엔진·외부 API 호출을 줄인다. */
export class TtlCache<V> {
  private readonly store = new Map<string, { value: V; expires: number }>();

  constructor(private readonly ttlMs: number, private readonly maxEntries = 500) {}

  async getOrLoad(key: string, load: () => Promise<V>): Promise<V> {
    const hit = this.store.get(key);
    if (hit && hit.expires > Date.now()) return hit.value;
    const value = await load();
    if (this.store.size >= this.maxEntries) this.store.delete(this.store.keys().next().value as string);
    this.store.set(key, { value, expires: Date.now() + this.ttlMs });
    return value;
  }

  get size() {
    return this.store.size;
  }
}
