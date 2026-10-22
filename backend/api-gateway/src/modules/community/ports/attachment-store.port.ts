import type { Attachment } from "../domain/community.types";

export type StoredFile = Attachment & { roomId: string; data: Buffer };

/** 첨부 파일 저장소 포트 (메모리 · 오브젝트 스토리지 등) */
export abstract class AttachmentStorePort {
  abstract save(file: Omit<StoredFile, "id">): Promise<Attachment>;
  abstract get(id: string): Promise<StoredFile | null>;
}
