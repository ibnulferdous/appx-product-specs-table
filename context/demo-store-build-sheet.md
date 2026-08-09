# Demo Store Build Sheet — D1–D7

Concrete build spec for the public demo store (`launch-support-checklist.md` § Demo store
track). Covers **D1** (niche + brand), **D4** (catalog, types, collections, metafields), and
the **D6/D7** template + routing plan, plus a locked image-prompt system.

> **Status:** DRAFT PROPOSAL — brand name not yet chosen. Everything below uses the lead
> pick **Kestra**; swapping to another name is a find-replace on that word plus the model
> names. Nothing here is written to the checklist yet.

> 🔴 **D5 still gates D6/D7.** Build the catalog (D4) freely — it is app-independent. Do
> **not** build templates until the production database exists, or pick option (b)
> knowingly. See D5 in the checklist.

---

## 1. Brand

### Lead pick — **KESTRA**

A kestrel is a falcon that **hovers** in place to watch the ground. That is literally what a
camera drone does, which gives the brand a story without needing to say it. Five letters,
one obvious pronunciation, trivial to set as a wordmark over a product shot.

Model families follow the raptor theme, which makes the line-up read as designed rather
than assembled:

| Model | Tier |
| --- | --- |
| **Wren 2** / **Wren 2 Pro** | sub-250 g entry |
| **Merlin 3** | mid folding (a merlin is a small falcon) |
| **Talon 2 Pro** | flagship |
| **Dart FPV** / **Dart Race Kit** | FPV |

### Alternates

| Name | Read | Note |
| --- | --- | --- |
| **ARDEA** | Latin, heron genus — elegant, premium | Pronunciation is ambiguous (AR-day-uh / ar-DEE-uh) |
| **VOLARA** | From *volare*, "to fly" — soft, premium | ⚠️ Volara is an existing closed-cell foam trademark. Different class, but check |
| **TALVA** | Invented, no meaning — lowest collision odds | Also the least evocative |
| **CORVUS AERIAL** | Raven — darker, pro/cinema feel | "Corvus" is in use in marine batteries and insurance |

🚫 **Rejected:** *Cirra* — too close to **Cirrus Aircraft**, which is a real aviation
manufacturer. Same-industry similarity is the one collision class actually worth avoiding.

### ⚠️ Before D2 — clearance you must do yourself

I can't clear a trademark. For whichever name you pick, run all four:

1. Plain web search + Shopify App Store search
2. USPTO TESS and EUIPO eSearch (goods classes **9** and **28**)
3. `.com` availability
4. Shopify store-name availability

### Store identity

- **Store name:** Kestra
- **Tagline:** *Cameras that fly.*
- **Colourway:** matte **ivory-white** body · **deep navy `#1F2A44`** accents · brushed
  aluminium gimbal ring. Chosen to be distinct from DJI (grey/white), Autel (orange),
  Skydio (dark grey), Parrot (khaki) — and because navy gives the Style tab's accent
  themes something that actually reads, which is the [[dev-store-theme-horizon-no-dark-scheme]]
  problem in D3.
- **Footer line:** *Fictional brand. Demo store for Appx — Product Specs Table.*
  Tells the App Store reviewer what they're looking at, costs nothing.

---

## 2. Catalog — 12 products, 4 types

Prices are USD, all products in stock, all `Kestra` as vendor.

| # | Product | Type | Price | Collections |
| --- | --- | --- | --- | --- |
| 1 | Kestra Wren 2 | `Camera Drone` | 429 | All Drones, Sub-250 g, Best Sellers |
| 2 | Kestra Wren 2 Pro | `Camera Drone` | 629 | All Drones, Sub-250 g |
| 3 | Kestra Merlin 3 | `Camera Drone` | 1,149 | All Drones, Best Sellers |
| 4 | **Kestra Talon 2 Pro** | `Camera Drone` | 1,899 | All Drones |
| 5 | Kestra Dart FPV | `FPV Drone` | 699 | All Drones |
| 6 | Kestra Dart Race Kit | `FPV Drone` | 549 | All Drones |
| 7 | Wren Intelligent Flight Battery | `Battery & Charger` | 69 | **Flight Essentials** |
| 8 | Talon Intelligent Flight Battery Plus | `Battery & Charger` | 159 | **Flight Essentials** |
| 9 | Kestra 100 W Four-Bay Charging Hub | `Battery & Charger` | 119 | **Flight Essentials** |
| 10 | Kestra ND Filter Set (ND8/16/32/64) | `Accessory` | 59 | **Flight Essentials** |
| 11 | Kestra Low-Noise Propeller Set | `Accessory` | 19 | **Flight Essentials** |
| 12 | **Kestra Shoulder Case** | `Accessory` | 89 | **Flight Essentials** |

### Collections

| Collection | Type | Members | Routed? |
| --- | --- | --- | --- |
| All Drones | manual | 1–6 | no — merchandising only |
| Sub-250 g | manual | 1, 2 | no |
| Best Sellers | manual | 1, 3 | no — homepage |
| **Flight Essentials** | manual | 7–12 | ✅ **COLLECTION-scope target** |

🔴 **`Flight Essentials` must contain NO camera or FPV drone.** If it did, that drone would
match both the COLLECTION rule and a PRODUCT_TYPE rule — a cross-dimension pair with no
PRODUCT-attributable carve-out to resolve it, so `evaluateActivationConflicts` blocks the
second template from ever going ACTIVE. This is the single easiest way to break the demo.

---

## 3. Metafield definitions (D4)

All under namespace **`custom`**, all **product**-owned.

🔴 **Turn on Storefront API access as you create each definition, before entering any
values.** This is the app's #1 silent blank-cell cause and the reason D4 calls it out. Doing
it retroactively across 22 definitions is miserable.

| Key | Type | Used by |
| --- | --- | --- |
| `takeoff_weight` | **`weight`** | drones |
| `dimensions_folded` | **`list.dimension`** | drones |
| `dimensions_unfolded` | **`list.dimension`** | camera drones |
| `propeller_length` | **`dimension`** | propellers |
| `max_flight_time` | `number_integer` | drones |
| `max_speed` | **`list.number_integer`** | drones |
| `max_transmission_range` | `number_decimal` | drones |
| `noise_level` | `number_decimal` | drones, propellers |
| `max_video_bitrate` | `number_integer` | camera drones, FPV |
| `video_latency` | `number_integer` | FPV |
| `battery_capacity` | `number_integer` | drones, batteries |
| `charge_time` | `number_integer` | drones, batteries |
| `wind_resistance` | `single_line_text_field` | drones |
| `operating_temperature` | `single_line_text_field` | all |
| `sensor` | `single_line_text_field` | camera drones, FPV |
| `lens` | `single_line_text_field` | camera drones |
| `iso_range` | `single_line_text_field` | camera drones |
| `gimbal_range` | `single_line_text_field` | camera drones |
| `internal_storage` | `single_line_text_field` | camera drones |
| `warranty` | `single_line_text_field` | all |
| `video_resolutions` | `list.single_line_text_field` | camera drones, FPV |
| `photo_formats` | `list.single_line_text_field` | camera drones |
| `obstacle_sensing` | `list.single_line_text_field` | camera drones |
| `flight_modes` | `list.single_line_text_field` | drones |
| `in_the_box` | `list.single_line_text_field` | all |
| `compatible_models` | `list.single_line_text_field` | batteries, accessories |
| `filter_grades` | `list.single_line_text_field` | ND filter set |

**Coverage against D4's required list:**

| D4 requirement | Satisfied by |
| --- | --- |
| plain `single_line_text_field` | `wind_resistance`, `sensor`, `lens`, … (8 of them) |
| a measurement type | `takeoff_weight` (`weight`), `propeller_length` (`dimension`) |
| a `list.*` type | `max_speed` (`list.number_integer`) |
| metaobject-backed taxonomy | `shopify.*` — see below |
| 🎯 **the untested `.unit` list branch** | **`dimensions_folded` / `dimensions_unfolded` (`list.dimension`)** |

> `list.dimension` is the reason this niche was worth choosing. The duck-typed `.unit`
> branch in `spec-table-value.liquid` (the `.unit → .rating → .title → …` chain) is
> exercised by **no test in the suite** — folded/unfolded dimensions are a real drone spec
> that finally proves it on a live storefront.
> ⚠️ Keep all three components in the **same unit** (mm) or the rendered row reads oddly.

### Taxonomy metafields (`shopify.*`)

These attach automatically once you set the product **Category**, and the available set
depends on the category — so don't pre-plan keys, do this:

1. Set Category on one drone (Electronics → the drone/UAV category).
2. See which `shopify.*` attributes appear.
3. Fill them, and **check Storefront API access on each** — same trap.

Expect `shopify.power-source`, `shopify.battery-type`, `shopify.color`,
`shopify.connectivity-technology`. Those are metaobject-backed choice lists — the exact
class the 2026-08-04 `metafield_text: field:` fix was built for, so the demo re-proves that
path on a fresh store.

### 🟢 You do not need a metafield per row

A 45-row spec table needs ~22 metafields, not 45. The rest are **manual TEXT** rows (which
is what most merchants actually do) plus a handful of **SHOPIFY_FIELD** pills. Budget D4 on
27 definitions, not on 45.

---

## 4. Metafield values

### Camera drones

| Field | Wren 2 | Wren 2 Pro | Merlin 3 | Talon 2 Pro |
| --- | --- | --- | --- | --- |
| `takeoff_weight` | 246 g | 249 g | 595 g | 958 g |
| `dimensions_folded` | 142, 88, 58 mm | 142, 88, 62 mm | 178, 98, 84 mm | 224, 122, 102 mm |
| `dimensions_unfolded` | 262, 322, 92 mm | 262, 322, 96 mm | 348, 384, 108 mm | 398, 452, 128 mm |
| `max_flight_time` | 31 | 34 | 42 | 46 |
| `max_speed` | 5, 5, 15 | 6, 6, 16 | 8, 6, 19 | 8, 7, 23 |
| `max_transmission_range` | 12.0 | 15.0 | 20.0 | 25.0 |
| `wind_resistance` | Level 5 (10.7 m/s) | Level 5 (10.7 m/s) | Level 6 (13.8 m/s) | Level 7 (17.1 m/s) |
| `operating_temperature` | −10 °C to 40 °C | −10 °C to 40 °C | −10 °C to 40 °C | −20 °C to 45 °C |
| `sensor` | 1/1.3-inch CMOS, 48 MP | 1-inch CMOS, 50 MP | 1-inch 50 MP + 1/1.3-inch tele 48 MP | 4/3-inch 50 MP + 1/1.3-inch tele 48 MP + 1/2-inch ultra-wide 12 MP |
| `lens` | FOV 82°, f/1.7, 24 mm equiv. | FOV 84°, f/1.7–f/11, 24 mm equiv. | Wide FOV 84° f/1.7 · Tele FOV 35° f/2.8 | Wide FOV 88° f/1.6–f/16 · Tele FOV 32° f/2.8 · Ultra-wide FOV 118° f/2.2 |
| `iso_range` | 100–6400 auto, 100–12800 manual | 100–12800 auto, 100–25600 manual | 100–12800 auto, 100–25600 manual | 100–25600 auto, 100–51200 manual |
| `video_resolutions` | 4K/30fps; 2.7K/60fps; 1080p/120fps | 4K/60fps; 4K/30fps HDR; 2.7K/120fps; 1080p/240fps | 4K/120fps; 4K/60fps HDR; 2.7K/120fps; 1080p/240fps | 5.4K/60fps; 4K/120fps; 4K/60fps HDR; 2.7K/240fps; 1080p/240fps |
| `max_video_bitrate` | 100 | 150 | 180 | 240 |
| `photo_formats` | JPEG; DNG (RAW) | JPEG; DNG (RAW) | JPEG; DNG (RAW) | JPEG; DNG (RAW); HEIF |
| `gimbal_range` | Tilt −90° to +35°, Pan −20° to +20° | Tilt −135° to +50°, Pan −25° to +25° | Tilt −135° to +60°, Pan −30° to +30°, Roll −45° to +45° | Tilt −140° to +70°, Pan −40° to +40°, Roll −55° to +55° |
| `obstacle_sensing` | Downward; Forward | Forward; Backward; Downward | Forward; Backward; Lateral; Upward; Downward | Forward; Backward; Lateral; Upward; Downward; Omnidirectional binocular |
| `battery_capacity` | 2350 | 2590 | 4280 | 5320 |
| `charge_time` | 65 | 60 | 82 | 94 |
| `internal_storage` | 2 GB | 8 GB | 24 GB | 64 GB |
| `noise_level` | 78.5 | 79.2 | 81.4 | 83.0 |
| `flight_modes` | Sport; Normal; Cine | Sport; Normal; Cine | Sport; Normal; Cine; Tripod | Sport; Normal; Cine; Tripod; Waypoint |
| `warranty` | 1 year limited | 1 year limited | 1 year limited | 2 years limited |

`in_the_box` (all four): *Aircraft; Remote controller; Intelligent Flight Battery; USB-C
cable; Spare propellers (pair); Gimbal protector* — add *Carrying case* for Merlin 3 and
Talon 2 Pro.

### FPV drones

| Field | Dart FPV | Dart Race Kit |
| --- | --- | --- |
| `takeoff_weight` | 342 g | 268 g |
| `dimensions_folded` | 178, 178, 74 mm | 165, 165, 62 mm |
| `max_flight_time` | 16 | 9 |
| `max_speed` | 6, 6, 27 | 8, 8, 38 |
| `max_transmission_range` | 6.0 | 4.0 |
| `sensor` | 1/1.7-inch CMOS, 12 MP | 1/2.3-inch CMOS, 12 MP |
| `video_resolutions` | 4K/60fps; 2.7K/120fps; 1080p/120fps | 2.7K/60fps; 1080p/120fps |
| `max_video_bitrate` | 130 | 80 |
| `video_latency` | 28 | 19 |
| `battery_capacity` | 2000 | 1300 |
| `charge_time` | 45 | 32 |
| `noise_level` | 84.6 | 88.1 |
| `operating_temperature` | −10 °C to 40 °C | −10 °C to 40 °C |
| `flight_modes` | Normal; Sport; Manual | Acro; Sport; Manual |
| `compatible_models` | Kestra FPV Goggles V2; Kestra Motion Controller | Kestra FPV Goggles V2 |
| `warranty` | 1 year limited | 1 year limited |

### Batteries & charging

| Field | Wren Battery | Talon Battery Plus | Four-Bay Hub |
| --- | --- | --- | --- |
| `battery_capacity` | 2590 | 5320 | — |
| `charge_time` | 60 | 94 | — |
| `takeoff_weight` | 82 g | 336 g | 246 g |
| `max_flight_time` | 34 | 46 | — |
| `operating_temperature` | −10 °C to 40 °C | −20 °C to 45 °C | 5 °C to 40 °C |
| `compatible_models` | Wren 2; Wren 2 Pro | Merlin 3; Talon 2 Pro | Wren 2; Wren 2 Pro; Merlin 3; Talon 2 Pro |
| `in_the_box` | Battery | Battery | Charging hub; AC power cable; USB-C cable |
| `warranty` | 6 months limited | 6 months limited | 1 year limited |

Manual TEXT rows carry the rest (voltage `7.7 V` / `15.4 V`, energy `19.9 Wh` / `81.9 Wh`,
chemistry `LiPo 2S` / `LiPo 4S`, cycle life `200 cycles`, hub output `100 W`, ports `4`).

### Accessories

| Field | ND Filter Set | Propeller Set | Shoulder Case |
| --- | --- | --- | --- |
| `filter_grades` | ND8; ND16; ND32; ND64 | — | — |
| `propeller_length` | — | 6.0 in | — |
| `noise_level` | — | 76.4 | — |
| `takeoff_weight` | 12.8 g | 34 g | — |
| `compatible_models` | Merlin 3; Talon 2 Pro | Wren 2; Wren 2 Pro | — |
| `in_the_box` | 4 filters; microfibre pouch | 4 propellers; 8 screws; screwdriver | Case; shoulder strap |
| `warranty` | 6 months limited | 6 months limited | — |

🔴 **Leave the Shoulder Case with no spec metafields.** It is the EXCLUDE carve-out — it
must have nothing to render, so the "no table" outcome reads as deliberate.

---

## 5. Templates & routing (D6 / D7)

### 🔴 Read this before assigning anything

Your resolver's ACTIVE rule set is **disjoint** — `spec-table-resolve.liquid` says the
resolution order "is efficiency, never precedence." Two consequences that break the obvious
plan:

1. **A PRODUCT template does not override a TYPE template.** `classifyScopePair` returns
   `NEEDS_CHECK` for that cross-dimension pair, the Shopify probe finds the shared product,
   and activation is **blocked**.
2. **The only legal way to give one product its own table is the exclude carve-out.** The
   covering (TYPE) template must `EXCLUDE PRODUCT: X`, which lets `resolvedByExclude`
   subtract the collision. On the storefront, `shard.by_product` is checked *before* the
   exclude gate, so X still gets its own table. This is the documented "all products EXCEPT
   X, and X gets its own table" story.
3. 🚫 **No `ALL_PRODUCTS` template anywhere in this store.** `ALL_PRODUCTS` short-circuits to
   `OVERLAP` against every other scope and only a PRODUCT-attributable exclude can resolve
   it — so it cannot coexist with a PRODUCT_TYPE rule at all.

### The four templates

| # | Template | INCLUDE | EXCLUDE | Renders on |
| --- | --- | --- | --- | --- |
| **T1** | Camera Drone Specifications | `PRODUCT_TYPE: Camera Drone` | `PRODUCT: Talon 2 Pro` | Wren 2, Wren 2 Pro, Merlin 3 |
| **T2** | Talon 2 Pro — Full Specifications | `PRODUCT: Talon 2 Pro` | — | Talon 2 Pro |
| **T3** | FPV Drone Specifications | `PRODUCT_TYPE: FPV Drone` | — | Dart FPV, Dart Race Kit |
| **T4** | Power & Compatibility | `COLLECTION: Flight Essentials` | `PRODUCT: Shoulder Case` | Batteries ×2, Hub, ND Filters, Propellers |
| — | *(nothing)* | — | — | **Shoulder Case → no table** |

This covers all four tiers D7 asks for and **both** flavours of carve-out:

- **T1 → T2 redirect:** exclude sends Talon 2 Pro to its own richer table.
- **T4 suppress:** exclude makes the Shoulder Case render nothing at all.

**Activation order doesn't matter** — `resolvedByExclude` handles both directions (case 1
when T2 is the candidate, case 2 when T1 is). But do set T1's exclude *before* activating
either, or the first activation blocks.

🚫 **VENDOR scope is not demoed.** Every product is vendor `Kestra`, so a vendor rule would
be identical to `ALL_PRODUCTS` in effect and would overlap everything. Note it in the demo
copy rather than forcing it.

### Style differentiation (D6)

Give each template a different preset + accent so the Style tab's range is visible on the
storefront, not just in the editor:

| Template | Preset | Accent |
| --- | --- | --- |
| T1 | Classic | Navy |
| T2 | Multi-column | Navy |
| T3 | Banded | a contrasting accent |
| T4 | Accordion (`FIRST_OPEN`) | neutral |

### T2 row plan — the showcase table (~45 rows, 9 sections)

This is the one the listing demo link points at (D8). Mix all three data-source types per
D6.

| Section | Rows | Source |
| --- | --- | --- |
| **Aircraft** | Model · Weight · Dimensions (folded) · Dimensions (unfolded) · Max service ceiling · Operating temperature · GNSS · Internal storage | `{% field title %}`, METAFIELD ×4, TEXT ×3 |
| **Flight Performance** | Max flight time · Max hover time · Max ascent / descent / horizontal speed · Wind resistance · Max tilt angle · Noise level | METAFIELD ×4, TEXT ×3 |
| **Camera** | Sensor · Lens · ISO range · Shutter speed · Max photo size · Photo formats | METAFIELD ×4, TEXT ×2 |
| **Video** | Resolutions · Max bitrate · Formats · Colour modes · Digital zoom | METAFIELD ×2, TEXT ×3 |
| **Gimbal** | Stabilisation · Mechanical range · Controllable range · Max control speed | METAFIELD ×1, TEXT ×3 |
| **Sensing & Safety** | Obstacle sensing · Sensing range · Return-to-home · Auto landing · Geofencing | METAFIELD ×1, TEXT ×4 |
| **Transmission** | System · Max range · Live view quality · Latency · Frequency bands | METAFIELD ×1, TEXT ×4 |
| **Battery & Charging** | Capacity · Voltage · Chemistry · Energy · Charge time · Charger | METAFIELD ×2, TEXT ×4 |
| **Support** | Vendor · Product type · SKU · In the box · Warranty · Certification | `{% field vendor %}`, `{% field product_type %}`, `{% field sku %}`, METAFIELD ×2, TEXT ×1 |

⚠️ Check the actual `SHOPIFY_FIELD` picker for the available field catalog before committing
to `title` / `vendor` / `product_type` / `sku`.

**T1** is the same skeleton trimmed to ~30 rows (drop Sensing detail, shorten Support).
**T3** ~24 rows with an FPV vocabulary (latency, goggle compatibility, VTX, no gimbal
section). **T4** ~12 rows (compatibility, capacity, charge time, weight, warranty).

---

## 6. Image prompts — locked family recipe

The hard part is not any single image; it is **12 images that look like one brand**. Lock
the base and vary only the subject clause.

### Base prompt (prepend to every product shot, unchanged)

```
Studio product photograph of {SUBJECT}. Three-quarter front view raised 15 degrees
above the subject, centred, full product in frame with generous margin.
Matte ivory-white polycarbonate body with deep navy accent panels on the arm
shoulders and a brushed-aluminium ring detail. Dark charcoal propellers.
Seamless warm light-grey background with a soft vertical gradient falling off
toward the corners. Single large softbox key light from upper left, subtle fill
from the right, soft contact shadow directly beneath the subject. 50mm equivalent
lens, f/8, sharp throughout, neutral white balance. Clean industrial-design
product render aesthetic, commercial catalogue quality. Completely unbranded —
no markings of any kind on the body.
```

### Negative prompt (every image)

```
text, letters, numbers, logo, wordmark, watermark, signature, brand name, people,
hands, fingers, outdoor scene, sky, grass, motion blur, lens flare, blurred
background, tilted horizon, multiple products, packaging, box, studio equipment
reflections, cartoon, illustration, low resolution
```

### Per-product `{SUBJECT}` clause

| Product | Subject clause |
| --- | --- |
| Wren 2 | a very small folding consumer camera drone with arms folded along the body, single compact forward camera in a small gimbal housing, no visible obstacle sensors, palm-sized footprint |
| Wren 2 Pro | a very small folding consumer camera drone, arms folded, with a slightly deeper gimbal housing and a noticeably larger front lens, two small forward sensor dots below the nose |
| Merlin 3 | a mid-size folding camera drone with arms extended, a dual-lens gimbal (one wide, one telephoto), and small sensor arrays on the nose and tail |
| Talon 2 Pro | a large folding professional camera drone with arms extended, a prominent three-lens gimbal, omnidirectional sensor pods at all four corners, thick arms and large propellers |
| Dart FPV | a ducted cinewhoop FPV drone with full circular propeller guards, a squat X-frame, and a small forward action camera tilted upward 25 degrees |
| Dart Race Kit | an open-frame FPV racing quadcopter with an exposed carbon-fibre X frame, ivory canopy, small upward-tilted camera, and visible motors with navy motor bells |
| Wren Battery | a single rectangular intelligent flight battery, ivory shell with a navy end cap, four gold contact pins and four small LED indicator dots |
| Talon Battery Plus | a large rectangular intelligent flight battery, ivory shell with navy end cap, gold contact pins, four LED indicator dots, visibly thicker than a compact battery |
| Charging Hub | a flat four-bay drone battery charging hub, ivory tray with four navy slots and a thin status LED strip, USB-C port at the rear |
| ND Filter Set | a set of four square drone camera ND filters in slim aluminium frames, arranged in a fanned row, each with a visibly different grey tint density |
| Propeller Set | four low-noise quadcopter propellers arranged in a neat fan, dark charcoal with navy tips |
| Shoulder Case | a compact ivory and navy textured-fabric shoulder carry case for a drone kit, closed, three-quarter view |

### Working method

1. Generate **all 12 in one session** with the same model and, if the tool supports it, a
   fixed seed family. Drift between sessions is the main enemy.
2. If one product doesn't match the family, **regenerate — don't accept it.** One
   off-colour body is more damaging than a slightly plain shot.
3. Second angle per drone: same base, swap the view clause to *"top-down flat lay,
   perfectly overhead, product centred"*. Gives you a second gallery image cheaply.
4. **Post-pass:** normalise every export to the same canvas (2048 × 2048), the same
   background hex, and the same subject scale. This is what actually makes them look like
   one shoot.
5. **Wordmark:** composite `KESTRA` in afterwards if you want branding. Never ask the
   generator for text — it is the one thing it reliably ruins.
6. **Alt text** on every image as you upload (needed for D9 anyway, and priority #2 is
   storefront accessibility): *"Kestra Talon 2 Pro folding camera drone, three-quarter
   view"*.

### Homepage hero

Lifestyle shots are the one place outdoor works, and drone-in-sky is easy for generators:

```
A small ivory-white and navy quadcopter camera drone hovering against an
overcast pale sky above a coastal ridge, shot from slightly below with a long
lens, shallow depth of field, soft diffused daylight, muted cool colour grade,
no people, no text, no logos.
```

---

## 7. Build order & traps

1. **Create all 27 metafield definitions first**, each with **Storefront API access ON**.
   Before any product data.
2. **Set the product Category** on one drone → note which `shopify.*` attributes appear →
   check their storefront access too.
3. **Create the 12 products** with types, prices, images, alt text.
4. **Create the 4 collections.** 🔴 Verify no drone is in `Flight Essentials`.
5. **Fill metafield values** from § 4.
6. ⛔ **STOP at D5.** Do not build templates until the production database question is
   settled, and install the app whose `client_id` will become production.
7. Then D6 (templates) → D7 (routing, T1's exclude before any activation) → D8 (demo link
   → the **Talon 2 Pro product page**).

### Traps, ranked

| | Trap |
| --- | --- |
| 🔴 | A drone in `Flight Essentials` → unresolvable COLLECTION × TYPE overlap → T4 can never activate |
| 🔴 | Forgetting Storefront API access on a definition → silent blank cells, no error anywhere |
| 🔴 | Setting T1's exclude *after* trying to activate T2 → activation blocked, looks like a bug |
| 🔴 | Any `ALL_PRODUCTS` template → blocks everything else |
| ⚠️ | Mixed units inside a `list.dimension` → the `.unit` branch renders a ragged row |
| ⚠️ | Giving the Shoulder Case spec metafields → weakens the "no table" demo |

---

## 8. Open items

- **Brand name not chosen** — D1 stays open until it is, plus the four clearance checks.
- **`shopify.*` attribute set unverified** — depends on the Category Shopify offers for
  drones; confirm in the admin at step 2 above.
- **`SHOPIFY_FIELD` catalog unverified** — confirm the picker offers `title` / `vendor` /
  `product_type` / `sku` before building the T2 Support section.
- 🆕 **Product observation, not a demo blocker:** a merchant cannot have a shop-wide default
  spec table alongside per-type tables (`ALL_PRODUCTS` overlaps `PRODUCT_TYPE` and no
  exclude can resolve it). That is a plausible real merchant request. Worth an entry in
  `progress-tracker.md` open questions if it isn't already covered.
