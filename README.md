# Modig Final Inspection

A small web app for Modig Machine Tool's Quality department that replaces the Excel workbook used
for the final inspection of CNC machines before delivery. Admins maintain one checklist template
per machine model; inspectors create an inspection from a template, print a blank checklist for the
walk-round, transcribe the results, and finalise a printable report. Every deviation goes into a
central table for KPIs. It runs on Azure Static Web Apps (Free) with managed Functions, Blob
Storage and Table Storage: no database, about 1 SEK a month.

## Status: all 6 phases built (insights was the last)

Working now:

- **Sign-in and access control.** Microsoft Entra ID sign-in through Static Web Apps. Admins
  manage who may use the app in Settings → Users & access (name, email, role); people invited
  earlier through Static Web Apps roles keep their access. A signed-in user who is neither on the
  list nor invited sees a "You don't have access yet" page. The API checks the role on every
  request.
- **App shell.** A sidebar in four groups: _Final inspection_ (Inspections and Deviations),
  _Quality check_ (Quality checks, the checks done on machines, and Deviations), _Setup_
  (Templates, where both are set up) and, for admins, _Admin_ (Insights and Settings); a drawer
  on tablets. Settings manages users and access, and admins edit the machine models, the
  Responsible and deviation category lists, the default location and the company name and logo
  there (see [Settings](#settings)).
- **Templates (phase 2).** The template list; a new template for a machine model that has none;
  the template editor, which looks like the printed checklist and is edited in place (sections and
  rows, drag and drop, automatic 1.a numbering, cover photo); autosave of the draft with conflict
  detection; publishing immutable revisions with a change note; the revision history; and
  read-only views of any published revision. Inspectors see the latest published
  revision of each template, read-only. See [Editing templates](#editing-templates).
- **Inspections (phase 3).** The inspection list with search and filters; a new inspection from a
  model's latest published checklist, which it keeps as a frozen copy; the front page; the
  checklist, filled in from the keyboard; the live Deviation Summary with extra deviations;
  autosave with conflict detection; Finalise, which locks it, and Reopen for admins. Every
  deviation is mirrored into the `deviations` table for the KPIs. See
  [Inspections](#inspections).
- **Deviation photos (phase 4).** Up to two photos per deviation, added from a file, the camera,
  the clipboard or by drag and drop, and marked up in the app with arrows, boxes, ellipses, text
  and freehand lines. See [Deviation photos](#deviation-photos).
- **Printing (phase 4).** The blank checklist for the walk-round, the report with a card per
  deviation and its photos (2 or 4 cards to a page), and a preview of any template, on A4 from
  Chrome or Edge's print dialog ("Save as PDF"). Tests print real PDFs and measure them. See
  [Printing](#printing).
- **Guides (phase 5).** A checklist row can have a guide: what the checkpoint should and
  shouldn't look like, as a short description and up to six reference images marked Good, Bad
  or Info, drawn on in the same editor as deviation photos. Admins write them in the template
  editor; inspectors open them from the row, as they were when the inspection was created. See
  [Guides](#guides).
- **Reference images and Word (phase 5).** Printouts can add an appendix with every guide's
  images, two to a row, and every printout can be exported as an editable Word file. See
  [Reference images](#reference-images-appendix) and [Word export](#word-export).
- **API.** `/api/me`, the template and inspection endpoints, settings (read and save), the people
  list and photo upload/download URLs (see [API](#api)), with role checks, JSON errors and ETag
  concurrency on every save.
- **Seed.** The RigiMill MG checklist (6 sections, 90 checkpoints) and the six machine models are
  imported from `seed/Final_Inspection_rev_2.xlsm` into storage.
- **Local dev, infrastructure and CI/CD.** One `npm run dev`, a Bicep file, and a GitHub Actions
  workflow that checks every pull request and deploys `main`.

- **Insights (phase 6).** The admins' KPI dashboard: inspections, deviations, deviations per
  machine and the first-pass rate; the top 10 recurring checkpoints; deviations per month, by
  severity, per section, per model, by responsible and by category; filtered by period, model and
  in-progress, and exported as CSV for Excel or Power BI. See [Insights](#insights).

Added after the six phases:

- **Editable settings and pick lists.** Admins edit the machine models, the Responsible and
  deviation category lists, the default location and the company name and logo. Every deviation
  picks its Responsible and an optional category from those lists. See [Settings](#settings).
- **Users and names.** Admins add, change and remove the people who may use the app in Settings,
  and the app shows them by name. See [Auth model and roles](#auth-model-and-roles).
- **Templates.** Delete a template, export and import it as JSON, see the list as cards, and add
  a new machine model together with its template. See [Editing templates](#editing-templates).
- **Dark and light theme**, following the device's setting unless you pick one. See
  [Light and dark theme](#light-and-dark-theme).
- **Quick report preview.** **Preview** on an inspection shows the printout at once, unsaved
  edits included. See [Printing](#printing).
- **Quality checks (set-up).** In-process checks along a machine's build, such as "Quality
  check – Pre start up", several per machine, kept in the machine's template under a tab of their own.
  Admins write them as rows with pictures of how it should and should not look; they are
  published in revisions and exported and imported as JSON. See [Quality checks](#quality-checks).
- **Quality checks (doing them).** Inspectors and admins start a quality check on a machine from
  _Quality checks_ in the sidebar, numbered QC-2026-0001, and fill it in on a tablet or a PC: each
  row a card with its pictures and large OK / NOK / N/A buttons, then finalise it. Insights counts
  them apart from final inspections, with a report of their own. See
  [Doing a quality check](#doing-a-quality-check).
- **Deviation log.** _Deviations_ under Final inspection and under Quality check: every deviation
  of that kind, by machine, open ones first, to be closed with what was done (and reopened),
  from the log or from the inspection's Deviations tab; a summary of what is open, closed and
  open for more than 30 days, filters and a CSV export. See [Deviation log](#deviation-log).
- **Machine ID.** The machine as the ERP (Monitor) knows it, "Magellan#1", on final inspections
  (where it was called the machine name) and now on quality checks too, which need it to start
  and to finalise.

Deployed to Azure Static Web Apps (see [Deploy to Azure](#deploy-to-azure)); a push to `main` deploys.

## Prerequisites

- **Node 22** (see `.nvmrc`; `nvm use` picks it up).
- The first `npm install` downloads the Azure Functions Core Tools (about 1.3 GB unpacked), so it
  takes a while.
- For the end-to-end tests on a new machine, run `npx playwright install chromium` once.

## Quick start

```bash
npm install
npm run dev
```

Open <http://localhost:4280> and choose **Sign in with Microsoft**. Locally, the Static Web Apps
CLI shows its own mock sign-in form instead of Microsoft's:

- **Username**: any email address, e.g. `anna.andersson@modig.se`. Unless that email is on the
  people list in Settings, the app derives the display name from it.
- **User's roles**: add `admin` or `inspector` on a line of its own, below the existing roles.
- Leave the other fields as they are and choose **Login**.

Sign in without either role to see the no-access page. An admin can then add that email in
Settings → Users & access, and "Check again" lets them in, no role needed in the emulator. Stop
everything with Ctrl+C.

The mock form loads jQuery and Bootstrap from a CDN (`ajax.aspnetcdn.com`). If it does nothing
(offline, or the CDN is blocked), sign in from the browser console on <http://localhost:4280>
instead and reload. The cookie is all the form sets:

```js
document.cookie = `StaticWebAppsAuthCookie=${btoa(
  JSON.stringify({
    identityProvider: 'aad',
    userId: 'local-anna',
    userDetails: 'anna.andersson@modig.se',
    userRoles: ['anonymous', 'authenticated', 'admin'],
    claims: [],
  }),
)}; path=/`;
```

### What `npm run dev` starts

| Prefix          | What                                                                                  | Port         |
| --------------- | ------------------------------------------------------------------------------------- | ------------ |
| `blob`, `table` | Azurite storage emulator, data kept in `.azurite/`                                    | 10000, 10002 |
| `seed`          | The idempotent seed, once Azurite is up (then exits with code 0)                      |              |
| `api-build`     | esbuild in watch mode: `api/src` → `api/dist/index.cjs`                               |              |
| `api`           | Functions host, restarted by nodemon whenever the bundle changes                      | 7071         |
| `app`           | Vite dev server with hot reload                                                       | 5173         |
| `swa`           | Static Web Apps CLI: the URL you open. Auth, roles and routes, proxying 5173 and 7071 | **4280**     |

Before it starts, `predev` creates `api/local.settings.json` from
`api/local.settings.example.json` if it is missing. The `swa` line runs
`scripts/swa-start.mjs`, which starts the SWA CLI with only the environment variables it needs:
the CLI copies its whole environment for every request it proxies, which made a page load take
seconds in a crowded shell. If any process fails (for example because a
port is already taken), everything stops, so you never work against half a stack. The exception
is port 4280: if only that one is taken, the `swa` line asks whether to use another port and waits.
Stop with Ctrl+C and free the port.

Always use port 4280. Only the SWA CLI applies the sign-in and role rules: the Functions host on
7071 trusts any `x-ms-client-principal` header. In dev mode the CLI does not apply the
Content-Security-Policy, the security headers or `navigationFallback` (Vite serves the pages).
To check those, run the built app, each command in a terminal of its own:

```bash
npm run build
npm run dev:blob                  # Azurite, with the data in .azurite/ (run npm run seed once
npm run dev:table                 #   if it is new)
npm start -w @modig/api           # Functions host on 7071, running the built api/dist/index.cjs
node scripts/local-swa-config.mjs
npx swa start app/dist --swa-config-location .swa-local --api-devserver-url http://127.0.0.1:7071
```

The deployed Content-Security-Policy lets the browser load and upload photos only on
`https://*.blob.core.windows.net`; locally they are on Azurite at `http://127.0.0.1:10000`, so
the policy would block the cover photo. `scripts/local-swa-config.mjs` writes
`.swa-local/staticwebapp.config.json` (git-ignored): a copy of the built config that also allows
Azurite. `app/public` and `app/dist` keep the Azure-only policy, and that is what gets deployed.
Use port 4280 here too: Azurite accepts the browser's photo uploads only from the dev origins.

This `swa start` prints "Error reading workflow configuration": it expects a different layout in
the GitHub workflow file. The warning is harmless.

## Editing templates

Templates are for admins; inspectors see the latest published revision of each, read-only. There
is one template per machine model: **New template** offers the models that don't have one yet,
and **New machine model…** for a model launched since. Type its name; the code is suggested from
it as in [Settings](#settings) (the capitals and digits of each word, e.g. RigiMill MG → RMMG,
with a number added when that code is taken) and can be changed. The model is added to the
machine models in Settings along with the template. A code that a model or a template already
uses (in any case), or a name another model has, is refused. **List** / **Cards** above the list
switches the view; each browser remembers its own choice. Cards show the cover photo whole in a
frame of one shape (16:10), so the photo, name, model, badges and the Rows / Last edited footer
line up across a row of cards whatever the photos' proportions; a template without a cover photo
has an empty frame of the same size.

- **Draft and revisions.** Every template has one draft, which admins edit, and numbered
  revisions, which never change once published. New inspections use the latest
  revision. The header shows the draft's revision number, the latest published one and whether
  the draft has unpublished changes.
- **Autosave.** Changes are saved to the draft about a second after you stop typing; the header
  says _Unsaved changes_, _Saving…_ or _Saved_. A save that fails on the way (network, server) is
  retried, and _Retry_ saves at once. Closing the tab with unsaved changes asks first; following
  a link in the app saves first (and waits for a cover photo that is still uploading).
- **Signed out.** If the session ended (signed out in another tab, or it ran out), saving stops
  with "You were signed out": your changes stay on the page. Sign in again in a new tab (the
  banner's **Sign in** opens one), then choose _Retry_.
- **Conflicts.** Every save says which version of the draft it is based on. If another admin saved
  in between, nothing is overwritten: the editor shows "Someone else changed this – reload to see
  the latest version.", stops saving and offers **Reload** (in the banner and next to _Not
  saved_).
- **Publish.** **Publish** freezes the draft as the next revision, with an optional change note.
  A template needs a name, a section and at least one row; every section needs a title, and no
  row may be empty. Otherwise Publish lists the problems, with links that jump to each, and marks
  them in red.
- **Sections without rows.** A section may be published before it has rows: a heading for
  checkpoints still to be written. In the editor it says "No rows yet" with its **+ Add row**,
  and rows can be dragged into it. It keeps its number (4 stays 4), inspections show its heading
  with "No checkpoints in this section yet.", and it prints its heading over "No checkpoints in
  this section.", on a blank checklist and a report alike (see [Printing](#printing)).
- **Revision history.** Next to the front page: each revision with its date, who published it and
  the note. **View** opens that revision read-only.
- **Export and import (JSON).** The editor's **⋯** menu has **Export JSON**: the draft as shown,
  unsaved changes included, saved as `<template name>.json`. On the Templates page, **Import
  JSON** reads such a file and checks it first (a file that isn't one is explained). You then
  pick a machine model without a template (or a new model) and the name, and the file becomes a
  new, unpublished draft. If no template here uses its rows' ids, it keeps them, so re-importing
  an exported template keeps its checkpoints' history in Insights; otherwise every section and
  row gets a new id. Images (cover, guide images) come along only if they are stored in this
  installation; the import says how many were left out. Files exported while templates had spare
  lines still import; their spare lines are left out.
- **Delete (admins).** **⋯ → Delete template** asks first, then deletes the draft and every
  published revision for good and goes back to the list. Inspections made from it are kept with
  their own copy of the checklist, their reports and their deviations. Insights still counts
  their deviations, showing each checkpoint as it was last inspected. Images stay in storage.
  Locally, deleting the seeded RigiMill MG template brings it back at the next `npm run dev`,
  because the seed imports it whenever none exists.
- **Front page.** Name, machine model and a cover photo. The photo is scaled down in the browser
  to 1600 px on the long edge before it is uploaded.

In the checklist:

| To                                          | Do                                                                |
| ------------------------------------------- | ----------------------------------------------------------------- |
| Add a row below                             | `Enter` in a row; **+ Add row** at the end of a section           |
| Start a new section's rows                  | `Enter` in its title                                              |
| Delete an empty row                         | `Backspace` in it (holding it down only empties a row)            |
| Undo deleting a row or section              | **Undo** at the bottom of the window, until the next such change  |
| Move between rows                           | `↑` / `↓` from the first or last line of a row                    |
| Duplicate or delete a row                   | The icons that appear on hover or focus; on a tablet, its **⋯**   |
| Rename, duplicate, move or delete a section | Its **⋯** menu (deleting a section with rows asks first)          |
| Move a row or section                       | Drag its handle (⠿, left of it), also between sections            |
| Move it with the keyboard                   | `Tab` to the handle, `Space`, arrow keys, `Space` (`Esc` cancels) |

Numbers (section 3, row 3.c) follow the position and change as rows move; each row keeps its
identity, which is what later phases key results and statistics on.

## Quality checks

In-process checks along a machine's build, before the final inspection: "Quality check – Pre
start up", several per machine. They live in the machine's template (their set-up, below) and are
done on a machine from _Quality checks_ in the sidebar (see
[Doing a quality check](#doing-a-quality-check)). Printing one, importing one from Excel,
approvals, and protective equipment and tools per section come later.

- **The machine's page.** A template opens as its machine: "← Templates", the model's name and two
  tabs, **Final inspection** (the template editor above) and **Quality checks (n)**. The Templates
  page lists the machines' final inspection templates only; each card says "1 quality check" (or
  "No quality checks") and lists their names under Rows, "Frame (draft), Pre start up", and the list has
  a Quality checks column.
- **The Quality checks tab** shows the machine's quality checks as cards: the title, the
  department, document number and who made it, the revision, the sections, and the rows, time
  and last edit. A card opens the quality check: the editor for admins, the latest published
  revision for inspectors.
- **New quality check** (admins): its Name (required), the in-process check, e.g. "Pre start
  up", which makes its title "Quality check – Pre start up" (shown as it is typed; a name that
  already starts with "Quality check" is not prefixed twice). A name another quality check of the
  machine has is pointed out, not refused. It starts as an empty draft with the department
  Quality, the admin as Made by and today's date.
- **The editor** works as the template editor: one draft, autosave, conflicts, the leave
  warnings, Publish with a change note, the revision history, read-only revisions, Undo, drag and
  drop and the keys in the table above. Breadcrumbs lead back: Templates › RigiMill MG › Quality
  checks.
  - **Front page:** Name, Department (from the Responsible list in
    [Settings](#settings); a department removed since stays, "(not in the list)"), Document no.,
    Made by (people's names are suggested) and Date (may be empty). The title follows the name as
    it is typed.
  - **Rows are cards:** the pictures on the left, then the ref and **What** (one line; `Enter` adds
    a row below), **How** (lines of its own), **References** (`Enter`, a comma or a semicolon adds
    one, as ISO 12100; × removes it; up to 20) and on the right **Time** in hours with one decimal
    ("0,5" works too) and the row's **⋯**: Pictures and information, Duplicate, Delete (with
    Undo). `Backspace` in an empty What removes the row only when it has nothing else.
  - Each section's header adds up its rows and time ("5 rows · 0.8 h"), and so does the
    checklist's heading ("3 sections · 20 rows · 0.8 h").
  - **Publish** needs a name, a section and a row; every section needs a
    title and every row its What ("Row 1.a needs “What to check”.").
- **Pictures and more information.** A row's picture, or **Add pictures**, opens the guide editor
  (see [Guides](#guides)) in a quality check's words: _More information_, and up to six pictures,
  each marked **Should look like this**, **Should not look like this** or **Info**, with a caption
  and arrows, boxes and labels drawn on it. The card shows the first picture with ✓ or ✗ and
  "+2" when there are more, and the start of the information. Read-only, a click shows them all.
- **Export and import (JSON).** **⋯ → Export JSON** saves the draft as shown, unsaved changes
  included, as `Quality check – Pre start up – RigiMill MG.json`. **Import JSON** on a machine's Quality checks
  tab reads such a file and makes a new, unpublished draft of that machine: its name can be changed
  first (the file's to start with), every section and row gets a new id,
  and pictures not stored in this installation are left out, as the import says. A quality check
  file is refused by the Templates page's Import JSON and a template file by this one, each
  saying where it belongs; template files import exactly as before.
- **Delete.** **⋯ → Delete quality check** asks first and goes back to the Quality checks tab.
  Deleting a machine's final inspection template deletes its quality checks too: its dialog names
  them.
- **Not for final inspections.** A new final inspection offers final inspection templates only; a
  quality check is started from _Quality checks_ (see below). A quality check's print preview says
  it doesn't print yet. Deleting a quality check (or its machine's template) never deletes the
  checks already done with it: each keeps its own copy.
- **Addresses:** `/templates/{id}` (Final inspection), `/templates/{id}/quality-checks`,
  `/templates/{id}/quality-checks/{qcId}` and `…/{qcId}/revisions/{n}`. Older addresses of a
  quality check (`/templates/{qcId}`) lead to these.

**How they are stored.** A quality check is a template (`templates/{id}/draft.json` and
`rev-{n}.json`) with `kind: "quality"`, `parentId` (its machine's final inspection template), its
machine's `modelCode` (copied when it is made), `name` ("Quality check – Pre start up") and the
front page in `quality` (`name`, `department`, `documentNumber`, `madeBy`, `date`). A row adds
`how`, `references` and `timeHours`, each left out when empty; its pictures and more information
are its `guide`. Templates stored before quality checks existed have no `kind` and are final
inspection templates.

### Doing a quality check

Inspectors and admins do quality checks; only admins reopen a finalised one or delete one, as
for inspections. Everything an inspection does, a quality check does too: autosave, conflicts,
the deviation fields and photos, extra deviations, Finalise and Reopen, Delete and the keys.

- **The list.** _Quality checks_ in the sidebar (`/quality-checks`): number, Machine ID (with the
  model under it; "—" for a quality check started before they had one), the quality check's
  title, serial number, date, state (with rows filled while in progress) and NOK, newest first;
  searched by number, Machine ID, title or serial number and filtered by model and state, as the
  inspections list. Final inspections are never listed here, nor quality checks under
  _Inspections_.
- **Start a quality check** (`/quality-checks/new`): pick the machine (the models with at least one
  published quality check; one machine is picked for you), then which of its quality checks (by
  title, with the revision it will copy), then the **Machine ID** ("As in Monitor, e.g.
  Magellan#1") and the serial number (both required), the date (today) and _Checked by_ (the
  signed-in person to start with; `Enter`, a comma or a semicolon adds a name).
  The quality check's title, department and document number are shown under them. **Start
  quality check** gives it the next number of its own series, `QC-2026-0001` (counted like the
  inspections' FI- series, restarting every year), and opens it.
- **A frozen copy.** It keeps its own copy of the quality check's latest published revision: the
  rows with their how, references, time and pictures, and the front page's title, department and
  document number. Later revisions, or deleting the quality check, never change it.
- **The page** (`/quality-checks/{id}`): the header with the number and machine, the quality
  check and its revision, the serial number, the save status, **Finalise** (or **Reopen**), the
  tabs _Checklist_ and _Deviations (n)_, the progress (`3 / 10 rows filled · 1 NOK`) and _Continue
  at 1.d_. There is no Print or Preview yet: its print address says quality checks don't print yet.
  The front page has, in a final inspection's order, the Machine ID, the machine model (fixed),
  Serial number, Date and Checked by, and the quality check it follows, read-only; nothing about
  delivery (no location or photo).
- **The rows.** Each section is a header with its number, title, rows and time ("5 rows · 0.6 h"),
  how many are done and **Set remaining to OK**. Each row is a card: its first picture on the
  left (✓ or ✗, "+1" for more), the ref and what to check, how, the references and the time, and
  **Pictures and information**; on the right (under the text on an upright tablet or a phone) large
  **OK**, **NOK** and **N/A** buttons, 52 px high on a touch screen, and the comment. A click on
  the picture, or **Pictures and information**, opens them read-only: _Should look like this_,
  _Should not look like this_ and _Info_ with their captions, and _More information_.
- **NOK** opens the deviation's fields on the card: Responsible, Category, Severity and up to two
  photos, added right there (file, camera, paste or drop) and marked up as on any deviation. The
  card gets a red bar. The _Deviations_ tab lists them as for an inspection, with extra deviations.
- **Keys**, as on an inspection's checklist, on a focused card: `1`/`O`, `2`/`N`, `3`/`A`, `0`,
  `R`, the arrows, `J`/`K`, `C` for the comment, `G` for the pictures, `Tab` into the card's
  fields, `Enter` on to the next row and `Esc` back to the card.
- **Finalise** needs every row's status, the Machine ID and the serial number; problems are listed
  with links, as for an inspection. One started before quality checks had a Machine ID gets one
  on its front page first.

**How they are stored.** A quality check done is an inspection (`inspections/{id}.json`) with
`kind: "quality"`, a `QC-` number from `config/quality-check-counter.json`, the quality check's
template id and revision, and its copy in `templateSnapshot` with the front page in
`templateSnapshot.quality`. Its front page's `machineName` is the Machine ID (empty on one started
before quality checks had one); `location` stays empty and it has no photo. Inspections
stored before quality checks could be done have no `kind` and are final inspections. Its
deviations go into the `deviations` table with `kind: "quality"`, so Insights counts them apart.

## Inspections

Inspectors and admins create and fill in inspections; only admins reopen a finalised one or
delete one.

- **New final inspection.** **New final inspection** on the list: pick the machine model's checklist (only
  templates with a published revision are offered) and fill in the front page: Machine ID (the
  machine as the ERP, Monitor, knows it, e.g. Magellan#1) and serial number (both required), participants (`Enter`, a comma or a semicolon adds a name),
  location (the default from the settings), date (today) and a photo (the template's cover photo
  unless you add another). The checklist shows the model, name and revision of its latest
  published revision, which is what the inspection copies. **Create inspection** gives it the
  next number, `FI-2026-0042` (counting restarts every year, Swedish time; if the counter is ever
  lost, it carries on from the highest number in use), and opens it.
- **A frozen checklist.** The inspection keeps its own copy of the template's latest published
  revision. Later edits and revisions of the template never change it; the header shows which
  revision it follows.
- **The list.** Number, Machine ID, serial number, model, date, state (with rows filled while in
  progress) and the number of NOK rows, newest first. Search by number, Machine ID or serial number,
  and filter by model and state; the filters are kept in the address, so they survive opening an
  inspection and coming back (with the browser's Back or the page's _← Inspections_).
- **The page.** A sticky header with the number, machine, state, revision, save status,
  **Preview** (the printout at once, unsaved edits included, see [Printing](#printing)), **Print /
  Save PDF** (see [Printing](#printing)), **Finalise** (or **Reopen**), the tabs _Checklist_ and
  _Deviations (n)_, and the
  progress, e.g. `87 / 104 rows filled · 6 NOK`. _Continue at 3.b_ jumps to the first row without
  a status; the page opens with the focus on it, so `Enter` starts transcribing. The front page
  sits at the top of the Checklist tab and can be edited until the inspection is finalised. A
  participant's name counts as unsaved until it is added.

### Filling in the checklist

The checklist looks like the printed one. Each row has OK / NOK / N/A, a comment and a
_Responsible_ department, picked from the list in [Settings](#settings). A NOK row gets a red bar,
a _Category_ (optional, from the list in Settings) and a severity (minor unless you pick another).
A value stored before it left the list stays, shown as "Mekanik (not in the list)". Click a row,
or use _Continue at_, then:

| Key                               | Does                                                                      |
| --------------------------------- | ------------------------------------------------------------------------- |
| `1` or `O`                        | OK, then on to the next row                                               |
| `2` or `N`                        | NOK; stays on the row for its comment                                     |
| `3` or `A`                        | N/A, then on to the next row                                              |
| `0`, `Backspace` or `Delete`      | Clears the status (so does clicking the selected one again)               |
| `R`                               | The rest of the row's section OK (as **Set remaining to OK**)             |
| `↓` / `J`, `↑` / `K`              | Next / previous row, across sections (`Home`, `End`: first, last)         |
| `C`                               | Into the comment                                                          |
| `G`                               | The row's guide, if it has one (`Esc` closes it)                          |
| `Tab`                             | Row → comment → responsible → category and severity (NOK rows) → next row |
| `Enter` in comment or responsible | On to the next row                                                        |
| `Esc` in a field                  | Back to the row                                                           |

In the Responsible and Category selects, letters and arrows pick an entry; they are never
shortcuts.

Keys typed in a field are text, never shortcuts; `Tab` carries on from a section's last row into
the next section. **Set remaining to OK** on a section header (or `R` on one of its rows) marks
every row of that section that has no status yet as OK: mark the exceptions, then fill the rest. A
row with a guide shows its icon (a camera when it has images); the icon or `G` opens the guide
(see [Guides](#guides)).

A section published without checkpoints (a heading for ones still to be written) shows its
heading and "No checkpoints in this section yet.", with nothing to set: the keys and `Tab` go from
the row before it straight on to the row after it, and the progress and _Continue at_ count only
rows.

### Deviations, saving, finalising

- **Deviation Summary.** The _Deviations_ tab has a card for every NOK row, in checklist order,
  then for each extra deviation: D-01, the row's ref (a link back to the row), its section, the
  checkpoint, comment, responsible, category and severity, and the deviation's photos (see
  [Deviation photos](#deviation-photos)). A row's comment, responsible, category and severity are
  edited in its checklist row. **Add extra deviation** adds a finding that isn't tied to a row; it
  is edited on its card (Description, Comment, Severity, Responsible, Category) and removed with
  its bin icon, which asks first if anything was typed or a photo added. A NOK row in the
  checklist shows _Add photo_ or _2 photos_ under Responsible; a click opens its card's photos
  (it is not a Tab stop, so transcribing is unchanged). Once finalised, the cards are read-only
  and a photo opens in a viewer.
- **Autosave and conflicts.** As in the template editor: saved about a second after you stop,
  _Saved_ in the header, failed saves retried, a warning before leaving with unsaved changes. If
  someone else saved the inspection in between, nothing is overwritten: the page shows "Someone
  else changed this – reload to see the latest version.", stops saving and offers **Reload**.
- **Finalise.** Every row needs a status, and the front page a Machine ID and serial number;
  an extra deviation needs a description. Otherwise **Finalise** lists the problems, each a link
  to the place to fix it, and marks them in red until they are fixed. Then it saves what is
  pending and locks the inspection: the page becomes read-only and the API refuses changes. If
  the server could not update the deviation records, nothing is locked and **Try again** sends it
  again.
- **Reopen.** Admins only: makes a finalised inspection editable again; it counts as in progress
  until it is finalised again.
- **Delete.** Admins only, mainly to clear out trial inspections: **Delete inspection** in the
  header's ⋯ menu asks first ("Delete FI-2026-0012?"), then deletes the inspection, in progress or
  finalised, with its deviation photos, its rows in the deviation table and their follow-up, so
  Insights and the deviation log stop counting it. It can't be undone, and its number is never given out again. The machine photo
  stays (it may be the template's cover photo), and so does everything the template owns. Pending
  changes are saved first and autosave then stops. If someone else changed the inspection
  meanwhile, nothing is deleted and the dialog offers **Reload**. Afterwards the list says
  "FI-2026-0012 was deleted."

### The deviation table

Every inspection's deviations are copied into the table `deviations`, the source of the KPIs
(brief §4): one row per deviation, PartitionKey = model code, RowKey =
`{inspectionId}_{itemId or extraId}`, with the inspection's number, machine, serial number,
template revision, the row's section, ref and text, comment, resp, severity, category, date,
`finalised` and `createdAt` (when the deviation was first recorded), then `kind` (`final`, or
`quality` for a quality check's) and `checkName` (the checklist's name, "Quality check – Pre start
up"); rows written before these two were added have neither, are a final inspection's, and get
them at the inspection's next write. Then the [deviation log](#deviation-log)'s: the deviation's
number (`deviationNumber`, "D-03") and its follow-up (`status` open or closed, `action`, `closedOn`,
`closedBy`), copied from the inspection's follow-ups; rows written before these have none, are
open, and get them at the next write. Each write brings the table in line with the inspection and
its follow-ups: new and changed rows are written, rows of deviations that are gone (a NOK set back
to OK, a removed extra deviation) are deleted, unchanged rows are left alone.

- A **save** writes the inspection first, then the table. If the table update fails, the save
  still succeeds and the next save repairs the table. After updating the table, every write
  checks that neither the inspection nor its follow-ups changed meanwhile and updates it again if
  they did, so a slow update never leaves the table behind a newer save, finalise, reopen or
  closed deviation.
- **Finalise** and **Reopen** update the table first (its `finalised` flag decides what the KPIs
  count), then the inspection. If the table update fails, nothing changes and the request can
  simply be sent again.

## Deviation photos

Every deviation, from a NOK row or an extra one, can have up to two photos, marked up so that
whoever fixes it sees exactly where. They print on the report's deviation pages.

- **Adding.** **Add photo** on the deviation's card opens the file picker (a tablet offers its
  camera too). An image on the clipboard is pasted with `Ctrl+V` while the card's photo buttons
  have the focus, and an image file can be dropped on them. The photo is scaled in the browser to
  1600 px on the long edge and uploads while the editor opens straight away. A file the browser
  can't open as a picture (HEIC in Chrome, SVG) is refused with a message; transparent parts of a
  PNG become white.
- **Editing.** A click on a thumbnail opens the photo in the editor again; its **×** removes it
  (after asking). With two photos the Add button goes away.
- **Saving.** **Save** uploads the photo and, when it has marks, a flattened copy of the photo
  with them; then the card shows the copy and the inspection saves itself as usual. An upload
  that hangs gives up after a minute (Save tries again), and **Cancel** or `Esc` while saving
  stops the save and keeps the marks.
- **Leaving.** Marks and a caption are kept only by **Save**: going elsewhere in the app (Back, a
  link) while the editor has unsaved changes asks first, and closing the tab warns.
- **If the editor can't load** (offline, or a new version was deployed meanwhile), a small
  message says so and offers **Reload page**; the rest of the page and its changes stay.

The editor: tools on top, the photo filling the window, a caption and **Save** / **Cancel** at the
bottom. Mouse, finger and pen all work.

| To                            | Do                                                                                             |
| ----------------------------- | ---------------------------------------------------------------------------------------------- |
| Draw an arrow, box or ellipse | Pick **Arrow**, **Rectangle** or **Ellipse**, drag across the photo                            |
| Write a label                 | **Text**, click where it goes, type, `Enter`                                                   |
| Draw by hand                  | **Freehand**, then draw                                                                        |
| Pick a colour                 | Red, Green, Cyan, Yellow or White (also recolours the selected mark, or the label being typed) |
| Move or delete a mark         | **Select and move**: drag it; `Delete` or the bin removes it                                   |
| Change a label                | Double-click it with **Select and move**                                                       |
| Undo, redo                    | `Ctrl+Z`; `Ctrl+Shift+Z` or `Ctrl+Y` (also the buttons)                                        |
| Cancel                        | `Esc` or **Cancel** (asks first if anything changed)                                           |

Lines and labels are sized to the photo (a label is 4 % of its long edge), so they look the same
on screen, on a thumbnail and on paper. They stay visible on a black-and-white printer: yellow
and white lines have a thin dark outline (in the editor and in the flattened copy), labels have
one in every colour, and red and cyan print dark enough on their own.

**How they are stored.** A photo is `{ imageId, caption, annotations, renderedImageId }` in the
inspection: in the NOK row's result (`results[itemId].photos`) or in the extra deviation. The marks
are vectors, coordinates as fractions (0–1) of the photo's width and height, so they stay
editable. `renderedImageId` is the flattened copy: a JPEG (quality 0.9) at the photo's own size,
uploaded through `/api/images/upload-url` like any photo (`images/{id}.jpg`). A photo without marks
has none, and print uses the photo itself; changing only the caption keeps the copy. Photos stay
with a row whose status changes from NOK, but count and print only while it is NOK. Replaced
copies, removed photos and photos added and then cancelled stay in storage, like replaced cover
photos.

## Guides

A guide shows what a checkpoint should and shouldn't look like (brief §5.4): a short description
and up to six reference images, each marked **✓ Good**, **✗ Bad** or **ⓘ Info**, with a caption,
and drawn on with arrows, boxes and labels in the same editor as deviation photos (see
[Deviation photos](#deviation-photos)).

- **Writing one (admins).** In the template editor, a row's **Add guide** (**Edit guide** once it
  has one) opens the guide editor: one of the icons that appear on hover or focus, on a tablet in
  the row's **⋯**. A row with a guide also shows its icon (a camera when it has images), which
  opens it too. Type the description, then add images with **Add image** (file picker; a tablet
  offers its camera), `Ctrl+V` of an image on the clipboard, or by dropping an image file anywhere
  on the dialog, also while typing. Text pasted into the description or a caption stays text, also
  when it comes from Excel or Word with a picture of itself. A new image opens in the photo editor straight away; a click
  on an image opens it again, its **×** removes it (after asking). Under each image: Good / Bad /
  Info (a new one starts as Info, saying nothing until it is marked) and its caption.
- **Saving.** **Save** puts the guide into the draft, which saves itself like any other change.
  **Cancel** or `Esc` asks before discarding changes, and so does leaving the page while the
  guide editor has changes. **Remove guide** (after asking) takes the guide off the row. A guide
  without a description or images is no guide.
- **What inspectors see.** A guide is part of the checklist: it reaches new inspections with the
  next published revision. An inspection keeps the guides of the revision it was created from,
  like the rest of its checklist, so editing a guide later never changes an existing inspection.
- **Reading one.** On an inspection the row's icon, or `G` on the row, opens the guide read-only:
  the description, then the images with their verdicts and captions. `←` / `→` move between the
  images; `Enter` or a click shows one large, where `←` / `→` step through them; `Esc` closes
  (the large view first, then the guide). The read-only template view and a revision page open
  the same viewer from the row's icon.

**How they are stored.** `item.guide = { description?, images }` on a checklist row, each image
`{ imageId, caption?, annotations, renderedImageId?, verdict }` (`good`, `bad` or `info`): a
deviation photo with a verdict, uploaded and flattened the same way. Guides are saved with the
template's draft, frozen in its published revisions and copied into each inspection's checklist
(`templateSnapshot`). Images that are replaced, removed or cancelled stay in storage.

## Printing

Printing is the browser's own: each print route shows a preview of A4 sheets, and **Print /
Save PDF** opens the print dialog. In it, in **Chrome or Edge**:

- **Destination**: _Save as PDF_ (or a printer). The paper size is A4, set by the page.
- **Margins**: _Default_. **Scale**: _Default_ (100 %).
- **Headers and footers**: off. The document prints its own footer.
- **Background graphics**: either way; the light grey header fills print regardless.

Chrome and Edge print the footer on every page: the inspection, machine, serial number and
revision bottom left, "Page X of Y" bottom right. Firefox and Safari can't; they print the left
part at the foot of each table (and of each page of reference images) and no page numbers. A
machine name longer than 60 characters is shortened in the footer.

**What to print.**

- **A quick look first**: **Preview** on an inspection shows the printed pages straight away in a
  full-screen window. Nothing is saved first and no print dialog opens. It shows what is on
  screen, including changes that are not saved yet, laid out as on paper and scaled to fit a
  tablet. It opens on the report; _Blank checklist_ switches to the blank checklist. Its **Print /
  Save PDF** does what the page's does. Escape or **Close** go back to the inspection. A
  template's **Print preview** never prints by itself, so it is the preview there.
- **From an inspection**: **Print / Save PDF** → _Blank checklist_ or _Report_. It saves pending
  changes, opens the preview in a new tab and the print dialog once everything (photos, fonts) has
  loaded. The preview's toolbar switches between the two.
- **From a template**: **Print preview**. From the editor: admins see the draft, marked "Draft –
  Rev N"; inspectors the latest published revision. From a revision page: that revision. It
  prints as a new inspection's blank checklist would, with an empty front page.
- Addresses: `/inspections/{id}/print?mode=blank|report[&deviationsPerPage=2|4][&appendix=1]`
  (without a mode: the report once finalised, else the blank checklist),
  `/templates/{id}/print[?revision=n]`; `appendix=1` adds the reference images to any of them.

**The document** (brief §6):

- **Front page.** Logo, "Final Inspection", company name, the machine photo, Machine name, Model,
  Serial number, Participants, Location and Date, signature lines (Inspected by, Date, Signature)
  and the checklist's revision bottom right ("Rev: 2", or "Draft – Rev 3" for a template's draft).
  A report also has its number, who finalised it and when, and "90 checkpoints: 82 OK · 6 NOK ·
  2 N/A · 8 deviations"; a report of an inspection in progress adds "N not checked", says
  "NOT FINALISED – DRAFT REPORT", and "Not finalised" in every footer. A report without a machine
  photo leaves its space blank; the blank and template forms show a "Machine photo" frame to
  stick one in. The photo gives way to long values; values far beyond the usual (dozens of participants,
  names near their 200 characters) move the signatures and revision to a second page.
- **Checklist.** One table per section: No. | Checkpoint | Comment | OK | NOK | N/A | Resp. Its
  title and column labels repeat on every page the section runs onto; a row is never split, and a
  section title never stands alone at the foot of a page. _Blank_: tick boxes and rows at least
  9 mm high for handwriting; findings that belong to no row go on the Deviation Summary. _Report_:
  the status as a symbol and a word (✓ OK, ✗ NOK, – N/A), a NOK row's severity above its comment
  ("Severity: Major"), and Resp. A section without checkpoints prints its title and column
  labels, then one line, "No checkpoints in this section.", blank or report; it keeps with its
  title but never holds the next section on its page. Word does the same.
- **Deviations**, starting on a new page. _Blank_: the Deviation Summary to fill in by hand, lines
  D-01 to D-24, filling the page (No. | Ref | Description | Severity | Category | Resp | Closed).
  _Report_: a card per deviation: "D-03 · 4.c · MAJOR" (an extra deviation says "Not on the
  checklist"), the section, the checkpoint or description, comment, Category and Responsible ("—"
  when none), its photos
  as marked up (with captions), and a "Closed · Sign · Date" line to sign off. A deviation without
  photos gets an empty frame to sketch in. "No deviations recorded." when there are none.

The printed checklist's narrow column and the blank summary keep the paper's short "Resp" label;
the cards and the screens say Responsible.

**2 or 4 deviations per page.** The report's toolbar has _Deviations: 2 per page | 4 per page_
(kept in the address). With 2, a card has the full width and half a page: one photo prints at
about 10 × 8 cm. With 4, each card is a row, the text on the left and the photos on the right: one
photo prints at about 7 × 5 cm. Cards share their page equally, and a card whose text needs more
room takes it from the others, but with 2 a photo never prints under 5 cm: a card with much text
then has a page of its own. If the cards don't all fit, the page holds fewer and the next card
starts the next page; a card is never split. A card too tall to share a page of four gets a page
of its own, laid out full width as with 2. Only a card whose text alone is longer than a page
(thousands of characters) runs on to the next page, with its photos whole. 2 per page is the
default, or 4 when no deviation has a photo (an address choice always wins).

On a phone or tablet the print route and the Preview fit the sheets to the screen; paper is always
printed 1:1.

Everything is laid out for black and white: statuses and severities in words, light grey fills
only, thin rules. Inter is bundled with the app, so a printout looks the same offline.

### Reference images (appendix)

**Include reference images** in the print toolbar (kept in the address as `appendix=1`) adds the
guides' images (see [Guides](#guides)) after the deviations, starting on a new page headed
"Appendix · Reference images": every row whose guide has images, in checklist order, with its ref
and checkpoint, the guide's description and the images two to a row, each about 9 × 7 cm as
marked up, captioned "3.c · ✓ Good" (or ✗ Bad, ⓘ Info) and with its own caption below. An image
never parts from its caption, and a row's heading always has its first images under it. Rows
whose guide has no images are left out; a checklist without any shows the box greyed out, with "No
reference images in this checklist". It works for the blank checklist, the report and the template
preview, and an inspection prints the guides it was created with.

### Word export

**Export to Word (.docx)** in the print toolbar saves what the preview shows as an editable Word
file, made in the browser: the front page, one table per section with the same columns (blank:
☐ boxes; report: ✓ / ✗ / – and the word, a NOK row's severity in its comment), the deviations
(blank: the D-01 to D-24 table; report: a framed block per deviation with its photos and a line
to sign it off), the reference images when they are included, and the footer with
"Page X of Y". It is A4 portrait with the print margins; header rows repeat on every page and rows
and deviation blocks never split (only one taller than a page may, so that Word doesn't cut it
off), but Word lays out its own pages, so they break differently from the PDF. The text is Arial, which every Word installation has. The file is named like the PDF:
`FI-2026-0042 RigiMill MG – Volvo Skövde – Inspection report.docx` (`– Blank checklist`,
`– Draft report`, a template's `… – Checklist preview`); a very long name is shortened before
that last part. The Word library is loaded only on the first export.

## Light and dark theme

**System**, **Light** or **Dark**, at the bottom of the sidebar (and in the tablet menu). System
follows the device's own light or dark setting and is the default. A choice is kept in this
browser (localStorage) and also applies to the sign-in and no-access pages. Printouts, the print
preview and the quick Preview always show white paper, whatever the theme. In the dark theme the
logo has a white wordmark (`app/public/modig-logo-dark.png`).

## Deviation log

For everyone signed in, inspectors and admins. _Deviations_ under Final inspection
(`/deviations/final`) and under Quality check (`/deviations/quality`; `/deviations` leads to the
first) list every deviation of that kind, NOK rows and extra deviations, with its follow-up: the
overview the Excel deviation log gave, of what is still open and what has been closed, per machine
and per responsible. The two kinds are never shown together.

- **Summary.** Open, Closed (with its share of all) and Open more than 30 days (in red when there
  are any), under every filter but the status. Under them, the open deviations per responsible as
  chips: a chip picks that responsible, and again shows all of them.
- **Filters**, kept in the address so a view can be shared: **Open | Closed | All** (Open to start
  with), a search (every word must appear somewhere: Machine ID, serial number, number, deviation
  ID, checkpoint, comment, action…), the model, the responsible ("Not assigned" for none) and the
  category ("No category").
- **By machine.** A card per machine: its Machine ID and serial number (a quality check's title
  too, since a machine has several), the model, the inspection and its date (a link to its
  Deviations tab), "In progress" while it is, and "3 open · 9 closed" with a bar. Machines with
  open deviations come first, then the newest. A machine inspected twice lists both inspections.
- **Each deviation:** its ID, "QC-2026-0004 · D-03" (a link to it on the inspection's Deviations
  tab), the severity, the ref and checkpoint (or an extra deviation's description), the comment and
  what was done; Responsible, Category, Found (the day it was first recorded and, while it is
  open, how many days ago, in red after 30) and the status, with when and by whom it was closed.
  A table on a desktop, a card each on a tablet or a phone.
- **Close…** asks Action taken (optional), Closed on (today to start with, never a day to come)
  and Closed by (you to start with); **Close deviation** shows it closed at once while it is
  saved. A closed one has **Edit** (the same fields) and **Reopen…**, which asks first: what was
  done stays, the date and name are cleared. If saving fails, it goes back as it was and the page
  says why. A deviation closed while only open ones are listed leaves the list, and the page says
  where it went.
- **On the inspection.** An inspection's or quality check's Deviations tab shows each deviation's
  status, when and by whom it was closed and what was done, with the same Close… / Edit /
  Reopen…, also once it is finalised: closing a deviation doesn't change what the inspection
  found (the row stays NOK). A deviation just marked is saved first.
- **Export CSV** saves what the filters show as a file like the Excel log: Machine ID, Serial
  number, (Quality check,) Model, Inspection (Quality check no.), Date, Deviation ID, Description,
  Comment, Action, Category, Severity, Responsible, Status, Found, Closed, Closed by; UTF-8 with a
  byte order mark and semicolons, as the Insights CSV. It is named after the filters:
  `Quality check deviations 2026-11-06, open, RMMG.csv`.
- A NOK row set back to OK leaves the log, as it leaves the deviation table; marked NOK again, it
  comes back with its follow-up (it is the same checkpoint of the same inspection).

**How it is stored.** An inspection's follow-ups are one blob, `follow-ups/{inspectionId}.json`,
by deviation key (a row's item id, an extra deviation's id): `status`, `action`, `closedOn`,
`closedBy`, `updatedAt`, `updatedBy`. A deviation without one is open. They are not in the
inspection, so closing a deviation never changes its version and its open page goes on saving
without a conflict. The blob is written over the version read and read again on a clash, so two
deviations closed at once both land. The deviation table carries each follow-up with its row (see
[The deviation table](#the-deviation-table)), so the log is one table query, plus the inspection
list, which leaves out rows of inspections deleted since; rebuilt from the blobs, the table gets
them back. Deleting an inspection deletes its follow-ups.

## Insights

Admins only (Insights in the sidebar). The numbers come from the inspection list and the
`deviations` table, so the page needs one blob listing and one table query.

**Final inspections | Quality checks**, at the top of the page, says which it shows: the two are
never counted together. Final inspections are the default (`/insights`, so every link made before
keeps showing what it did); quality checks are `/insights?kind=quality`. Everything below follows
the choice in its own words: the headline numbers ("Quality checks finalised", "Deviations per
check"), the panels, the top 10 ("Of checks"), the CSV export and the report. For quality checks
a **Quality check** menu next to the model picks one quality check by its title (`&check=Quality
check – Pre start up`), on every machine that has it; with a model, on that machine. Switching
keeps the period, the model and in-progress, and drops the quality check. A quality check's CSV
has the same columns with `checkName` (its title) after `machineName` (its Machine ID), and is
named `Quality check deviations 2026-01-01 to 2026-10-31, RMMG, Pre start up.csv`; its
report is the **Quality check deviation report**, which also states the quality check, and its
PDF is named the same way.

- **Filters**, in one row above everything they scope, and in the URL, so a view can be shared:
  the period, the model, and **Include inspections in progress** (off: only finalised inspections
  count, as the brief asks). Dates are the inspection's front-page date. The periods:
  - **Last 12 months** (the default), **This year**, **Last year** and **All time** are relative:
    a link to "last 12 months" shows the 12 months before the day it is opened. The dates they
    cover today show next to the menu.
  - **Single month**: one month from a menu (`?period=month&month=2026-10`), its first to its
    last day.
  - **Month range**: a from month and a to month, both included
    (`?period=months&fromMonth=2026-01&toMonth=2026-06`).
  - **Custom dates**: any two dates (`?period=custom&from=2026-02-10&to=2026-05-20`).
- **Choosing months:** the month menus list every month from the first inspection's (whatever the
  filters) to the current one, newest first, as "2026-10". Switching to a month, a month range or
  custom dates starts from the dates on screen: "Last year" becomes 2025-01 to 2025-12, so the
  numbers don't jump until you narrow them. A range that ends before it starts says so under it
  and shows no numbers until it makes sense. A selection without inspections says which ("There
  are no finalised inspections in 2025-08.") and offers **Show all time**.
- **Headline numbers:** inspections finalised (with in-progress ones, how many of each),
  deviations (NOK rows plus extra deviations), deviations per machine (deviations ÷ inspections),
  and the first-pass rate: the share of checked rows that were OK. N/A rows were not checked, so
  they don't count either way.
- **Top 10 recurring checkpoints**, the most important table: grouped by the row's stable id, so
  a checkpoint keeps its history when it moves or is reworded. It shows where the checkpoint is in
  the template's latest published revision (ref, text, section), how many inspections it failed in,
  and that as a share of the inspections whose checklist had the row: an inspection made before
  the row was added says nothing about it. A row removed since shows its last ref and text, marked
  "No longer in the checklist".
- **Charts:** deviations per month (a line; every month of the period, empty ones included),
  by severity (one bar split into minor, major and critical), and per section, per model, by
  responsible and by category (ranked bars). Sections, responsibles and categories are grouped
  ignoring case and surrounding spaces, in the spelling most rows use; extra deviations and
  deviations without a responsible or category come last ("Not assigned", "No category").
- **Export CSV** saves the deviation rows behind the page, under the same filters: the table's
  18 columns in the brief's order, with `category` after `severity`, oldest inspection first, rows
  in checklist order. It is UTF-8 with a byte order mark and semicolons, which is what Excel with
  Swedish regional settings opens directly; Power BI reads it too. A cell that starts with `=`,
  `+`, `-` or `@` gets a leading `'` so that Excel never runs it as a formula. The file is named
  after the filters, e.g.
  `Deviations 2025-12-01 to 2026-11-03, RMMG.csv`.

If some deviation records can't be read (a row edited by hand, say), the page says how many are
left out, so its numbers may be too low; the API log names the first problem.

The chart library (Recharts) loads only when Insights opens.

### Report

**Preview report** and **Print report**, next to Export CSV, turn the page into a printed
deviation report: the same numbers, for exactly the filters chosen on the page.

- **Preview report** shows the A4 pages at once in a full-screen window, scaled to fit a phone
  or tablet, on light paper in either theme. Its **Print / Save PDF** (or Ctrl+P) prints them;
  Escape or **Close** go back to Insights.
- **Print report** opens the report in a new tab, which opens the print dialog once it has
  loaded, as an inspection's Print / Save PDF does. The print dialog's settings are those under
  [Printing](#printing). The tab's toolbar leads back to Insights with the same filters.
- **Include deviation list**, in the preview and the print toolbar, adds every deviation behind
  the numbers on pages of their own (greyed out when there are none).
- Address: `/insights/report?<the Insights page's filters>[&deviations=1]`, for admins only.

**What it says**, A4 portrait, in black and white, each part in a light card (the short ones two to
a row):

- **The header:** logo, "Deviation report", the company name, then what the report covers:
  _Period_ ("2026-10" for a whole month, "2026-01 – 2026-10" for whole months, otherwise the
  dates, such as "2025-12-01 – 2026-11-05 (last 12 months)", or "All time"), _Model_ ("All
  models" or its name), _Inspections_ ("Finalised only" or "Finalised and in progress") and
  _Generated_ (date, time and who). If some deviation records could not be read, it says so, as
  the page does.
- **Headline numbers:** the four tiles' figures, each with what it counts.
- **Deviations per month:** columns for one or two months, a line from three on, and under it
  each month's deviations and inspections, a year to a row.
- **By severity and Per model** side by side, then the top 10, **Per section**, and **By
  responsible and By category** side by side: tables with every entry (no "Show all"), its count,
  its share of all the deviations and a bar as long as the count against the largest; per model
  its inspections, deviations, deviations per machine and share.
- **Top 10 recurring checkpoints:** rank, ref, checkpoint ("No longer in the checklist" under a
  removed one), section, the model when there are several, how many inspections it failed in and
  that as a share of the inspections whose checklist had it ("50% of 4").
- **The deviation list**, when included: each inspection's deviations under a line naming it
  (number, date, model, machine and serial number, "In progress" when it is), with ref,
  checkpoint and comment, severity, category and responsible, in the order of the CSV export.
  Refs and checkpoints are as they were inspected.
- **When no inspection matches**, "No inspections match these filters" instead of the tables.

Each part stays on one page with its heading when it fits; tables repeat their column labels on
every page they run onto. Chrome and Edge print "Deviation report · 2026-10 · RigiMill MG" bottom
left and "Page X of Y" bottom right; Firefox and Safari repeat the left part under the deviation
list. The PDF is named after the filters, as the CSV is: `Deviation report 2026-01-01 to
2026-10-31, RMMG.pdf`, `Deviation report 2026-10, RMMG.pdf`, or `Deviation report start to
2026-11-05.pdf` for all time (`, incl. in progress` when they are included).

## Settings

Admins only. The Settings page has two cards: _Users & access_, the people who may use the app
(see [Auth model and roles](#auth-model-and-roles) and [Invite users](#5-invite-users)), and
_Models, lists & reports_, described here. Everything in _Models, lists & reports_ is saved
together with one **Save**. Problems (an empty name, a code with other characters, a name that is
already on its list, ignoring case) are listed after the first try, and the first one gets the
focus. Leaving the page with unsaved changes asks first. If someone else saved the settings in
between, nothing is overwritten: the card says so and offers **Reload**.

- **Machine models.** A name and a short code each. A new model's code is suggested from its name
  ("RigiMill MG" → RMMG, with a number added when that code is taken) and can be changed until it
  is saved: letters and digits only. After that the code stays, because templates, inspections
  and the deviation records carry it. Removing a model asks first. Templates and inspections that
  use it keep its code and show the code where its name was. New templates can't be made for it.
- **Responsible** (who fixes a deviation) and **Deviation categories** (what kind it is). These
  are the choices offered on every deviation, in this order. Add an entry (type it and press
  Enter), rename it in place, move it up or down, or remove it. Each list starts from the
  defaults: Mechanical, Electrical, Media, Quality, Design, Software, Purchasing; and Markings &
  labels, Wrong assembly, Missing parts, Damage & scratches, Loose or wrong torque, Leakage,
  Cleanliness, Cabling & routing, Function & adjustment, Software & parameters, Documentation,
  Safety. Removing or renaming an entry doesn't change deviations that already use it.
- **Default location** for new inspections, and the **company name and logo** on printed reports
  and Word exports. Without a logo of its own, the Modig logo is used.

## API

Managed Functions under `/api`, all JSON. Every function checks the role itself; errors are
`{ error, message, details? }`. Saves (settings too), publishing, finalising, reopening and
deleting a template or an inspection need the document's `ETag` in `If-Match` and get `412` if
someone else changed it. A `503` with `unavailable` means nothing was changed and the same request
can be sent again.

A quality check goes through the template routes. `POST /api/templates` with `{ kind: "quality",
parentId, name }` makes one under the final inspection template `parentId` (404
if there is none, 400 if it is a quality check); `POST /api/templates/import` with `{ kind:
"quality", parentId, name, file }` imports a quality check file. The list gives each
quality check its front page, section titles and total time.

A quality check done on a machine goes through the inspection routes. `POST /api/inspections`
with a published quality check's id and `{ front: { machineName, serialNumber, participants, date
} }` starts one: `kind: "quality"`, the next `QC-` number (409 when the quality check was never
published, 400 without a Machine ID or serial number); a final inspection template still makes a final inspection, with
its own front page. `GET /api/inspections` lists both, each with its `kind` and `templateName`;
read, save, finalise, reopen and delete work the same for both. Insights takes `kind=quality` (and
`check`) on all three of its routes; without it, it counts final inspections only.

The deviation log (see [Deviation log](#deviation-log)) takes `kind` (final when left out),
`status` (`open` when left out, `closed` or `all`), `model`, `resp` and `category` (matched
ignoring case; `-` for none) and `q` (words that must all appear). A follow-up is `PUT` as
`{ status: "closed", action?, closedOn?, closedBy? }` (left out: the action as it was, today in
Sweden, the signed-in person's name; an edit keeps an earlier close's date and name) or
`{ status: "open", action? }`, on an inspection in progress or finalised; `key` is a NOK row's
item id or an extra deviation's id, and anything else is a 404. A `503` after a follow-up means
it was stored but the log's table could not be updated: sending the same request again is safe.

| Method and route                             | Role      | What                                                                     |
| -------------------------------------------- | --------- | ------------------------------------------------------------------------ |
| `GET /api/me`                                | inspector | Name, email and roles of the signed-in user                              |
| `GET /api/settings`                          | inspector | Machine models, location, company name and logo, the pick lists, `ETag`  |
| `PUT /api/settings`                          | admin     | Save every editable setting (`If-Match`)                                 |
| `GET /api/users`                             | admin     | The people list (name, email, role, added by/when) and its `ETag`        |
| `PUT /api/users`                             | admin     | Save the people list (`If-Match`, or `If-None-Match: *` for the first)   |
| `GET /api/people`                            | inspector | Everyone's name by email, to show people by name                         |
| `GET /api/templates`                         | inspector | All templates and quality checks (`kind`, `parentId`): latest revision   |
| `POST /api/templates`                        | admin     | New template for a model without one or a new model; or a quality check  |
| `GET /api/templates/{id}`                    | admin     | The draft, its revision history and its `ETag`                           |
| `PUT /api/templates/{id}`                    | admin     | Save the draft (`If-Match`)                                              |
| `DELETE /api/templates/{id}`                 | admin     | Delete draft and revisions (`If-Match`), a template's quality checks too |
| `POST /api/templates/import`                 | admin     | New draft from a template file (model, name, new model) or quality check |
| `POST /api/templates/{id}/publish`           | admin     | Publish the draft as the next revision (`If-Match`, change note)         |
| `GET /api/templates/{id}/revisions/{n}`      | inspector | A published revision (cached by the browser: it never changes)           |
| `GET /api/inspections`                       | inspector | All inspections and quality checks done (`kind`), newest number first    |
| `POST /api/inspections`                      | inspector | New inspection, or quality check done, from a template's latest revision |
| `GET /api/inspections/{id}`                  | inspector | One inspection and its `ETag`                                            |
| `PUT /api/inspections/{id}`                  | inspector | Save front page, results and extra deviations (`If-Match`)               |
| `DELETE /api/inspections/{id}`               | admin     | Delete it, its deviation rows, follow-ups and photos (`If-Match`)        |
| `POST /api/inspections/{id}/finalise`        | inspector | Lock it once every row has a status (`If-Match`)                         |
| `POST /api/inspections/{id}/reopen`          | admin     | Unlock a finalised inspection (`If-Match`)                               |
| `GET /api/inspections/{id}/follow-ups`       | inspector | Its deviations' follow-ups by key (none yet: an empty map)               |
| `PUT /api/inspections/{id}/follow-ups/{key}` | inspector | Close, edit or reopen one of its deviations                              |
| `GET /api/deviations`                        | inspector | The deviation log for `?kind&status&model&resp&category&q`               |
| `GET /api/deviations/export.csv`             | inspector | The same deviations as a CSV file, the Excel log's columns               |
| `GET /api/insights`                          | admin     | KPIs for `?kind&from&to&model&check&includeInProgress` (all optional)    |
| `GET /api/insights/export.csv`               | admin     | The deviation rows under the same filters, as a CSV file                 |
| `GET /api/insights/deviations`               | admin     | The same rows as JSON, for the printed report's deviation list           |
| `POST /api/images/upload-url`                | inspector | New image id and a 10-minute upload URL for it                           |
| `GET /api/images/{id}/url`                   | inspector | A 15-minute read URL for an image                                        |

## Seed data

`npm run dev` runs the seed every time. To run it on its own:

```bash
npm run seed -- --dry-run   # parse and validate the workbook, print a summary, write nothing
npm run seed                # write into local Azurite (it must be running)
```

It is idempotent and never changes what already exists. Containers, the `deviations` table and
`config/settings.json` are created when missing; after that the settings belong to the admins and
the seed leaves them alone. The RigiMill MG template is imported only if none exists yet
(published revision 2, continuing the workbook's "Rev: 2", plus a draft at revision 3); it is
still recognised after an admin moves it to another model. An import that was interrupted
between those two writes is completed on the next run. To start over
locally, stop `npm run dev`, delete `.azurite/` and start it again.

`STORAGE_CONNECTION_STRING` points the seed at another storage account (see
[Deploy to Azure](#deploy-to-azure)). Set it only for that one command, and never `export` it in
the shell you run `npm run dev` from. Unset means local Azurite; set but empty stops the seed,
because it usually means the command that produced it failed.

## Scripts

| Command             | What it does                                                                |
| ------------------- | --------------------------------------------------------------------------- |
| `npm run dev`       | The whole local stack (see above)                                           |
| `npm run build`     | `app/dist` (static site) and `api/deploy` (bundled API), as CI deploys them |
| `npm run typecheck` | `tsc` for the root configs and e2e tests, then every workspace              |
| `npm run lint`      | ESLint                                                                      |
| `npm run format`    | Prettier, writing changes (`format:check` only checks)                      |
| `npm test`          | Vitest unit tests of all workspaces                                         |
| `npm run test:e2e`  | Playwright end-to-end tests                                                 |
| `npm run seed`      | Import the workbook (see above)                                             |
| `npm run check`     | typecheck + lint + format:check + test: run it before pushing               |

## Tests

- **Unit tests** (`npm test`): Vitest across `shared`, `api`, `seed` and `app`. The storage tests
  start their own in-memory Azurite on free ports, so nothing else needs to be running. For the
  deviation log: the follow-up contract and its defaults, the log's filters and old rows read as
  open (`shared/src/deviationLog.test.ts`); the follow-up and log endpoints
  (`api/src/functions/deviation-log.test.ts`: roles, a key that is no deviation, finalised
  inspections and quality checks, the inspection's version untouched, a follow-up kept across a
  save, a rebuild of the table and a save's sync racing it, delete, the filters, old rows, the
  CSV); and the page's filters, grouping by machine and order (`app/src/features/deviationLog`).
- **End-to-end tests** (`npm run test:e2e`): Playwright with Chromium, against
  <http://localhost:4280>. If nothing is running there, Playwright starts `npm run dev` itself and
  stops it afterwards; locally it reuses a stack you already started. The tests cover the sign-in
  redirect for pages and the API, the anonymous pre-login files (and that an encoded `../` cannot
  reach the app through them), the sign-in link, the inspector and admin navigation, the no-access
  page (and Check again), an admin adding themselves and a colleague in Settings (the invitation,
  then the colleague signing in by name without any Static Web Apps role, an edit and a removal
  counting at once), a deep link, signing out and the seed. For the themes: System following the
  browser's setting, Light and Dark kept over a reload and set before the first paint, the tablet
  drawer's control in step with the sidebar's, light paper when printing in the dark theme, the
  anonymous theme script and dark logo, and the sign-in page in the stored or the system theme.
  For the quick Preview: the report with unsaved edits on white sheets while the app is dark, the
  switch to the blank checklist, Escape closing it with the focus back on Preview and nothing
  saved, Close, its Print / Save PDF saving first and printing in a new tab, sheets scaled to a
  tablet's width with the cards packed as on paper, and a template's print preview never printing
  by itself. For the settings (`e2e/settings-lists.spec.ts`, run in order because every save
  changes the settings' one ETag): an admin adding a model and list entries, which inspections
  then offer, and removing them again; Save after someone else saved refused with Reload, and
  leaving with changes asking first; and an inspector's save refused with 403. For templates: the
  list, autosave across a reload, `Enter` and `Backspace` (also held down), undoing a delete, a
  long word at tablet width, dragging a row into another section, the section menu, saving before
  leaving and the tab-close warning, publishing with a change note, two admins in conflict, a lost
  save answer, a save after signing out, a cover photo upload (also leaving while it uploads), a
  new template whose empty row blocks publishing; a section without rows published, shown in an
  inspection and printed (blank and report); the list shown as cards and remembered; deleting a
  template (asks first, its inspection kept, its revisions gone); the new machine model fields
  (suggested code, a taken code refused); Export JSON, a wrong file explained, and Import JSON
  making a new draft with new ids; and the inspector's read-only view (the API refuses their
  saves, deletes and imports with 403). For quality checks (`e2e/quality-checks.spec.ts`): an
  admin creates one on a machine's Quality checks tab, fills in the front page (the title
  following it), adds a section and two rows from the keyboard with How, references (comma and
  Enter) and time (a decimal comma), opens a row's pictures in a quality check's words, adds a
  picture marked Should look like this, checks the autosaved draft, publishes, and finds it on the
  tab, counted on the machine's card and list row and never listed as a template of its own;
  Export JSON (unsaved changes included, the file name) and Import JSON on the same machine as a
  new draft with fresh ids, a template file refused with its reason; deleting the machine's
  template names its quality check and deletes it too; an inspector sees one read-only (the API
  refuses their reads of the draft and every write with 403); and a new final inspection never
  offers one, while the API starts a quality check (QC- number) from it. Doing quality checks
  (`e2e/quality-check-inspections.spec.ts`): the sidebar's four groups (three for an inspector);
  an inspector starts one from Quality checks (machine, quality check, the serial number it needs,
  Checked by filled in), sees the rows as cards with how and references, opens a row's pictures
  from its button and its picture (Should look like this, More information, Escape), is stopped by
  Finalise while rows lack a status, marks a NOK with comment, severity and responsible and an OK
  with the keyboard, finalises (stored as a quality check, its frozen front page, its deviation row
  of kind quality), finds it read-only after a reload, listed under Quality checks and not under
  Inspections, its inspection address leading to it and its print address saying it doesn't print
  yet; an admin sees it only under Quality checks in Insights (the API's numbers by kind, the
  switch, the quality check menu, the CSV's name and rows, the report's title and deviation list)
  while the final inspection's numbers and report leave it out; and an admin reopens and deletes
  one while an inspector has no Delete and gets 403. For inspections: creating one from the front page form and
  finding it in the list; a whole checklist filled in from the keyboard (status keys, moving between
  rows, the comment, the Tab order, Escape, Enter, clearing, Set remaining to OK, the progress) and
  still there after a reload; the Deviation Summary's order and an extra deviation; the deviation table, read straight from Azurite (every column, the
  `finalised` flag, a row deleted when NOK becomes OK); Finalise blocked by a missing row, its
  jump link, the locked page and the API's 409; Reopen refused to an inspector (403) and done by
  an admin; an inspection unchanged after its template publishes a new revision; and two
  inspectors in conflict. Deleting one (`e2e/delete-inspection.spec.ts`): an admin from its page
  (asks first, then it is gone from the list, the deviation table and storage, photo included),
  refused with Reload after someone else saved, and an inspector without the action (the API
  refuses with 403). For deviation photos: a photo added to a deviation, an arrow and a
  label drawn on it with the mouse in the real editor, saved, and after a reload the marks stored
  as fractions, the flattened copy a JPEG of the photo's size that is red along the arrow, shown
  as the thumbnail and on the printed card; at most two photos (then Add goes away, and a paste or
  a drop says why); a photo on an extra deviation, saved with the inspection; a finalised
  inspection's photos in a viewer that never loads the editor's code (Konva); Back with unsaved
  marks asks first (Cancel keeps them, Leave goes), and a transparent PNG flattened on white; an
  editor whose code can't load says so and keeps the page; and in the editor the focus coming
  back after the first opening and staying after the bin, a colour picked while typing a label,
  and a save whose upload hangs stopped with Cancel and then saved. For guides: an admin
  writes one in the template editor, with an image pasted while typing the description and one
  dropped on the dialog, one marked up, verdicts and captions, autosaved and the same after a
  reload, and text pasted from Excel kept as text; leaving with the guide editor open asks first;
  an inspection opens it read-only from the row's icon and with `G` (arrow keys, the
  large view, `Esc` back to the row) and keeps it unchanged after the template publishes a new
  version of it, which a new inspection gets. The smoke test of brief §9: an inspection created
  from the seeded RigiMill MG in the UI, marked from the keyboard, finalised, and its report
  printed from the Print menu. For insights (`e2e/insights.spec.ts`, each test with a model code
  of its own, so other tests' inspections never mix in): the headline numbers, the top
  checkpoints with their shares, the month, severity, section, responsible and category figures,
  in-progress inspections joining in, the CSV download (name, header, rows) and no console errors
  under the Content-Security-Policy; a custom range that ends before it starts; a single month and a month range narrowing the
  numbers, kept in the URL; a month range that ends before it starts; a month without
  inspections; and inspectors refused the page and both endpoints. The deviation report
  (`e2e/insights-report.spec.ts`): previewed from Insights with the deviation list added and
  printed, A4 pages with the footer and the list on pages of its own, a single month stated as the
  month and an empty selection saying so, and admins only. The deviation log
  (`e2e/deviation-log.spec.ts`): Deviations under both sidebar groups, for an inspector too; a
  quality check's deviation in the quality checks' log only, closed there with an action (today
  and the inspector's name to start with, the inspection's version unchanged), shown closed in
  the log and on the quality check's Deviations tab, which its ID opens at it, and reopened there;
  a deviation just marked closed from a final inspection's Deviations tab (saved first), a
  finalised inspection's followed up through the API and a key that is no deviation refused, and
  the CSV of the closed ones (name, header, row).
- **Print tests** (`e2e/print.spec.ts`) print real PDFs with Chromium's `page.pdf` (A4, the
  page's own `@page` rule, background graphics on) and measure them with `pdfjs-dist`: a blank
  checklist of the 90-row RigiMill MG, a finalised report in both deviation layouts (long
  comments, N/A rows, extra deviations, photos with and without a marked-up copy), a report whose
  long texts leave fewer cards on a page, one whose deviation is too tall to share a page of four
  (it gets a page of its own, full width, and no empty page follows), a template preview of the
  90-row checklist, a report with its reference images (also as Firefox and Safari print it, with
  the footer on every appendix page), a front page with very long values (the
  signatures and revision move on together) and refs up to 10.an inside their column, 2 per
  page with long texts (no photo under 50 mm), and a section without checkpoints (its heading and
  one line saying so, blank and report).
  They check that every page is A4, the page count is in a range derived from the layout, page 1
  is the front page, every page has the footer and "Page X of Y" with the right total and nothing
  else in the bottom margin, every row is whole on the one page that has its ref, no section
  title is left without a row after it, no text crosses the right margin, blank rows are at least
  9 mm apart, the blank Deviation Summary is the last page
  with D-01 to D-24, and the report's cards are 2 or 4 to a page, each whole on one page with its
  photos painted there. The reference images: turned on in the toolbar, the page is not ready to
  print until their images are in; the appendix follows the deviations, the images two to a row
  (side by side on one line), captioned with the ref and verdict, every page painting as many
  images as it has captions, and no row heading without its images on its page. The Word export
  is downloaded from the toolbar: its file name, and inside the .docx a table per section with two
  repeating header rows, every checkpoint, the deviation, the reference images with their
  captions, the logo and images embedded, and "Page X of Y" as Word fields in the footer; the
  blank checklist's file has D-01 to D-24. Each PDF and .docx is kept in `test-results/`.

The end-to-end tests sign in by setting the SWA CLI's `StaticWebAppsAuthCookie` directly. Each
test writes its own throwaway templates into the local Azurite (the print tests a copy of the
seeded checklist) and deletes them afterwards with their inspections, deviation rows and photos,
so local edits to the seeded RigiMill MG never break them. The New template and Import JSON tests
need one machine model that has no template yet, and run one after the other; the smoke test uses
the seeded template as it is. The settings and the people list are one shared document each, so
those tests add entries named for their own run and remove them afterwards.

CI (`.github/workflows/azure-static-web-apps.yml`) runs `typecheck`, `lint`, `format:check`, a
Bicep lint, `test` and `build` on every pull request and push to `main`. The end-to-end tests run
in a separate job that does not block deployment yet.

## Project structure

```text
app/      Frontend: Vite, React, TypeScript, Tailwind CSS, React Router, TanStack Query
  public/   staticwebapp.config.json (routes, roles, headers), login.html, forbidden.html,
            theme.js, logos
  src/      app shell, pages, apiFetch (lib/api.ts); theme tokens in src/index.css
api/      Azure Functions (Node v4 model), bundled by esbuild into api/deploy
shared/   zod schemas and types, numbering (3.c, D-01), roles, storage names: used by all others
seed/     Excel import of the RigiMill MG checklist and machine models
infra/    main.bicep: Static Web App and storage account
e2e/      Playwright tests
scripts/  swa-start.mjs: the SWA CLI for npm run dev; local-swa-config.mjs: the SWA config for
          checking the built app locally
```

Branding lives in the colour, spacing, font and radius tokens in `app/src/index.css`. Each colour
has a light value in `@theme` and a dark one in the dark-theme block below it. The pre-login pages
(`app/public/login-assets/auth.css`) mirror a few of both by hand, so change all of them.
`app/public/modig-logo.png` is the official Modig logo and `app/public/favicon.png` is the blue
swoosh cut from it. To change the logo, replace the PNG and keep the file name.
`modig-logo-dark.png` is the same logo with the black wordmark made white, for the dark theme;
replace it together with the logo.

## Storage layout

One storage account. Each document is a JSON blob, saved with ETag concurrency (`If-Match`): a
save based on an outdated copy gets HTTP 412 and "Someone else changed this – reload to see the
latest version."

```text
templates/{templateId}/draft.json        draft being edited (a quality check is one too)
templates/{templateId}/rev-{n}.json      published revisions, never changed
inspections/{inspectionId}.json          with its list row in the blob's metadata (quality
                                         checks done too, kind "quality")
images/{imageId}.jpg                     photos, and flattened copies of marked-up photos
config/settings.json                     machine models, default location, company name and
                                         logo, Responsible and category lists
config/people.json                       who may use the app: email, name, role, added by/when
config/inspection-counter.json           counter for FI-YYYY-NNNN numbers (final inspections)
config/quality-check-counter.json        counter for QC-YYYY-NNNN numbers (quality checks done)
follow-ups/{inspectionId}.json           its deviations' follow-up: open or closed, the action,
                                         when and by whom (the deviation log)
table deviations                         one row per deviation, the source for KPIs and the
                                         deviation log
```

IDs are 16-character alphanumeric nanoids. Names are defined in `shared/src/storage.ts`.
Documents are read through the shared zod schemas, which drop fields they no longer know: the
`printSettings` and sections' `spareRows` that templates and inspections stored before spare lines
were removed still carry are ignored, and gone after the next save.

Photos never pass through the API. The browser asks `/api/images/upload-url` for a new image id
and a URL that can only write that one blob, valid for 10 minutes, and uploads the scaled-down
JPEG straight to the `images` container. To show it, it asks for a read-only URL valid for 15
minutes. Documents store only image ids: a template's `coverImageId` and its rows' guide images
(see [Guides](#guides)), which inspections share through their copy of the checklist, and an
inspection's `front.photoId` and its deviation photos (see [Deviation photos](#deviation-photos)).
Replacing or removing a photo leaves the old file in storage; deleting an inspection deletes its
deviation photos. Locally the API sets Azurite's blob CORS rule for the dev origins (ports 4280
and 5173) on its first storage call; in Azure the rule comes from the Bicep file.

## Auth model and roles

- Static Web Apps built-in authentication with Microsoft Entra ID (`/.auth/login/aad`). There are
  no passwords. Other providers (GitHub, X) are switched off.
- Two roles: **`inspector`** creates and fills in inspections and quality checks and follows up
  their deviations in the deviation log; **`admin`** can also edit
  templates, see insights, change settings, reopen inspections and delete them.
- **Who has which role is decided by the API.** A person's role and the name shown for them come
  from the people list (`config/people.json`), which admins manage in Settings → Users & access.
  The list is matched on the sign-in's email (lowercased). Someone not on the list keeps the role
  of their Static Web Apps role invitation, if they have one (written in lowercase), so access
  granted the old way keeps working. Their name is then made from their email. A role on the list
  replaces the invited one.
- `app/public/staticwebapp.config.json` only asks for a signed-in user (`authenticated`) for the
  app and `/api/*`: people on the list have no Static Web Apps role. Every function checks the
  role itself (`endpoint({ role })` in `api/src/lib/http.ts`), and a sign-in without any role gets
  `403` with "You don't have access to Final Inspection yet…". The app bundle (no data) can be
  loaded by any signed-in Microsoft account. The only anonymous paths are `/login.html`,
  `/forbidden.html`, `/login-assets/auth.js`, `/login-assets/auth.css`, `/theme.js`, the two
  logos and the favicon, each with its own exact route: an anonymous wildcard such as
  `/login-assets/*` can be escaped with an encoded `../`. Without a session you are redirected to
  `/login.html`.
- The pre-login pages and the app ask `/api/me`. With a role you go into the app; without one you
  get the no-access page, with your email, your account ID and "Check again".
- A change in Settings counts straight away, with no new sign-in. On a Functions instance other
  than the one that saved it, it can take up to 5 seconds (each instance caches the list that
  long). A changed invitation role still applies only from the next sign-in. The app itself reads
  the person's role once per visit, so its menus follow at their next page load.
- **What is trusted:** the sign-in's email (`userDetails`) from Static Web Apps' Microsoft
  sign-in. Microsoft sets it from the account: the UPN for work and school accounts (on a domain
  the tenant has verified), and the account's email for personal Microsoft accounts (verified when
  the account is created). Only Microsoft (`aad`) sign-ins are matched against the list.
- Users are identified by their lowercased email. Documents store emails (`updatedBy`,
  `finalisedBy`, …) and the app shows names from `GET /api/people`. Someone removed from the list
  is shown by email again.

## Deploy to Azure

Everything Azure needs is in `infra/main.bicep`: a **Static Web App (Free)** that hosts the app and
its managed Functions API, and one **storage account** (Standard_LRS) with the private blob
containers `templates`, `inspections`, `images`, `config` and `follow-ups`, the table
`deviations`, 7-day soft
delete and blob CORS for the browser's SAS uploads. The deployment also writes the
`STORAGE_CONNECTION_STRING` app setting, so there is nothing to set by hand. GitHub Actions
(`.github/workflows/azure-static-web-apps.yml`) builds and deploys every push to `main`.

Pull requests are checked but get **no preview environment**: previews would use the production
app settings, i.e. a public preview URL with read/write access to the real inspection data.

### Prerequisites

- [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli) with Bicep
  (`az bicep upgrade`), signed in with Owner or Contributor rights on the subscription:
  `az login`, then `az account set --subscription "<subscription name or id>"`.
- [GitHub CLI](https://cli.github.com/), signed in (`gh auth login`), run from your clone of this
  repository.
- Node 22 and `npm ci --ignore-scripts` done in the clone, for the one-time seed
  (`--ignore-scripts` skips the 1.3 GB Functions Core Tools download, which the seed doesn't need).

The commands below are for bash (Linux, macOS, WSL or Azure Cloud Shell). Run them all in one
terminal: the later steps use the variables `RG`, `SWA`, `STORAGE` and `SWA_URL` from step 1, and
stop with a message if one is missing.

### 1. Create the resource group and deploy the infrastructure

The storage account takes the resource group's region, so the inspection data is stored in
Sweden (the API that reads and writes it runs with the Static Web App in West Europe). Static Web
Apps is offered only in a few regions (not Sweden); `westeurope` is the closest and the default.
To see where it is offered today:

```bash
az provider show --namespace Microsoft.Web \
  --query "resourceTypes[?resourceType=='staticSites'].locations | [0]" --output tsv
```

```bash
RG=rg-modig-final-inspection
az group create --name "$RG" --location swedencentral

az deployment group create --resource-group "$RG" --name modig-final-inspection \
  --template-file infra/main.bicep --parameters swaLocation=westeurope

# Outputs (names and URL only, no secrets)
az deployment group show --resource-group "$RG" --name modig-final-inspection \
  --query properties.outputs
SWA=$(az deployment group show --resource-group "$RG" --name modig-final-inspection \
  --query properties.outputs.swaName.value --output tsv)
STORAGE=$(az deployment group show --resource-group "$RG" --name modig-final-inspection \
  --query properties.outputs.storageAccountName.value --output tsv)
SWA_URL=$(az deployment group show --resource-group "$RG" --name modig-final-inspection \
  --query properties.outputs.swaUrl.value --output tsv)
echo "$SWA_URL"
```

Other parameters (all optional): `location`, `storageAccountName` (globally unique; defaults to
`stmodigfi` + a hash of the resource group), `swaName`, `devOrigins` (extra blob CORS origins
besides the deployed site; none by default), `appInsightsConnectionString` (see below) and `tags`.

Re-running the deployment is safe as long as you pass the same parameters each time, so keep your
overrides with the command. An omitted or changed `storageAccountName` or `swaName` creates a new,
empty resource and points the app at it; an omitted `devOrigins`, `tags` or
`appInsightsConnectionString` reverts to the default.

> **App settings are owned by the Bicep file.** Each deployment replaces _all_ app settings of the
> Static Web App, so a setting added in the portal disappears on the next run. Add new settings to
> `infra/main.bicep` instead.

**API logs (optional).** Managed Functions write their logs only to Application Insights, so
without it an API error is not recorded anywhere you can read. To turn logging on, create an
Application Insights resource (billed by data ingested, with a monthly free allowance) and pass
its connection string on every deployment:
`--parameters appInsightsConnectionString="<connection string>"`. Don't use the portal's _Enable
Application Insights_ switch: the setting it adds is removed by the next deployment.

### 2. Give GitHub the deployment token

The token goes straight from Azure into the repository secret, without being printed:

```bash
: "${RG:?run step 1 in this shell first}" "${SWA:?run step 1 in this shell first}" &&
  az staticwebapp secrets list --name "$SWA" --resource-group "$RG" \
    --query properties.apiKey --output tsv \
  | gh secret set AZURE_STATIC_WEB_APPS_API_TOKEN
```

Until this secret exists the workflow still runs all checks and skips the deploy job (with a
notice), so a fresh clone or fork stays green.

### 3. First deploy

Push to `main`, or start the workflow by hand and follow it:

```bash
gh workflow run azure-static-web-apps.yml --ref main
gh run watch
```

The workflow type-checks, lints, tests and builds, then uploads the prebuilt site (`app/dist`) and
API (`api/deploy`). The Azure build service is skipped on purpose: it cannot resolve the npm
workspace package `@modig/shared`.

### 4. Seed production storage (once)

Imports the RigiMill MG template and the machine models from `seed/Final_Inspection_rev_2.xlsm`.
It only creates what is missing and never changes existing data, so running it twice does no
harm. The connection string goes straight into the command's environment and is not printed. If
`az` fails, the seed stops instead of falling back to local storage:

```bash
: "${RG:?run step 1 in this shell first}" "${STORAGE:?run step 1 in this shell first}" &&
  STORAGE_CONNECTION_STRING="$(az storage account show-connection-string \
    --name "$STORAGE" --resource-group "$RG" --query connectionString --output tsv)" \
  npm run seed
```

Add `-- --dry-run` to parse and validate the workbook without writing anything.

### 5. Invite users

Anyone with a Microsoft account can _sign in_, but only people the API gives a role get into the
app (`admin` includes everything an inspector can do).

**The first admin** needs a Static Web Apps role invitation once, because the people list starts
empty:

```bash
: "${RG:?run step 1 first}" "${SWA:?run step 1 first}" "${SWA_URL:?run step 1 first}" &&
SWA_HOST=${SWA_URL#https://} &&
az staticwebapp users invite --name "$SWA" --resource-group "$RG" \
  --authentication-provider AAD --user-details anna.andersson@example.com \
  --roles admin --domain "$SWA_HOST" --invitation-expiration-in-hours 168 \
  --query invitationUrl --output tsv
```

(or in the portal: Static Web App → _Settings_ → _Role management_ → _Invite_, provider
_Microsoft Entra ID_, role `admin` in lowercase). They open the link and sign in with that
account. The link expires after at most 168 hours (7 days); send a new one if it lapses.

**Everyone else** is added in the app. In Settings → Users & access, the first admin selects
**Add yourself** (the list always needs an admin), then **Add person** for each colleague: name,
the email of their Microsoft account (usually their work email), and a role. The app sends no
email. It shows an invitation with the app's address and "sign in with your Microsoft account"
followed by their email, with **Copy invitation** and **Open in email**. Names and roles can be
changed and people removed in the same place. Changes count straight away, with no new sign-in.
There is no 25-user cap: that limit applies only to Static Web Apps invitations.

**Invited earlier through Role management?** Those people keep their access with the invited
role. Add them in Settings to set their name; their role there then counts instead. Removing
someone in Settings does not remove their invitation: remove that in _Role management_ (or
`az staticwebapp users update … --roles ""`) to take that access away too.

**Still "You don't have access yet"?** The page shows the email they are signed in with. Check
that this exact email is on the list in Settings, then have them select **Check again**. If
Microsoft signed them in with a different account (a personal account instead of the work one,
say), they sign out and use the account that was added. For someone relying on an old
invitation, the page also shows the **Account ID**, to compare with the `UserId` column of
`az staticwebapp users list`.

If the app itself is refused while the API lets the sign-in in, the page says **The server
refused a request** instead, with the request, its status, the time and the account ID. Send that
screen to whoever maintains the app.

### 6. Check the lock after each deploy

Anonymous requests must never reach the app or the API:

```bash
: "${SWA_URL:?run step 1 in this shell first}" &&
for path in / /templates /login.html /api/me /.auth/login/github /login-assets/..%2findex.html; do
  printf '%-30s ' "$path"
  curl --silent --path-as-is --output /dev/null \
    --write-out '%{http_code} %{redirect_url}\n' "$SWA_URL$path"
done
```

Expected:

```text
/                              302 https://<host>/login.html
/templates                     302 https://<host>/login.html
/login.html                    200
/api/me                        302 https://<host>/login.html
/.auth/login/github            404
/login-assets/..%2findex.html  302 https://<host>/login.html
```

Two lines allow some leeway. `/.auth/login/github` may also answer 200 without a redirect if
Azure serves its navigation fallback there; only a 302 to github.com means the provider block is
broken. `/login-assets/..%2findex.html` may also be refused with 400 or 404; only a 200 means the
app can be reached without signing in.

Then sign in through the site with an account that is on the people list (or invited) and with
one that is neither. The latter must land on the "You don't have access yet" page.

### Rotating secrets

Deployment token (the old one stops working at once):

```bash
: "${RG:?run step 1 in this shell first}" "${SWA:?run step 1 in this shell first}" &&
  az staticwebapp secrets reset-api-key --name "$SWA" --resource-group "$RG" --output none &&
  az staticwebapp secrets list --name "$SWA" --resource-group "$RG" \
    --query properties.apiKey --output tsv \
  | gh secret set AZURE_STATIC_WEB_APPS_API_TOKEN
```

Storage account key: the app setting is built from `key1` at deployment time, so renew it and
re-run the deployment right away (the API fails until the new setting is in place). Use the same
`--parameters` as in step 1; the command below shows the defaults:

```bash
: "${RG:?run step 1 in this shell first}" "${STORAGE:?run step 1 in this shell first}" &&
  # --output none: the command otherwise prints the new keys
  az storage account keys renew --account-name "$STORAGE" --resource-group "$RG" --key key1 \
    --output none &&
  az deployment group create --resource-group "$RG" --name modig-final-inspection \
    --template-file infra/main.bicep --parameters swaLocation=westeurope # + step-1 overrides
```

## Estimated monthly cost

Azure list prices in SEK, excluding VAT, as of October 2026; storage in Sweden Central, the API in
West Europe. Usage assumes ~1 GB stored (mostly photos, including 7 days of soft-deleted
overwrites), ~10 000 blob write/list operations and ~50 000 reads per month.

| Item                                                | Price                            | Per month   |
| --------------------------------------------------- | -------------------------------- | ----------- |
| Static Web App, Free plan (hosting, API, auth, TLS) | 0                                | 0 SEK       |
| Blob storage, Hot LRS: 1 GB                         | 0.1834 SEK/GB                    | 0.18 SEK    |
| Blob write/list operations: 10 000                  | 0.4984 SEK/10 000                | 0.50 SEK    |
| Blob reads: 50 000                                  | 0.0399 SEK/10 000                | 0.20 SEK    |
| Table storage (deviations): < 0.01 GB, < 10 000 ops | 0.4485 SEK/GB, 0.0036 SEK/10 000 | < 0.01 SEK  |
| Data transfer out (first 100 GB free)               | 0                                | 0 SEK       |
| Inter-region transfer, storage → API: < 0.5 GB JSON | 0.1993 SEK/GB                    | < 0.1 SEK   |
| **Total**                                           |                                  | **≈ 1 SEK** |

That is far below the 50 SEK/month target: even ten times the usage (10 GB, 100 000 writes,
500 000 reads) comes to about 9 SEK. Add 25 % VAT if it is not reclaimed. No resource has a fixed
monthly fee, so the cost only grows with stored data and traffic.
