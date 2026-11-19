# Zara Supply Globe

An interactive 3D globe showing where Zara's parent company, **Inditex**, sources its materials and finished goods, and the **Tradeverifyd risk score** for each vendor.

Each supplier is a colored column on the globe, with an animated arc to Inditex HQ in Arteixo, Spain. Click a supplier (on the globe or in the list) to see:

- its Tradeverifyd score and risk level
- the materials it ships (cotton, synthetic, viscose, leather, wool, silk…)
- the product types (dresses, coats, handbags, costume jewelry…)
- the raw HS customs codes behind those labels
- a one-line summary of the company
- **the company:** registered name, other names, industry, company type, registration number and global ID (LEI)
- **who else it sells to:** how many buyers it has on record, and some of the other brands
- **where its materials come from:** its own suppliers (fabric mills, label and button makers), with gold lines on the globe from their countries
- warnings when the record looks unreliable, for example a company listed under an unrelated industry

Click the **Inditex HQ** column in Spain, or **About Inditex and its supply chain**, for an overview of the company and how materials travel from fiber to store.

You can filter by country, filter by material, search, and hide suppliers whose location is uncertain.

**Live site:** <https://ty2202nyu.github.io/zara-globe/>

## Run it

No build tools or install needed. Serve the folder with any static server:

```bash
cd ~/zara-globe
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

Opening `index.html` directly from disk also works in most browsers. You need an internet connection for the globe library and the Earth textures, which load from unpkg.

## Project layout

```
index.html               page structure
styles.css               styling (desktop side panel, phone bottom sheet)
app.js                   globe + panel logic (globe.gl 2.27.2), including the Inditex overview
data/suppliers_raw.json  supplier data from Tradeverifyd, plus hand-added coordinates
data/details_raw.jsonl   company details, top buyers and top suppliers for each vendor
data/suppliers.js        generated: what the page actually loads
scripts/build_data.py    turns raw data into suppliers.js
scripts/details.py       turns details_raw.jsonl into the panel's company sections
```

After you edit `data/suppliers_raw.json` or `data/details_raw.jsonl`, run `python3 scripts/build_data.py` to regenerate `data/suppliers.js`.

## Where the data comes from

All supplier, score and address data comes from **Tradeverifyd**, pulled through its MCP connector on 2026-11-19:

1. **Buyer:** `Industria de Diseño Textil SA` (Inditex, Zara's parent), entity `c339c0e0-5a87-4eb6-914f-c382e529b723`.
2. **Suppliers:** its inbound trade relationships (58 records). One internal Inditex entity ("Zara Mexico Contrato…") was dropped, leaving **57 vendors** (43 in India, 14 in Vietnam).
3. **Scores:** `entity_score` for each vendor. Scores range from **700 to 737**, and every vendor is rated **Low** risk.
4. **Locations:** the first address on file from `entity_addresses`, geocoded by hand to approximate city-level coordinates.
5. **Company details:** `entity_details` (names, industry, IDs) and `entity_trade_relationships` in both directions: the first few buyers and suppliers, plus their totals. Only the top few of each are stored. Supplier countries are guessed from company names (for example "Shanghai…" or "…(HK) Ltd"), and left blank when unclear.
6. **Materials and products:** inferred from the HS codes on each trade relationship (see `scripts/build_data.py`). For garments, the 6-digit HS subheading encodes the fiber (for example, `620442` means women's dresses of cotton).

### Caveats

- **Locations are approximate.** Coordinates are city-level, not factory-level. 16 vendors are flagged as uncertain and drawn semi-transparent with a pulsing ring:
  - 9 have more than 50 addresses on file (for example "Bharat Sales" has 3,921). These records probably merge several companies with the same name, so the address shown may not be the one supplying Inditex.
  - 7 have no usable address and are placed at the center of their country.
- **Color shows relative score only.** The color scale stretches across 700–737 so you can see differences, but Tradeverifyd rates all of them Low risk.
- **This is a partial view.** These are only the suppliers in Tradeverifyd's trade records for this one Inditex entity. Inditex publishes a much larger supplier list (thousands of factories, including Bangladesh, Turkey, Morocco, China and others), and those aren't included here.
- **Some records merge different companies.** Tradeverifyd sometimes groups unrelated firms with similar names into one record. For example, "Paramount Limited" is listed as a surgical-instrument maker. The panel flags records whose industry doesn't match clothing, or that carry 20+ names.
- **Two vendors aren't factories.** Mitra Adiperkasa Vietnam is a retailer that buys from Inditex, and Unbox Robotics supplies warehouse robots.
- **No sanctions or forced-labor check yet.** The data doesn't include annotations such as sanctions or forced-labor flags. Tradeverifyd's `entity_annotations` tool could add them.

## Updating the data

The Tradeverifyd data comes from an MCP connector rather than a public API, so the simplest way to refresh it is to ask Claude Code (with the Tradeverifyd connector enabled) to re-pull the suppliers and update `data/suppliers_raw.json`. Then run the build script.

Ideas for extending it:
- Add Inditex's other entities (for example `ITX Nederland B.V.` or the Indian entity `b4e7c54b-…`) as additional buyers.
- Go a tier deeper: fetch each vendor's own suppliers (fabric mills, yarn spinners) to trace materials back toward raw fiber.
- Add annotation flags (sanctions, forced labor) as a separate risk layer.
