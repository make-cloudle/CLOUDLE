import { TrashMatch } from "@/features/trash-match/TrashMatch";

/** 분리수거 게임: 같은 쓰레기를 3개 이상 맞추는 퍼즐 (콤보 배수 · 특수 블록 · 시간 회복) */
export default function GamePage() {
  return (
    <div className="pt-8 lg:pt-12">
      <TrashMatch />
    </div>
  );
}
