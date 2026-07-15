
"""
카드 마스터 테이블 수집 스크립트
Source: card.ambitstock.com (카드모아) - 8개 카드사 카드 통합 목록
"""
import requests, re, pandas as pd
from bs4 import BeautifulSoup

BASE_URL = "https://card.ambitstock.com/cards/"
COMPANIES = ['신한카드','NH농협카드','KB국민카드','삼성카드','현대카드','롯데카드','우리카드','하나카드','BC카드']

def fetch_card_list_page(url=BASE_URL):
    resp = requests.get(url, timeout=20, headers={"User-Agent": "Mozilla/5.0"})
    resp.raise_for_status()
    return resp.text

def parse_card_blocks(soup):
    """카드 하나 = 제목(bold) + 설명 + 연회비/실적/태그 블록 구조를 파싱"""
    records = []
    # 실제 DOM 구조에 맞춰 카드 컨테이너 셀렉터를 웹페이지 검사 후 조정 필요
    cards = soup.select("a[href*='/cards/']")  # 카드 상세 링크 기준 후보
    for c in cards:
        name_tag = c.select_one("strong, b, .card-name")
        if not name_tag:
            continue
        name = name_tag.get_text(strip=True)
        block_text = c.get_text(" ", strip=True)

        fee_m = re.search(r"연회비\s*([^\s]+원|없음)", block_text)
        cond_m = re.search(r"실적\s*([^\s]+원|없음)", block_text)
        type_m = re.search(r"(신용|체크)", block_text)
        company = next((co for co in COMPANIES if co in block_text or co.replace("카드","") in name), None)

        records.append({
            "카드사": company,
            "카드명": name,
            "카드유형": type_m.group(1) if type_m else None,
            "연회비": fee_m.group(1) if fee_m else None,
            "전월실적조건": cond_m.group(1) if cond_m else None,
            "상세페이지": c.get("href"),
        })
    return records

def build_master_table():
    html_text = fetch_card_list_page()
    soup = BeautifulSoup(html_text, "html.parser")
    records = parse_card_blocks(soup)
    df = pd.DataFrame(records).drop_duplicates(subset=["카드사","카드명"])
    df.to_csv("card_master_table.csv", index=False, encoding="utf-8-sig")
    print(f"총 {len(df)}개 카드 수집 완료")
    return df

if __name__ == "__main__":
    build_master_table()
