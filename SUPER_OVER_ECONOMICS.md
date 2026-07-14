# SUPER OVER — Post-Launch Economics, Growth & Monetization Model (v1)

*Written 2026-07-04. Status: PRE-PROTOTYPE MODEL. Every number below is a benchmark-derived assumption, not a promise — real telemetry replaces this table at each gate (§10). Currency: USD primary, ₹ for sachet pricing (₹83 ≈ $1).*

---

## 0. TL;DR

| Milestone | Time after launch | Cash spent (recommended path) | Cumulative revenue (Cons / Base / Strong) | Monthly run-rate at milestone (Base) |
|---|---|---|---|---|
| 0 → 10K players | 2–6 weeks | $0–200 | $15 / $60 / $150 | ~$50–150/mo |
| 10K → 50K | months 2–4 | $500–2,000 | $400 / $2,500 / $8,000 | ~$1,000–1,500/mo |
| 50K → 100K | months 4–8 | $1,000–3,000 more | $1,500 / $8–15K / $25–45K | ~$2,200–3,000/mo |

**The one-line truth:** at India-heavy economics, this game likely crosses $2K/month run-rate around 80–120K installs (month 5–8, Base case) — *if* it passes the retention gates. Paid UA cannot carry it (LTV < CPI until the Strong case); portals, clips, ASO and publisher money must. The game is an asset with compounding upside, not July's rent — engine.md remains the rent plan.

---

## 1. Model assumptions (three scenarios)

Retention scenarios anchor everything (2026 casual benchmarks: strong hybrid-casual D1 35–45% / D7 ~20% / D30 ~10%; prototype proceed-gate D1 ≥ 30%).

| Variable | Conservative | Base | Strong | Source/logic |
|---|---|---|---|---|
| D1 / D7 / D30 | 25% / 8% / 3% | 32% / 12% / 6% | 40% / 18% / 10% | hybrid-casual benchmarks; gates in design doc §15 |
| Avg lifetime active days/install | 2.5 | 4.5 | 8 | integral of retention curve |
| Ad ARPDAU (India-heavy in-app) | $0.008 | $0.015 | $0.030 | India = tier-3 eCPMs: rewarded ~$1.5–4, interstitial ~$0.5–1.5 (T3 band of global benchmarks: rewarded $3–10, interstitial global avg $2.5–5) |
| **Ads LTV / install** | **$0.02** | **$0.07** | **$0.24** | ARPDAU × lifetime days |
| Payer conversion (of installs) | 0.3% | 0.8% | 1.5% | India converts below global 2–4%; sachet pricing lifts count not size |
| Lifetime ARPPU | ₹60 ($0.72) | ₹120 ($1.44) | ₹250 ($3.00) | 2–4 sachet purchases + some Gully Pass |
| **IAP LTV / install** | **$0.002** | **$0.012** | **$0.045** | payer% × ARPPU |
| **Blended LTV / install** | **~$0.02** | **~$0.08** | **~$0.28** | ads + IAP, gross |
| Web-portal revenue | ~$0.5–2 per 1,000 plays | same | same | real dev datapoint: €1.04/1,000 plays on CrazyGames; exclusivity bonus +50% |

Notes: T1 (US/UK) web-portal traffic monetizes 5–15× better per play than India in-app; every 10% of T1 mix lifts blended ARPDAU meaningfully — portals are not just free users, they're *richer* users. Store cuts: Play billing ~15% (small dev tier); PWA web shop on UPI ≈ 2% gateway only.

## 2. Monetization design (what earns, when)

**Ads (the workhorse, ~80–90% of revenue in Base case):**
- Interstitial: between innings only (never mid-over — protects the duel and the reviews).
- Rewarded (opt-in, the real earner): extra life in a failed chase · crate reroll · 2× crate · cosmetic trial day · Golden Over second attempt. Target 1.5–2.5 rewarded views/DAU (engagers retain ~3.5× better — revenue that *helps* retention).
- No banners (pennies + ugly).

**IAP (sachet economics — design doc §9.1):**
- Ladder: ₹9 starter (seal-breaker) · ₹29 Epic · ₹99 Legendary · ₹29–49/mo Gully Pass. India's documented comfort zone is ₹15–20/transaction; the ladder brackets it.
- Phase gating: portal phase has NO IAP (CrazyGames IAP is invite-only Xsolla for top titles); IAP starts with the PWA/Play launch in Phase 2.
- KPI focus: **payer count, not basket size.** The ₹9 first purchase is the conversion event; repeat sachets follow. Never sell relief from manufactured pain (Hitwicket's review-verified mistake).

## 3. Phase 1 — 0 → 10,000 players

- **Job of this phase:** NOT revenue. It's (a) retention telemetry to pass/fail the gates, (b) seeding the ghost pool so ranked feels alive, (c) first clips learning what hooks.
- **Channels:** CrazyGames submission (take the 2-month exclusivity for +50% revshare) → their 20M-player traffic does the work; Poki after exclusivity; 1 clip/day (gully window-break, 18-run balls, max-Pressure wickets); Golden Over emoji scorecards from day one.
- **Timeline:** portal review 1–3 weeks; then 1–5 weeks to 10K plays for a game that passes curation (portal-fed). Total: **2–6 weeks post-submission.**
- **Spend:** $0 mandatory. Optional $100–200 Google UAC India burst purely to calibrate real CPI and cohort quality (data purchase, not growth).
- **Revenue:** 10K players × 3–6 plays × $0.5–2/1,000 plays → **$15–150 total.** Treat as noise.
- **Exit criteria (gates):** D1 ≥ 30%, ≥2 matches/session, ≥40% retry-after-loss, ≥15% Golden Over participation among D3+ players. Pass → Phase 2. Fail → iterate core (2-week timebox) or invoke the Gully Rush fallback.

## 4. Phase 2 — 10K → 50K

- **Trigger:** gates passed. Actions: Play Store India launch (closed-track testing satisfied during Phase 1 with a tester cohort), PWA with UPI shop, publisher prototype submissions (Voodoo/Homa/SayGames/CrazyLabs — they fund testing; hybrid deals ≈ 50/50 net revshare, sometimes advances).
- **Channels & CAC:**

| Channel | CPI / cost | Role |
|---|---|---|
| Web portals | $0 | volume + T1 revenue mix |
| Shorts/Reels/TikTok clips (faceless) | ~$0 cash | the compounding channel; 1/day |
| ASO ("gully cricket" keyword family — high-volume, low-competition in India Play Store) | $0 | steady trickle that compounds |
| Google UAC India | $0.10–0.25 | calibration bursts only |
| Meta India | $0.15–0.35 | creative testing only |
| Cricket meme pages (IG/ShareChat) | ₹2–10K/post; effective CPI $0.01–0.05 when it lands | high-variance, cheap experiments; faceless-friendly |
| Publisher-funded UA | $0 to you | the only ethical way to buy scale at these LTVs |

- **Timeline:** 6–10 weeks (months 2–4 cumulative). Organic+portal ~60–75% of installs, calibration UA the rest.
- **Spend:** $500–2,000 (recommended path).
- **Revenue during phase:** exit DAU ≈ 2.5–4K (Base). Ads ≈ $40–60/day at exit; IAP begins: ~150–300 cumulative payers × ₹60–120. **Phase cumulative: Cons ~$400 / Base ~$2,500 / Strong ~$8,000.** Exit run-rate (Base): **~$1,000–1,500/mo.**
- **Watch metric:** LTV:CPI on the calibration cohorts. Paid UA scales ONLY if 90-day LTV > 3× CPI (it won't in Cons/Base — that's fine; it's not the plan).

## 5. Phase 3 — 50K → 100K

- **Engines:** whatever Phase 2 proved. Realistic mix: portal long tail + ASO compounding + a clip that eventually pops (volume game: ~90 clips by month 4) + publisher scaling if signed (Strong scenario) + cross-promo from JobPosted properties' India audience if any.
- **Timeline:** Base months 4–8; Strong months 3–5 (publisher fuel); Conservative: stalls short of 100K without a pivot — see kill criteria.
- **Spend:** $1,000–3,000 discretionary (meme-page tests, ASO assets, occasional UAC bursts).
- **Revenue at 100K cumulative installs:** DAU ≈ 4–6K (Base). Ads $60–90/day → $1.8–2.7K/mo; IAP: MAU ~25–35K × 0.8% × ₹60–100/mo → $180–350/mo. **Run-rate: Cons $400–600 / Base $2,200–3,000 / Strong $6–10K per month.**
- **Cumulative revenue by 100K installs:** **Cons $1–2K · Base $8–15K · Strong $25–45K.**

## 6. LTV:CAC discipline (the rule that protects you)

- Blended LTV/install: $0.02 / $0.08 / $0.28 (Cons/Base/Strong). Even Base cannot pay $0.15 CPIs. Therefore: **paid UA is a measuring instrument, not an engine** — until either (a) Strong-case retention shows up, or (b) T1 portal mix lifts blended ARPDAU ~2×, or (c) a publisher pays for installs with their money.
- The $10–30K "buy 100K users" path from the earlier research remains a money-loser at these numbers: 100K × $0.15 = $15K spend vs $2–8K back (Cons–Base). The report exists so you never do this.
- Publisher math for reference: they scale only at ~150%+ ROAS in *their* tests; if signed, expect 50/50 net after platform fees, and their UA budget replaces yours entirely.

## 7. Timeline summary (Base case, calendar from portal submission)

```
Week 0-3    portal review · Play closed testing · clips begin
Week 3-8    Phase 1: 0→10K · gates measured · revenue ≈ noise
Month 2-4   Phase 2: 10K→50K · Play India + UPI shop + publisher subs · exit ~$1-1.5K/mo
Month 4-8   Phase 3: 50K→100K · run-rate crosses ~$2-3K/mo near 80-120K installs
Month 8+    scale or steady-state: ads floor + sachet layer + seasonal spikes (Asia Cup, T20 leagues)
```

## 8. Sensitivities (which levers actually move money)

1. **D30 retention** — the master lever. +4pts D30 ≈ +60–80% lifetime days ≈ nearly doubles LTV. Everything in the design doc (Heat, ghosts, Golden Over, Overnight Report) exists for this number.
2. **T1 traffic mix** — every 10% of US/UK web play lifts blended ad LTV disproportionately (rewarded $15–40 vs India $1.5–4 eCPM). Portals are the cheap way to buy this mix.
3. **Rewarded views/DAU** — 1.0 → 2.0 views/DAU ≈ +40–70% ad revenue with *positive* retention side-effects.
4. **Payer count** (not ARPPU) — the ₹9 seal-breaker's conversion rate matters more than any price above it.
5. CPI barely matters — because we're not buying users at scale.

## 9. Risks

- **Gate failure risk (largest):** most first games miss D1 30%. Mitigation: prototype gates at week 2, Gully Rush fallback, 2-week iteration timebox.
- **Portal rejection/underpromotion:** mitigation — polish bar + CrazyGames exclusivity incentive + Poki as second shot + itch/Telegram as tertiary.
- **Clip channel variance:** 90-day volume commitment before judging; formats iterated weekly.
- **IAP underperformance:** sachet model is payer-count-dependent; if ₹9 conversion <0.5%, revisit the starter bundle contents, not the prices.
- **Platform policy:** Play billing rules for in-app; UPI web shop stays the cut-free lane.

## 10. Gates & kill criteria (pre-committed, so emotions don't decide later)

| Gate | Metric | Pass → | Fail → |
|---|---|---|---|
| G1 (proto wk 2) | D1 ≥ 30%, retry ≥ 40% | build full v1 | iterate 2 wks, then Gully Rush pivot or shelve |
| G2 (Phase 1 exit) | gates + GO participation ≥ 15% | Play launch + publishers | fix loop before spending anything |
| G3 (Phase 2 exit) | run-rate ≥ $800/mo or publisher signed | Phase 3 push | maintenance mode; engine/JobPosted take the hours |
| G4 (month 8) | run-rate ≥ $2K/mo | scale (phase-2 monetization: Gully Pass push, seasons) | steady-state asset; revisit next cricket season |

## 11. Context vs the money goal

This model says: the game plausibly becomes a **$2–3K/month asset by months 5–8** (Base), with real upside tails (Strong/publisher/viral) and a hard floor near zero (Cons). It cannot pay July's $2,000 — engine.md does that. Correct portfolio: engine pays rent now; game compounds into the asset; JobPosted LTD bridges. Run all three, in that priority order.
