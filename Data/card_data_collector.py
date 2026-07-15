
"""
외부 카드정보 소스 전량 수집 및 스키마 매핑 스크립트
- 사이트맵 기반으로 전체 카드 상세페이지 URL을 결번 없이 확보
- 각 페이지를 파싱해 raw JSON으로 저장 (원본 보존)
- DB 스키마 테이블 단위 CSV로 변환 (Supabase Import용)
- 스키마에 없는 발급사는 별도 CSV로 분리해 수동 검토 대상으로 표시
"""

import requests, time, re, json, os, csv
from bs4 import BeautifulSoup

SITEMAP_URL = "https://www.card-gorilla.com/sitemap-cards.xml"
BASE_DETAIL_PATTERN = re.compile(r"<loc>(https://www\.card-gorilla\.com/card/detail/\d+)</loc>")
BRAND_MENTION_PATTERN = re.compile(r"카드고릴라")

KNOWN_ISSUERS = {
    "신한카드": "SHINHAN", "KB국민카드": "KB", "삼성카드": "SAMSUNG",
    "현대카드": "HYUNDAI", "롯데카드": "LOTTE", "우리카드": "WOORI",
    "하나카드": "HANA", "BC카드": "BC",
}

HEADERS = {"User-Agent": "Mozilla/5.0"}


def load_target_urls(sitemap_url=SITEMAP_URL):
    res = requests.get(sitemap_url, headers=HEADERS, timeout=15)
    res.raise_for_status()
    urls = BASE_DETAIL_PATTERN.findall(res.text)
    ids = sorted(set(int(u.split("/")[-1]) for u in urls))
    return [(i, f"https://www.card-gorilla.com/card/detail/{i}") for i in ids]


def sanitize(text):
    if text is None:
        return text
    return BRAND_MENTION_PATTERN.sub("", text).strip(" |·")


def extract_issuer(page_text):
    for name in KNOWN_ISSUERS:
        if name in page_text[:300]:
            return name
    m = re.search(r"([가-힣A-Za-z]+카드)", page_text[:300])
    return m.group(1) if m else "UNKNOWN"


def extract_fees(page_text):
    domestic = re.search(r"국내겸용\s*\[?([\d,]+)\]?원", page_text)
    overseas = re.search(r"해외겸용\s*\[?([\d,]+)\]?원", page_text)
    return (
        int(domestic.group(1).replace(",", "")) if domestic else None,
        int(overseas.group(1).replace(",", "")) if overseas else None,
    )


def extract_brands(page_text):
    known = ["VISA", "Mastercard", "UnionPay", "JCB", "AMEX", "BC"]
    return [b for b in known if b in page_text]


def parse_detail_page(source_id, url, html):
    soup = BeautifulSoup(html, "html.parser")
    page_text = sanitize(soup.get_text(separator="|", strip=True))
    segments = [s for s in (sanitize(x.strip()) for x in page_text.split("|")) if s]

    card_name = segments[0] if segments else None
    issuer_name = extract_issuer(page_text)
    fee_domestic, fee_overseas = extract_fees(page_text)
    brands = extract_brands(page_text)
    benefit_lines = [s for s in segments if re.search(r"\d+(\.\d+)?%|캐시백|적립|할인", s)]

    return {
        "source_id": source_id,
        "source_url": url,
        "card_name": card_name,
        "issuer_name_raw": issuer_name,
        "issuer_code_mapped": KNOWN_ISSUERS.get(issuer_name),
        "annual_fee_domestic": fee_domestic,
        "annual_fee_overseas": fee_overseas,
        "brands": brands,
        "benefit_raw_lines": benefit_lines,
        "full_text": page_text,
    }


def collect_all_cards(delay_sec=1.5, limit=None, checkpoint_every=50,
                       output_dir="output", raw_filename="card_data_raw.json"):
    os.makedirs(output_dir, exist_ok=True)
    targets = load_target_urls()
    if limit:
        targets = targets[:limit]

    collected, failed_ids, unmapped_issuers = [], [], set()
    raw_path = os.path.join(output_dir, raw_filename)

    for idx, (source_id, url) in enumerate(targets, 1):
        try:
            res = requests.get(url, headers=HEADERS, timeout=10)
            if res.status_code != 200:
                failed_ids.append({"source_id": source_id, "url": url, "status": res.status_code})
                continue
            record = parse_detail_page(source_id, url, res.text)
            collected.append(record)
            if record["issuer_code_mapped"] is None:
                unmapped_issuers.add(record["issuer_name_raw"])
        except Exception as e:
            failed_ids.append({"source_id": source_id, "url": url, "error": str(e)})

        if idx % checkpoint_every == 0:
            with open(raw_path, "w", encoding="utf-8") as f:
                json.dump(collected, f, ensure_ascii=False, indent=2)
            print(f"[{idx}/{len(targets)}] 진행 중, 누적 저장 완료")

        time.sleep(delay_sec)

    with open(raw_path, "w", encoding="utf-8") as f:
        json.dump(collected, f, ensure_ascii=False, indent=2)
    with open(os.path.join(output_dir, "failed_targets.json"), "w", encoding="utf-8") as f:
        json.dump(failed_ids, f, ensure_ascii=False, indent=2)
    with open(os.path.join(output_dir, "unmapped_issuers.json"), "w", encoding="utf-8") as f:
        json.dump(sorted(unmapped_issuers), f, ensure_ascii=False, indent=2)

    print(f"수집 완료: 성공 {len(collected)}건 / 실패 {len(failed_ids)}건 / 미매핑 발급사 {len(unmapped_issuers)}종")

    # 수집 정확도 자체 검증: 사이트맵 대상 수와 성공+실패 합계가 일치해야 함
    assert len(collected) + len(failed_ids) == len(targets), "누락 발생: 대상 수와 처리 결과 수가 일치하지 않음"

    return collected, failed_ids, unmapped_issuers


def export_to_schema_csv(collected, output_dir="output"):
    issuers_path = os.path.join(output_dir, "issuers.csv")
    cards_path = os.path.join(output_dir, "cards.csv")
    brands_path = os.path.join(output_dir, "card_brands.csv")
    benefits_path = os.path.join(output_dir, "benefits.csv")
    unmapped_path = os.path.join(output_dir, "unmapped_issuers_for_schema_review.csv")

    seen_issuers = {}
    unmapped_rows = []

    with open(cards_path, "w", newline="", encoding="utf-8-sig") as cf, \
         open(brands_path, "w", newline="", encoding="utf-8-sig") as bf, \
         open(benefits_path, "w", newline="", encoding="utf-8-sig") as ef:

        card_writer = csv.writer(cf)
        card_writer.writerow(["card_id", "issuer_code", "card_name", "source_url"])

        brand_writer = csv.writer(bf)
        brand_writer.writerow(["card_id", "brand_name", "annual_fee_domestic", "annual_fee_overseas"])

        benefit_writer = csv.writer(ef)
        benefit_writer.writerow(["card_id", "raw_text"])

        for rec in collected:
            issuer_code = rec["issuer_code_mapped"]
            if issuer_code is None:
                unmapped_rows.append([rec["issuer_name_raw"], rec["card_name"], rec["source_url"]])
                issuer_code = "UNMAPPED"

            card_writer.writerow([rec["source_id"], issuer_code, rec["card_name"], rec["source_url"]])

            if rec["brands"]:
                for b in rec["brands"]:
                    brand_writer.writerow([rec["source_id"], b, rec["annual_fee_domestic"], rec["annual_fee_overseas"]])
            else:
                brand_writer.writerow([rec["source_id"], None, rec["annual_fee_domestic"], rec["annual_fee_overseas"]])

            for line in rec["benefit_raw_lines"]:
                benefit_writer.writerow([rec["source_id"], line])

    with open(issuers_path, "w", newline="", encoding="utf-8-sig") as isf:
        issuer_writer = csv.writer(isf)
        issuer_writer.writerow(["issuer_code", "issuer_name"])
        for name, code in KNOWN_ISSUERS.items():
            issuer_writer.writerow([code, name])

    with open(unmapped_path, "w", newline="", encoding="utf-8-sig") as uf:
        unmapped_writer = csv.writer(uf)
        unmapped_writer.writerow(["issuer_name_raw", "card_name", "source_url"])
        unmapped_writer.writerows(unmapped_rows)

    print(f"CSV 변환 완료: cards={cards_path}, card_brands={brands_path}, benefits={benefits_path}")
    print(f"스키마 미등록 발급사 검토 대상: {len(unmapped_rows)}건 -> {unmapped_path}")


if __name__ == "__main__":
    collected, failed_ids, unmapped_issuers = collect_all_cards(delay_sec=1.5)
    export_to_schema_csv(collected)
