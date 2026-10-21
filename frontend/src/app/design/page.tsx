"use client";

import { useState } from "react";
import { IconArrow, IconSearch } from "@/components/ui/icons";
import { Alert, Button, Card, Field, Input, Overline, Segmented, Select, Tag } from "@/components/ui/primitives";

const COLORS = [
  ["bg", "Background"], ["surface", "Surface"], ["surface-2", "Surface 2"], ["ink", "Ink"], ["ink-2", "Ink 2"],
  ["line", "Line"], ["accent", "Accent · Sage"], ["sky", "Sky"], ["warn", "Warn"], ["danger", "Danger"],
] as const;

const TYPE = [
  ["Display", "text-4xl font-bold tracking-tight", "36 / 700"],
  ["Heading", "text-2xl font-bold tracking-tight", "24 / 700"],
  ["Title", "text-lg font-semibold", "18 / 600"],
  ["Body", "text-base", "16 / 400"],
  ["Small", "text-sm text-ink-2", "14 / 400"],
  ["Overline", "eyebrow", "11 / 600 / +12%"],
] as const;

function Section({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <section className="grid grid-cols-1 gap-4 border-t border-line pt-6 lg:grid-cols-12">
      <div className="lg:col-span-3">
        <Overline>{n}</Overline>
        <h2 className="text-lg font-semibold">{title}</h2>
      </div>
      <div className="lg:col-span-9">{children}</div>
    </section>
  );
}

/** 컴포넌트 키트 · 디자인 시스템 시트 */
export default function DesignPage() {
  const [seg, setSeg] = useState("all");
  return (
    <div className="flex flex-col gap-10 pt-8">
      <header>
        <Overline>Design system · v0.1</Overline>
        <h1 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">CLOUDLE UI kit</h1>
        <p className="mt-2 max-w-2xl text-ink-2">
          Flat · editorial · 12-column grid. Muted palette, 1px borders instead of shadows, 4–8px radius. Left-aligned on mobile.
        </p>
      </header>

      <Section n="01" title="Color">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {COLORS.map(([k, label]) => (
            <div key={k} className="overflow-hidden rounded-md border border-line">
              <div className="h-16" style={{ background: `var(--${k})` }} />
              <div className="bg-surface p-2">
                <p className="text-xs font-semibold">{label}</p>
                <p className="text-[11px] text-ink-3">--{k}</p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section n="02" title="Typography">
        <div className="flex flex-col divide-y divide-line border-y border-line">
          {TYPE.map(([name, cls, spec]) => (
            <div key={name} className="grid grid-cols-[96px_1fr_auto] items-baseline gap-4 py-3">
              <span className="text-xs text-ink-3">{name}</span>
              <span className={cls}>물건 하나부터 Greener</span>
              <span className="text-xs text-ink-3 tabular-nums">{spec}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section n="03" title="Buttons">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
          {(["primary", "secondary", "ghost", "danger"] as const).map((v) => (
            <div key={v} className="flex flex-col items-start gap-2">
              <p className="text-xs text-ink-3">{v}</p>
              <Button variant={v}>Default</Button>
              <Button variant={v} className={v === "primary" ? "opacity-90" : "bg-surface-2"}>Hover</Button>
              <Button variant={v} loading>Loading</Button>
              <Button variant={v} disabled>Disabled</Button>
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button size="sm">Small</Button>
          <Button>Medium</Button>
          <Button size="lg" variant="primary">Large <IconArrow size={16} /></Button>
        </div>
      </Section>

      <Section n="04" title="Inputs">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Default" hint="Helper text"><Input placeholder="무선 이어폰" /></Field>
          <Field label="Focus"><Input defaultValue="보조배터리" autoFocus={false} className="border-accent" /></Field>
          <Field label="Error" error="물건 이름을 적어 주세요."><Input invalid placeholder="—" /></Field>
          <Field label="Disabled"><Input disabled placeholder="Disabled" /></Field>
          <Field label="Dropdown">
            <Select defaultValue="kr"><option value="kr">대한민국</option><option value="seoul">서울</option></Select>
          </Field>
          <Field label="Search">
            <div className="relative">
              <IconSearch size={16} className="absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" />
              <Input className="pl-9" placeholder="조건으로 찾기" />
            </div>
          </Field>
        </div>
        <div className="mt-4 flex flex-col gap-3">
          <Segmented label="purpose" value={seg} onChange={setSeg}
            options={[{ value: "all", label: "All" }, { value: "repair", label: "Repair" }, { value: "reuse", label: "Reuse" }]} />
          <div className="flex flex-wrap gap-2">
            <Tag>Neutral</Tag><Tag tone="accent">Accent</Tag><Tag tone="sky">Live</Tag><Tag tone="warn">Battery</Tag>
            <Tag onRemove={() => undefined}>Removable</Tag>
          </div>
        </div>
      </Section>

      <Section n="05" title="Paper">
        <div className="paper max-w-md px-5 pt-6 pb-5 pl-14">
          <p className="eyebrow">CLOUDLE NOTE</p>
          <p className="text-xl leading-9 font-bold">무선 이어폰</p>
          <p className="leading-9 text-ink-2">한쪽 작동 불량 · 대한민국</p>
        </div>
      </Section>

      <Section n="06" title="Info cards · Bento">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
          <Card className="md:col-span-4">
            <Overline className="mb-1">Summary</Overline>
            <p className="text-lg">배출 분류는 소형폐가전입니다. <span className="text-accent">[1]</span></p>
          </Card>
          <Card className="md:col-span-2">
            <Overline className="mb-1">PM2.5 · Statistic</Overline>
            <p className="text-3xl font-bold tabular-nums">21.89</p>
            <p className="text-xs text-ink-3">µg/m³ · 2023 · World Bank</p>
          </Card>
          <Card className="md:col-span-2"><Overline>Repair</Overline><p className="text-sm">서비스센터 확인</p></Card>
          <Card className="md:col-span-2"><Overline>Reuse</Overline><p className="text-sm">중고 판매·나눔</p></Card>
          <Card className="md:col-span-2"><Overline>Disposal</Overline><p className="text-sm">소형가전 수거함</p></Card>
        </div>
      </Section>

      <Section n="07" title="Feedback">
        <div className="flex flex-col gap-2">
          <Alert tone="info">오프라인 모드 — 근거 문장을 발췌해 답했어요.</Alert>
          <Alert tone="warn">배터리가 있을 수 있어요. 분해하지 마세요.</Alert>
          <Alert tone="error">문제가 생겼어요. 잠시 후 다시 시도해 주세요.</Alert>
        </div>
      </Section>
    </div>
  );
}
