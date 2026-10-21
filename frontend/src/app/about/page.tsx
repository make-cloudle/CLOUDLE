"use client";

import Link from "next/link";
import { CloudMascot, EarthBuddy } from "@/entities/mascot/characters";
import { IconArrow } from "@/shared/ui/icons";
import { buttonClass, Card, Overline, Tag } from "@/shared/ui/primitives";
import type { Lang } from "@/shared/lib/i18n";
import { useT } from "@/shared/lib/i18n";
import { usePrefs } from "@/shared/lib/prefs";

type L = Record<Lang, string>;
const C = {
  lead: {
    ko: "CLOUDLE은 지구의 환경 문제를 보고 끝내지 않고, 내 물건을 다시 쓰는 행동으로 잇는 근거 기반 서비스예요.",
    en: "CLOUDLE turns what you see about the planet into action — giving your everyday things a second life, backed by evidence.",
    ja: "CLOUDLEは、地球の環境問題を知るだけで終わらせず、身近なモノを生かす行動へつなげる根拠ベースのサービスです。",
    zh: "CLOUDLE 让你不止看见环境问题，更把它变成让日常物品重获新生的行动。",
  } as L,
  steps: [
    { t: { ko: "지구 둘러보기", en: "Discover the planet", ja: "地球を見る", zh: "探索地球" }, d: { ko: "나라를 고르면 대기질·폐기물·자연현상 데이터를 출처와 함께 보여줘요.", en: "Pick a country to see air, waste and natural-event data with sources.", ja: "国を選ぶと大気・廃棄物・自然現象のデータを出典付きで表示します。", zh: "选择国家，查看带来源的空气、垃圾与自然事件数据。" } },
    { t: { ko: "문제 이해하기", en: "Understand the problem", ja: "問題を知る", zh: "理解问题" }, d: { ko: "구름에게 물어보면 관련 문서를 찾아 근거 번호와 함께 설명해요.", en: "Ask the cloud — it retrieves documents and answers with citations.", ja: "クラウドに聞くと、文書を探して根拠番号付きで説明します。", zh: "问问云朵，它会检索文档并附引用作答。" } },
    { t: { ko: "물건 분석하기", en: "Analyze an item", ja: "モノを分析", zh: "分析物品" }, d: { ko: "노트에 적고 구겨서, 또는 캔·페트병을 골라 쓰레기통에 던져요.", en: "Write it down and crumple it, or pick a can or bottle, and toss it in.", ja: "ノートに書いて丸めるか、缶やペットボトルを選んで投げ入れます。", zh: "写下并揉成团，或选择罐子、瓶子扔进桶里。" } },
    { t: { ko: "더 나은 선택", en: "Find a better solution", ja: "より良い選択", zh: "更好的选择" }, d: { ko: "수리·재사용·되팔기·재활용 방법을 원문 링크와 함께 알려줘요.", en: "Get repair, reuse, resale and recycling guidance with source links.", ja: "修理・再利用・売却・リサイクルの方法を原文リンク付きで案内します。", zh: "获得附原文链接的维修、再利用、转卖与回收建议。" } },
  ],
};
const SOURCES = [
  ["World Bank WDI", "PM2.5 · 인구", "CC BY 4.0"],
  ["NASA EONET", "자연현상 이벤트", "Public"],
  ["Wikipedia", "품목·국가 문서", "CC BY-SA 4.0"],
  ["Natural Earth", "국가 경계", "Public Domain"],
  ["OpenAQ", "실시간 대기질 (키 필요)", "데이터별 상이"],
  ["CLOUDLE 품목 152건", "RAG 1 메타데이터", "팀 작성"],
];

export default function AboutPage() {
  const t = useT();
  const lang = usePrefs((s) => s.lang);
  return (
    <div className="flex flex-col gap-12 pt-8 lg:pt-12">
      <section className="grid grid-cols-1 items-center gap-6 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <Overline>About</Overline>
          <h1 className="mt-1 text-[36px] leading-tight font-extrabold tracking-[-0.03em] sm:text-[52px]">Small Actions.<br />Better Planet.</h1>
          <p className="mt-4 max-w-xl text-[16px] leading-relaxed text-ink-2">{C.lead[lang]}</p>
          <Link href="/" className={`${buttonClass("primary", "lg")} mt-6`}>{t("cta_start")} <IconArrow size={16} /></Link>
        </div>
        <div className="relative h-56 lg:col-span-5">
          <EarthBuddy className="absolute top-0 left-1/2 h-48 w-48 -translate-x-1/2" />
          <CloudMascot mood="happy" className="absolute right-[12%] bottom-0 h-24 w-28" />
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-2xl font-extrabold tracking-tight">How it works</h2>
        <ol className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {C.steps.map((s, i) => (
            <Card as="div" key={i} className="flex flex-col gap-2">
              <span className="text-sm font-bold text-sky-deep tabular-nums">0{i + 1}</span>
              <span className="text-lg font-bold">{s.t[lang]}</span>
              <span className="text-[14px] leading-relaxed text-ink-2">{s.d[lang]}</span>
            </Card>
          ))}
        </ol>
      </section>

      <section className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Card>
          <h2 className="text-xl font-extrabold tracking-tight">RAG</h2>
          <ul className="mt-3 flex flex-col gap-2 text-[14px] text-ink-2">
            <li><Tag tone="lavender">RAG 1</Tag> 품목 메타데이터 152건 → <code>item_meta</code></li>
            <li><Tag tone="sky">RAG 2</Tag> 배출 안내 · 위키백과 · 업로드 문서 → <code>evidence_docs</code></li>
            <li><Tag tone="mint">Prompts</Tag> 검색어 추출 → 후보 선별 → 근거 답변</li>
            <li><Tag tone="yellow">LangGraph</Tag> retrieve → generate, 근거 번호와 원문 링크</li>
          </ul>
        </Card>
        <Card>
          <h2 className="text-xl font-extrabold tracking-tight">Data</h2>
          <ul className="mt-3 flex flex-col divide-y divide-line text-[14px]">
            {SOURCES.map(([n, u, l]) => (
              <li key={n} className="flex items-center justify-between gap-3 py-2">
                <span className="font-semibold">{n}</span><span className="flex-1 text-ink-2">{u}</span><span className="text-xs text-ink-3">{l}</span>
              </li>
            ))}
          </ul>
        </Card>
      </section>
    </div>
  );
}
