export type CardTiProfile = {
  name: string;
  description: string;
};

const PROFILES: Record<string, CardTiProfile> = {
  IVN: {
    name: "차분한 생활 관리자",
    description:
      "혼자만의 소비를 편안하게 즐기고, 오프라인에서 꼭 필요한 지출을 먼저 챙기는 실속형 소비자예요.",
  },
  IVW: {
    name: "취향 있는 산책자",
    description:
      "혼자만의 시간을 소중히 여기며, 오프라인에서 취향과 경험을 천천히 발견하는 소비자예요.",
  },
  IRN: {
    name: "온라인 실속 설계자",
    description:
      "혼자 필요한 것을 빠르게 판단하고, 온라인 채널을 활용해 효율적으로 소비하는 계획형 소비자예요.",
  },
  IRW: {
    name: "디지털 취향 큐레이터",
    description:
      "온라인에서 나만의 취향을 탐색하고, 만족도가 높은 경험과 상품을 선택하는 소비자예요.",
  },
  EVN: {
    name: "스마트한 총무",
    description:
      "함께하는 자리를 즐기고 오프라인에서 활발히 소비하지만, 꼭 필요한 지출을 우선시하는 균형 잡힌 사교형 소비자예요.",
  },
  EVW: {
    name: "분위기 메이커",
    description:
      "사람들과 함께하는 오프라인 경험을 즐기며, 취향과 재미를 위해 기꺼이 소비하는 활동형 소비자예요.",
  },
  ERN: {
    name: "함께하는 생활 플래너",
    description:
      "사람들과 필요한 것을 공유하고, 온라인 채널을 활용해 생활비를 효율적으로 관리하는 소비자예요.",
  },
  ERW: {
    name: "트렌드 커넥터",
    description:
      "사람들과 새로운 취향을 나누고, 온라인에서 발견한 경험과 상품을 적극적으로 즐기는 소비자예요.",
  },
};

export function getCardTiProfile(cardTiType: string): CardTiProfile {
  return (
    PROFILES[cardTiType] ?? {
      name: "나만의 소비형",
      description:
        "소비 내역이 더 쌓이면 나의 소비 성향을 더욱 정확하게 확인할 수 있어요.",
    }
  );
}
