"""Company details for each supplier, from data/details_raw.jsonl.

details_raw.jsonl holds one line per supplier, pulled from Tradeverifyd's
entity_details and entity_trade_relationships tools (top buyers and top
suppliers only, plus the total counts). This module turns those lines into
what the supplier panel shows:

  profile    - legal name, other names, industry, company type, IDs
  buyers     - how many buyers it has on record, and a few non-Inditex ones
  inditex    - which Inditex brands it ships to
  tier2      - its own suppliers: what they supply and (roughly) where from
  flags      - data-quality warnings
  summary    - one plain-English sentence
"""
import json
import re
from pathlib import Path

# --- Inditex group names (so "other buyers" means other brands) -----------
INDITEX_BRANDS = [
    ("ZARA HOME", "Zara Home"), ("ZARA", "Zara"), ("PULL & BEAR", "Pull&Bear"),
    ("PULL&BEAR", "Pull&Bear"), ("BERSHKA", "Bershka"), ("MASSIMO DUTTI", "Massimo Dutti"),
    ("STRADIVARIUS", "Stradivarius"), ("OYSHO", "Oysho"), ("TEMPE", "Tempe (Inditex footwear)"),
]
INDITEX_GROUP = ("INDITEX", "INDUSTRIA DE DISE", "ITX ", "POLIGONO INDITEX")


def inditex_brand(name):
    """Return the Inditex brand a buyer name belongs to, or None."""
    up = name.upper()
    for key, label in INDITEX_BRANDS:
        if key in up:
            return label
    if any(k in up for k in INDITEX_GROUP):
        return "Inditex"
    return None


# --- Industry ---------------------------------------------------------------
# NAICS prefixes that fit a clothing / textile supplier.
APPAREL_NAICS = ("313", "314", "315", "316", "4243", "4581")
ROLE_BY_NAICS = [
    ("315", "Garment maker"), ("313", "Textile mill"), ("314", "Textile products maker"),
    ("316", "Leather goods maker"), ("4243", "Clothing wholesaler"), ("4581", "Clothing exporter"),
]
MANY_NAMES = 20  # this many names on one record usually means unrelated companies merged


# --- What tier-2 suppliers ship (by HS heading, then chapter) ---------------
SUPPLY_BY_HEADING = {
    "0505": "Down & feathers", "6701": "Down & feathers",
    "4104": "Leather", "4107": "Leather", "4112": "Leather", "4113": "Leather", "4114": "Leather", "4115": "Leather",
    "4302": "Fur", "4304": "Faux fur",
    "5007": "Silk fabric", "5111": "Wool fabric", "5112": "Wool fabric", "5113": "Wool fabric",
    "5204": "Thread", "5205": "Cotton yarn", "5206": "Cotton yarn", "5401": "Thread", "5508": "Thread",
    "5208": "Cotton fabric", "5209": "Cotton fabric", "5210": "Cotton fabric", "5211": "Cotton fabric", "5212": "Cotton fabric",
    "5309": "Linen fabric", "5311": "Linen fabric",
    "5407": "Synthetic fabric", "5512": "Synthetic fabric", "5513": "Synthetic fabric", "5514": "Synthetic fabric",
    "5515": "Synthetic fabric", "5516": "Viscose fabric", "5408": "Viscose fabric",
    "5501": "Fiber & yarn", "5502": "Fiber & yarn", "5503": "Fiber & yarn", "5506": "Fiber & yarn",
    "5509": "Fiber & yarn", "5510": "Fiber & yarn",
    "6001": "Knit fabric", "6002": "Knit fabric", "6003": "Knit fabric", "6004": "Knit fabric",
    "6005": "Knit fabric", "6006": "Knit fabric",
    "5601": "Padding & wadding", "5602": "Felt", "5603": "Nonwovens", "5604": "Elastic & cord",
    "5607": "Cord & twine", "5609": "Cord & twine",
    "5801": "Velvet & corduroy", "5804": "Lace", "5806": "Ribbons & tape", "5807": "Woven labels",
    "5808": "Braids & trims", "5810": "Embroidery", "5811": "Quilted fabric",
    "5903": "Coated fabric & interlining", "5902": "Tire cord", "5907": "Coated fabric & interlining",
    "4821": "Labels & tags", "4819": "Packaging", "4820": "Stationery", "4911": "Printed matter",
    "3923": "Plastic packaging", "3926": "Plastic trims & hangers", "3919": "Adhesive labels",
    "9606": "Buttons", "9607": "Zips", "8308": "Buckles, hooks & eyelets", "7117": "Costume jewelry",
    "8531": "Security tags", "8523": "RFID & data tags", "9618": "Mannequins",
    "8445": "Textile machinery", "8446": "Textile machinery", "8447": "Textile machinery",
    "8448": "Textile machinery parts", "8451": "Textile machinery", "8452": "Sewing machines",
    "2902": "Chemicals", "2905": "Chemicals", "2907": "Chemicals", "2921": "Chemicals", "2922": "Chemicals",
    "2941": "Antibiotics", "9019": "Massage equipment", "4412": "Plywood", "7226": "Steel",
    "9403": "Furniture", "9405": "Lighting", "4010": "Rubber belts", "8513": "Lamps",
}
SUPPLY_BY_CHAPTER = {"84": "Machinery", "85": "Electronics", "39": "Plastics", "73": "Steel parts",
                     "48": "Paper", "82": "Tools", "40": "Rubber", "61": "Garments", "62": "Garments",
                     "42": "Bags & leather goods", "29": "Chemicals", "94": "Furniture & lighting"}


def supplies(hs_codes):
    out = []
    for code in hs_codes:
        label = SUPPLY_BY_HEADING.get(code[:4]) or SUPPLY_BY_CHAPTER.get(code[:2])
        if label and label not in out:
            out.append(label)
    return out


# --- Rough country of a tier-2 supplier, from its name ------------------------
# Only clear signals: a place name or a legal suffix tied to one country.
# Anything else stays unknown rather than guessed.
KNOWN = {
    "MURATA": "JP", "TOYOTA INDUSTRIES": "JP", "TSUDAKOMA": "JP", "SHIMA SEIKI": "JP", "BANDO CHEMICAL": "JP",
    "RIETER AG": "CH", "RIETER COMPONENTS GERMANY": "DE", "PICANOL": "BE", "MOUSER": "US",
    "METTETAL": "FR", "TANNERIE": "FR", "ANTIBIOTICE": "RO", "COMERCIO DE COUROS": "BR",
    "JUNGWOO KOREA": "KR", "J-LAND KOREA": "KR", "SAE-A": "KR", "SHINSEGAE": "KR", "KUMSUNG": "KR",
    "BOSIDENG": "CN", "IBERTEX": "ES", "TYCO INTEGRATED SECURITY": "ES", "NEMARK": "ES",
    "MANGO MNG": "ES", "COSTA GUERR": "PT", "NILORN PORTUGAL": "PT", "DONGKUK": "KR",
    "FREUDENBERG": "DE", "OSIM INTERNATIONAL": "SG", "KEMPAR": "SG", "MAX MARA": "IT",
    "PROLOGIC": "HK", "MAX TRADE": "HK", "PAXAR (CHINA)": "CN", "PAXAR CHINA": "CN",
    "CHINA STEEL CHEMICAL": "TW", "HOMESENSE": "GB", "KURT GEIGER": "GB",
}
CHINA_PLACES = ("SHANGHAI", "JIANGSU", "ZHEJIANG", "GUANGZHOU", "DONGGUAN", "HANGZHOU", "SUZHOU", "YIWU",
                "SHAOXING", "CHANGZHOU", "CHANGSHU", "NINGBO", "FUZHOU", "WUXI", "JIAXING", "YIXING", "ZHUJI",
                "NANTONG", "QUANZHOU", "TAIZHOU", "ZHONGSHAN", "HUIZHOU", "HUIAZHOU", "YANCHENG", "WENAN",
                "CHANGSHAN", "SHENZHEN", "XIAMEN", "QINGDAO", "(CHINA)", "CHINA ")
PATTERNS = [
    ("HK", r"HONG ?KONG|\(HK\)|\bHK\b|KWUN TONG|KWAI CHUNG"),
    ("VN", r"VIET ?NAM|\bVINA\b|CONG TY"),
    ("BD", r"BANGLADESH"),
    ("LK", r"LANKA"),
    ("KR", r"KOREA"),
    ("IN", r"\bINDIA\b|\bPVT\b|PRIVATE LIMITED"),
    ("TR", r"SANAYI|TICARET|\bTIC\b|MATBAACILIK|OTOMASYON|\bA\.S\.$"),
    ("IT", r"\bS\.?P\.?A\b|\bS\.? ?R\.? ?L\b|C\.S\.P\.A"),
    ("PT", r"\bLDA\b"),
    ("ES", r"\bS\.?L\.?U?\b|ESPA[ÑN]A"),
    ("FR", r"\bSAS\b"),
    ("BE", r"\bSPRL\b"),
    ("DE", r"\bGMBH\b|\bKG\b"),
    ("SG", r"\bPTE\b"),
    ("AU", r"\bPTY\b"),
    ("NL", r"\bB\.?V\.?$"),
    ("US", r"\bLLC\b"),
]


def guess_country(name):
    up = name.upper()
    for key, cc in KNOWN.items():
        if key in up:
            return cc
    for cc, pattern in PATTERNS[:1]:  # Hong Kong before the China place names
        if re.search(pattern, up):
            return cc
    if any(p in up for p in CHINA_PLACES):
        return "CN"
    for cc, pattern in PATTERNS[1:]:
        if re.search(pattern, up):
            return cc
    return None


# --- Tidying names -----------------------------------------------------------
LOWER = {"and", "of", "de", "la", "del", "y", "the"}
TWO_UPPER = {"HK", "SA", "SL", "NV", "BV", "AG", "UK", "US", "IM", "AP", "KP", "DS", "TP", "TJ", "RK", "SK", "BD",
             "II", "AM", "GW", "ID", "IC", "FZ", "LG"}
KEEP_UPPER = {"LLC", "LLP", "JSC", "PLC", "SRL", "SPA", "SAS", "SAU", "SLU", "GMBH",
              "USA", "PCC", "SND", "CTA", "IIPI", "ATC", "IDT", "SML", "FGL", "GGS", "KCC", "JCON", "MFCINT",
              "RAON", "FNC", "THK", "QVC", "TJ", "DS", "TP", "DHN", "INTEC", "ITX"}


def _word(m):
    w = m.group(0)
    up = w.upper()
    if up in KEEP_UPPER or up in TWO_UPPER or len(w) == 1:
        return "GmbH" if up == "GMBH" else up
    if up.lower() in LOWER and m.start() > 0:
        return up.lower()
    return up.capitalize()


def tidy(name):
    """'SAHU EXPORTS PRIVATE LIMITED' -> 'Sahu Exports Pvt Ltd'. Leaves mixed-case names alone."""
    name = re.sub(r"\s+", " ", name).strip(" ,.;")
    if name != name.upper() and name != name.lower():
        return name
    name = re.sub(r"PRIVATE LIMITED|PVT\.? LTD\.?", "PVT LTD", name.upper())
    name = re.sub(r"JOINT STOCK COMPANY", "JSC", name)
    name = re.sub(r"\bLIMITED\b", "LTD", name)
    name = re.sub(r"[A-Za-zÀ-ÿ]+", _word, name)
    return re.sub(r"\s*,\s*", ", ", name).replace(", Ltd", " Ltd").replace("Co., ", "Co. ").replace("Co.,", "Co.")


def dedupe(names):
    seen, out = set(), []
    for n in names:
        key = re.sub(r"[^a-z]", "", n.lower())[:18]
        if key not in seen:
            seen.add(key)
            out.append(n)
    return out


# --- Main --------------------------------------------------------------------
def load(path: Path):
    return {row["id"]: row for row in map(json.loads, path.read_text().splitlines()) if row}


def build(row, supplier):
    """supplier: the already-built supplier dict (name, place, products, materials)."""
    naics = row.get("naics") or ""
    apparel = naics.startswith(APPAREL_NAICS)
    alias_count = row.get("alias_count", len(row.get("aliases", [])) + 1)

    flags = []
    if row.get("note"):
        flags.append({"kind": "info", "text": row["note"] + "."})
    if row.get("industry") and not apparel and not row.get("note"):
        flags.append({"kind": "warn", "text": f"Tradeverifyd lists the industry as “{row['industry']}”, which doesn't match "
                                              "the clothing it ships. The record may be misclassified, or may mix up "
                                              "several companies with similar names."})
    if alias_count >= MANY_NAMES:
        flags.append({"kind": "warn", "text": f"This record has {alias_count} different names on file, and some look like "
                                              "different businesses, so it may merge several companies. Buyers and suppliers "
                                              "below may not all belong to the company that supplies Inditex."})

    buyer_names = dedupe([tidy(b) for b in row.get("buyers", [])])
    brands = []
    for b in row.get("buyers", []):
        brand = inditex_brand(b)
        if brand and brand not in brands:
            brands.append(brand)
    others = [b for b in buyer_names if not inditex_brand(b)]

    tier2 = []
    for name, hs in row.get("suppliers", []):
        if inditex_brand(name) or name.upper().startswith(row["legal_name"][:12].upper()):
            continue  # skip Inditex itself and self-references
        tier2.append({"name": tidy(name), "supplies": supplies(hs), "country": guess_country(name)})
    tier2 = [t for i, t in enumerate(tier2) if t["name"] not in {x["name"] for x in tier2[:i]}]

    role = next((label for prefix, label in ROLE_BY_NAICS if naics.startswith(prefix)), None) if apparel else None
    if row.get("note", "").startswith("Retailer"):
        role = "Fashion retailer"
    elif row.get("note", "").startswith("Warehouse"):
        role = "Robotics company"

    return {
        "legalName": tidy(row["legal_name"]),
        "aliases": [a for a in dedupe([tidy(a) for a in row.get("aliases", [])])
                    if a.lower() != tidy(row["legal_name"]).lower()][:4],
        "aliasCount": alias_count,
        "industry": row.get("industry"),
        "legalForm": row.get("legal_form"),
        "lei": row.get("lei"),
        "leiCount": row.get("lei_count", 1 if row.get("lei") else 0),
        "companyNumber": row.get("company_number"),
        "buyersTotal": row.get("buyers_total", 0),
        "otherBuyers": others,
        "inditexBrands": brands,
        "tier2Total": row.get("suppliers_total", 0),
        "tier2": tier2,
        "flags": flags,
        "summary": summary(supplier, role, row.get("buyers_total", 0), others),
    }


NOT_PRODUCTS = {"Security tags / alarms", "Labels & tags", "Plastic trims & accessories", "Electronic devices",
                "Zips", "Nails & pins", "Plastic packaging", "Packaging", "Woven labels", "Hooks, eyes & buckles",
                "Buttons", "Data media", "Lamps"}


def summary(s, role, buyers_total, others):
    goods = [p.lower() for p in s["products"] if p not in NOT_PRODUCTS][:3] or ["goods"]
    what = ", ".join(goods[:-1]) + " and " + goods[-1] if len(goods) > 1 else goods[0]
    fibers = [m.lower() for m in s["materials"] if m not in ("Plastic", "Paper", "Base metal")][:2]
    city = s["place"].split(" (")[0].split(",")[-1].strip()
    if role == "Fashion retailer":
        text = f"Fashion retailer in {city} that buys stock from Inditex to sell in its own region."
    elif role == "Robotics company":
        text = f"Robotics company in {city} supplying warehouse sorting robots and equipment to Inditex."
    else:
        text = f"{role or 'Supplier'} in {city} shipping {what} to Inditex"
        text += f", mostly {' and '.join(fibers)}." if fibers else "."
    if buyers_total > 1:
        text += f" Trades with {buyers_total:,} buyers on record"
        text += f", including {' and '.join(others[:2])}." if others else "."
    return text
