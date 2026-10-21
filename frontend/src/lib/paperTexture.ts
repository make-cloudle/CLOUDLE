import type { Paper } from "./loop";

export const TEX_W = 768;
export const TEX_H = 1000; // 종이 메시 비율(1.5 : 1.95)과 같다

const LINE = 44;
const TOP = 132;
const MARGIN = 78;

export type PaperLabels = { product: string; condition: string; region: string; purpose: string; purposeValue: string };

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const ch of text) {
    if (ch === "\n" || ctx.measureText(line + ch).width > maxW) {
      out.push(line);
      line = ch === "\n" ? "" : ch;
    } else line += ch;
  }
  if (line) out.push(line);
  return out;
}

/** 종이 내용(구조화 JSON)을 줄노트 캔버스에 그린다. 3D 종이의 텍스처로 쓰인다. */
export function drawPaper(
  canvas: HTMLCanvasElement,
  paper: Paper,
  labels: PaperLabels,
  dark: boolean,
  images: HTMLImageElement[],
) {
  canvas.width = TEX_W;
  canvas.height = TEX_H;
  const ctx = canvas.getContext("2d")!;
  const ink = dark ? "#e7e5dd" : "#2b2b28";
  const sub = dark ? "#a5a399" : "#6b6a62";
  ctx.fillStyle = dark ? "#2a2b26" : "#fbfaf5";
  ctx.fillRect(0, 0, TEX_W, TEX_H);

  ctx.strokeStyle = dark ? "rgba(170,190,205,0.16)" : "rgba(70,110,140,0.2)";
  ctx.lineWidth = 2;
  for (let y = TOP; y < TEX_H - 20; y += LINE) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(TEX_W, y);
    ctx.stroke();
  }
  ctx.strokeStyle = dark ? "rgba(200,130,120,0.4)" : "rgba(196,120,110,0.55)";
  ctx.beginPath();
  ctx.moveTo(MARGIN - 14, 0);
  ctx.lineTo(MARGIN - 14, TEX_H);
  ctx.stroke();

  const font = getComputedStyle(document.body).fontFamily || "sans-serif";
  ctx.fillStyle = sub;
  ctx.font = `600 20px ${font}`;
  ctx.fillText("CLOUDLE NOTE", MARGIN, 72);

  let y = TOP - 10;
  const row = (label: string, value: string, size = 30, weight = 500) => {
    if (!value) return;
    ctx.fillStyle = sub;
    ctx.font = `600 18px ${font}`;
    ctx.fillText(label, MARGIN, y - 8 - size + 18);
    ctx.fillStyle = ink;
    ctx.font = `${weight} ${size}px ${font}`;
    for (const l of wrap(ctx, value, TEX_W - MARGIN - 160).slice(0, 2)) {
      ctx.fillText(l, MARGIN + 130, y);
      y += LINE;
    }
  };
  row(labels.product, paper.product_name, 36, 700);
  row(labels.condition, paper.condition);
  row(labels.region, paper.region);
  row(labels.purpose, labels.purposeValue);
  if (paper.note) {
    ctx.fillStyle = ink;
    ctx.font = `400 26px ${font}`;
    for (const l of wrap(ctx, paper.note, TEX_W - MARGIN - 40).slice(0, 4)) {
      ctx.fillText(l, MARGIN, y);
      y += LINE;
    }
  }
  // 사진은 글 아래에 폴라로이드처럼
  let x = MARGIN;
  const top = Math.min(y + 10, TEX_H - 250);
  images.slice(0, 3).forEach((img, i) => {
    const w = 190, h = 190;
    ctx.save();
    ctx.translate(x + w / 2, top + h / 2);
    ctx.rotate((i % 2 ? 1 : -1) * 0.04);
    ctx.fillStyle = dark ? "#1c1d19" : "#ffffff";
    ctx.fillRect(-w / 2 - 10, -h / 2 - 10, w + 20, h + 40);
    ctx.strokeStyle = sub;
    ctx.strokeRect(-w / 2 - 10, -h / 2 - 10, w + 20, h + 40);
    const s = Math.max(w / img.width, h / img.height);
    const sw = w / s, sh = h / s;
    ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, -w / 2, -h / 2, w, h);
    ctx.restore();
    x += w + 40;
  });
}
