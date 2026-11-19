#!/usr/bin/env python3
"""Turn data/suppliers_raw.json into data/suppliers.js for the globe page.

For each supplier this adds:
  materials  - fibres / raw materials inferred from the HS codes it ships
  products   - product types inferred from the 4-digit HS headings
  uncertain  - True when the location can't be trusted (see README)
  lat/lng    - nudged slightly so suppliers in the same city don't overlap

Usage:  python3 scripts/build_data.py
"""
import json
import math
from collections import Counter
from pathlib import Path

import details  # company profile, buyers and tier-2 suppliers (scripts/details.py)

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "suppliers_raw.json"
OUT = ROOT / "data" / "suppliers.js"
DETAILS = ROOT / "data" / "details_raw.jsonl"

# Suppliers with more addresses than this are probably several same-named
# companies merged into one record.
UNCERTAIN_ADDRESS_COUNT = 50

# --- Products, by 4-digit HS heading --------------------------------------
PRODUCTS = {
    "3923": "Plastic packaging", "3924": "Plastic homeware", "3926": "Plastic trims & accessories",
    "4202": "Handbags & cases", "4203": "Leather apparel & belts", "4205": "Leather articles",
    "4807": "Paper & board", "4821": "Labels & tags", "4819": "Packaging",
    "5208": "Cotton fabric", "5210": "Cotton-blend fabric", "5408": "Viscose filament fabric",
    "5603": "Nonwovens", "5804": "Lace & tulle", "5807": "Woven labels", "5810": "Embroidery",
    "5903": "Coated fabric", "6001": "Pile knit fabric",
    "6101": "Coats & jackets", "6103": "Suits & trousers", "6104": "Dresses, skirts & trousers",
    "6105": "Shirts", "6106": "Blouses", "6109": "T-shirts & vests", "6110": "Sweaters & cardigans",
    "6111": "Babywear", "6114": "Other garments", "6115": "Hosiery & socks", "6117": "Clothing accessories",
    "6201": "Coats & jackets", "6202": "Coats & jackets", "6203": "Suits & trousers",
    "6204": "Dresses, skirts & trousers", "6205": "Shirts", "6206": "Blouses", "6207": "Underwear & sleepwear",
    "6208": "Underwear & sleepwear", "6209": "Babywear", "6211": "Tracksuits & other garments",
    "6212": "Bras & lingerie", "6213": "Handkerchiefs", "6214": "Scarves & shawls", "6215": "Ties",
    "6217": "Clothing accessories", "6304": "Home furnishings", "6305": "Sacks & bags",
    "6405": "Footwear", "6505": "Hats", "6507": "Hat trims",
    "7117": "Costume jewellery", "7317": "Nails & pins", "8308": "Hooks, eyes & buckles", "8309": "Metal closures",
    "8513": "Lamps", "8523": "Data media", "8531": "Security tags / alarms", "8543": "Electronic devices",
    "9503": "Toys", "9606": "Buttons", "9607": "Zips",
}
EQUIPMENT_CHAPTERS = {"73", "84", "85"}  # used when a supplier ships nothing else

# --- Materials --------------------------------------------------------------
# Most garment headings use the 5th/6th digit for fibre. These tables cover the
# codes that actually appear in the data.
FIBRE_BY_HS6 = {
    # knitted (61)
    "610130": "Synthetic", "610342": "Cotton", "610343": "Synthetic", "610349": "Other fibres",
    "610442": "Cotton", "610443": "Synthetic", "610444": "Viscose / artificial", "610449": "Other fibres",
    "610452": "Cotton", "610453": "Synthetic", "610459": "Other fibres",
    "610462": "Cotton", "610463": "Synthetic", "610469": "Other fibres",
    "610510": "Cotton", "610520": "Synthetic", "610590": "Other fibres",
    "610610": "Cotton", "610620": "Synthetic",
    "610710": "Cotton", "610910": "Cotton", "610990": "Other fibres",
    "611011": "Wool", "611020": "Cotton", "611030": "Synthetic", "611090": "Other fibres",
    "611120": "Cotton", "611130": "Synthetic",
    "611420": "Cotton", "611430": "Synthetic", "611490": "Other fibres",
    # woven (62)
    "620130": "Cotton", "620140": "Synthetic", "620230": "Cotton", "620240": "Synthetic",
    "620290": "Other fibres",
    "620332": "Cotton", "620333": "Synthetic", "620339": "Other fibres",
    "620342": "Cotton", "620343": "Synthetic", "620349": "Other fibres",
    "620422": "Cotton", "620432": "Cotton", "620433": "Synthetic", "620439": "Other fibres",
    "620442": "Cotton", "620443": "Synthetic", "620444": "Viscose / artificial", "620449": "Other fibres",
    "620452": "Cotton", "620453": "Synthetic", "620459": "Other fibres",
    "620462": "Cotton", "620463": "Synthetic", "620469": "Other fibres",
    "620520": "Cotton", "620530": "Synthetic", "620590": "Other fibres",
    "620630": "Cotton", "620640": "Synthetic", "620690": "Other fibres",
    "620721": "Cotton", "620821": "Cotton", "620822": "Synthetic", "620829": "Other fibres",
    "620891": "Cotton", "620892": "Synthetic", "620899": "Other fibres",
    "620920": "Cotton", "620930": "Synthetic", "620990": "Other fibres",
    "621133": "Synthetic", "621142": "Cotton", "621143": "Synthetic", "621149": "Other fibres",
    "621320": "Cotton", "621390": "Other fibres",
    "621410": "Silk", "621420": "Wool", "621430": "Synthetic", "621440": "Viscose / artificial",
    "621490": "Other fibres", "621520": "Synthetic",
    "630492": "Cotton", "630491": "Other fibres", "630499": "Other fibres",
}
MATERIAL_BY_HEADING = {
    "4203": "Leather", "4205": "Leather", "4202": "Leather / textile / plastic",
    "5208": "Cotton", "5210": "Cotton", "5408": "Viscose / artificial",
    "3923": "Plastic", "3924": "Plastic", "3926": "Plastic", "9606": "Plastic",
    "7117": "Base metal", "7317": "Base metal", "8308": "Base metal", "8309": "Base metal", "9607": "Base metal",
    "4807": "Paper", "4821": "Paper", "4819": "Paper",
}


def describe(hs_codes):
    products, materials = Counter(), Counter()
    for code in hs_codes:
        heading, hs6 = code[:4], code[:6]
        if heading in PRODUCTS:
            products[PRODUCTS[heading]] += 1
        material = FIBRE_BY_HS6.get(hs6) or MATERIAL_BY_HEADING.get(heading)
        if material:
            materials[material] += 1
    if not products and {c[:2] for c in hs_codes} & EQUIPMENT_CHAPTERS:
        products["Warehouse equipment"] += 1
    # Most frequent first
    return [p for p, _ in products.most_common()], [m for m, _ in materials.most_common()]


def jitter(suppliers):
    """Spread suppliers that share (almost) the same point around a small circle."""
    groups = {}
    for s in suppliers:
        key = (round(s["lat"], 1), round(s["lng"], 1))
        groups.setdefault(key, []).append(s)
    for group in groups.values():
        if len(group) < 2:
            continue
        for i, s in enumerate(group):
            angle = 2 * math.pi * i / len(group)
            s["lat"] = round(s["lat"] + 0.12 * math.sin(angle), 4)
            s["lng"] = round(s["lng"] + 0.12 * math.cos(angle), 4)


def main():
    raw = json.loads(RAW.read_text())
    suppliers = []
    for s in raw["suppliers"]:
        products, materials = describe(s["hs"])
        suppliers.append({
            "id": s["id"],
            "name": s["name"],
            "country": s["country"],
            "place": s["place"],
            "lat": s["lat"],
            "lng": s["lng"],
            "score": s["score"],
            "level": s["level"],
            "products": products,
            "materials": materials,
            "hsCount": len(s["hs"]),
            "hs": s["hs"],
            "addressCount": s["address_count"],
            "uncertain": bool(s.get("location_missing")) or s["address_count"] > UNCERTAIN_ADDRESS_COUNT,
            "locationMissing": bool(s.get("location_missing")),
        })
    rows = details.load(DETAILS)
    for s in suppliers:
        if s["id"] in rows:
            s["details"] = details.build(rows[s["id"]], s)
    missing = [s["name"] for s in suppliers if "details" not in s]
    if missing:
        print("No company details for:", ", ".join(missing))
    jitter(suppliers)
    payload = {"source": raw["source"], "buyer": raw["buyer"], "suppliers": suppliers}
    OUT.write_text("// Generated by scripts/build_data.py, do not edit by hand.\n"
                   "window.SUPPLY_DATA = " + json.dumps(payload, ensure_ascii=False, indent=1) + ";\n")
    print(f"Wrote {len(suppliers)} suppliers to {OUT.relative_to(ROOT)}")
    unmapped = sorted({c[:4] for s in raw["suppliers"] for c in s["hs"]} - set(PRODUCTS))
    if unmapped:
        print("HS headings without a product label:", ", ".join(unmapped))


if __name__ == "__main__":
    main()
