import { TrashHub } from "@/features/trash-match/TrashHub";

/** 분리수거 게임: 일반 모드(기존 방식)와 트레일(쉬움·보통·어려움 각 10 스테이지) */
export default function GamePage() {
  return (
    <div className="pt-8 lg:pt-12">
      <TrashHub />
    </div>
  );
}
