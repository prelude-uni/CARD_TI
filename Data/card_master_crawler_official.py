
"""
8개 카드사 공식 사이트 카드 마스터 크롤러 (Playwright 기반)
- 카드사별 사이트가 JS 렌더링(SPA)이므로 requests 대신 Playwright 사용
- 사이트마다 DOM 구조가 다르므로 카드사별 파서(parser) 함수를 개별 작성
- 공통 인터페이스: fetch_rendered_html(url) -> parser_함수(html) -> List[dict]
"""
import time
import pandas as pd
from playwright.sync_api import sync_playwright

COMPANY_ENTRY_POINTS = {
    "신한카드": "https://www.shinhancard.com/pconts/html/card/friends/MOBFM175/MOBFM175C03.html",
    "삼성카드": "https://www.samsungcard.com/home/card/cardinfo/pghppdccardcardinforecommendpc001",
    "KB국민카드": "https://card.kbcard.com/CRD/DVIEW/HCAM0101",
    "현대카드": "https://www.hyundaicard.com/cpc/ca/CPCCA0110_01.hc?cardflag=HC",
    "롯데카드": "https://www.lottecard.co.kr/app/LPCDXAA_V001.lc",
    "우리카드": "https://pc.wooricard.com/dcpc/main.do",
    "하나카드": "https://www.hanacard.co.kr/",
    "BC카드": "https://www.bccard.com/app/card/CreditCardMain.do",
    "NH농협카드": "https://card.nonghyup.com/servlet/IPCC010101.menu",
}

def fetch_rendered_html(url: str, wait_selector: str = None, wait_ms: int = 3000) -> str:
    """JS 렌더링 완료 후 HTML 반환"""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(user_agent="Mozilla/5.0")
        page.goto(url, timeout=30000)
        if wait_selector:
            page.wait_for_selector(wait_selector, timeout=15000)
        else:
            page.wait_for_timeout(wait_ms)
        html = page.content()
        browser.close()
    return html

def parse_generic_card_list(html: str, company: str) -> list:
    """
    카드사별 DOM 구조가 다르므로, 최초 1회는 반드시 브라우저 개발자도구로
    카드 컨테이너 셀렉터(.card-item, .prod-card 등)를 확인 후 아래 셀렉터를 교체할 것.
    """
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(html, "html.parser")
    records = []

    # TODO: 카드사별 실제 셀렉터로 교체 필요 (예시 셀렉터)
    candidates = soup.select("li, div.card-item, div.prod-item")
    for c in candidates:
        name_tag = c.select_one("strong, .card-name, .prod-name, h3, h4")
        if not name_tag:
            continue
        name = name_tag.get_text(strip=True)
        if len(name) < 2 or len(name) > 40:
            continue
        detail_link = c.select_one("a")
        records.append({
            "카드사": company,
            "카드명": name,
            "상세페이지": detail_link.get("href") if detail_link else None,
        })
    return records

def crawl_all_companies():
    all_records = []
    for company, url in COMPANY_ENTRY_POINTS.items():
        print(f"[{company}] 크롤링 시작: {url}")
        try:
            html = fetch_rendered_html(url)
            records = parse_generic_card_list(html, company)
            print(f"  -> {len(records)}개 카드 후보 발견")
            all_records.extend(records)
        except Exception as e:
            print(f"  !! {company} 실패: {e}")
        time.sleep(2)  # 서버 부담 방지용 딜레이

    df = pd.DataFrame(all_records).drop_duplicates(subset=["카드사", "카드명"])
    df.to_csv("card_master_table_official.csv", index=False, encoding="utf-8-sig")
    print(f"총 {len(df)}개 카드 수집 완료 -> card_master_table_official.csv")
    return df

if __name__ == "__main__":
    crawl_all_companies()
