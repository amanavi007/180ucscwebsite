# Portal UI rulebook

Rules for every screen in the member and admin portal. If a screen breaks a rule, either fix the screen or change the rule here in the same PR. Mockups live in the "Portal UI audit and fixes" canvas; this file wins if they disagree.

Scope: the portal (`/portal`, `/login`). The public marketing site has its own look and is not covered.

## 1. Principles

1. **One obvious next step.** Every page has at most one loud button (lime, with the hard shadow). Everything else is quieter.
2. **Show it, then say it.** Status is always a word in a chip. Never color alone.
3. **Stay where you are.** Details open in a side panel, not a new page or a dialog.
4. **Two levels deep.** Place, then view. Nothing deeper is a page.
5. **Friendly, not cute.** Plain words, short sentences, no jokes in error messages.
6. **Tokens, never colors.** Pages never name a color. See section 2.

## 2. Color

All color comes from theme tokens in `src/app/globals.css`. Pages use Tailwind token classes (`bg-card`, `text-muted-foreground`, `bg-status-warn`), never `bg-amber-50`, `text-red-700`, hex or `rgb()`.

| Role | Token | Light value | Notes |
| --- | --- | --- | --- |
| Page | `--background` | `#F7F5EE` | warm off-white, never pure white |
| Card, popover | `--card`, `--popover` | `#FFFFFF` | closer things are lighter in dark mode |
| Text | `--foreground` | `#14301A` | forest, not black |
| Quiet text | `--muted-foreground` | `#5E6657` | 5.4:1 on the page, keep it above 4.5:1 |
| Border | `--border`, `--input` | `#E4E0D2` | |
| Quiet fill | `--muted`, `--secondary` | `#ECEAE0` | tracks, inactive pills |
| Main action | `--primary` / `--primary-foreground` | `#C8F169` / `#14301A` | lime, one per page |
| Selected, soft highlight | `--accent` / `--accent-foreground` | `#F0FAD6` / `#14301A` | selected row, soft callout |
| Link, small green text | `--link` (new) | `#1F6B2E` | |
| Focus ring | `--ring` | `#14301A` | 2px, always visible |
| Sidebar | `--sidebar` and friends | `#14301A` with lime active item | |
| Status: good | `--status-ok` / `-foreground` | `#E4F1D6` / `#2F5A10` | "Ready", "Done", "Active" |
| Status: caution | `--status-warn` / `-foreground` | `#FFE9A3` / `#5C4300` | "Stuck", "Behind", "Open" |
| Status: problem | `--status-bad` / `-foreground` | `#FFD9CF` / `#8A2A12` | "Late", "No PM", "Missing" |
| Status: info | `--status-info` / `-foreground` (new) | `#E6E0FF` / `#3B2E8A` | "Soon", labels, neutral highlights |

Rules:

- Butter and coral mean something. Don't use them for decoration. Lilac and green are allowed for decoration (avatars, project tags).
- Text on a status fill uses that status's `-foreground`. All pairs are at least 6.5:1.
- Color-block tiles (big numerals) use the four status fills plus a deep-forest tile with lime text. A page uses at most four tiles.
- Avatars rotate through the status tints and are always initials, never a colored empty circle.
- Lime is for: the main button, the active sidebar item, the selected score, the progress fill, the "today" marker. Nothing else.
- Dark mode is generated from the same token names in a `.dark` block. Pages never branch on theme. A separate design pass for dark mode is planned; until then dark is "works, not polished".

## 3. Type

- **Headings and big numbers:** Bricolage Grotesque, 800. Everything you read: Hanken Grotesk.
- Page title (`h1`): 36px / 1.1, `tracking-tight`, one per page, always present.
- Section title (`h2`): 18 to 20px, 800.
- Body 15 to 16px. Table and chip text 13 to 14.5px. **Nothing under 12px.**
- Numbers in tables and tiles use tabular numerals.
- Reading text (essays, descriptions) is capped at about 66 characters wide.
- No all-caps except small section labels (12 to 13px, wide tracking).

## 4. Shape, space and depth

- Corner radius: cards 22px, inner cards 18px, buttons and inputs 10 to 14px, chips and pills fully round.
- Spacing steps: 4, 8, 12, 16, 20, 24, 32, 40. Page gutter is 40px on desktop.
- Cards have a 1px `--border` and no shadow. The only shadow in the product is the main button's hard 3px edge and the "featured" card on a board.
- Dividers inside a card are 1px `--border` at about half strength.

## 5. Components

### Buttons

| Kind | Look | Use |
| --- | --- | --- |
| Main | lime fill, forest 1.5px outline, 3px hard shadow | the one thing to do on this page |
| Secondary | white fill, forest 1.5px outline | everything else |
| Quiet | text only, `--link` color | inline actions in text |
| Destructive | secondary with coral outline and text | archive, delete. Never filled |

- Labels are verbs: "Publish teams", "Add slots". Never "Submit" alone, never "OK".
- Icon-only buttons must have an `aria-label` and a tooltip.
- Disabled buttons stay visible and say why nearby ("Score every line to submit").
- Use the shared `Button`. No raw `<button>` unless it is a toggle inside a shared component.

### Chips

Always a word. Four status colors plus neutral (`--muted`). Sentence case, 12.5px, fully round. Filters are chips too: the selected one is green with a count.

### View switch, tabs, filters (these are different things)

- **View switch** (pill with a forest selected pill and lime text): different views of the same thing. Roster / Teams / Stats. Maximum four options. Lives under the page title. State goes in the URL (`?view=`).
- **Filter chips**: narrow the list you are looking at. Never navigate.
- **Sort and secondary filters**: plain text with a caret, right-aligned.
- Do not nest view switches. Stage (Applications / Interviews) beside a view switch is a filter chip row, not a second switch.

### Tables and lists

- Header row 12.5px caps, rows 54 to 56px. The selected row has the soft highlight and a 3px forest edge.
- Name column leads: avatar, bold name, quiet second line.
- Status and numbers sit on the right. Numbers are right-aligned.
- Clicking a row opens the side panel. It does not navigate.
- Wrap with `role="table"` semantics or use the shared `Table`.

### Side panel (inspector)

- 400 to 420px wide, right edge, white, left border. Opens on row click, closes with the ✕ and Escape.
- Order: identity, one main action, fields, then a "danger" block at the bottom.
- Forms inside the panel save with an explicit button. Selections that are safe to flip (toggles) save immediately and say "Saved".

### Dialogs

Only for choices that need an answer before anything else can happen (confirm a destructive action, pick a file). Never `window.confirm()` or `alert()`. A dialog has one question as its title, the consequence in one sentence, and two buttons that name their action ("Archive Maya", "Keep"). Everything else is a side panel.

### Toasts

For confirmation of something that already happened ("Submitted your score for Nadia"). Never for errors that need action; those stay on the page.

### Board cards, number tiles, callouts

- Board columns sit on `--muted`, cards are white. The user's own card gets the outline and hard shadow.
- Number tiles: a big Bricolage numeral and a 14px label. Four per row at most.
- Callout (butter or lilac block): one heading, one sentence, optionally one button.

## 6. Page skeletons

Every page starts with the same header, then one of four bodies.

**Header** (always): top bar with breadcrumb (admin) or page name (member), ⌘K search, quarter chip (admin) or avatar (member). Then `h1`, a one-line description or the view switch, and the main button aligned right.

1. **List and panel** (People roster, Applicants): filters row, table, side panel opens on selection.
2. **Board** (Projects, Team builder): columns of cards, status chip per card, a "before you publish" or checklist column when publishing is gated.
3. **Agenda or calendar** (Scheduling, Calendar): day groups of slot rows or a week grid, availability in a right-hand panel.
4. **Reader and score** (Reviews): reading column on the left (66ch), sticky score card on the right, a pill row of sections above the text.
5. **Settings** (Setup): left list of sections, one section on the right. Settings are never tabs.

Every page also has: a loading skeleton shaped like the page (add `loading.tsx` per route group), an empty state (one sentence of what goes here and the button that fills it), and an error state (what happened, what to do, no jargon).

## 7. Navigation

- Member rail: Home, Projects, Calendar, Directory, Resources. Execs get an admin switch at the bottom.
- Admin rail: Today, Recruiting, Scheduling, People, Setup, and a way back to the member view.
- New feature? It becomes a **view** inside an existing place, a **filter**, or a **panel**. A new rail item needs a written reason and exec sign-off.
- Maximum two levels: place, then view.
- The URL holds the view and quarter (`?view=`, `?quarter=`). Reloading or sharing a link lands in the same spot. Use `UrlTabs` / `useUrlTab` from `src/components/url-tabs.tsx`.
- ⌘K must be able to reach every page and common action. Adding a page means adding it to ⌘K.

## 8. Words

- Titles are nouns ("People", "Scheduling"). Buttons are verbs.
- Say what will happen: "Moves her to Archived and removes her from Santa Cruz Bikes."
- Counts and dates are specific ("31 applicants are still unmarked", "4 days ago").
- Errors say what is wrong and what to do: "That email and password didn't match. Check for typos and try again."
- Empty states invite: "No one is booked yet. Add slots so people can book."
- No exclamation marks except in celebration ("You've scored everyone").

## 9. Accessibility (non-negotiable)

- Text contrast 4.5:1, large text 3:1, UI outlines 3:1.
- Every control is reachable and usable by keyboard, with a visible focus ring.
- Real elements: `<button>`, `<a href>`, `<label>` with `<input>`. No clickable `div`.
- Status is a word plus color. Charts and meters also state the number.
- Respect `prefers-reduced-motion`. Motion is under 200ms and never required to understand a state.
- Hit targets at least 40px on touch layouts.

## 10. Checks that can be automated

Run these before opening a PR (a CI step is a good follow-up):

```sh
# 1. No raw colors in portal pages (expect no output)
grep -rnE "\b(bg|text|border|ring|from|to)-(red|amber|green|blue|yellow|orange|emerald|rose|slate|gray|zinc|neutral|stone|sky|indigo|violet|purple|pink|teal|lime)-[0-9]{2,3}|#[0-9a-fA-F]{6}\b" "src/app/portal" src/app/login --include='*.tsx'

# 2. No native dialogs (expect no output)
grep -rnE "\b(window\.)?(confirm|alert)\(" src/app/portal --include='*.tsx'

# 3. No text under 12px (expect no output)
grep -rnE "text-\[(9|10|11)px\]" src/app/portal --include='*.tsx'

# 4. Every portal page file should render an h1
for d in $(find "src/app/portal" -name page.tsx | xargs -n1 dirname); do grep -rq "<h1" $d/*.tsx || echo "no h1: $d"; done
```

## 11. PR checklist

- [ ] Only theme tokens, no raw colors (checks 1 to 3 above are clean)
- [ ] One main button on the page; secondary actions are secondary
- [ ] Status shown as a word in a chip
- [ ] Details open in a side panel, destructive actions confirm in a dialog that names the action
- [ ] `h1` present; loading, empty and error states exist
- [ ] View and quarter are in the URL; the page is reachable from ⌘K
- [ ] Keyboard path works; icon-only buttons are labeled
- [ ] If a rule here was wrong, the rule is updated in this PR

## 12. Open decisions

- `--primary` is currently the brand green (`#588a2c`) and is used by existing components (badges, progress, links). Moving it to lime changes all of them at once, so migrate in one PR with a visual pass.
- `globals.css` is shared with the marketing site. Either scope the new tokens to the portal layout (a wrapper class) or confirm the marketing site is fine with them.
- Fonts: the app loads Geist, Big Shoulders and Lato today. Bricolage Grotesque and Hanken Grotesk replace Geist in the portal; the marketing site keeps its own.
- Dark mode needs its own design pass built around lime and saturated accents (the first attempt, a lightness flip of the light palette, lost the personality).
