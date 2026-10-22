import type { Room } from "./community.types";

/** 주제가 정해진 방만 둔다 — 잡담방이 아니라 "지구를 위한 실천"을 함께 이야기하는 곳. */
export const ROOMS: Room[] = [
  {
    id: "sorting",
    title: "분리배출 Q&A",
    topic: "이거 어디에 버려요? 헷갈리는 분리배출을 함께 풀어요.",
    icon: "recycle",
    pinned: "지역마다 배출 기준이 달라요. 지자체 안내 링크나 사진을 같이 올려 주세요.",
    prompts: ["이거 어디에 버려요?", "우리 동네는 이렇게 해요", "라벨 떼야 하나요?"],
  },
  {
    id: "repair",
    title: "수리 · 나눔",
    topic: "고쳐 쓰고, 다시 쓰고, 필요한 사람에게 건네요.",
    icon: "tool",
    pinned: "개인 연락처 대신 방 안에서 이야기해요. 거래·금전 요청은 하지 않아요.",
    prompts: ["수리점 추천해 주세요", "필요한 분께 나눔해요", "자가 수리 해봤어요"],
  },
  {
    id: "air",
    title: "우리 동네 공기",
    topic: "오늘 공기 어땠나요? 체감과 관측값을 나눠요.",
    icon: "air",
    pinned: "수치를 말할 때는 출처와 관측 시각을 함께 적어 주세요. (예: 에어코리아 14시)",
    prompts: ["오늘 마스크 썼어요", "관측값 공유해요", "실내 환기 팁"],
  },
  {
    id: "zerowaste",
    title: "제로웨이스트 챌린지",
    topic: "이번 주 한 가지 실천을 인증하고 응원해요.",
    icon: "leaf",
    pinned: "인증 사진은 얼굴·주소가 보이지 않게 올려 주세요.",
    prompts: ["오늘의 실천 인증!", "다회용기 썼어요", "이번 주 목표"],
  },
];

export const findRoom = (id: string) => ROOMS.find((r) => r.id === id);
