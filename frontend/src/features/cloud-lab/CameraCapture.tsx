"use client";

import { useEffect, useRef, useState } from "react";
import { useT } from "@/shared/lib/i18n";
import { Alert, Button } from "@/shared/ui/primitives";

/** 컴퓨터·휴대폰 카메라에 물건을 비춰 사진을 찍는다. 스트림은 닫을 때 즉시 해제한다. */
export function CameraCapture({ onCapture, onClose }: {
  onCapture: (blob: Blob) => void;
  onClose: () => void;
}) {
  const t = useT();
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: "environment", width: { ideal: 1280 } }, audio: false })
      .then((s) => {
        if (!alive) return s.getTracks().forEach((tr) => tr.stop());
        stream.current = s;
        if (video.current) video.current.srcObject = s;
      })
      .catch(() => setError(true));
    if (!navigator.mediaDevices) queueMicrotask(() => setError(true));
    return () => {
      alive = false;
      stream.current?.getTracks().forEach((tr) => tr.stop());
    };
  }, []);

  const capture = () => {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    const c = document.createElement("canvas");
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext("2d")!.drawImage(v, 0, 0);
    c.toBlob((b) => b && onCapture(b), "image/jpeg", 0.85);
  };

  return (
    <div role="dialog" aria-modal="true" aria-label={t("attach_camera")}
      className="fixed inset-0 z-50 flex items-end justify-center bg-bg/70 p-4 sm:items-center">
      <div className="w-full max-w-lg rounded-[28px] bg-surface p-4 shadow-float">
        {error ? (
          <Alert tone="error">{t("camera_denied")}</Alert>
        ) : (
          <video ref={video} autoPlay playsInline muted className="aspect-video w-full rounded-2xl bg-surface-2 object-cover" />
        )}
        <div className="mt-3 flex gap-2">
          <Button variant="primary" onClick={capture} disabled={error} className="flex-1">{t("camera_capture")}</Button>
          <Button onClick={onClose} className="flex-1">{t("camera_close")}</Button>
        </div>
      </div>
    </div>
  );
}
