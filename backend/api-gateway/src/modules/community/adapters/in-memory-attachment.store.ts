import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { AttachmentStorePort, type StoredFile } from "../ports/attachment-store.port";

const TTL_MS = 24 * 60 * 60_000;
const MAX_TOTAL_BYTES = 200 * 1024 * 1024;

/** 메모리 어댑터: 24시간 · 전체 200MB를 넘으면 오래된 것부터 지운다. */
@Injectable()
export class InMemoryAttachmentStore extends AttachmentStorePort {
  private readonly files = new Map<string, StoredFile & { savedAt: number }>();
  private total = 0;

  async save(file: Omit<StoredFile, "id">) {
    this.evict(file.data.length);
    const id = randomUUID().replace(/-/g, "");
    this.files.set(id, { ...file, id, savedAt: Date.now() });
    this.total += file.data.length;
    const { name, mimetype, size, kind } = file;
    return { id, name, mimetype, size, kind };
  }

  async get(id: string) {
    const f = this.files.get(id);
    if (!f || Date.now() - f.savedAt > TTL_MS) return null;
    return f;
  }

  private evict(incoming: number) {
    const now = Date.now();
    for (const [id, f] of this.files) {
      const expired = now - f.savedAt > TTL_MS;
      if (!expired && this.total + incoming <= MAX_TOTAL_BYTES) break; // Map은 삽입 순서 = 오래된 순
      this.files.delete(id);
      this.total -= f.data.length;
    }
  }
}
