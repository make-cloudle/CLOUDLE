"use client";

import { useEffect, useRef, useState } from "react";
import { ApiError, type ChatMessage, chat, chatHistory, type Evidence } from "@/shared/api/client";
import { useT } from "@/shared/lib/i18n";
import { usePrefs } from "@/shared/lib/prefs";
import { CloudMascot } from "@/entities/mascot/characters";
import { AttachmentBar, type AttachedPhoto } from "@/features/cloud-lab/Attachments";
import { Cited, SourceList } from "@/entities/evidence/Evidence";
import { IconX } from "@/shared/ui/icons";
import { Alert, Button, Overline, Tag, cx } from "@/shared/ui/primitives";

/** 선택한 물건에 대한 후속 질문. 기록은 (세션, 품목) 단위로 분리된다 (F2009). */
export function ChatPanel({ itemId, itemName }: { itemId: string; itemName: string }) {
  const t = useT();
  const lang = usePrefs((s) => s.lang);
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [photos, setPhotos] = useState<AttachedPhoto[]>([]);
  const [docs, setDocs] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [sources, setSources] = useState<Evidence[]>([]);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    chatHistory(itemId)
      .then((d) => alive && setHistory(d.history))
      .catch(() => alive && setHistory([]));
    return () => {
      alive = false;
    };
  }, [itemId]);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [history.length]);

  const send = async () => {
    const labels = photos.flatMap((p) => p.labels);
    const q = [text.trim(), labels.length ? `(사진: ${labels.join(", ")})` : ""].filter(Boolean).join(" ");
    if (!q || busy) return;
    setBusy(true);
    setError("");
    setHistory((h) => [...h, { role: "user", content: q }]);
    setText("");
    setPhotos([]);
    try {
      const r = await chat(itemId, q, lang);
      setHistory(r.history);
      setSources(r.answer.sources);
    } catch (e) {
      setError(e instanceof ApiError && e.code === "rate_limited" ? t("rate_limited")
        : e instanceof ApiError && e.message && e.code !== "network" ? e.message : t("error_generic"));
    } finally {
      setBusy(false);
    }
  };

  const cite = (n: number) => document.getElementById(`chat-src-${n}`)?.scrollIntoView({ behavior: "smooth", block: "center" });

  return (
    <section aria-label={t("chat_title")} className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      <div className="flex flex-col gap-4 lg:col-span-7">
        <div>
          <Overline>{itemName}</Overline>
          <h2 className="text-xl font-bold tracking-tight">{t("chat_title")}</h2>
        </div>

        <ol className="flex flex-col gap-3">
          {history.map((m, i) => (
            <li key={i} className={cx("flex items-end gap-2", m.role === "user" && "justify-end")}>
              {m.role === "assistant" && <CloudMascot mood="presenting" className="h-10 w-12 shrink-0" />}
              <div className={cx("max-w-[85%] rounded-[20px] px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap",
                m.role === "user" ? "rounded-br-md bg-accent text-accent-ink" : "rounded-bl-md bg-surface shadow-soft")}>
                {m.role === "assistant" ? <Cited text={m.content} onCite={cite} /> : m.content}
                {m.role === "assistant" && m.citations && m.citations.length === 0 && (
                  <p className="mt-1.5 text-[12px] text-ink-3">{t("chat_no_cite")}</p>
                )}
              </div>
            </li>
          ))}
          {busy && <li className="flex items-end gap-2"><CloudMascot mood="thinking" className="h-10 w-12" /></li>}
        </ol>
        <div ref={end} />
        {error && <Alert tone="error">{error}</Alert>}

        {/* 종이 모양 입력창: 글은 줄 위에, 사진은 글 아래에, 첨부 버튼은 맨 아래 */}
        <form
          className="paper px-5 pt-4 pb-3 pl-12"
          onSubmit={(e) => { e.preventDefault(); send(); }}
        >
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }}
            placeholder={t("chat_ph")}
            rows={3}
            maxLength={1000}
            className="paper-field"
            aria-label={t("chat_ph")}
          />
          {photos.length > 0 && (
            <ul className="mt-1 flex flex-wrap gap-2">
              {photos.map((p) => (
                <li key={p.id} className="relative w-20 rounded-sm bg-surface p-1 pb-4 shadow-soft">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.url} alt={p.name} className="aspect-square w-full object-cover" />
                  {p.labels[0] && <p className="truncate text-[10px] text-ink-2">{p.labels[0]}</p>}
                  <button type="button" onClick={() => setPhotos((ps) => ps.filter((x) => x.id !== p.id))}
                    aria-label={t("remove")}
                    className="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full bg-surface shadow-soft">
                    <IconX size={10} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {docs.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1.5">{docs.map((d) => <Tag key={d} tone="sky">{d}</Tag>)}</div>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-1 border-t border-dashed border-line-strong pt-2">
            <AttachmentBar
              photoLimitReached={photos.length >= 3}
              onPhoto={(p) => setPhotos((ps) => [...ps, p])}
              onDoc={(d) => setDocs((ds) => [...ds, d.name])}
              onError={setNotice}
              disabled={busy}
            />
            <Button type="submit" variant="primary" size="sm" loading={busy} className="ml-auto">{t("send")}</Button>
          </div>
          {notice && <p className="mt-1 text-xs text-ink-3" role="status">{notice}</p>}
        </form>
      </div>

      <aside className="lg:col-span-5">
        {sources.length > 0 && (
          <>
            <Overline className="mb-2">{t("sources")}</Overline>
            <div className="[&_li]:scroll-mt-24">
              <SourceList sources={sources} active={null} idPrefix="chat-src" />
            </div>
          </>
        )}
      </aside>
    </section>
  );
}
