
"""
신한카드 BEST 카드 크롤러 (인코딩 수정판)
핵심 수정: resp.encoding = resp.apparent_encoding 추가
"""
import requests, re
import pandas as pd
from bs4 import BeautifulSoup

HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36"}
BEST_CARD_URL = "https://www.shinhancard.com/pconts/html/landing/bestCardC.html?epCase=google"

def fetch_best_cards():
    resp = requests.get(BEST_CARD_URL, headers=HEADERS, timeout=15)
    resp.raise_for_status()
    resp.encoding = resp.apparent_encoding  # 인코딩 오탐 수정 (핵심)

    soup = BeautifulSoup(resp.text, "html.parser")
    text = soup.get_text("\n", strip=True)

    # 카드명 -> 연회비 -> 혜택 라인들 -> 전월실적조건 블록 단위로 분리
    blocks = re.split(r"(?=신한카드\s[A-Za-z가-힣\.\+\s]+?\n연회비)", text)
    records = []
    for b in blocks:
        name_m = re.match(r"(신한카드\s[^\n]+?)\n연회비[:：]?\s*([^\n]+)", b)
        if not name_m:
            continue
        name, fee = name_m.group(1).strip(), name_m.group(2).strip()
        cond_m = re.search(r"\*전월\s*최소\s*이용금액[:：]?\s*([^\n]+)", b)
        condition = cond_m.group(1).strip() if cond_m else "확인필요"
        benefit_lines = re.findall(r"\n([^\n]{2,20}(?:%|원|할인|적립|캐시백)[^\n]{0,10})", b)
        records.append({
            "카드사": "신한카드",
            "카드명": name,
            "연회비": fee,
            "전월실적조건": condition,
            "혜택요약": " / ".join(benefit_lines[:5]),
        })
    return pd.DataFrame(records).drop_duplicates(subset=["카드명"])

if __name__ == "__main__":
    df = fetch_best_cards()
    df.to_csv("shinhan_best_cards_fixed.csv", index=False, encoding="utf-8-sig")
    print(f"{len(df)}개 카드 수집 완료")
