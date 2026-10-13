# Portal UI rulebook

Rules for every screen in the member and admin portal. If a screen breaks a rule, either fix the screen or change the rule here in the same PR. The mockups live in the "Portal UI audit and fixes" design canvas; where they and this file disagree, this file wins (it describes what was actually built).

Scope: the portal (`/portal`, `/login`). The public marketing site has its own look and is not covered. It is pinned to its old tokens by the `.marketing-light` block in `src/app/globals.css`.

## 1. Principles

1. **One obvious next step.** Every page has at most one loud button (lime, with the hard shadow). Everything else is quieter.
2. **Show it, then say it.** Status is always a word in a chip. Never color alone.
3. **Stay where you are.** Details open in a panel beside the list, not on a new page. (Known exception: the Applicants list still opens a sheet that slides over the page.)
4. **Two levels deep.** Place, then view. Nothing deeper is a page. Anything that would be a third level is a filter chip or a panel.
5. **Friendly, not cute.** Plain words, short sentences, no jokes in error messages.
6. **Tokens, never colors.** Pages never name a color. See section 2.

## 2. Color

All color comes from theme tokens in `src/app/globals.css`. Pages use Tailwind token classes (`bg-card`, `text-muted-foreground`, `bg-status-warn`), never `bg-amber-50`, `text-red-700`, hex or `rgb()`. The only hex values allowed outside `globals.css` are non-UI ones (a canvas fill, a CSS-variable fallback).

| Role | Token | Light value | Notes |
| --- | --- | --- | --- |
| Page | `--background` | `#F7F5EE` | warm off-white, never pure white |
| Card, popover | `--card`, `--popover` | `#FFFFFF` | |
| Text | `--foreground` | `#14301A` | forest, not black |
| Quiet text | `--muted-foreground` | `#5E6657` | 5.4:1 on the page, keep it above 4.5:1 |
| Border | `--border` | `#E4E0D2` | hairlines, card edges |
| Input border | `--input` | `#CBD1BF` | form fields and quiet outlines |
| Strong border | `--border-strong` | `#14301A` | outlined (secondary) buttons |
| Quiet fill | `--muted`, `--secondary` | `#ECEAE0` | tracks, inactive pills |
| Main action | `--primary` / `--primary-foreground` | `#C8F169` / `#14301A` | lime, one per page |
| Main button edge | `--primary-border`, `--primary-edge` | `#14301A` | outline and the 3px hard shadow under the main button |
| Selected, soft highlight | `--accent` / `--accent-foreground` | `#F0FAD6` / `#14301A` | selected row, soft callout |
| Link, small green text | `--link` | `#1F6B2E` | |
| Destructive | `--destructive` | `#9C2F17` | outlined destructive buttons and text |
| Focus ring | `--ring` | `#14301A` | always visible |
| Sidebar | `--sidebar`, `--sidebar-primary`, `--sidebar-accent` | `#14301A`, lime, `#1F4A26` | forest rail with a lime active item |
| Status: good | `--status-ok` / `-foreground` | `#E4F1D6` / `#2F5A10` | "Ready", "Done", "On track" |
| Status: caution | `--status-warn` / `-foreground` | `#FFE9A3` / `#5C4300` | "Stuck", "Check in", "Open" |
| Status: problem | `--status-bad` / `-foreground` | `#FFD9CF` / `#8A2A12` | "Late", "No PM", "Missing" |
| Status: info | `--status-info` / `-foreground` | `#E6E0FF` / `#3B2E8A` | "Soon", labels, neutral highlights |

Rules:

- Butter and coral mean something. Don't use them for decoration. Lilac and green are allowed for decoration (avatars, project tags, big-number tiles).
- Text on a status fill uses that status's `-foreground`. All pairs are at least 6.5:1.
- Big-number tiles use the four status fills plus a deep-forest tile (`bg-sidebar text-sidebar-primary`). A page uses at most four.
- Avatars (`PersonAvatar`) show the person's approved photo when they have one, otherwise their initials in a status tint picked from their name. Never an empty colored circle.
- Lime is for: the main button, the active sidebar item, the selected score, the selected pill's text on forest, the "today" marker, and the Admin switch. Nothing else. Progress fills and meters on light surfaces are forest (`bg-foreground`); lime on a light surface is almost invisible.
- Never use `text-primary` for text on a light surface. Links and small green text use `text-link`. `text-primary` is only for lime text on a forest background (selected pills, the sidebar, the meeting card).
- The portal is light only: there is no theme toggle and the theme is forced to light. The `.dark` token block is kept so a future dark mode can be built from the same token names (pages never branch on theme), but it is not designed or supported.

## 3. Type

- **Headings and big numbers:** Bricolage Grotesque, 800 (`h1` and `h2` get it by default, and `font-heading` does too). Everything you read: Hanken Grotesk.
- Page title (`h1`): `text-4xl leading-tight`, one per page, always present, normally through `PageHeader`.
- Section title (`h2`): 18 to 20px.
- Body 15 to 16px. Table and chip text 13 to 14.5px. **Nothing under 12px.**
- Numbers in tables and tiles use tabular numerals.
- Reading text is capped by line length: application answers at about 100 characters, short descriptions at about 66.
- No all-caps except small section labels and table headers (12 to 13px, wide tracking).

## 4. Shape, space and depth

- Corner radius: cards 22px, inner cards 18px, buttons and inputs 10 to 14px, chips and pills fully round.
- Spacing steps: 4, 8, 12, 16, 20, 24, 32, 40. Page gutter is 40px on desktop.
- Cards have a 1px `--border` and no shadow. The only shadow in the product is the main button's hard 3px edge and the "your own" card on the Projects board. Popovers and dialogs have one soft shadow.
- A table inside a card does not draw its own border (a global rule removes it).

## 5. Components (reuse these, don't restyle)

| Need | Use |
| --- | --- |
| Page title block | `PageHeader` (`src/components/page-header.tsx`) |
| Buttons | `Button` (variants below) |
| Status or label chip | `Badge` with variant `ok`, `warn`, `bad`, `info`, `muted` |
| Filter that narrows a list | `FilterChip` (`src/components/filter-chip.tsx`) |
| View switch inside one page | `Tabs` + `TabsList` (the default pill style), with `UrlTabs` when the view should be in the URL |
| View switch between pages | `LinkSwitch` (`src/components/link-switch.tsx`), or the admin breadcrumb for admin places |
| Person | `PersonAvatar` (pass `src` with the approved photo) |
| Table | `Table` |
| Confirmation | `useConfirm` (`src/components/confirm-dialog.tsx`) |
| Sign-in style screens | `AuthShell` |

### Buttons

| Kind | Look | Use |
| --- | --- | --- |
| Main (`default`) | lime fill, forest 1.5px outline, 3px hard shadow | the one thing to do on this page |
| Secondary (`outline`) | white fill, forest 1.5px outline | everything else |
| Quiet (`ghost`, `link`) | text only, `--link` color for links | inline actions |
| Destructive | white fill, red outline and text | archive, delete. Never filled |

- Sizes: `default` 36px, `sm` 32px, `lg` 44px. The page's main button is `lg`.
- Labels are verbs: "Add availability", "Finalize". Never "Submit" alone, never "OK".
- Icon-only buttons must have an `aria-label`.
- Disabled buttons stay visible and say why nearby ("Score every line to submit").
- Use the shared `Button`. No raw `<button>` unless it is a toggle or a row inside a shared pattern.

### Chips

Always a word. Four status colors plus neutral (`muted`). Sentence case, fully round. Filters are `FilterChip`s: the selected one is green and can show a count.

### View switch, tabs, filters (these are different things)

- **View switch** (pill, forest selected pill with lime text): different views of the same thing. Roster / Teams / Stats. Maximum four options. For a view inside one page the state goes in the URL as `?tab=` (`UrlTabs`); admin places use real routes.
- **Filter chips**: narrow the list you are looking at. Never navigate.
- **Sort and secondary filters**: plain text with a caret, or a small select.
- Do not nest view switches. Stage (Applications / Interviews) next to a view switch is a filter chip row, not a second switch.

### Tables and lists

- Header: small caps, muted. Rows about 56px, `py-3.5`. The selected row has the soft `accent` highlight.
- Name column leads: avatar, bold name, quiet second line.
- Status chips on the right; numbers right-aligned or in a meter.
- Clicking a row opens the panel. It does not navigate.

### Panel beside a list

- 400 to 420px wide, on the right, white, bordered. Opens on row click and closes with its ✕ button.
- Order: identity, facts, fields, then the "danger" block at the bottom.
- Forms inside the panel save with an explicit button. Choices that are safe to flip (toggles) save immediately.
- Used by: People roster (member), Scheduling (slot). The Applicants list still uses a sheet that slides over the page.

### Dialogs

For choices that need an answer before anything else can happen (confirm a destructive action) and for short forms that don't need the page behind them (Add availability, Add members). Never `window.confirm()` or `alert()`; use `useConfirm`. A confirmation has one question as its title, the consequence in one sentence, and two buttons that name their action ("Cancel the chat", "Keep it").

### Toasts

For confirmation of something that already happened ("Reminder sent to Maya."). Never for errors that need action; those stay on the page.

### Board cards, number tiles, callouts

- Board columns sit on `--muted`, cards are white. The user's own card gets the outline and hard shadow plus a "Your project" chip.
- Number tiles: a big Bricolage numeral and a 14px label. Four per row at most.
- Callout (butter, lilac or lime tint): one heading, one sentence, optionally one button.

## 6. Page skeletons

**Header** (always). Admin pages: breadcrumb row (`Admin > Place`) with the quarter select on the right, the view switch if the place has several views, then the `h1`, a one-line description, and the page's actions on the right. Member pages: the `h1` and description, then a `LinkSwitch` if the page has sibling views. Top bar: ⌘K search and the account menu.

Then one of five bodies:

1. **List and panel** (People roster, Applicants): filters row, table, panel opens on selection.
2. **Board** (Projects, Team builder): columns of cards, status chip per card; the Team builder also has a "Before you finalize" advice panel.
3. **Agenda or calendar** (Scheduling, Calendar): day groups of rows or a time grid, with a side column. Scheduling's side column is "Your availability" plus "Booking and setup", and becomes the slot panel when a slot is selected.
4. **Reader and score** (Reviews): reading column on the left, score card on the right that stays in view only while the whole column fits on screen (it never scrolls on its own), pill row of sections above the text. The resume is shown by default.
5. **Settings** (Setup): left list of sections, one section on the right. Settings are never tabs.

Every page also has: a loading state shaped like the page, an empty state (one sentence of what goes here and the button that fills it), and an error state (what happened, what to do, no jargon). Today only the portal root has a `loading.tsx`; adding one per area is open work.

## 7. Navigation

- Member rail: Home, Projects, Calendar, Directory, Resources. Tasks (under Projects), Attendance (from Home's check-in) and Quick links (under Resources) are reached from those pages and from ⌘K. Execs get an Admin switch at the bottom of the rail.
- Admin rail: Today, Recruiting, Scheduling, People, Setup, and a Portal switch back to the member side.
- Views per admin place: Today (Today, Activity), Recruiting (Applicants, My reviews, Team progress, Attendance, all tabs on one page), Scheduling (one page), People (Roster, Teams, Stats, Team page), Setup (Quarters, Recruiting, Meeting days, Settings).
- New feature? It becomes a **view** inside an existing place, a **filter**, or a **panel**. A new rail item needs a written reason and exec sign-off.
- Maximum two levels: place, then view.
- The URL holds the view and quarter (`?tab=` or the route, plus `?quarter=`). Reloading or sharing a link lands in the same spot. Use `UrlTabs` / `useUrlTab` from `src/components/url-tabs.tsx`.
- ⌘K must be able to reach every page and common action. Adding a page means adding it to the nav config in `src/components/layout/nav-links.ts` (it feeds the rail, the view switch and ⌘K).
- Old addresses that people have bookmarked or that are in sent emails (`/portal/admin/coffee-chats`, `/interviews`, `/client-meetings`) redirect to Scheduling. Keep redirects like this when a page moves.

## 8. Words

- Titles are nouns ("People", "Scheduling"). Buttons are verbs.
- Say what will happen: "Moves her to Archived and removes her from Santa Cruz Bikes."
- Counts and dates are specific ("9 recruiting bookings still need to be marked").
- Errors say what is wrong and what to do: "That email and password didn't match. Check for typos and try again."
- Empty states invite: "No bookings yet. Turn on Show open slots to see the times people can still book."
- No exclamation marks except in celebration ("You've scored everyone").

## 9. Accessibility (non-negotiable)

- Text contrast 4.5:1, large text 3:1, UI outlines 3:1.
- Every control is reachable and usable by keyboard, with a visible focus ring.
- Real elements: `<button>`, `<a href>`, `<label>` with `<input>`. No clickable `div`.
- Status is a word plus color. Meters and bars also state the number.
- Respect `prefers-reduced-motion`. Motion is short and never required to understand a state.
- Touch targets at least 40px on phone layouts. Phone layouts have not been checked yet.

## 10. Checks that can be automated

Run these before opening a PR (a CI step is a good follow-up). Run them from the repo root in zsh or bash.

```sh
# 1. No raw colors in portal code (expect only: loading-curtain.tsx and crop-image.ts, which are not UI colors)
grep -rnE "\b(bg|text|border|ring|from|to|stroke|fill)-(red|amber|green|blue|yellow|orange|emerald|rose|slate|gray|zinc|neutral|stone|sky|indigo|violet|purple|pink|teal|lime)-[0-9]{2,3}|#[0-9a-fA-F]{6}\b" src/app/portal src/app/login src/lib src/components --include='*.ts' --include='*.tsx' --exclude-dir=marketing --exclude='*.test.*'

# 2. No native dialogs (expect no output)
grep -rnE "window\.(confirm|alert)\(|(^|[^.[:alnum:]_])alert\(" src/app/portal --include='*.tsx'

# 3. No text under 12px (expect no output)
grep -rnE "text-\[(9|10|11)px\]" src/app/portal --include='*.tsx'

# 4. Every portal page renders a title (expect no output; pages that only redirect are skipped)
for d in $(find src/app/portal -name page.tsx | xargs -n1 dirname); do grep -rqE "<h1|<PageHeader|<AuthShell|redirect\(" $d/*.tsx || echo "no title: $d"; done

# 5. Lime text is only for forest backgrounds (expect only: selected pills in link-switch.tsx, admin-breadcrumb.tsx,
#    application-card.tsx, segmented.tsx, ui/tabs.tsx, and the meeting card in home-sidebar.tsx)
grep -rnE "(^|[^-a-z])text-primary([^-]|$)" src/app/portal src/app/login src/components --include='*.tsx' --exclude-dir=marketing
```

## 11. PR checklist

- [ ] Only theme tokens, no raw colors (checks 1 to 3 above are clean)
- [ ] One main button on the page; secondary actions are secondary
- [ ] Status shown as a word in a chip
- [ ] Details open in a panel, destructive actions confirm with `useConfirm` and name the action
- [ ] Page title through `PageHeader`; loading, empty and error states considered
- [ ] View and quarter are in the URL; the page is in the nav config so ⌘K finds it
- [ ] Keyboard path works; icon-only buttons are labeled
- [ ] If a rule here was wrong, the rule is updated in this PR

## 12. Known gaps (what is not done yet)

- The Applicants list opens a sliding sheet instead of the panel beside the list.
- Only the portal root has a loading skeleton.
- The one-main-button rule has not been audited on every page. About 95 buttons use the default (lime) style, most of them the confirm button inside a dialog, which is fine; the rest need a look.
- About 30 raw `<button>` elements remain, mostly toggles and rows. Panels close with ✕ only (no Escape).
- Phone layouts have not been checked.
- There is no dark mode. If one is wanted, design it around lime and saturated accents: the first attempt (flipping the lightness of the light palette) lost the personality.
- Home has no big "ask" box above the chat, and `AGENTS.md` does not yet point future work at this file (that edit is made locally but not committed).
