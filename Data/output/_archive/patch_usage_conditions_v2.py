"""
patch_usage_conditions_v2.py
목적: usage_conditions_v1.csv가 카드당 실적구간을 1개(대표값)로 단순화하여
      발생한 오류를 수정한다. card_data_raw.json의 benefit_raw_lines를 재파싱해
      카드 내에 서로 다른 실적조건(금액/기간유형)이 여러 개 존재하는 경우
      usage_conditions에 추가 행(condition_order 2, 3...)을 생성하고,
      해당하는 benefits_v1.csv의 개별 혜택 행(raw_text 매칭)을 새 condition_id로
      재배정한다.

입력: card_data_raw.json, cards_v1.csv, usage_conditions_v1.csv, benefits_v1.csv
출력: usage_conditions_v2.csv, benefits_v2.csv, condition_patch_report.csv
스키마 위배 없음: CREATE TABLE 구조 변경 없이 데이터만 보정 (condition_id는 SERIAL이므로
      기존 최대값 이후부터 새 ID를 순차 부여)
"""
import pandas as pd
import json
import re
from collections import OrderedDict

RAW_PATH = "card_data_raw.json"
UC_PATH = "usage_conditions_v1.csv"
BV_PATH = "benefits_v1.csv"
OUT_DIR = "output"

AMT_PAT = re.compile(r"(전월실적|분기별\s*실적|연간실적|분기실적)\s*([\d,]+)\s*(만원|천만원|원)\s*(이상|이하|초과|미만)")


def parse_amount(num_str: str, unit: str) -> int:
    n = float(num_str.replace(",", ""))
    if unit == "만원":
        return int(n * 10000)
    if unit == "천만원":
        return int(n * 10000000)
    return int(n)


def extract_condition(text: str):
    """텍스트에서 (금액, 비교연산자, 기간유형)을 추출. 매칭 없으면 None."""
    m = AMT_PAT.search(text)
    if not m:
        return None
    period_kw, num_str, unit, comp = m.groups()
    amt = parse_amount(num_str, unit)
    if "분기" in period_kw:
        period_type = "QUARTERLY"
    elif "연간" in period_kw:
        period_type = "YEARLY"
    else:
        period_type = "MONTHLY"
    return amt, comp, period_type


def build_patch(raw_records, uc_df):
    uc_by_url = uc_df.set_index("source_url")[["condition_id", "min_amount", "period_type"]].to_dict("index")
    next_condition_id = int(uc_df["condition_id"].max()) + 1

    new_uc_rows = []
    override_map = {}  # (source_url, raw_text) -> new condition_id
    report_rows = []

    for rec in raw_records:
        surl = rec["source_url"]
        base = uc_by_url.get(surl)
        if base is None:
            continue
        default_amt = int(base["min_amount"]) if pd.notna(base["min_amount"]) else 0
        default_ptype = base["period_type"]
        default_cid = int(base["condition_id"])
        default_key = (default_amt, "이상", default_ptype)

        seen = OrderedDict()
        seen[default_key] = default_cid

        for line in rec.get("benefit_raw_lines", []):
            parsed = extract_condition(line)
            key = parsed if parsed else default_key
            if key not in seen:
                seen[key] = next_condition_id
                next_condition_id += 1
            if seen[key] != default_cid:
                override_map[(surl, line)] = seen[key]

        if len(seen) > 1:
            for order_idx, (key, cid) in enumerate(seen.items(), start=1):
                amt, comp, ptype = key
                if cid != default_cid:
                    new_uc_rows.append({
                        "condition_id": cid,
                        "source_url": surl,
                        "condition_order": order_idx,
                        "min_amount": amt,
                        "max_amount": None,
                        "period_type": ptype,
                    })
                report_rows.append({
                    "source_url": surl,
                    "condition_id": cid,
                    "condition_order": order_idx,
                    "min_amount": amt,
                    "period_type": ptype,
                    "is_new": cid != default_cid,
                })

    return new_uc_rows, override_map, report_rows


def apply_overrides(bv_df, override_map):
    bv_patched = bv_df.copy()

    def _lookup(row):
        return override_map.get((row["source_url"], row["raw_text"]), row["condition_id"])

    bv_patched["condition_id"] = bv_patched.apply(_lookup, axis=1)
    changed_mask = bv_patched["condition_id"] != bv_df["condition_id"]
    return bv_patched, int(changed_mask.sum())


def main():
    with open(RAW_PATH, encoding="utf-8") as f:
        raw_records = json.load(f)

    uc_df = pd.read_csv(UC_PATH)
    bv_df = pd.read_csv(BV_PATH)

    new_uc_rows, override_map, report_rows = build_patch(raw_records, uc_df)

    uc_v2 = pd.concat([uc_df, pd.DataFrame(new_uc_rows)], ignore_index=True)
    uc_v2 = uc_v2.sort_values(["source_url", "condition_order"]).reset_index(drop=True)

    bv_v2, changed_count = apply_overrides(bv_df, override_map)

    report_df = pd.DataFrame(report_rows)

    uc_v2.to_csv(f"{OUT_DIR}/usage_conditions_v2.csv", index=False, encoding="utf-8-sig")
    bv_v2.to_csv(f"{OUT_DIR}/benefits_v2.csv", index=False, encoding="utf-8-sig")
    report_df.to_csv(f"{OUT_DIR}/condition_patch_report.csv", index=False, encoding="utf-8-sig")

    print(f"[INFO] usage_conditions: {len(uc_df)} -> {len(uc_v2)} (+{len(new_uc_rows)})")
    print(f"[INFO] benefits condition_id 재배정: {changed_count}건")
    print(f"[INFO] 영향받은 카드 수: {report_df['source_url'].nunique() if not report_df.empty else 0}")


if __name__ == "__main__":
    main()
