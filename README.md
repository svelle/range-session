# Range Session — Launch Monitor Analysis

A single-page web app for exploring golf launch-monitor exports. Upload one or more CSV files from a session; the dashboard builds charts, filters, benchmarks, and a shot list around whatever columns are present. The page also ships with embedded sample data so the UI is never empty on first load.

Live version here: https://svelle.github.io/range-session/

## Screenshots

<img width="1965" height="1323" alt="image" src="https://github.com/user-attachments/assets/c2fb7da5-4081-488e-ab2a-b35d6f064016" />
<img width="1965" height="1323" alt="image" src="https://github.com/user-attachments/assets/10bcbeca-dc8b-4ca7-99d3-ae3c8f5eb34c" />
<img width="1965" height="1323" alt="image" src="https://github.com/user-attachments/assets/c3706b10-6c1b-46b9-a5c6-dc507a71e2e5" />
<img width="1965" height="1323" alt="image" src="https://github.com/user-attachments/assets/9ed26498-26de-44ca-b32e-68153b453d6a" />

<img width="757" height="358" alt="image" src="https://github.com/user-attachments/assets/31ae4a46-62d4-4941-a58f-144ec41d5af4" />


## Running locally

Requires [Bun](https://bun.sh) (v1.0+).

```bash
bun install   # optional; no npm dependencies listed in package.json
bun run start # serves golf_dispersion.html at http://localhost:3000/
```

Use `bun run dev` to watch `server.ts` and restart on changes. Override the port with `PORT` (e.g. `PORT=8080 bun run start`).

You can open `golf_dispersion.html` directly in a browser; serving via Bun avoids `file://` limitations. The **3D** view loads Plotly from a CDN, so that tab needs network access.

## GitHub Pages

This repo includes [`.github/workflows/pages.yml`](.github/workflows/pages.yml): on push to `main` or `master`, it copies `golf_dispersion.html` to `index.html`, optionally includes a `data/` folder if present, and deploys with **Actions → GitHub Pages**.

1. In the repository **Settings → Pages**, set **Source** to **GitHub Actions** (not “Deploy from a branch”).
2. Push to `main` (or run the workflow manually). The site URL will be `https://<user>.github.io/<repo>/` for a project site.

There is no separate build toolchain; the app is static HTML.

## CSV format

The parser is **header-driven**: the first row must be column names. Names are matched **case-insensitively** after normalizing spaces, parentheses, `#`, and common unit suffixes (`mph`, `rpm`, `deg`, `mm`). Extra columns are ignored. Rows are skipped if the shot number is missing or non-numeric, or if the first cell looks like a summary row (`Avg`, `Average`, `Total`).

### Required

- **At least one of** a **Carry** or **Total** distance column (meters in the file; the app can display meters or yards in the UI).

### Strongly recommended

- `**Shot`** (or `**No**`) — identifies each swing. If omitted, the parser falls back to the first column for numbering.

### Optional columns (logical names → accepted header aliases)


| Data                 | Aliases recognized (after normalization)  |
| -------------------- | ----------------------------------------- |
| Carry                | `Carry`, `Carrym`                         |
| Total                | `Total`, `Totalm`                         |
| Club speed           | `ClubSpeed`                               |
| Ball speed           | `BallSpeed`, `BSpeed`                     |
| Smash factor         | `Smash`, `SmashFactor`                    |
| Spin rate            | `Spin`, `SpinRate`                        |
| Spin axis            | `SpinAxis`                                |
| Launch angle         | `LaunchAng`, `LaunchAngle`, `Lang`        |
| Launch direction     | `LaunchDir`, `LaunchDirection`, `Ldir`    |
| Landing angle        | `LandingAng`, `LandAngle`, `LandingAngle` |
| Height / apex        | `Height`, `Heightm`, `Apex`               |
| Curve                | `Curve`, `Curvem`                         |
| Attack angle         | `AttackAng`                               |
| Face to path         | `FaceToPath`                              |
| Club path            | `ClubPath`                                |
| Face angle           | `FaceAngle`                               |
| Carry side (lateral) | `CarrySide`, `Carrys`, `CarrySm`          |
| Total side (lateral) | `TotalSide`, `Tots`, `TotSm`              |
| Target hit carry     | `TargetHitCarry`                          |
| Target hit total     | `TargetHitTotal`                          |


**Lateral values** may be a plain number (signed meters) or a number with an `**L`** or `**R**` suffix (e.g. `12.3L` → left miss).

**Units in the file:** distances are treated as **meters**; speeds as **mph** where applicable; spin as **rpm**; angles as **degrees**. Missing or `-` cells become empty metrics in the app.

### Example (minimal)

```csv
Shot,Carry,Total,Ball Speed,Spin Rate,Launch Angle
1,110.5,125.2,103.5,3500,12.5
2,108.0,122.0,102.0,3600,13.0
```

### Example (richer Trackman-style row)

```csv
Shot,Carry,Total,Carry Side,Total Side,Ball Speed,Club Speed,Smash,Spin Rate,Spin Axis,Launch Angle,Height
1,110.8,127.6,-35.4L,-44.0L,103.9,73.6,1.41,3720,-42.8,12.8,9.3
```

### Multiple files

You can select several CSVs at once. For each file you assign a **club** (used for benchmark carry). The importer can **guess** a club from the filename using short tokens such as `7i`, `3w`, `4h`, `dr`, `pw`, `sw`, `56`, `60` (see in-app hints).

## Loading data

Use **Upload CSV** in the header or drag files onto the window. After import, the current file label appears in the header; per-shot visibility resets when new data loads.

## Header stats strip

Summary tiles (e.g. average carry, longest shot, average ball speed, lateral spread, spin, miss-left count) update when data or filters change.

## Main views

**Dispersion** — Plan-view landing chart: colored by lateral miss (left / straight / right), optional target band, **Total** vs **Carry**, 1:1 or fill scaling, and centroid / dispersion overlay modes.

**Distance & Spin** — Carry vs ball speed with a trend line, plus a carry histogram (10 m buckets).

**Diagnostics** — Spin axis vs curve.

**3D** — Approximate **flight paths from the tee** (Plotly): each visible shot is drawn as a line starting at the origin. The **carry** phase is a simple vertical-plane arc (apex from **height**; lateral from **carry side**). If **total** exceeds **carry**, a **ground-roll** segment continues to **total side**. This is a geometric sketch, not a full physics simulation. Orbit with drag, zoom with scroll; click a shot’s trace to select it (the tee marker is not selectable).

## Shots panel (all tabs)

Sortable table with visibility checkboxes, optional **club** column (short labels when multiple clubs), and filters:

- **Carry** — three buckets from the session’s carry distribution (**terciles** when there are enough shots; otherwise a fixed 50 m / 100 m fallback).
- **Lateral** — left / straight (within 5 m of line) / right.
- **Club** — appears when more than one club exists in the data.

**Hover** highlights the row and chart dots; **click** selects; **Shift+click** range-selects in sort order; **double-click** the visibility checkbox column toggles hide/show for that shot.

## Detail panel

When exactly one shot is selected, the right-hand panel shows a compact **shot detail** layout: total distance, shape summary, speed & strike cards, spin-axis bar, and flight metrics — with benchmark-style tier coloring where applicable.

## Benchmarks

Choose a **Skill** level in the header to align reference carry distances with the app’s built-in yardage table by club. Charts can show a benchmark line when a single club is filtered or only one club exists in the session.

## What persists

Per-shot hide/show and UI state last for the open tab session. Loading a new CSV clears shot metadata so shot numbers always match the current file.
