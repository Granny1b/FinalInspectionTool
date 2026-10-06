# Build: Modig Final Inspection — template-driven checklist app on Azure

You are building a small, polished web app for Modig Machine Tool's Quality department. It replaces an Excel workbook (`Final_Inspection_rev_2.xlsm`, placed in `/seed`) used for the final inspection of CNC machines before delivery. Read this whole brief before writing code, then work in the phases at the bottom and stop for my review after each phase.

**Guiding principle: simple but powerful.** Few concepts, few screens, no clever abstractions. If a feature can be done with plain React state and one JSON document, do that. When you must make a judgement call, pick the simpler option and note it in `DECISIONS.md`.

---

## 1. How the work actually happens (the workflow to design for)

1. **Template** – I maintain one inspection template per machine model (RigiMill MG, RigiMill MT, HHV3, HHV3 DUO, Mill-Ex, IM8). A template is a living document: sections and checkpoint rows are added, removed, reordered and reworded over time.
2. **New inspection** – For a specific machine I create an inspection from a template and fill in the front page (machine name, model, serial number, participants, location, date, photo).
3. **Print blank checklist** – I print it on A4 and walk the machine with a pen, ticking OK / NOK / N/A and writing comments and responsible person on paper.
4. **Transcribe** – Back at my desk I enter the paper results into the digital version. **This must be fast** (keyboard-first, see §5.3).
5. **Deviations** – Every NOK row automatically appears in the Deviation Summary. I can also add deviations that aren't tied to a row.
6. **Finalise & print report** – I lock the inspection and print/export the completed report (PDF) to file with the machine.
7. **Learn** – All deviations from all inspections go into a central store so I can see KPIs: which checkpoints fail most, per model, per section, over time.

---

## 2. Structure of the existing Excel (use this to seed and as the layout reference)

- **`Main`** – front page: Machine name, Model, Serial Number, Participants, Location (default "Kalmar, Sweden"), Date, revision text ("Rev: 2") bottom right, machine picture.
- **`Slutkontroll_RM_MG`** – the checklist. Sections numbered `1..6` (Loading area, Tool Arena, Electrical Cabinets, Machining area, Gantry, External units). Each section has a header row with columns **Checkpoint | Comment | Status | Resp**, and rows lettered `a, b, c…`. Rows are written as `Component - what to check`, e.g. `Lifting columns - Marked screws, blue/red/yellow`. Several sections end with **empty lettered rows**: spare lines for writing extra findings by hand. Keep that idea.
- **`Avvikelser`** – deviation summary ("Remarks"), currently filled in by hand.
- **`Misc`** – lookup lists: Status values `OK`, `NOK`, `N/A`; the machine model list with short codes (`HHV3/HHVSingle`, `HHV3 DUO/HHVDUO`, `Mill-Ex/MILLEX`, `RigiMill MT/RMMT`, `RigiMill MG/RMMG`, `IM8/IM`).

Write a one-off seed script (`/seed/import-xlsx.ts`, using `exceljs` or `xlsx`) that reads `Slutkontroll_RM_MG` and creates the **RigiMill MG** template from it: section number from column B (integer), section title from column D on that row, items from the lettered rows that have text in column D. Skip empty lettered rows (spare lines are a print setting, see §6). Also seed the six machine models from `Misc`.

---

## 3. Architecture: cheapest possible Azure, no paid database

Target running cost: **well under 50 SEK/month**. Do not introduce Cosmos DB, Azure SQL, App Service plans, Redis, or anything with a fixed monthly fee.

| Concern | Choice |
|---|---|
| Hosting + API | **Azure Static Web Apps (Free plan)** with **managed Azure Functions** (Node 20, TypeScript) under `/api` |
| Auth | **SWA built-in authentication** with Microsoft Entra ID (`/.auth/login/aad`). Access controlled by SWA **role invitations**: roles `inspector` (create/fill inspections) and `admin` (also edit templates, see KPIs, manage settings). Lock all routes except the login page in `staticwebapp.config.json`. No custom user table, no passwords. |
| Documents (templates, inspections) | **Azure Blob Storage**, one JSON blob per document. Use **ETags for optimistic concurrency** on every save (`If-Match`), and return a clear "someone else changed this – reload" error on 412. |
| Deviation database (for KPIs) | **Azure Table Storage** in the same storage account. One row per deviation, denormalised so KPI queries need no joins (see §4). |
| Images | Blob Storage container `images`. Resize client-side to max 1600 px long edge, JPEG ~0.8, before upload. Upload/download via short-lived SAS URLs issued by the API (SWA managed functions don't support managed identity, so use the storage connection string from app settings — never expose it to the client). |
| Frontend | **Vite + React + TypeScript + Tailwind CSS**. Routing with React Router. Server state with TanStack Query. No Redux. |
| Annotation editor | **react-konva** (Konva). |
| Drag & drop reorder | **dnd-kit**. |
| Charts | **Recharts**. |
| PDF | **Browser print with dedicated print CSS** (`@page { size: A4; }`) → user picks "Save as PDF". No server-side PDF rendering. |
| Word export | `docx` npm package, client-side (phase 5, optional). |
| Infra as code | One **Bicep** file: storage account (Standard_LRS, containers `templates`, `inspections`, `images`, table `deviations`) + Static Web App (Free). |
| CI/CD | GitHub Actions workflow generated for SWA. |
| Local dev | **SWA CLI** (`swa start`) + **Azurite** for storage. `npm run dev` should start everything. Mock auth works locally via SWA CLI. |

Containers:
```
templates/{templateId}/draft.json
templates/{templateId}/rev-{n}.json        # immutable published revisions
inspections/{inspectionId}.json
images/{guid}.jpg                          # originals
images/{guid}.annotated.png                # flattened render of annotations (for print)
```

---

## 4. Data model

Keep it this small. Use `nanoid` for IDs.

```ts
type MachineModel = { code: string; name: string };           // e.g. { code: "RMMG", name: "RigiMill MG" }

type Template = {
  id: string;
  name: string;                 // "Final inspection – RigiMill MG"
  modelCode: string;
  revision: number;             // published revision number; draft = last published + 1
  status: "draft" | "published";
  coverImageId?: string;
  printSettings: { spareRowsPerSection: number };   // default 3
  sections: Section[];
  updatedAt: string; updatedBy: string;
};

type Section = { id: string; title: string; items: Item[] };   // order = array order

type Item = {
  id: string;                   // STABLE forever – survives renumbering, rewording and new revisions
  text: string;                 // "Lifting columns - Marked screws, blue/red/yellow"
  guide?: Guide;                // optional pop-up content, see §5.4
};

type Guide = {
  description?: string;         // short "what good looks like"
  images: GuideImage[];
};
type GuideImage = {
  imageId: string;
  verdict: "good" | "bad" | "info";    // shown as green ✓ / red ✗ / neutral badge
  caption?: string;
  annotations: Annotation[];           // vector data, editable later
  renderedImageId?: string;            // flattened PNG for print/thumbnail
};
type Annotation =
  | { kind: "arrow"; points: number[]; color: string }
  | { kind: "rect" | "ellipse"; x: number; y: number; w: number; h: number; color: string }
  | { kind: "text"; x: number; y: number; text: string; color: string; size: number }
  | { kind: "freehand"; points: number[]; color: string };
// Coordinates stored as fractions (0–1) of image width/height so they survive resizing.

type Inspection = {
  id: string;
  number: string;               // human ID, e.g. "FI-2026-0042" (counter kept in a small blob)
  templateId: string;
  templateRevision: number;
  templateSnapshot: { sections: Section[] };   // FROZEN copy at creation – template edits never change existing inspections
  front: {
    machineName: string; modelCode: string; serialNumber: string;
    participants: string[]; location: string; date: string; photoId?: string;
  };
  results: Record<string, RowResult>;          // keyed by Item.id
  extraDeviations: Deviation[];                // not tied to a checklist row
  state: "in_progress" | "finalised";
  finalisedAt?: string; finalisedBy?: string;
};

type RowResult = {
  status?: "OK" | "NOK" | "NA";
  comment?: string;
  resp?: string;                // responsible person/department (free text with autocomplete from history)
  severity?: "minor" | "major" | "critical";   // only asked for when NOK, default "minor"
  photoIds?: string[];          // optional evidence photos
};
```

### Numbering and references
- Display numbers are **derived from position**, never stored: section `3`, row `3.c` (a–z, then aa, ab…). Reordering renumbers automatically.
- Everywhere a row is referenced (deviation summary, KPI tables, print) show the display ref **and** the text, e.g. `3.c Main Cabinet - Verify labeling on cables and components`.
- KPIs group by the **stable `Item.id`**, so a checkpoint keeps its history even if it moves from 3.c to 4.a in a later revision.
- Deviation numbers inside an inspection: `D-01, D-02…` in order of appearance.

### Deviation table (Azure Table Storage) — the KPI source
Written/updated by the API whenever an inspection is saved (upsert all of that inspection's deviations, delete ones that no longer exist). PartitionKey = `modelCode`, RowKey = `{inspectionId}_{itemId or extraId}`. Columns:
`inspectionId, inspectionNumber, serialNumber, machineName, modelCode, templateId, templateRevision, itemId, sectionTitle, displayRef, checkpointText, comment, resp, severity, inspectionDate, finalised (bool), createdAt`.
Only rows from **finalised** inspections count in KPIs by default (toggle to include in-progress).

---

## 5. Screens

Keep navigation to a left sidebar with: **Inspections**, **Templates**, **Insights** (admin), **Settings** (admin).

### 5.1 Inspections list
Table: number, machine, serial, model, date, state, #NOK. Search box, filter by model/state. "New inspection" button → pick template (latest published revision) → front-page form → open inspection.

### 5.2 Template editor (admin)
- One scrolling page that **looks like the printed document**, edited in place (WYSIWYG-ish, Notion-like):
  - Section header with inline-editable title, ⋯ menu (rename, duplicate, delete, move up/down), drag handle.
  - Rows with inline-editable text, drag handle (reorder within and between sections), hover actions: **Guide** (opens the pop-up editor), duplicate, delete.
  - "+ Add row" at the end of each section, "+ Add section" at the end. `Enter` in a row creates the next row; `Backspace` on an empty row deletes it.
  - A row with a guide shows a small camera/info icon.
- Cover image upload, model, name, spare rows per section.
- **Draft vs published**: edits autosave to the draft. "Publish revision" creates `rev-{n}.json` (immutable) with an optional change note. New inspections always use the latest published revision. Show a simple revision history list (revision, date, who, note).
- Confirm before deleting a section that has rows.

### 5.3 Inspection (fill-in) view — optimised for transcribing from paper
- Front page card at the top (editable until finalised).
- Checklist below, same visual structure as print. Each row: ref, text, **segmented OK / NOK / N/A control**, comment field, resp field. NOK rows get a red left border and reveal a severity selector.
- **Keyboard-first**: a focused row can be set with `1`/`O` = OK, `2`/`N` = NOK, `3`/`A` = N/A; `↓/↑` or `J/K` moves between rows; `Tab` goes into comment → resp → next row; `C` focuses comment. Show a small shortcut hint bar.
- "Set remaining to OK in this section" button (most rows are OK; I mark the exceptions).
- Progress indicator: `87 / 104 rows filled · 6 NOK`.
- Clicking the guide icon on a row opens the guide pop-up read-only (see §5.4).
- Add "extra deviation" (not tied to a row) from the deviation summary.
- **Deviation Summary** panel/tab: auto-generated list of every NOK row + extra deviations: `D-nn | ref | checkpoint | comment | severity | resp`. Updates live.
- Autosave (debounced ~1 s) with a subtle "Saved" indicator; handle ETag conflicts gracefully.
- **Finalise** button: validates every row has a status (list any missing with jump links), then locks the inspection. Admin can reopen.

### 5.4 Guide pop-up (per row) — "what it should / shouldn't look like"
A modal per checkpoint row, edited from the template editor, viewed from inspections:
- Short description text.
- Image gallery; each image tagged **Good ✓ / Bad ✗ / Info**, with caption.
- **Annotation editor** (react-konva) on any image: tools **arrow, rectangle, ellipse, text, freehand**, a colour picker limited to 4 colours (red, Modig cyan, yellow, white), select/move/delete, undo/redo, Save. Annotations are stored as vector JSON (editable later) and also flattened to a PNG for print and thumbnails.
- Paste image from clipboard and drag-and-drop upload are both supported.
- Keep the UI simple: tool bar on top, image fills the modal, Save/Cancel bottom right.

### 5.5 Insights (admin) — KPI dashboard from the deviation table
Filters: date range, model, include in-progress. Cards and charts:
- Inspections finalised, total deviations, **avg deviations per machine**, **first-pass rate** (% of rows OK on first inspection).
- Deviations per month (line), per section (bar), per model (bar), by severity (stacked bar).
- **Top 10 recurring checkpoints** (grouped by `itemId`, showing current ref + text, count, % of inspections where it failed) – this is the most important table.
- Deviations by resp.
- **Export CSV** of the filtered deviation rows (so I can take it into Excel/Power BI).
Compute KPIs in an API function that queries the table with filters; volume is small (thousands of rows), no aggregation infrastructure needed.

### 5.6 Settings (admin)
Machine model list, default location, company name/logo for print, and a short "how to invite users" note pointing to SWA role invitations.

---

## 6. Printing — must fit standard A4 perfectly

Implement a dedicated print route `/inspections/:id/print?mode=blank|report` (and `/templates/:id/print` for a preview) with print-specific CSS. Test in Chrome "Save as PDF" at 100 % scale, no browser headers/footers.

- `@page { size: A4 portrait; margin: 14mm 12mm 16mm 12mm; }`. Use Chrome's `@page` margin boxes for a footer: `Modig · {inspection number} · {machine} · S/N {serial} · Rev {templateRevision}` on the left, `Page X of Y` on the right. Fallback: if margin boxes aren't supported, put the info in a repeating `<thead>/<tfoot>`.
- Page 1 = **front page**: Modig logo, title "Final Inspection", machine photo, data grid (Machine name, Model, Serial number, Participants, Location, Date), signature lines (Inspected by / Date / Signature), template revision.
- Checklist pages: one table per section with columns **No. | Checkpoint | Comment | OK | NOK | N/A | Resp**. In **blank mode** status cells are empty checkboxes and the comment column has writing space (row height ≥ 9 mm). Append `printSettings.spareRowsPerSection` empty numbered rows to each section (continuing the lettering) for handwritten findings.
- Section header rows repeat when a section breaks across pages (`thead { display: table-header-group }`); never split a single row (`break-inside: avoid`); avoid a section header orphaned at the bottom of a page.
- **Deviation Summary** page: in report mode, the filled list; in blank mode, an empty table with ~15 numbered lines (`D-01…`) with columns **No. | Ref | Description | Severity | Resp | Closed (sign/date)**.
- Optional appendix toggle "Include reference images": prints each guide's annotated images (2 per row, captioned with ref + Good/Bad).
- Must look clean in **black & white**: status shown with symbols/text, not colour only; light grey header fills; no backgrounds that waste toner.
- "Print / Save PDF" button on the inspection opens the print route and calls `window.print()`.
- Phase 5 (optional): **Export to Word (.docx)** with the same structure using the `docx` package (A4, table per section).

---

## 7. Look & feel — modern SaaS with Modig branding as a base

You have freedom here; aim for something that feels like Linear / Notion / Vercel dashboard rather than an Excel clone.
- Primary accent: **Modig cyan `#29ABE2`** (buttons, focus rings, active nav). Neutral greys/near-black for text and structure; white surfaces on a very light grey app background. Status colours: OK green, NOK red, N/A grey — muted, not neon.
- Font: Inter (or system UI stack). Comfortable density – this is a work tool, not a landing page.
- Rounded-lg cards, subtle borders instead of heavy shadows, generous whitespace, clear hierarchy.
- Use **lucide-react** icons. Empty states with a one-line hint and a primary action.
- Light mode only is fine. Responsive enough to be usable on a tablet in the workshop (filling in directly on a tablet should work, even though paper is the main flow).
- Define colours/spacing as Tailwind theme tokens in one place so branding can be tweaked later.
- Put a placeholder `public/modig-logo.svg`; I will replace it.

---

## 8. API (managed Functions)

Keep endpoints few and REST-ish; every function checks the SWA client principal (`x-ms-client-principal`) and role.
```
GET/POST        /api/templates               list / create
GET/PUT         /api/templates/{id}          read / save draft (ETag)
POST            /api/templates/{id}/publish
GET             /api/templates/{id}/revisions/{n}
GET/POST        /api/inspections
GET/PUT         /api/inspections/{id}        (PUT also syncs deviations table)
POST            /api/inspections/{id}/finalise | /reopen
POST            /api/images/upload-url       → { imageId, sasUrl }
GET             /api/images/{id}/url         → short-lived read SAS
GET             /api/insights?from&to&model&includeInProgress
GET             /api/insights/export.csv
GET             /api/me                      → name, email, roles
```
Validate request bodies with **zod** (shared schemas in `/shared` used by both frontend and API).

---

## 9. Quality bar
- TypeScript strict everywhere. ESLint + Prettier.
- Unit tests (Vitest) for: numbering/lettering (incl. > 26 rows), deviation derivation from results, KPI aggregation, template snapshotting on inspection creation.
- One Playwright smoke test: create inspection from seeded template → mark rows → finalise → open print route.
- `README.md`: local setup, deploy steps (`az deployment group create` with the Bicep, connect SWA to GitHub, set `STORAGE_CONNECTION_STRING` app setting, invite users with roles), and estimated monthly cost.
- `DECISIONS.md`: short log of every judgement call you made.

---

## 10. Phases — stop after each and show me what to review

1. **Foundation** – repo structure (`/app`, `/api`, `/shared`, `/infra`, `/seed`), Bicep, SWA config with auth/roles, Azurite local dev, seed script importing the RigiMill MG checklist from the Excel. App shell with sidebar and login.
2. **Templates** – template editor with sections/rows CRUD, drag-and-drop, auto-numbering, draft/publish revisions.
3. **Inspections** – create from template (snapshot), front page, keyboard-first fill-in, deviation summary, autosave, finalise. Deviation table sync.
4. **Print** – blank checklist and completed report on A4, verified by generating PDFs with Playwright (`page.pdf({ format: 'A4' })`) in a test and checking page count/overflow; show me the PDFs.
5. **Guides & annotations** – per-row guide pop-up with image upload, annotation editor, print appendix. Optional Word export.
6. **Insights** – KPI dashboard + CSV export.

Do not add features beyond this brief without asking. If something in the brief turns out to be unnecessarily complex in practice, propose the simpler alternative before building it.
