type MerchantRule = {
    pattern: RegExp;
    normalizedName: string;
  };
  
  const MERCHANT_RULES: MerchantRule[] = [
    {
      pattern: /k\s*패스.*환급/i,
      normalizedName: "K-패스 환급",
    },
    {
      pattern: /k\s*패스.*할인/i,
      normalizedName: "K-패스 할인",
    },
    {
      pattern: /우아한형제들|배달의민족|배민클럽/i,
      normalizedName: "우아한형제들",
    },
    {
      pattern: /홈플러스.*익스프레스/i,
      normalizedName: "홈플러스 익스프레스",
    },
    {
      pattern: /씨제이올리브영|올리브영/i,
      normalizedName: "올리브영",
    },
    {
      pattern: /매머드익스프레스/i,
      normalizedName: "매머드익스프레스",
    },
    {
      pattern: /지에스\s*25|gs\s*25s?/i,
      normalizedName: "GS25",
    },
    {
      pattern: /씨유|cu\s*[가-힣a-z0-9]*점/i,
      normalizedName: "CU",
    },
    {
      pattern: /메가엠지씨커피|메가\s*mgc\s*커피/i,
      normalizedName: "메가MGC커피",
    },
    {
      pattern: /투썸플레이스/i,
      normalizedName: "투썸플레이스",
    },
    {
      pattern: /할리스/i,
      normalizedName: "할리스",
    },
    {
      pattern: /아성다이소|다이소/i,
      normalizedName: "다이소",
    },
    {
      pattern: /삼성웰스토리/i,
      normalizedName: "삼성웰스토리",
    },
    {
      pattern: /g\s*마켓/i,
      normalizedName: "G마켓",
    },
  ];
  
  function cleanMerchantText(merchantName: string): string {
    return merchantName
      .normalize("NFKC")
      .replace(/\(주\)|㈜|주식회사|유한회사/g, " ")
      .replace(/[_/\\|·•]+/g, " ")
      .replace(/\s*-\s*/g, " ")
      .replace(/[()[\]{}]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
  
  export function normalizeMerchantName(
    merchantName: string,
  ): string {
    const cleanedName = cleanMerchantText(merchantName);
  
    if (!cleanedName) {
      return "";
    }
  
    for (const rule of MERCHANT_RULES) {
      if (rule.pattern.test(cleanedName)) {
        return rule.normalizedName;
      }
    }
  
    // 등록된 브랜드 규칙이 없으면
    // 법인 표기와 특수문자만 정리한 이름을 반환한다.
    return cleanedName;
  }