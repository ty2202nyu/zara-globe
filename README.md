# Zara Supply Globe

An interactive 3D globe showing where Zara's parent company, **Inditex**, sources its materials and finished goods, and the **Tradeverifyd risk score** for each vendor.

Each supplier is a coloured column on the globe, with an animated arc to Inditex HQ in Arteixo, Spain. Click a supplier (on the globe or in the list) to see:

- its Tradeverifyd score and risk level
- the materials it ships (cotton, synthetic, viscose, leather, wool, silk…)
- the product types (dresses, coats, handbags, costume jewellery…)
- the raw HS customs codes behind those labels

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
app.js                   globe + panel logic (globe.gl 2.27.2)
data/suppliers_raw.json  supplier data from Tradeverifyd, plus hand-added coordinates
data/suppliers.js        generated: what the page actually loads
scripts/build_data.py    turns raw data into suppliers.js
```

After you edit `data/suppliers_raw.json`, run `python3 scripts/build_data.py` to regenerate `data/suppliers.js`.

## Where the data comes from

All supplier, score and address data comes from **Tradeverifyd**, pulled through its MCP connector on 2026-11-19:

1. **Buyer:** `Industria de Diseño Textil SA` (Inditex, Zara's parent), entity `c339c0e0-5a87-4eb6-914f-c382e529b723`.
2. **Suppliers:** its inbound trade relationships (58 records). One internal Inditex entity ("Zara Mexico Contrato…") was dropped, leaving **57 vendors** (41 in India, 16 in Vietnam).
3. **Scores:** `entity_score` for each vendor. Scores range from **700 to 737**, and every vendor is rated **Low** risk.
4. **Locations:** the first address on file from `entity_addresses`, geocoded by hand to approximate city-level coordinates.
5. **Materials and products:** inferred from the HS codes on each trade relationship (see `scripts/build_data.py`). For garments, the 6-digit HS subheading encodes the fibre (for example, `620442` means women's dresses of cotton).

### Caveats

- **Locations are approximate.** Coordinates are city-level, not factory-level. 16 vendors are flagged as uncertain and drawn semi-transparent with a pulsing ring:
  - 9 have more than 50 addresses on file (for example "Bharat Sales" has 3,921). These records probably merge several companies with the same name, so the address shown may not be the one supplying Inditex.
  - 7 have no usable address and are placed at the centre of their country.
- **Colour shows relative score only.** The colour scale stretches across 700–737 so you can see differences, but Tradeverifyd rates all of them Low risk.
- **This is a partial view.** These are only the suppliers in Tradeverifyd's trade records for this one Inditex entity. Inditex publishes a much larger supplier list (thousands of factories, including Bangladesh, Turkey, Morocco, China and others), and those aren't included here.
- **No sanctions or forced-labour check yet.** The data doesn't include annotations such as sanctions or forced-labour flags. Tradeverifyd's `entity_annotations` tool could add them.

## Updating the data

The Tradeverifyd data comes from an MCP connector rather than a public API, so the simplest way to refresh it is to ask Claude Code (with the Tradeverifyd connector enabled) to re-pull the suppliers and update `data/suppliers_raw.json`. Then run the build script.

Ideas for extending it:
- Add Inditex's other entities (for example `ITX Nederland B.V.` or the Indian entity `b4e7c54b-…`) as additional buyers.
- Go a tier deeper: fetch each vendor's own suppliers (fabric mills, yarn spinners) to trace materials back toward raw fibre.
- Add annotation flags (sanctions, forced labour) as a separate risk layer.
