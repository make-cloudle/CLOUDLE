/** 에코 버킷: Cloud Lab에서 "좋았다" 싶은 결과·방법을 담아 두는 개인 리스트. 채팅방에 그대로 공유할 수 있다. */
export type BucketKind = "result" | "reuse" | "repair" | "disposal" | "basic_info";

/** 채팅으로 보내는 모양 (게이트웨이 BucketEntry와 같다) */
export type BucketEntry = {
  title: string;
  item: string;
  kind: BucketKind;
  text: string;
  sources: { title: string; url: string }[];
};

export type BucketItem = BucketEntry & { id: string; createdAt: number };
