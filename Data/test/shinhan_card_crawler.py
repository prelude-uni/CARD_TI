
"""
신한카드 전체 카드 정보 수집 파이프라인
1단계: bestCardC.html에서 주요 카드 마스터 데이터 파싱
2단계: 통합검색 API로 전체 카드명 목록 확보
3단계: 카드별 상세페이지 URL 매핑 및 상세 데이터 수집
"""
import requests, re, time
import pandas as pd
from bs4 import BeautifulSoup

HEADERS = {"User-Agent": "Mozilla/5.0"}

BEST_CARD_URL = "https://www.shinhancard.com/pconts/html/landing/bestCardC.html?epCase=google"
SEARCH_API_URL = "https://www.shinhancard.com/mob/MOBFM004N/MOBFM004R0201.shc"

def fetch_best_cards():
    """분야별 BEST 카드 페이지에서 주요 카드 마스터 리스트 파싱"""
    resp = requests.get(BEST_CARD_URL, headers=HEADERS, timeout=15)
    soup = BeautifulSoup(resp.text, "html.parser")
    text = soup.get_text("\n", strip=True)

    # "카드명 \n 연회비: ... \n ... \n *전월 최소 이용금액: ..." 블록 단위 파싱
    pattern = re.compile(
        r"(?P<name>[\w가-힣\s™#\.\-\+\(\)]+?)\n+연회비[:：]?\s*(?P<fee>[^\n]+)"
        r"(?P<benefits>(?:\n(?!연회비)[^\n]+){1,12}?)"
        r"(?:\*전월\s*최소\s*이용금액[:：]?\s*(?P<condition>[^\n]+))?"
    )
    records = []
    for m in pattern.finditer(text):
        records.append({
            "카드사": "신한카드",
            "카드명": m.group("name").strip(),
            "연회비": m.group("fee").strip(),
            "전월실적조건": (m.group("condition") or "확인필요").strip(),
            "혜택요약": " / ".join([l.strip() for l in m.group("benefits").split("\n") if l.strip()])[:200],
        })
    return pd.DataFrame(records).drop_duplicates(subset=["카드명"])

def search_card_names(keywords=("카드","체크","신용","적립","할인","마일리지")):
    """통합검색 API로 전체 카드명 후보 수집 (키워드 여러 개로 커버리지 확장)"""
    all_names = set()
    for kw in keywords:
        try:
            resp = requests.get(SEARCH_API_URL, params={"query": kw}, headers=HEADERS, timeout=15)
            names = re.findall(r'cardNmHTML["\']?\s*[:=]\s*["\']([^"\']+)', resp.text)
            all_names.update(names)
        except Exception as e:
            print(f"검색 실패({kw}): {e}")
        time.sleep(1)
    return all_names

def fetch_card_detail(url):
    """개별 카드 상세페이지 HTML 원문 반환 (Document Parse 입력용)"""
    resp = requests.get(url, headers=HEADERS, timeout=15)
    resp.raise_for_status()
    return resp.text

def build_shinhan_master():
    df_best = fetch_best_cards()
    print(f"BEST 카드 {len(df_best)}건 확보")

    all_names = search_card_names()
    print(f"통합검색으로 확보한 카드명 후보 {len(all_names)}건")

    df_best.to_csv("shinhan_master_best.csv", index=False, encoding="utf-8-sig")
    pd.DataFrame({"카드명후보": list(all_names)}).to_csv(
        "shinhan_card_name_candidates.csv", index=False, encoding="utf-8-sig"
    )
    return df_best, all_names

if __name__ == "__main__":
    build_shinhan_master()
