"use client";

import { useEffect, useState } from "react";
import { getRanking, type RankBoard, type RankRow } from "@/shared/api/client";
import { type DictKey, fill, useT } from "@/shared/lib/i18n";
import { Card, cx } from "@/shared/ui/primitives";
import type { Level } from "./stages";

type Tab = "all" | Level;
const TABS: Tab[] = ["all", "easy", "normal", "hard"];
const SHOW = 10;

/** 트레일 랭킹: 별 합계 → 클리어 수 → 점수 합계 순. 내 줄은 강조하고, 10위 밖이면 아래에 따로 보여 준다. */
export function RankingCard({ level, version }: { level: Level; version: number }) {
  const t = useT();
  const [tab, setTab] = useState<Tab>(level);
  const [shown, setShown] = useState<{ tab: Tab; version: number; board: RankBoard | null } | null>(null);

  // 탭이나 새 기록이 바뀔 때마다 서버에서 다시 받는다 (받는 동안은 이전 표를 그대로 둔다)
  useEffect(() => {
    let alive = true;
    getRanking(tab)
      .then((board) => alive && setShown({ tab, version, board }))
      .catch(() => alive && setShown({ tab, version, board: null }));
    return () => { alive = false; };
  }, [tab, version]);

  const board = shown?.tab === tab ? shown.board : null;
  const loading = !shown || shown.tab !== tab;
  const rows = board?.rows.slice(0, SHOW) ?? [];

  return (
    <Card>
      <h3 className="text-[15px] font-extrabold">{t("pz_rank")}</h3>
      <div role="tablist" aria-label={t("pz_rank")} className="mt-3 grid grid-cols-4 gap-1.5">
        {TABS.map((x) => (
          <button key={x} role="tab" type="button" aria-selected={tab === x} onClick={() => setTab(x)}
            className={cx("rounded-full px-2 py-1.5 text-[12px] font-bold transition-colors", tab === x ? "bg-accent text-accent-ink" : "bg-surface-2 text-ink-2 hover:text-ink")}>
            {x === "all" ? t("pz_rank_all") : t(`pz_lv_${x}` as DictKey)}
          </button>
        ))}
      </div>

      <div aria-live="polite" className="mt-3">
        {loading && <p className="text-[13px] text-ink-3">{t("pz_rank_loading")}</p>}
        {!loading && !board && <p className="text-[13px] text-ink-3">{t("pz_rank_offline")}</p>}
        {board && rows.length === 0 && <p className="text-[13px] leading-relaxed text-ink-3">{t("pz_rank_empty")}</p>}
        {board && rows.length > 0 && (
          <ol className="flex flex-col gap-1.5">
            {rows.map((r) => <Row key={r.rank} r={r} mine={board.me?.rank === r.rank} />)}
          </ol>
        )}
        {board?.me && board.me.rank > SHOW && (
          <>
            <p className="my-1 text-center text-[12px] text-ink-3" aria-hidden>···</p>
            <ol><Row r={board.me} mine /></ol>
          </>
        )}
        {board && !board.me && board.nickname && (
          <p className="mt-2 text-[12px] text-ink-3">{fill(t("pz_rank_no_record"), { name: board.nickname })}</p>
        )}
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-ink-3">{t("pz_rank_note")}</p>
    </Card>
  );
}

function Row({ r, mine }: { r: RankRow; mine?: boolean }) {
  const t = useT();
  return (
    <li className={cx("flex items-center gap-2.5 rounded-2xl px-3 py-2 text-[13px]", mine ? "bg-sky-soft ring-1 ring-sky" : "bg-surface-2")}>
      <span className="w-7 shrink-0 text-center text-[14px] font-extrabold tabular-nums">{r.rank}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-bold">{r.nickname}{mine && <span className="ml-1.5 text-[11px] font-semibold text-sky-deep">{t("pz_rank_me")}</span>}</span>
        <span className="block text-[11px] text-ink-3">{fill(t("pz_rank_meta"), { cleared: r.cleared, score: r.score.toLocaleString() })}</span>
      </span>
      <span className="shrink-0 text-[13px] font-extrabold tabular-nums">★ {r.stars}</span>
    </li>
  );
}
