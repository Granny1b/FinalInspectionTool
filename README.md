# Modig Final Inspection

A small web app for Modig Machine Tool's Quality department that replaces the Excel workbook used
for the final inspection of CNC machines before delivery. Admins maintain one checklist template
per machine model; inspectors create an inspection from a template, print a blank checklist for the
walk-round, transcribe the results, and finalise a printable report. Every deviation goes into a
central table for KPIs. It runs on Azure Static Web Apps (Free) with managed Functions, Blob
Storage and Table Storage: no database, about 1 SEK a month.

## Status: phase 5 of 6 (guides, reference images and Word export)

Working now:

- **Sign-in and access control.** Microsoft Entra ID sign-in through Static Web Apps. Only invited
  users with the role `inspector` or `admin` get past `/login.html`; signed-in users without a
  role see a "You don't have access yet" page. Pages and `/api/*` are locked alike.
- **App shell.** Sidebar with Inspections and Templates, plus Insights and Settings for admins; a
  drawer on tablets. Insights and Settings are still placeholders whose actions say which phase
  delivers them. Settings explains how to invite users.
- **Templates (phase 2).** The template list; a new template for a machine model that has none;
  the template editor, which looks like the printed checklist and is edited in place (sections and
  rows, drag and drop, automatic 1.a numbering, cover photo, spare rows); autosave of the draft
  with conflict detection; publishing immutable revisions with a change note; the revision
  history; and read-only views of any published revision. Inspectors see the latest published
  revision of each template, read-only. See [Editing templates](#editing-templates).
- **Inspections (phase 3).** The inspection list with search and filters; a new inspection from a
  model's latest published checklist, which it keeps as a frozen copy; the front page; the
  checklist, filled in from the keyboard; the live Deviation Summary with extra deviations;
  autosave with conflict detection; Finalise, which locks it, and Reopen for admins. Every
  deviation is mirrored into the `deviations` table for the KPIs of phase 6. See
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
- **API.** `/api/me`, the template and inspection endpoints, settings, "Resp" suggestions and
  photo upload/download URLs (see [API](#api)), with role checks, JSON errors and ETag
  concurrency on every save.
- **Seed.** The RigiMill MG checklist (6 sections, 90 checkpoints) and the six machine models are
  imported from `seed/Final_Inspection_rev_2.xlsm` into storage.
- **Local dev, infrastructure and CI/CD.** One `npm run dev`, a Bicep file, and a GitHub Actions
  workflow that checks every pull request and deploys `main`.

Not yet: insights (phase 6) and editing the settings.

Next phase: 6 insights.

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

- **Username**: any email address, e.g. `anna.andersson@modig.se`. The app derives the display
  name from it.
- **User's roles**: add `admin` or `inspector` on a line of its own, below the existing roles.
- Leave the other fields as they are and choose **Login**.

Sign in without either role to see the no-access page. Stop everything with Ctrl+C.

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
is one template per machine model: **New template** offers the models that don't have one yet.

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
  A template needs a name and a section; every section needs a title and a row, and no row may be
  empty. Otherwise Publish lists the problems, with links that jump to each, and marks them in
  red.
- **Revision history.** Next to the front page: each revision with its date, who published it and
  the note. **View** opens that revision read-only.
- **Front page.** Name, machine model, spare rows per section (the empty lettered lines printed
  after each section for handwritten findings, previewed in the checklist) and a cover photo. The
  photo is scaled down in the browser to 1600 px on the long edge before it is uploaded.

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

## Inspections

Inspectors and admins create and fill in inspections; only admins reopen a finalised one.

- **New inspection.** **New inspection** on the list: pick the machine model's checklist (only
  templates with a published revision are offered) and fill in the front page: machine name and
  serial number (both required), participants (`Enter`, a comma or a semicolon adds a name),
  location (the default from the settings), date (today) and a photo (the template's cover photo
  unless you add another). The checklist shows the model, name and revision of its latest
  published revision, which is what the inspection copies. **Create inspection** gives it the
  next number, `FI-2026-0042` (counting restarts every year, Swedish time; if the counter is ever
  lost, it carries on from the highest number in use), and opens it.
- **A frozen checklist.** The inspection keeps its own copy of the template's latest published
  revision. Later edits and revisions of the template never change it; the header shows which
  revision it follows.
- **The list.** Number, machine, serial number, model, date, state (with rows filled while in
  progress) and the number of NOK rows, newest first. Search by number, machine or serial number,
  and filter by model and state; the filters are kept in the address, so they survive opening an
  inspection and coming back (with the browser's Back or the page's _← Inspections_).
- **The page.** A sticky header with the number, machine, state, revision, save status, **Print /
  Save PDF** (see [Printing](#printing)), **Finalise** (or **Reopen**), the tabs _Checklist_ and
  _Deviations (n)_, and the
  progress, e.g. `87 / 104 rows filled · 6 NOK`. _Continue at 3.b_ jumps to the first row without
  a status; the page opens with the focus on it, so `Enter` starts transcribing. The front page
  sits at the top of the Checklist tab and can be edited until the inspection is finalised. A
  participant's name counts as unsaved until it is added.

### Filling in the checklist

The checklist looks like the printed one. Each row has OK / NOK / N/A, a comment and _Resp_
(responsible person or department, suggested from earlier deviations). A NOK row gets a red bar and
a severity (minor unless you pick another). Click a row, or use _Continue at_, then:

| Key                          | Does                                                              |
| ---------------------------- | ----------------------------------------------------------------- |
| `1` or `O`                   | OK, then on to the next row                                       |
| `2` or `N`                   | NOK; stays on the row for its comment                             |
| `3` or `A`                   | N/A, then on to the next row                                      |
| `0`, `Backspace` or `Delete` | Clears the status (so does clicking the selected one again)       |
| `R`                          | The rest of the row's section OK (as **Set remaining to OK**)     |
| `↓` / `J`, `↑` / `K`         | Next / previous row, across sections (`Home`, `End`: first, last) |
| `C`                          | Into the comment                                                  |
| `G`                          | The row's guide, if it has one (`Esc` closes it)                  |
| `Tab`                        | Row → comment → resp → severity (NOK rows) → next row             |
| `Enter` in comment or resp   | On to the next row                                                |
| `Esc` in a field             | Back to the row                                                   |

Keys typed in a field are text, never shortcuts; `Tab` carries on from a section's last row into
the next section. **Set remaining to OK** on a section header (or `R` on one of its rows) marks
every row of that section that has no status yet as OK: mark the exceptions, then fill the rest.
Resp suggests the names of earlier deviations and the ones already entered in this inspection. A
row with a guide shows its icon (a camera when it has images); the icon or `G` opens the guide
(see [Guides](#guides)).

### Deviations, saving, finalising

- **Deviation Summary.** The _Deviations_ tab has a card for every NOK row, in checklist order,
  then for each extra deviation: D-01, the row's ref (a link back to the row), its section, the
  checkpoint, comment, Resp and severity, and the deviation's photos (see
  [Deviation photos](#deviation-photos)). A row's comment, Resp and severity are edited in its
  checklist row. **Add extra deviation** adds a finding that isn't tied to a row; it is edited on
  its card (Description, Comment, Severity, Resp) and removed with its bin icon, which asks first
  if anything was typed or a photo added. A NOK row in the checklist shows _Add photo_ or _2
  photos_ under Resp; a click opens its card's photos (it is not a Tab stop, so transcribing is
  unchanged). Once finalised, the cards are read-only and a photo opens in a viewer.
- **Autosave and conflicts.** As in the template editor: saved about a second after you stop,
  _Saved_ in the header, failed saves retried, a warning before leaving with unsaved changes. If
  someone else saved the inspection in between, nothing is overwritten: the page shows "Someone
  else changed this – reload to see the latest version.", stops saving and offers **Reload**.
- **Finalise.** Every row needs a status, and the front page a machine name and serial number;
  an extra deviation needs a description. Otherwise **Finalise** lists the problems, each a link
  to the place to fix it, and marks them in red until they are fixed. Then it saves what is
  pending and locks the inspection: the page becomes read-only and the API refuses changes. If
  the server could not update the deviation records, nothing is locked and **Try again** sends it
  again.
- **Reopen.** Admins only: makes a finalised inspection editable again; it counts as in progress
  until it is finalised again.

### The deviation table

Every inspection's deviations are copied into the table `deviations`, the source of the KPIs
(brief §4): one row per deviation, PartitionKey = model code, RowKey =
`{inspectionId}_{itemId or extraId}`, with the inspection's number, machine, serial number,
template revision, the row's section, ref and text, comment, resp, severity, date, `finalised`
and `createdAt` (when the deviation was first recorded). Each write brings the table in line with
the inspection: new and changed rows are written, rows of deviations that are gone (a NOK set
back to OK, a removed extra deviation) are deleted, unchanged rows are left alone.

- A **save** writes the inspection first, then the table. If the table update fails, the save
  still succeeds and the next save repairs the table. After updating the table, every write
  checks that the inspection hasn't changed meanwhile and updates it again if it has, so a slow
  update never leaves the table behind a newer save, finalise or reopen.
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

| To                            | Do                                                                                      |
| ----------------------------- | --------------------------------------------------------------------------------------- |
| Draw an arrow, box or ellipse | Pick **Arrow**, **Rectangle** or **Ellipse**, drag across the photo                     |
| Write a label                 | **Text**, click where it goes, type, `Enter`                                            |
| Draw by hand                  | **Freehand**, then draw                                                                 |
| Pick a colour                 | Red, Cyan, Yellow or White (also recolours the selected mark, or the label being typed) |
| Move or delete a mark         | **Select and move**: drag it; `Delete` or the bin removes it                            |
| Change a label                | Double-click it with **Select and move**                                                |
| Undo, redo                    | `Ctrl+Z`; `Ctrl+Shift+Z` or `Ctrl+Y` (also the buttons)                                 |
| Cancel                        | `Esc` or **Cancel** (asks first if anything changed)                                    |

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
  and the checklist's revision bottom right ("Rev: 2"). A report also has its number, who
  finalised it and when, and "90 / 90 rows filled · 6 NOK · 8 deviations"; a report of an
  inspection in progress says "NOT FINALISED – DRAFT REPORT" instead, and "Not finalised" in every
  footer. The photo gives way to long values; values far beyond the usual (dozens of participants,
  names near their 200 characters) move the signatures and revision to a second page.
- **Checklist.** One table per section: No. | Checkpoint | Comment | OK | NOK | N/A | Resp. Its
  title and column labels repeat on every page the section runs onto; a row is never split, and a
  section title never stands alone at the foot of a page. _Blank_: tick boxes, rows at least
  9 mm high for handwriting, and the template's spare lines after each section, lettered on. _Report_:
  the status as a symbol and a word (✓ OK, ✗ NOK, – N/A), a NOK row's severity above its comment
  ("Severity: Major"), and Resp.
- **Deviations**, starting on a new page. _Blank_: the Deviation Summary to fill in by hand, lines
  D-01 to D-15 (No. | Ref | Description | Severity | Resp | Closed). _Report_: a card per
  deviation: "D-03 · 4.c · MAJOR" (an extra deviation says "Not on the checklist"), the section,
  the checkpoint or description, comment, Resp, its photos as marked up (with captions), and a
  "Closed · Sign · Date" line to sign off. A deviation without photos gets an empty frame to sketch
  in. "No deviations recorded." when there are none.

**2 or 4 deviations per page.** The report's toolbar has _Deviations: 2 per page | 4 per page_
(kept in the address). With 2, a card has the full width and half a page: one photo prints at
about 10 × 8 cm. With 4, each card is a row, the text on the left and the photos on the right: one
photo prints at about 7 × 5 cm. Cards share their page equally, and a card whose text needs more
room takes it from the others, but with 2 a photo never prints under 5 cm: a card with much text
then has a page of its own. If the cards don't all fit, the page holds fewer and the next card
starts the next page; a card is never split. A card too tall to share a page of four gets a page
of its own, laid out full width as with 2. Only a card whose text alone is longer than a page
(thousands of characters) runs on to the next page, with its photos whole. 2 per page is the
default.

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
(blank: the D-01 to D-15 table; report: a framed block per deviation with its photos and a line
to sign it off), the reference images when they are included, and the footer with
"Page X of Y". It is A4 portrait with the print margins; header rows repeat on every page and rows
and deviation blocks never split (only one taller than a page may, so that Word doesn't cut it
off), but Word lays out its own pages, so they break differently from the PDF. The text is Arial, which every Word installation has. The file is named like the PDF:
`FI-2026-0042 RigiMill MG – Volvo Skövde – Inspection report.docx` (`– Blank checklist`,
`– Draft report`, a template's `… – Checklist preview`); a very long name is shortened before
that last part. The Word library is loaded only on the first export.

## API

Managed Functions under `/api`, all JSON. Every function checks the role itself; errors are
`{ error, message, details? }`. Saves, publishing, finalising and reopening need the document's
`ETag` in `If-Match` and get `412` if someone else changed it. A `503` with `unavailable` means
nothing was changed and the same request can be sent again.

| Method and route                        | Role      | What                                                             |
| --------------------------------------- | --------- | ---------------------------------------------------------------- |
| `GET /api/me`                           | inspector | Name, email and roles of the signed-in user                      |
| `GET /api/settings`                     | inspector | Machine models, default location, company name                   |
| `GET /api/templates`                    | inspector | All templates: latest published revision, unpublished changes    |
| `POST /api/templates`                   | admin     | New template for a machine model without one                     |
| `GET /api/templates/{id}`               | admin     | The draft, its revision history and its `ETag`                   |
| `PUT /api/templates/{id}`               | admin     | Save the draft (`If-Match`)                                      |
| `POST /api/templates/{id}/publish`      | admin     | Publish the draft as the next revision (`If-Match`, change note) |
| `GET /api/templates/{id}/revisions/{n}` | inspector | A published revision (cached by the browser: it never changes)   |
| `GET /api/inspections`                  | inspector | All inspections as list rows, newest number first                |
| `POST /api/inspections`                 | inspector | New inspection from a template's latest published revision       |
| `GET /api/inspections/{id}`             | inspector | One inspection and its `ETag`                                    |
| `PUT /api/inspections/{id}`             | inspector | Save front page, results and extra deviations (`If-Match`)       |
| `POST /api/inspections/{id}/finalise`   | inspector | Lock it once every row has a status (`If-Match`)                 |
| `POST /api/inspections/{id}/reopen`     | admin     | Unlock a finalised inspection (`If-Match`)                       |
| `GET /api/resp-suggestions`             | inspector | "Resp" values used in earlier deviations, for autocomplete       |
| `POST /api/images/upload-url`           | inspector | New image id and a 10-minute upload URL for it                   |
| `GET /api/images/{id}/url`              | inspector | A 15-minute read URL for an image                                |

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
  start their own in-memory Azurite on free ports, so nothing else needs to be running.
- **End-to-end tests** (`npm run test:e2e`): Playwright with Chromium, against
  <http://localhost:4280>. If nothing is running there, Playwright starts `npm run dev` itself and
  stops it afterwards; locally it reuses a stack you already started. The tests cover the sign-in
  redirect for pages and the API, the anonymous pre-login files (and that an encoded `../` cannot
  reach the app through them), the sign-in link, the inspector and admin navigation, the no-access
  page, a deep link, signing out and the seed. For templates: the list, autosave across a reload,
  `Enter` and `Backspace` (also held down), undoing a delete, a long word at tablet width,
  dragging a row into another section, the section menu, saving before leaving and the tab-close
  warning, publishing with a change note, two admins in conflict, a lost save answer, a save after
  signing out, a cover photo upload (also leaving while it uploads), a new template whose empty
  row blocks publishing, and the inspector's read-only view (the API refuses their saves with
  403). For inspections: creating one from the front page form and finding it in the list; a
  whole checklist filled in from the keyboard (status keys, moving between rows, the comment,
  the Tab order, Escape, Enter, clearing, Set remaining to OK, the progress) and still there
  after a reload; the Deviation Summary's order
  and an extra deviation; the deviation table, read straight from Azurite (every column, the
  `finalised` flag, a row deleted when NOK becomes OK); Finalise blocked by a missing row, its
  jump link, the locked page and the API's 409; Reopen refused to an inspector (403) and done by
  an admin; an inspection unchanged after its template publishes a new revision; and two
  inspectors in conflict. For deviation photos: a photo added to a deviation, an arrow and a
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
  printed from the Print menu.
- **Print tests** (`e2e/print.spec.ts`) print real PDFs with Chromium's `page.pdf` (A4, the
  page's own `@page` rule, background graphics on) and measure them with `pdfjs-dist`: a blank
  checklist of the 90-row RigiMill MG, a finalised report in both deviation layouts (long
  comments, N/A rows, extra deviations, photos with and without a marked-up copy), a report whose
  long texts leave fewer cards on a page, one whose deviation is too tall to share a page of four
  (it gets a page of its own, full width, and no empty page follows), a template preview with
  spare lines lettered past z, a report with its reference images (also as Firefox and Safari
  print it, with the footer on every appendix page), a front page with very long values (the
  signatures and revision move on together) and refs up to 10.an inside their column, and 2 per
  page with long texts (no photo under 50 mm).
  They check that every page is A4, the page count is in a range derived from the layout, page 1
  is the front page, every page has the footer and "Page X of Y" with the right total and nothing
  else in the bottom margin, every row is whole on the one page that has its ref, no section
  title is left without a row after it, no text crosses the right margin, blank rows are at least
  9 mm apart, spare lines carry on the lettering, the blank Deviation Summary is the last page
  with D-01 to D-15, and the report's cards are 2 or 4 to a page, each whole on one page with its
  photos painted there. The reference images: turned on in the toolbar, the page is not ready to
  print until their images are in; the appendix follows the deviations, the images two to a row
  (side by side on one line), captioned with the ref and verdict, every page painting as many
  images as it has captions, and no row heading without its images on its page. The Word export
  is downloaded from the toolbar: its file name, and inside the .docx a table per section with two
  repeating header rows, every checkpoint, the deviation, the reference images with their
  captions, the logo and images embedded, and "Page X of Y" as Word fields in the footer; the
  blank checklist's file has D-01 to D-15. Each PDF and .docx is kept in `test-results/`.

The end-to-end tests sign in by setting the SWA CLI's `StaticWebAppsAuthCookie` directly. Each
test writes its own throwaway templates into the local Azurite (the print tests a copy of the
seeded checklist) and deletes them afterwards with their inspections, deviation rows and photos,
so local edits to the seeded RigiMill MG never break them. The New template test needs one
machine model that has no template yet; the smoke test uses the seeded template as it is.

CI (`.github/workflows/azure-static-web-apps.yml`) runs `typecheck`, `lint`, `format:check`, a
Bicep lint, `test` and `build` on every pull request and push to `main`. The end-to-end tests run
in a separate job that does not block deployment yet.

## Project structure

```text
app/      Frontend: Vite, React, TypeScript, Tailwind CSS, React Router, TanStack Query
  public/   staticwebapp.config.json (routes, roles, headers), login.html, forbidden.html, logo
  src/      app shell, pages, apiFetch (lib/api.ts); theme tokens in src/index.css
api/      Azure Functions (Node v4 model), bundled by esbuild into api/deploy
shared/   zod schemas and types, numbering (3.c, D-01), roles, storage names: used by all others
seed/     Excel import of the RigiMill MG checklist and machine models
infra/    main.bicep: Static Web App and storage account
e2e/      Playwright tests
scripts/  swa-start.mjs: the SWA CLI for npm run dev; local-swa-config.mjs: the SWA config for
          checking the built app locally
```

Branding lives in the colour, spacing, font and radius tokens in `app/src/index.css`. The
pre-login pages (`app/public/login-assets/auth.css`) mirror a few of them by hand, so change both.
`app/public/modig-logo.png` is the official Modig logo and `app/public/favicon.png` is the blue
swoosh cut from it. To change the logo, replace the PNG and keep the file name.

## Storage layout

One storage account. Each document is a JSON blob, saved with ETag concurrency (`If-Match`): a
save based on an outdated copy gets HTTP 412 and "Someone else changed this – reload to see the
latest version."

```text
templates/{templateId}/draft.json        draft being edited
templates/{templateId}/rev-{n}.json      published revisions, never changed
inspections/{inspectionId}.json          with its list row in the blob's metadata
images/{imageId}.jpg                     photos, and flattened copies of marked-up photos
config/settings.json                     machine models, default location, company name
config/inspection-counter.json           counter for FI-YYYY-NNNN numbers
table deviations                         one row per deviation, the source for KPIs
```

IDs are 16-character alphanumeric nanoids. Names are defined in `shared/src/storage.ts`.

Photos never pass through the API. The browser asks `/api/images/upload-url` for a new image id
and a URL that can only write that one blob, valid for 10 minutes, and uploads the scaled-down
JPEG straight to the `images` container. To show it, it asks for a read-only URL valid for 15
minutes. Documents store only image ids: a template's `coverImageId` and its rows' guide images
(see [Guides](#guides)), which inspections share through their copy of the checklist, and an
inspection's `front.photoId` and its deviation photos (see [Deviation photos](#deviation-photos)).
Replacing or removing a photo leaves the old file in storage. Locally the API sets Azurite's blob
CORS rule for the dev origins (ports 4280 and 5173) on its first storage call; in Azure the rule
comes from the Bicep file.

## Auth model and roles

- Static Web Apps built-in authentication with Microsoft Entra ID (`/.auth/login/aad`). There is
  no user table and there are no passwords. Other providers (GitHub, X) are switched off.
- Two roles, assigned with Static Web Apps invitations and always written in lowercase:
  **`inspector`** creates and fills in inspections; **`admin`** can also edit templates, see
  insights and change settings. On the Free plan any Microsoft account can sign in, so access
  depends only on these roles, never on "authenticated". At most 25 invited users.
- `app/public/staticwebapp.config.json` locks everything, including `/api/*`, to the two roles.
  The only anonymous paths are `/login.html`, `/forbidden.html`, `/login-assets/auth.js`,
  `/login-assets/auth.css`, the logo and the favicon, each with its own exact route: an anonymous
  wildcard such as `/login-assets/*` can be escaped with an encoded `../`. Without a session you
  are redirected to `/login.html`; with a session but no role you get the no-access page.
- Every function checks the role again (`endpoint({ role })` in `api/src/lib/http.ts`). Users are
  identified by their lowercased email, and the display name is derived from it, because Static
  Web Apps passes no name claim to managed functions.
- After an invitation or a role change, the person must sign out and in again.

## Deploy to Azure

Everything Azure needs is in `infra/main.bicep`: a **Static Web App (Free)** that hosts the app and
its managed Functions API, and one **storage account** (Standard_LRS) with the private blob
containers `templates`, `inspections`, `images` and `config`, the table `deviations`, 7-day soft
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

Anyone with a Microsoft account can _sign in_, but only users holding the role `inspector` or
`admin` get past the login page (`admin` includes everything an inspector can do). Roles are
assigned with Static Web Apps invitations:

- **Portal**: Static Web App → _Settings_ → _Role management_ → _Invite_. Provider _Microsoft
  Entra ID_, the person's email, domain = the site's hostname, role `inspector` or `admin`,
  expiry in hours. Write the role in lowercase. Send them the generated link; they open it and
  sign in with that account.
- **CLI**:

  ```bash
  : "${RG:?run step 1 first}" "${SWA:?run step 1 first}" "${SWA_URL:?run step 1 first}" &&
  SWA_HOST=${SWA_URL#https://} &&
  az staticwebapp users invite --name "$SWA" --resource-group "$RG" \
    --authentication-provider AAD --user-details anna.andersson@example.com \
    --roles inspector --domain "$SWA_HOST" --invitation-expiration-in-hours 168 \
    --query invitationUrl --output tsv

  # Change a role, list users
  az staticwebapp users update --name "$SWA" --resource-group "$RG" \
    --authentication-provider AAD --user-details anna.andersson@example.com --roles admin
  az staticwebapp users list --name "$SWA" --resource-group "$RG" --output table
  ```

Limits: at most **25 users** with a custom role (on every plan), and an invitation link expires
after at most **168 hours (7 days)**; send a new one if it lapses. Remove someone's access in the
portal under _Role management_. A user who gets a new role should sign out and in again.

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

Then sign in through the site with an invited account and with a non-invited one (the latter must
land on the "You don't have access yet" page).

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
