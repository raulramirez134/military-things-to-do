# Checks for new bases, new listings and new events

`checks/run.sh all` runs everything below automatically and exits non-zero if anything fails (warnings don't fail).
`checks/ship.sh <message-file>` runs it, prints what changed since the last ship, and only if everything passes commits → staging → main → waits for the deploy → runs the live check. If the live check fails twice it **rolls main back automatically** (`checks/rollback.sh <merge-sha>` does the same by hand; your work stays on staging).
`node checks/selftest.js` breaks a copy of the site 26 ways and confirms the suite notices each one (run it after editing a check).

| Command | What it covers |
|---|---|
| `checks/run.sh fast` | static + headless Chromium (about 1 min) |
| `checks/run.sh all` | static + Chromium + **WebKit (iPhone Safari)** + Firefox + the real worker running locally (WebKit/Firefox/wrangler auto-install to the temp dir; an engine that can't be installed is skipped with a message) |
| `checks/run.sh live` | waits for the deploy, then checks the live site |

## When you add a base — do this first
1. Add it to `checks/config.js` (key, page, data file, guide, timezone, unit, reference point(s), region box, distinctive proper nouns). The suite fails if a `data*.js` or `guide*.html` exists that isn't configured.
2. Register it in: `_worker.js` (`VALID_BASE_KEYS`, `LISTING_BASE_CONFIG`), `listing.html` (`BASE_CONFIG`), `search.html` (`BASES`), `suggest.html`, `admin.html` (`BASE_LABELS`), `index.html` (base card + status), the base switcher on every base page, `sitemap.xml`.
3. Add `"/<page>"` to `assets.run_worker_first` in `wrangler.jsonc` (the worker pre-fills the base page for crawlers), add the base to `LISTING_BASE_CONFIG` in `_worker.js` (label, full, refWord, unit, dataFile), make a 1200×630 share image at `og/<key>.jpg`, and add the base to `llms.txt`.
4. Run `checks/run.sh all` and fix everything red.

## What is checked automatically
**Leftovers from the template copy** — other bases' names/cities/hospitals anywhere on the page or in the data; other bases' reference coordinates; `<script src>` pointing at the wrong data file; `CURRENT_BASE_KEY`; `HUB_TIME_ZONE`; map centre and base marker; stats text ("N locations / M categories"); "Start Guide" link.
**Wiring** — base registered in the worker, listing page, search, suggest form, admin, homepage; base switcher lists exactly the other bases with exactly one active; every sitemap URL is clean and exists; every listing is in the sitemap; no stale sitemap entries; canonical/og:url have no `.html`; unique titles; every inline script compiles; tags balanced.
**Categories** — every category with listings has a tab, a grid, a render-loop entry, an icon, a colour, exactly one group; no empty tabs or groups.
**Data** — valid fields, unique ids, `dist` equals the real km distance from the reference point (dist is ALWAYS km), pins inside the expected region, no 3+ listings on one pin, no placeholder text, ratings sane, phone numbers look like the right country (warning), closed/off-limits businesses never listed (`neverList` in config), banned categories (Humphreys tattoo).
**Events** — every card has a name, description and "Typical dates"/"Typical schedule"; footnote has "last verified in <Month Year>"; warnings list cards whose dates are all in a past year and a footnote older than 12 months (that's the yearly refresh list).
**Duplicates** — identical blurbs, same name+address, same name within 100 m (all fail); the same phone number on listings more than 3 km apart, or in two different bases (warnings: a copy-paste error unless it's a shared line).
**Secrets** — every text file in the repo is scanned for Discord webhooks, private keys, GitHub/AWS/Slack/API tokens and hard-coded admin/Turnstile/password values (fail).
**Change summary** — `checks/baseline.json` holds the listing ids/counts from the last ship. Each run prints "Yokota +3 listings, legal +3", and fails if more than 3 listings vanished or a whole category emptied (an accidental bulk delete). `ship.sh` refreshes the baseline after a successful run; run `node checks/baseline.js --update` by hand if a big removal was intentional.
**Open/Closed badge** — fixed-clock tests per base (winter + summer, the midnight hour, a closing time, "Open 24 hours") confirm the timezone/daylight-saving logic; a warning lists hours strings the badge can't read (full list written to the temp dir, path printed).
The parser lives in ONE shared file, `/hours.js` (every base page, listing.html and search.html load it with `<script src="/hours.js"></script>` before their own script — the static check fails if a page forgets it or pastes its own copy). `checks/hours-tests.js` holds ~65 unit tests that must pass; every listing is run through the parser (nonsense ranges and 12-hour times like "9–6" fail outside bars); and the baseline fails the build if more than 5 listings' hours stop being readable at once. Hours format for new listings: 24-hour times, `·` between groups, e.g. `Mon–Fri 9:00–17:00 · Sat 10–14 · Closed Sun`; `&` for split shifts, `11–20/22` when closing varies, `(Apr–Oct)` for seasonal hours, `Closed weekends & holidays` is fine.
**Help/emergency cards** — phone numbers shared between bases are listed as warnings (fine for national lines, a bug for a local number copied from another base). Add legitimately shared numbers to `sharedNumbers` in config.
**In real browsers (Chromium, WebKit and Firefox; desktop and 390px phone)** — no page errors, no failed local requests, map legend toggles == categories with listings, map centred on the base, one card per listing, all card links carry `base=`, every group/sub-tab shows exactly the right cards, Seasonal Events tab, search finds a listing, map view opens, no sideways scrolling, three listing pages per base render the right name/back link/canonical, every arrival-guide checklist saves progress under its own key, homepage/search/other pages load.
**In the real worker** — per-listing `<title>`/`og:title`/canonical are injected for every base, `/api/*` reaches the worker (not the 404 page), unknown paths 404, no `eval`/`new Function` (forbidden on Workers).
**Live** — deployed files are byte-identical to local (ignoring Cloudflare's injected script), pages/data/listing previews/sitemap/404/API all behave.

## Things only a human/research pass can check (do these by hand)
- Every new listing has a second source for hours/address/phone; pins are real (address geocoded, or flagged approximate in the blurb). Never invent hours, phone numbers or ratings (`rating:null, reviewCount:0` for new listings).
- Closed-business check (search local news) on any listing older than a year.
- Overseas bases: check the garrison's off-limits list before adding off-base businesses.
- Emergency/crisis cards: hospital, police, "what to dial" and host-nation numbers verified against an official page for THAT base.
- Events: only add an event with an official/organizer source; use evergreen "Typical dates" plus the dated year; refresh yearly.
- Arrival guide written for that base's service/country (not copied).
- Anything the warnings list (placeholder hours, no phone, stale events) is the to-do list for the next refresh.
