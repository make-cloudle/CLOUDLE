"use client";

import { useEffect, useRef, useState } from "react";
import { ApiError, claimNickname } from "@/shared/api/client";
import { useT } from "@/shared/lib/i18n";
import { rememberNickname, savedNickname } from "@/shared/lib/nickname";
import { Alert, Button, Card, Input, Overline } from "@/shared/ui/primitives";

/**
 * 트레일 입장 조건: 닉네임을 정해 랭킹에 등록해야 들어갈 수 있다(로그인은 없다).
 * 이 브라우저에 저장된 이름이 있으면 자동으로 다시 등록하고, 이미 다른 사람이 쓰는 이름이면 그 자리에서 고친다.
 */
export function NicknameGate({ onEnter }: { onEnter: (nickname: string) => void }) {
  const t = useT();
  const [nick, setNick] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [auto, setAuto] = useState(false); // 저장된 이름으로 자동 입장을 시도하는 중인지
  const ran = useRef(false);

  const submit = async (name: string, silent = false) => {
    setBusy(true); setError(""); setAuto(silent);
    try {
      const r = await claimNickname(name);
      rememberNickname(r.nickname);
      onEnter(r.nickname);
    } catch (e) {
      setError(e instanceof ApiError && e.code !== "network" && e.message ? e.message : t("pz_rank_offline"));
      if (silent) setNick(name);
    } finally { setBusy(false); setAuto(false); }
  };

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const saved = savedNickname();
    // 들어올 때 한 번, 저장된 이름으로 서버에 다시 등록하는 요청 (외부 시스템과의 동기화)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved) void submit(saved, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (auto) return <p className="py-10 text-center text-[14px] text-ink-3" aria-live="polite">{t("pz_gate_checking")}</p>;

  return (
    <Card className="mx-auto w-full max-w-md">
      <Overline>Sorting Trail</Overline>
      <h2 className="mt-1 text-[24px] leading-tight font-extrabold tracking-[-0.02em]">{t("pz_gate_title")}</h2>
      <p className="mt-2 text-[14px] leading-relaxed text-ink-2">{t("pz_gate_desc")}</p>
      <form className="mt-5" onSubmit={(e) => { e.preventDefault(); void submit(nick.trim()); }}>
        <label htmlFor="gate-nick" className="text-[13px] font-semibold">{t("talk_nick_label")}</label>
        <Input id="gate-nick" className="mt-1.5" value={nick} maxLength={12} autoFocus autoComplete="nickname" enterKeyHint="go"
          placeholder={t("pz_gate_ph")} invalid={!!error} aria-describedby="gate-nick-hint"
          onChange={(e) => { setNick(e.target.value); setError(""); }} />
        <p id="gate-nick-hint" className="mt-1.5 text-[12px] text-ink-3">{t("pz_gate_hint")}</p>
        {error && <div className="mt-3"><Alert tone="error">{error}</Alert></div>}
        <Button type="submit" variant="primary" size="lg" className="mt-4 w-full" loading={busy} disabled={!nick.trim()}>{t("pz_gate_enter")}</Button>
      </form>
    </Card>
  );
}
