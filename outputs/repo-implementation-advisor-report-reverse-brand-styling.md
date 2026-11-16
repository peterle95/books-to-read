# Reverse-brand styling advisor report (Books to Read)

Written 2026-11-07 by repo-obsidian-implementation-advisor. Companion to (and separate from) `outputs/repo-implementation-advisor-report.md` (Android refactor report, different topic — left untouched).

## Executive recommendation

Use the **reverse-brand prompt** stored in the Obsidian vault (the reusable asset from the video "Reverse Engineer Anything era SOLO l'inizio", Dario Fontanel, 2026-10-21) in two phases:

1. **Phase 1 — capture and tokens (recommended now, zero risk to app code).** Run the prompt's capture/analysis/token phases (Playwright, 1440×900 desktop + 390×844 mobile) against the chosen public app's website, producing `tokens.css` / `tokens.json` plus a brand-guide marked **"Unofficial analysis"** with the built-in disclaimer. Phase 1 touches nobody's app: it only produces evidence artifacts.
2. **Phase 2 — apply tokens to this app (defer or decide explicitly).** The web app currently **must mirror the Android app's design** per the repo's own release policy (`docs/web-release-verification.md`), so re-skinning only the web app conflicts with an active repository constraint. The smallest coherent change is an optional token layer (`brand-tokens.css`) that remaps the existing palette/typography surfaces, **applied to both the web theme and the Android `styles.xml`/`colors.xml` in the same change**, so parity is preserved. If parity release verification is still pending, defer Phase 2 until after it.

Recommended reference to capture first: **The StoryGraph** (`https://thestorygraph.com`) as primary (same domain, warm, stats-heavy), with **Literal** (`https://literal.club`) as the style alternative. The other three candidates are listed below.

## Scope and assumptions

- Target repository: `C:\Users\molze\GitHub\books-to-read`.
- "This app" interpreted as the repository's app surfaces: offline web app (`web\`, PWA), Android app (`reading-plan-android\`), and the Python Tkinter desktop GUI (`reading_plan_gui.py`). No side (web vs Android) was specified, so the report covers the constraint that binds them together.
- Requested outcome: use the vault's reverse-brand technique to copy a style from another app and apply it here; find 5 candidate apps with links. **No implementation was requested**; this report is read-only advice.
- Vault consulted: `C:\Users\molze\GitHub\Obsidian\AI` (per skill instructions; Windows equivalent of `/mnt/c/Users/molze/GitHub/Obsidian/AI`).
- Assumption: the user's standing vault instruction (below) about making preview videos with this prompt is adjacent context, not this task.

## Vault notes consulted (guidance, not authority)

| Note | What it establishes |
|---|---|
| `C:\Users\molze\GitHub\Obsidian\AI\wiki\sources\tech\design-reverse-engineering-reverse-brand-hyperframes-video.md` (§ Summary, Key Points, Links) | The video (Dario Fontanel, 2026-10-21) demos a community reverse-brand prompt on Apple, Revolut and Satispay, then re-applies the extracted identity to the author's site. Flow: Playwright capture desktop+mobile → analysis → codified tokens → guide/slides/video. Author's own caution: the underlying model does the real work; missed details are recovered by another iteration round. Disambiguation (line 27): the title's "Reverse Engineer Anything" is design-engineering, **unrelated to the installed REA MCP tool**. |
| `C:\Users\molze\GitHub\Obsidian\AI\wiki\sources\tech\reverse-brand-prompt.md` (§ § How To Run It (this vault), The Prompt (verbatim, gist state 2026-11-07)) | Full verbatim prompt (gist: https://gist.github.com/amirmushichge/ede82d51439e4bd70817c329e36c4cc7). The prompt itself is a capture/analysis/token pipeline that **never copies logos, font files or the brand's images** — everything is measured, described, replaced by placeholders, and labelled "Unofficial analysis": "Not affiliated with or endorsed by \<brand\>. Trademarks belong to their owners." Outputs to `out/<host>/`: `tokens.css`, `tokens.json`, `brand-guide.html` (≤150 KB offline), slides, 60 fps video, `run-log.md`. Standing instruction (line 28, Peter 2026-11-07): create project videos with this prompt. Re-fetch the gist before reuse. |
| `C:\Users\molze\GitHub\Obsidian\AI\raw\processed\Reverse Engineer Anything era SOLO l'inizio.md` | Raw video transcript (Italian, ASR-garbled tool names per the summary note). |
| `C:\Users\molze\GitHub\Obsidian\AI\wiki\topics\printing-press.md`, `raw/processed/MCP È GIÀ SUPERATO…` | Adjacent (CLI/API reverse-engineering), not design tokens — not used here. |
| `C:\Users\molze\GitHub\Obsidian\AI\wiki\projects\plan b\freelancing\video.md` (§ Project Videos From The Reverse-Brand Prompt, Links) | Unrelated to styling this app's UI itself; notes end-to-end render untested on this machine. |

**Vault limitation:** Hyperframes Studio's "Reference Any Video" is a video tool, and its Windows availability was unverified at the note's snapshot; it is therefore rejected below for app styling.

## Repository facts (evidence map)

All facts below are checked in code; file paths link-able from this workspace.

| # | Fact | Citation |
|---|---|---|
| R1 | Web app's palette is warm cream/brown: page `#f1e4d4` with text `#3a241a` | [web/style.css:1](../../web/style.css#L1) |
| R2 | Primary action buttons `#b56b3c` on `#87421e` border; surfaces `#fff8f0`, alt surfaces `#f7ede2`, borders `#d6baa1`, deep brown `#6f4e37` | [web/style.css:19](../../web/style.css#L19), [web/style.css:69](../../web/style.css#L69) |
| R3 | Android theme: platform `Theme.Material.Light.NoActionBar`, accent `#B56B3C`, nav & status bar `#F1E4D4`, light system bars | [reading-plan-android/app/src/main/res/values/styles.xml:2-9](../../reading-plan-android/app/src/main/res/values/styles.xml#L2-L9) |
| R4 | Android launcher background `#6F4E37` (walnut brown) — the palette predates the web app | [reading-plan-android/app/src/main/res/values/colors.xml:3](../../reading-plan-android/app/src/main/res/values/colors.xml#L3) |
| R5 | Web app ships the native typeface (Roboto woff2, API35 assets) and matches shipped assets | [web/android-native.css:1-14](../../web/android-native.css#L1-L14), [web/assets/android/THIRD-PARTY-NOTICES.md](../../web/assets/android/THIRD-PARTY-NOTICES.md) |
| R6 | Release policy: **the current Android build is the reference** for screen structure, controls, chart content and interactions; "chart/design divergence is **not** an accepted release exception"; "Visual differences are not a second release exception" (only exception: sync becomes manual bundle transfer on web) | [docs/web-release-verification.md:37-43](../../docs/web-release-verification.md#L37-L43), [docs/web-release-verification.md:45-56](../../docs/web-release-verification.md#L45-L56) |
| R7 | The web app already applies fine-grained parity CSS (dialog paddings in dp-approx px, 14sp line metrics, native sheet heights), i.e. re-skins must preserve these parity mechanics | [web/style.css:135-150](../../web/style.css#L135-L150) |
| R8 | Automated checks: `npm ci && npx playwright install chromium`, `npm run test:web`; JS has no typecheck — use `node --check`; tests do **not** approve visual/chart sign-off | [web/README.md:74-78](../../web/README.md#L74-L78) |
| R9 | Charts are hand-rolled SVG with bounded lookback; visually separate from DOM styling | [web/style.css:87-105](../../web/style.css#L87-L105), [docs/web-release-verification.md:39-41](../../docs/web-release-verification.md#L39-L41) |
| R10 | Version control is active and recent work is parity-driven (evidence folders exist per issue) | [docs/evidence/issue-45/native-reference.md](../../docs/evidence/issue-45/native-reference.md), [docs/evidence/issue-49/verification.md](../../docs/evidence/issue-49/verification.md) |

## The 5 candidate apps to replicate the design

Verified live domains (loop-checked 2026-11-07 via web search). All are book/reading-domain fits for a reading planner; two are recommended as capture targets below.

| # | App | Link | Why it fits, and what to capture so it fits this repo's constraints |
|---|---|---|---|
| 1 | **The StoryGraph** (primary recommendation) | https://thestorygraph.com (app: https://app.thestorygraph.com) | Closest domain match: warm-toned UI, book covers up front, stats pages, goals. Its warm earthy palette is closest to this app's current `#f1e4d4`/`#b56b3c` identity, so a re-skin diff is smallest. |
| 2 | **Literal** (style alternative) | https://literal.club | Minimal, quiet, restrained design; the "most visually polished reading tracker" per third-party 2026 reviews. Good if the user wants *calm*, not color. |
| 3 | **Hardcover** | https://hardcover.app | Modern, stats- and dashboard-heavy (charts, projections) — leader for the Charts/Metrics screens' look. |
| 4 | **Fable** | https://fable.co | Cream/serif editorial magazine feel; high polish on mobile. |
| 5 | **Apple Books** | https://www.apple.com/apple-books/ | Calm warm-neutral library design; large cover grids; mobile-first. |

Non-domain alternatives considered and not pursued: Notion (table-dense, neutral — skills already fine here), Linear (developer-dashboard dark — wrong warmth), Revolut/Satispay/Apple (video's demons; wrong domain for a reading app).

## Candidate comparison (approaches)

### Approach A — Reverse-brand capture pipeline (vault prompt), applied as a token layer across both surfaces *(recommended)*

- **Adaptation of the vault prompt.** Three prompt-level adjustments: (1) run on the chosen app's public **web** site (StoryGraph/Literal), not an app-store page; (2) skip its heavyweight `brand-guide`/slides/video deliverables if the user only wants tokens (they're optional value, but the vault standing instruction to make videos exists separately); (3) keep `IMAGES: none` — free, offline, CSS-gradient fallbacks per the stored snapshot.
- **Outputs:** `out/<host>/tokens.css`, `tokens.json`, `run-log.md`, screenshots, all labelled "Unofficial analysis" with the prebuilt disclaimer (baked into the prompt).
- **Then:** add `web/brand-tokens.css` as a variable layer remapping R1/R2 surfaces only — i.e., define `--brand-bg`, `--brand-surface`, `--brand-action`, `--brand-text`, radii and shadow tokens, then have `style.css` consume them (or directly override hexes if keeping a minimal footprint). Apply the **same color hexes to Android** `styles.xml` (colorAccent, navigationBarColor, statusBarColor) and `colors.xml` (launcher bg) so R6 parity holds.
- **Architectural fit:** fits the existing structure (no JS changes; CSS-only; native HTML unchanged). Follows the repo's parity-first practice (R6, R7).
- **Effort:** capture+tokens ~1 session; token layer + Android hexelman ~0.5 session; iterations per video lesson (missed details recovered by another round).
- **Risks:** only the design-divergence policy conflict (mitigated by two-surface change). StoryGraph's web app may be behind a login — the prompt's own fallbacks handle it (`--headed`, DevTools snippet per the gist).
- **Reversibility:** high; tokens.css is additive; hex values swap back trivially.

### Approach B — Manual eyebrow-dropper re-skin (no capture pipeline)

- Pick the chosen app's palette/typography from its screenshots; hand-write hexes into a tokens file; apply as above.
- **Effort:** smaller still (~0.5 session), but no `run-log.md`, no measured type scale, no OKLCH/contrast data, more guess-and-check, less reproducible when the user changes their mind later.
- **Risk:** ironically *higher* design risk (no contrast/role analysis), but avoids Playwright dependency entirely.

### Rejected — Hyperframes Studio "Reference Any Video"

- It restyles *videos*, not app UIs, and its Windows availability is unverified per the vault snapshot. Only relevant if the separate project-video standing instruction resurfaces.

## Chosen design (recommendation)

**Approach A**, executed with this concrete ordering, which turns the policy conflict into the plan's pivot point:

1. **Phase 1 — tokens only (no app code changes).** Run the adapted prompt as a single session against `https://thestorygraph.com` and (optional compare pass) `https://literal.club`. Output lands under `out/` (untracked) or `outputs/reverse-brand/`. Decide target palette from the two guides; mark the winner "Unofficial analysis" where it will be shown.
2. **Decision gate.** Before Phase 2, decide explicitly:
   - *Option 1 (safe):* wait until the parity release verification is complete, then re-skin both surfaces in one change.
   - *Option 2 (chosen if the user accepts the conflict):* one change now, applied to both surfaces, plus a note in `docs/web-release-verification.md` stating the shared restyle is the intended baseline going forward.
   This gate is the repo's own rule (R6); the report does not silently override it.
3. **Phase 2 — apply tokens (as above):** `web/brand-tokens.css` (new file), small consumption edits inside `web/style.css` (the existing rules keep their structure — the reviewable diff is a palette swap, not a re-architecture), and Android `styles.xml`/`colors.xml` hex updates in the same commit.
4. **Iterate one more round** per the video's own lesson ("missed details recovered by another iteration").

Deliberately **not** touched: text strings, layout structure, orbit of charts, controls, 48 dp touch targets, fonts outside token roles, session/metrics sizes written into `style.css` comments (R7 parity mechanics).

## File-level plan (Phase 2 sketch)

| File | Change |
|---|---|
| `outputs/reverse-brand/<host>/tokens.css`, `tokens.json`, `run-log.md` | New (Phase 1 artifacts; `out/` produced by the prompt) |
| `web/brand-tokens.css` | New; defines `--brand-*` custom properties and font role maps; imported early by `web/index.html` |
| `web/style.css` | Palette values migrate to var references where refundable to hover/gaps; non-color rules untouched to protect R7 parity mechanics |
| `reading-plan-android/app/src/main/res/values/styles.xml` | `colorAccent`, `navigationBarColor`, `statusBarColor` hex updates |
| `reading-plan-android/app/src/main/res/values/colors.xml` | launcher background hex update |
| `docs/web-release-verification.md` | Add a "restyle" note describing the dual-surface change and restated parity rule (only if Option 2 is chosen) |
| `web/index.html` | One `<link>` for `brand-tokens.css` |

## Test strategy

- **Existing suite stays authoritative for behavior:** `npm ci && npx playwright install chromium`, `npm run test:web` from repo root (R8). It covers workflow, transfers, charts/numeric logic — restyling none of these paths.
- **Syntax check:** `node --check` on any touched JS (none expected in Phase 2, but R8 requires it if any).
- **Visual-only gates (out of scope for automated tests per the docs, R8):** manual real-device pass, 390 px mobile view, offline reload — same checks the repo already requires, now against the new palette.
- **Phase 1 artifacts:** verify the produced `tokens.json` parses and the two `brand-guide.html` variants open offline (these come free inside the vault prompt).
- **Contrast:** the prompt's WCAG contrast phase directly feeds the `docs/`/guides' accessibility bar; verify `#6f4e37`/`#fff8f0`-class pairs with the new hexes before commit.

## Risks and open questions

1. **Policy conflict is real, not cosmetic.** R6 currently forbids web/Android design divergence; restyling only the web app would block release verification. The plan therefore treats dual-surface restyle as the only valid Phase 2. Open question for the user: Option 1 or Option 2 at the decision gate.
2. **StoryGraph is a login-first product on web.** The vault prompt has built-in fallbacks (`--headed`, DevTools same-origin snippet), but success/failure on this machine is unrecorded. If capture fails, Literal is the reference alternative with a public site surface (verified above).
3. **Windows tooling for capture.** Playwright is already used in this repo for tests (R8), so the capture stack is present locally — but the vault prompt itself was never run end-to-end on this machine (per the vault note). First Phase 1 run is the true test; the note "Re-fetch the gist before reuse" also applies (the vault wants the support gist re-checked).
4. **Trademark honesty.** The vault prompt bakes "Unofficial analysis"/"Not affiliated with or endorsed by \<brand\>" into all deliverables; the re-skinned app does not display branding, logos or fonts, so the user's app stays clean — but the token docs should carry the disclaimer if shared.
5. **Undecided pairing.** Whether the 5-candidate shortlist above should be re-scored after a capture success (e.g. if the user actually wants dashboard-heavy Hardcover) — the report does not prescribe.
6. **Desktop GUI keeps a separate visual identity.** `reading_plan_gui.py` is Tkinter and outside the parity rule; a consistent restyle there should be its own pass and is out of scope here.

## Citations and sources

- Vault (guidance assets):
  - `C:\Users\molze\GitHub\Obsidian\AI\wiki\sources\tech\design-reverse-engineering-reverse-brand-hyperframes-video.md` (§§ Summary, Key Points — Resource 1, Links)
  - `C:\Users\molze\GitHub\Obsidian\AI\wiki\sources\tech\reverse-brand-prompt.md` (§ § How To Run It (this vault), The Prompt (verbatim, gist state 2026-11-07), Links)
  - `C:\Users\molze\GitHub\Obsidian\AI\raw\processed\Reverse Engineer Anything era SOLO l'inizio.md` (raw transcript)
  - `C:\Users\molze\GitHub\Obsidian\AI\wiki\projects\plan b\freelancing\video.md` (§ Project Videos From The Reverse-Brand Prompt)
- Repository evidence: as listed in the Repository facts table above (R1–R10).
- Candidate app links (verified live via web search 2026-11-07): thestorygraph.com, app.thestorygraph.com, literal.club, hardcover.app, fable.co, apple.com/apple-books.
- Underlying gist referenced by the vault note: https://gist.github.com/amirmushichge/ede82d51439e4bd70817c329e36c4cc7

*Report ends; no source code was modified.*
