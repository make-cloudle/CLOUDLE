"use client";

import { useRef, useState } from "react";
import { ApiError, identifyImage, uploadDoc, type VisionResult } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { CameraCapture } from "./CameraCapture";
import { IconCamera, IconClip, IconImage } from "../ui/icons";

export type AttachedPhoto = { id: string; url: string; name: string; labels: string[]; vision?: VisionResult };

const btn = "inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-sm text-ink-2 hover:bg-surface-2 hover:text-ink disabled:opacity-40";

/** 종이 하단 도구 막대: 파일 · 사진 · 카메라. 종이 입력창과 채팅 입력창이 같이 쓴다. */
export function AttachmentBar({ onPhoto, onDoc, onError, disabled, photoLimitReached }: {
  onPhoto: (p: AttachedPhoto) => void;
  onDoc: (d: { name: string; chunks: number }) => void;
  onError: (message: string) => void;
  disabled?: boolean;
  photoLimitReached?: boolean;
}) {
  const t = useT();
  const imgRef = useRef<HTMLInputElement>(null);
  const docRef = useRef<HTMLInputElement>(null);
  const [camera, setCamera] = useState(false);
  const [busy, setBusy] = useState(false);

  const addImage = async (blob: Blob, name: string) => {
    if (!blob.type.startsWith("image/") || blob.size > 5 * 1024 * 1024) return onError("png · jpg · webp ≤ 5MB");
    const photo: AttachedPhoto = { id: crypto.randomUUID(), url: URL.createObjectURL(blob), name, labels: [] };
    setBusy(true);
    try {
      const v = await identifyImage(blob, name);
      photo.labels = v.labels;
      photo.vision = v;
      if (v.message) onError(v.message);
    } catch (e) {
      onError(e instanceof ApiError ? e.message : t("error_generic"));
    } finally {
      setBusy(false);
      onPhoto(photo); // 인식에 실패해도 사진은 종이에 붙는다
    }
  };

  const addDocs = async (files: FileList | null) => {
    if (!files) return;
    setBusy(true);
    for (const f of Array.from(files)) {
      try {
        onDoc(await uploadDoc(f));
      } catch (e) {
        onError(e instanceof ApiError ? e.message : t("error_generic"));
      }
    }
    setBusy(false);
  };

  return (
    <>
      <button type="button" className={btn} onClick={() => docRef.current?.click()} disabled={disabled || busy}>
        <IconClip size={16} /> {t("attach_file")}
      </button>
      <button type="button" className={btn} onClick={() => imgRef.current?.click()} disabled={disabled || busy || photoLimitReached}>
        <IconImage size={16} /> {t("attach_image")}
      </button>
      <button type="button" className={btn} onClick={() => setCamera(true)} disabled={disabled || busy || photoLimitReached}>
        <IconCamera size={16} /> {t("attach_camera")}
      </button>
      {busy && <span className="ml-1 h-3.5 w-3.5 animate-spin rounded-full border-2 border-accent border-t-transparent" aria-label="uploading" />}
      <input ref={docRef} type="file" accept=".pdf,.txt,.md" multiple hidden
        onChange={(e) => { addDocs(e.target.files); e.target.value = ""; }} />
      <input ref={imgRef} type="file" accept="image/png,image/jpeg,image/webp" hidden
        onChange={(e) => { const f = e.target.files?.[0]; if (f) addImage(f, f.name); e.target.value = ""; }} />
      {camera && (
        <CameraCapture
          onClose={() => setCamera(false)}
          onCapture={(b) => { setCamera(false); addImage(b, `camera-${Date.now()}.jpg`); }}
        />
      )}
    </>
  );
}
