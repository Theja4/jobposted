# SUPER OVER — Game Design Document (v1)

**Working title:** Super Over (name TBD — check collisions before launch)
**Format:** Browser-first (CrazyGames/Poki + PWA), portrait, one-thumb. Mobile stores in phase 2.
**One-line pitch:** *Balatro × Stick Cricket.* A 3-minute cricket mind-game duel where every ball is a bet you place with your own nerve — and there are **no dice anywhere**.

**Positioning against the references:**
- Hitwicket = manager brain, no hands (outcomes are stat-probability rolls; delivery type shown, then RNG decides).
- Stick Cricket = hands, no brain (pure timing, no opponent psychology).
- **Super Over = brain vs. brain, hands on both.** Every outcome is deterministic: your timing, your choices, your greed.

---

## 1. Design pillars

1. **Self-blame, never game-blame.** Every dismissal must be traceable to the player's own greed or thumb. The moment a player says "the game cheated," we've lost them.
2. **The gamble lives in the player, not the code.** No hidden odds, no dice resolution. The *feeling* of gambling comes from push-your-luck decisions the player makes voluntarily.
3. **One decision + one execution per ball. Under 8 seconds. One thumb.** All other complexity lives between balls or between matches.
4. **Every ball must be worth clipping.** Juice budget is a feature, not polish.

---

## 2. What we studied in Hitwicket — keep / replace

| Hitwicket element | Verdict | Why |
|---|---|---|
| Delivery types with difficulty tiers | **KEEP** (as the 2/2/2 hand) | Great strategic vocabulary |
| Bowler-vs-batter prediction mind-game | **KEEP & sharpen** | The fun core — but make it open-information instead of stat-fog |
| Outcomes = stat-based probability rolls | **REPLACE** with timing execution | Rolls create game-blame; timing creates self-blame |
| Superpowers/traits modifying odds | **REPLACE** with visible systems (Heat, Disguise) | Hidden modifiers erode trust |
| Team management meta | **DEFER** to phase 2 | Solo-buildable scope: match first, meta later |

**The cautionary tale that shapes this doc:** FIFA's rumored "momentum/scripting" (hidden difficulty shifts after streaks) became a decade-long community conspiracy that poisoned trust — players *always* discover hidden odds manipulation. The brief's instinct ("after two boundaries, the third should be less likely") is psychologically true but must NOT be implemented as secret probability. Section 5 implements it honestly: streaks make the batter *mechanically fragile by their own choice*, in plain sight. Same felt arc. Zero betrayal.

---

## 3. The psychology foundation

Each principle below is load-bearing — it maps to a specific mechanic.

| # | Principle | What it says | Mechanic it powers |
|---|---|---|---|
| 1 | **Agency / self-blame** (attribution theory) | Losses attributed to self → retry; to system → churn | Deterministic timing resolution; visible windows |
| 2 | **Loss aversion** (Kahneman–Tversky) | Losing X hurts ~2× more than winning X feels good | The **Bank-or-Ride** decision on the Heat meter |
| 3 | **Near-miss effect** (slot research, Reid 1986) | Almost-wins fire reward circuitry almost as hard as wins | Edge outcomes, last-ball losses by 1 — always *deterministic* near-misses, never manufactured |
| 4 | **Variable-ratio reinforcement** (Skinner) | Unpredictable reward timing = strongest habit loop | Crates & reward wheel ONLY — never ball outcomes. Visible pity counter keeps it honest |
| 5 | **Flow** (Csikszentmihalyi) | Fun = challenge just above skill | League-based ghost matchmaking; window sizes as the difficulty dial |
| 6 | **Zeigarnik effect** | Unfinished tasks occupy the mind | Post-match hooks ("2 wins to Silver"), incomplete star objectives, mid-tour exits |
| 7 | **Peak-end rule** | Memory = peak moment + ending | Chase format makes the last ball the climax; post-match replays YOUR best six |
| 8 | **Endowed progress** | Pre-filled progress accelerates commitment | Trophy road starts 2/10; first crate in minute one |
| 9 | **Competence–autonomy–relatedness** (Self-Determination Theory) | The 3 intrinsic motivators | Timing mastery ceiling (competence), sequencing/banking choices (autonomy), named ghost opponents & leagues (relatedness) |
| 10 | **Gambler's fallacy — harnessed** | Players *believe* a third straight boundary is "due to fail" | Heat fragility makes the belief mechanically TRUE by the batter's own doing — the game feels "psychologically correct" without lying |

**The fidget definition (per brief: fidgety = feel-good):** sub-100ms input response, generous input buffering (never eat a tap), springy UI physics, idle toys on menus (flick the shuttle/tap the bat), and a hit-confirm cocktail (Section 10) tuned like a rhythm game.

---

## 4. Core loop

```
        ┌─────────────────────────────────────────────┐
        │  MATCH (≈3 min): bat 6 balls, bowl 6 balls  │
        └─────────────────────────────────────────────┘
 per ball:  READ opponent's remaining hand & my Heat
              → DECIDE (shot ambition / delivery + sequence)
              → EXECUTE (timing tap / release meter)
              → FEEL (juice cocktail, scoreboard drama)
 per match: crate ritual → trophy road tick → "next unlock in N" hook
 per day:   Golden Over (global same-seed challenge) → emoji scorecard share
```

---

## 5. Batting system

### 5.1 Shots (the 0/1/2/4/6 layer)

Ambition sets the timing window. Probability is never displayed — it is *embodied* as window size.

| Shot | Runs on Good | Runs on Perfect | Window vs Easy/Med/Hard (ms) | Mistime consequence |
|---|---|---|---|---|
| Block (0) | 0 | 0 + **BANKS Heat** | 360 / 300 / 240 | none — never out |
| Nudge (1) | 1 | 1 + Heat | 280 / 220 / 160 | dot |
| Drive (2) | 2 | 2 + Heat | 220 / 170 / 120 | dot; big error → caught |
| Loft (4) | 4 | 4 + Heat | 160 / 115 / 80 | edge zone or caught |
| **Slog (6)** | 6 | 6 + Heat | 120 / 85 / 55 | caught / bowled |

- **Grading:** Perfect = center 40% of window. Good = remainder. Edge = ≤40ms outside window. Miss = beyond.
- **Edge outcomes are the honest near-miss:** small error on Loft/Slog = snick past the keeper for 4 with heartbeat SFX ("lucky-feeling," fully deterministic); large error = caught behind. Players FEEL variance; the system never rolls a die.
- Input buffering: taps up to 80ms early register at window-open. Never punish eagerness with an eaten input.

### 5.2 THE HEAT SYSTEM (the core invention)

The brief asked: "after two boundaries, the third should be more likely to get him out." Here is that exact arc, made deterministic and *chosen*:

- **Heat meter (0–8), fully visible to BOTH players.**
  - +2 on any Perfect-timed scoring shot; +1 on Good boundary; unchanged on Good 1s/2s and dots.
  - **Mistime (Miss, or Edge that yields no runs) resets Heat to 0.** (The sting. Playtest alt: −3 soft reset.)
- **Multiplier (the temptation):** boundary runs scale with Heat tier — ×1 (0–2), ×1.5 (3–4), ×2 (5–6), ×3 (7–8). A Perfect Slog at max Heat = **18 runs**. Scoreboard shouts it: "6 × 3 = EIGHTEEN!"
- **Fragility (the trap):** every Heat point shrinks ALL batting windows by 4% (max −32%). Hot batters hit harder AND break easier. **The streak is the trap.**
- **BANK (the loss-aversion lever):** playing Block/Nudge with Heat ≥3 converts Heat → bonus runs 1:1 and resets the meter. Guaranteed small money vs. riding for the ×3 jackpot — blackjack tension, zero cards hidden.

**Worked example — the brief's exact scenario:** Bowler feeds two easy Length Balls. Batter Perfect-drives both boundaries → Heat 4+, multiplier ×1.5–2, windows already −16–24%. NOW the bowler spends a Yorker: Slog window = 55ms × 0.76 ≈ **42ms**. The batter *sees* all of this and must choose: bank 5 runs safely, nudge a single to keep strike-feel, or swing at a 42ms window for 12–18 runs. Whatever happens next is entirely on them. That's the honey trap the brief described — with the batter walking in eyes open, which is exactly why it's compulsive instead of infuriating.

---

## 6. Bowling system

### 6.1 The hand: 2 Easy / 2 Medium / 2 Hard (per brief)

Each over, the bowler holds exactly six delivery cards. **Order is the strategy.**

| Tier | Delivery | Effect on batter's window |
|---|---|---|
| Easy | Length Ball | baseline window |
| Easy | Full Toss | baseline, +10% wider — pure bait |
| Medium | Off-Cutter | window SHIFTS 30% late (ball deviates) |
| Medium | Slower Ball | window ARRIVES later than the visual flight implies (timing deception) |
| Hard | **Yorker** | window −tier + sits at the very END of flight (late reaction) |
| Hard | **Bouncer** | window −tier + sits EARLY (snap reaction), Slog disabled → Hook (4-value) only |

- **Open information (the card-counting layer):** the batter always sees the bowler's REMAINING hand (e.g. "🟢🟢 used, 🟡 left, 🔴🔴 left"). Spent both Yorkers early? The batter knows the last balls are safe and swings freely. Information management IS the bowler's resource.
- **Release meter (bowler execution skill):** a moving needle per delivery. Perfect zone (15%) → delivery at full strength, category cue shown LATE. Good (35%) → full strength, cue leaks EARLY (batter gets more read time). Poor → delivery degrades one tier (Yorker → Length) with honest cue. The bowler's hands matter as much as the batter's.
- **Disguise token (1 per over):** disguises one delivery's category cue (show 🟢, bowl 🔴) — the classic slower-ball con. Requires a Perfect release or the disguise visibly fizzles. One bluff per over = spice, not slot machine.

### 6.2 Named strategies (teachable = contagious)

Naming plays makes strategy legible, clippable, and community-discussable:

- **The Honey Trap** *(the brief's play, canonized)*: Easy, Easy → let Heat build → Hard into shrunken windows.
- **Front-Load**: Hard, Hard immediately → batter never builds Heat → starve the multiplier, win on dots.
- **The Long Con**: hold both Hards for balls 5–6 when chase pressure forces swings.
- **Choke Hold**: Medium spam mid-over to deny rhythm (shift/delay windows break timing muscle memory).
- **The Fizzle Bluff**: burn the Disguise early and *visibly fail* it — then the batter doubts every honest cue after.

Career bosses each embody one strategy (Section 8) — the campaign literally teaches the metagame.

### 6.3 Pressure & Second Wind (bowling's own compulsion loop)

Batting has Heat; bowling gets its mirror — otherwise bowling becomes homework (the historical failure mode of cricket games).

- **Pressure meter (0–3), visible to both:** +1 per consecutive dot ball; resets the moment the batter scores. Each Pressure point shrinks the batter's windows an extra −4% (stacks with Heat fragility; combined shrink capped at −40%).
- **Second Wind (the bowler's jackpot):** at Pressure 3 — three straight dots — the bowler **recovers one spent Hard delivery** (once per over). Dots stop being passive; they're how you reload the Yorker for the death balls. Choke Hold becomes a build-up strategy, not just denial.
- The duel now reads as two visible gauges pulling opposite directions: the batter's Heat (momentum) vs the bowler's Pressure (the noose). Spectators — and clips — read the story at a glance.

### 6.4 Trade feedback (the Clash Royale steal)

Clash Royale's addiction engine isn't elixir itself — it's **trade intelligence**: the felt moment of "I spent 3 to kill his 5, I'm smarter." Our deliveries are already a priced economy (2 Easy / 2 Medium / 2 Hard = a deck); what was missing is *celebrating the trade*:

- **DEFUSED:** when the batter safely Blocks or survives a Hard ball, a small pop for the batter — the bowler just wasted one of his two best cards for nothing. Positive trade, made visible.
- **Trade Report** (end of innings, one line): "You made him burn both Yorkers by ball 3 — you swung free at the death." / "You saved both Hards for max Heat — two wickets." The over's story told as trades, so players learn to feel clever, and cleverness is the stickiest reward there is.

### 6.5 Engineered climax (the double-elixir steal)

Clash Royale guarantees rising drama by design (double/triple elixir). Cricket's chase already escalates naturally — we tune it into a guarantee: ghost-target matchmaking selects targets near the player's demonstrated skill so a large share of matches (~40% target) come down to a live final ball. Peak-end rule, manufactured honestly.

---

## 7. The duel — ball-by-ball timeline

1. Bowler picks delivery (+ optional Disguise) and starts release meter — **7s shot clock** (auto-picks weakest remaining ball on timeout; anti-stall).
2. Run-up begins (~2s). Batter sees: remaining hand, category cue (timing depends on bowler's release grade), own Heat, required rate.
3. Batter pre-selects shot during run-up (tap-and-hold a shot chip; can slide between chips until release).
4. Delivery flight (0.5–0.9s) → batter's timing tap → resolution → juice (1.5–3s) → next ball.

Full ball cycle: 6–8 seconds. Over = ~50s. Match (bat + bowl + transitions) ≈ 3 minutes.

**Wickets:** 2 lives per innings. Tie → **one-ball eliminator** (sudden death; peak-end rule says this will be the most-clipped moment in the game).

---

## 8. Modes

- **Ranked — async ghost duels (no live servers needed):** one ranked session = **chase** a matched ghost's target (their recorded over bowls at you — sequences, releases, and disguises intact), then optionally **re-record your defense over**. Trophies exchange both ways while offline, with one protection: overnight defense losses are capped (−30/night) while wins are uncapped — the app must never open with a punch in the face. Named opponents ("you beat Rahul_07"), trophy road, leagues (Bronze→Legend), monthly season reset. League and venue share one ladder (§8.5): Bronze plays in the gully, Legend under stadium lights — your rank IS how far you've climbed from the street. Clash Royale's ladder feel, zero real-time netcode.
- **Career — 5 tours × 6 bosses:** each tour is a venue on the Gully-to-Glory ladder (§8.5); each boss personifies a named strategy with readable tells; 3-star objectives per level (win / win banking ≥5 Heat / win without losing a life) for replay depth. Bosses = the tutorial, disguised.
- **Golden Over (daily):** everyone worldwide faces the SAME bowling sequence. One free attempt. Percentile leaderboard + shareable emoji scorecard:
  `🏏 Golden Over #37 → ⚫ 1️⃣ 4️⃣ 6️⃣ 6️⃣ ❌ = 24 · top 6% 🔥` — Wordle's viral loop, cricket-flavored, and 100% faceless marketing.

---

- **Gully Rush (v1.1, and prototype fallback):** endless mode — deliveries stream continuously and accelerate, Heat never stops climbing, one mistime ends the innings. The hook is **walk-off banking**: leave the crease anytime and keep your banked score, or keep swinging and risk it all. Weekly leaderboard. This is the pure-fidget, batting-only expression of the game — a *mode*, not the game (see §Clash Royale note in 6.4: removing the duel would remove the human on the other side, which is the deepest hook we have).

## 8.5 World & art direction — GULLY TO GLORY *(locked 2026-07-04)*

The game is the Indian cricket dream as a progression system: you start in the gully and earn your way to the stadium.

| Stage | Venue | Ball/kit flavor | Ambience |
|---|---|---|---|
| Tour 1 / Bronze | The Gully | tennis ball, taped bat | traffic, crows, neighbors — aunties on balconies are the "crowd" |
| Tour 2 / Silver | Rooftop | tennis ball, team bibs | wind, kites, water tanks |
| Tour 3 / Gold | Beach | heavy tennis ball | waves, golden-hour light |
| Tour 4 / Diamond | Maidan under floodlights | season ball, pads appear | real spectators, radio commentary |
| Tour 5 / Legend | Stadium | full pro kit | full roar, fireworks, anthem |

- Ranked league and career tour share the venue ladder — status made scenery.
- Style: warm, stylized, hand-painted look (Clash-adjacent rendering, desi palette, never photoreal). Venues are visual + audio identity only in v1 — no mechanic changes; the duel stays pure.
- Audio evolves up the ladder: street percussion → dhol layers → stadium anthem; the commentator grows from an excited kid on a balcony into a pro announcer by Tour 4 (announcer packs double as cosmetics).
- Cosmetics write themselves: taped tennis balls, bat stickers, gully kits, window-break celebrations.
- **Signature FTUE moment:** your first six breaks a window pane — cartoon glass, angry-uncle silhouette, kids scatter, "RUN!" — the most iconic gully-cricket trope, inside the first 30 seconds, built to be clipped.
- Why it's ownable: every licensed cricket game sells the stadium fantasy. Nobody owns the gully. Cheaper to art (early venues are small dioramas), culturally beloved, instantly recognizable in a 9:16 clip.

## 9. Economy & rewards

- **Coins** (soft currency) from any match; **Crates** from wins & stars: Bronze/Silver/Gold with **visible pity counter** ("Epic guaranteed within 10") — variable reward WITH honesty.
- Crate contents: cosmetics only for ranked integrity — bats, kits, six-celebrations, commentary voice packs, ball trails. Career-only gear = **sidegrades** (e.g., +1 window vs Bouncers, −1 vs Yorkers), never flat power.
- **Celebrations are async emotes:** your equipped six-celebration and wicket-celebration play automatically inside opponents' ghost duels against you. Cosmetics gain social teeth — status and taunt are the two honest reasons people pay in skill games (it's why Clash Royale sells emotes).
- **Never in this game:** loot-influenced ball resolution, hidden drop-rate manipulation, pay-to-win in ranked.

### 9.1 Players & the Sachet Shop *(added 2026-07-04)*

Collectible players in three rarities — **Normal / Epic / Legendary** — priced on India's sachet ladder (₹9 / ₹29 / ₹99, UPI one-tap). The design rule that keeps this from becoming the thing Hitwicket gets review-bombed for:

> **Sell desire, never relief.** The grind is a generous earnable path, not a wall built to sell the door.

- **What rarity buys:** spectacle and identity, not ranked power. Legendaries have signature shot *skins* (a scoop six with its own camera + commentary line), unique celebrations (which play as async emotes in opponents' duels), voice interactions, album status frames on your ranked profile. Epic = one signature element. Normal = clean kits.
- **Where power is allowed:** career (PvE) only — sidegrades and boss-counters (a Legendary spinner-killer trivializes the Tour 3 boss). Ranked normalizes all stats; there, players are pure identity.
- **Earn path (the fairness anchor):** a F2P player earns a chosen Legendary in ~2–3 weeks of normal play via career stars + crates with visible pity. The ₹99 button skips the wait for the impatient — it never rescues the stuck.
- **First-purchase design:** a one-time ₹9 starter bundle (Epic + 3 crates) exists purely to break the payment seal — first purchase, not purchase size, is the conversion event that matters.
- **Gully Pass:** season pass at ₹29–49/month (sachet-priced battle pass), cosmetic + crate track. Phase 2 (mobile) only.
- Storefront: PWA web shop on UPI (no store cut) + Play billing in-app where required.

## 10. Feel — the juice spec (the "insanely feel-good" budget)

| Event | Cocktail |
|---|---|
| Perfect Slog SIX | 80ms hit-stop → 0.3× slow-mo 200ms → camera punch-zoom → ball flame trail → stadium roar swell → announcer bark ("THAT'S OUT OF HERE!") → confetti at Heat ≥5 → haptic double-pulse (mobile) |
| Good boundary | 40ms hit-stop, crack SFX pitched by power, crowd pop, score ticker rolls (never snaps) |
| Edge past keeper | audio drop-out 100ms → snick → keeper lunge → heartbeat thump → "FOUR?! He's got away with it!" |
| Wicket | stump-cam shatter, bails cartwheel in slow-mo, crowd gasp→eruption, desaturation pulse — intensity scales with Pressure: a max-Pressure wicket is THE loudest moment in the game, louder than any six. Bowlers get the biggest peak |
| Heat tier-up | meter flares, crowd murmur layer rises (Pavlovian tension audio), bat handle sparks at ×3 |
| BANK | satisfying cash-register *ka-chunk* + coins fly to scoreboard (make prudence feel good too) |
| Final ball of chase | music ducks to heartbeat + low-pass filter, crowd holds breath, UI vignettes |
| Crate open | 3-beat ritual: tap (shake) → tap (crack + light leak) → reveal (rarity-colored burst). Anticipation gaps are the point |

Audio: layered bat cracks (thump+crack+ring), dynamic crowd bed tied to Heat/required-rate, AI announcer packs (excited "SMAAASH!", "SIX!", regional-language packs later — huge for India). Menu music loops with intensity stems.

## 11. Retention & viral systems

- Daily Golden Over (appointment), day-streak with 1 free freeze (forgiving > punishing).
- Post-match Zeigarnik hooks: always show the NEXT thing ("2 wins → Silver League", "1 star → Tour 2 boss").
- Emoji scorecard share on every Golden Over and any 18-run ball.
- **Overnight Defense Report** (the reopen hook): the app opens with "Your over was chased 11× last night — defended 7. Best moment: Honey Trap wicket on ball 4." Delayed variable reward; bowling earns while you sleep.
- Ghost rivalries: "Rahul_07 beat your over — rematch?" push/email (phase 2).

## 12. Monetization (sequenced — fun first, squeeze later)

- **v1 (portals):** interstitial between innings + **opt-in rewarded ads only**: one extra life in a failed chase / crate reroll / cosmetic trial. (Rewarded-ad engagers retain ~3.5× better — this is a retention feature that happens to pay.)
- **Phase 2 (mobile stores, only after D30 proves out):** season pass (cosmetic track), starter pack, shop rotations. **Not in v1, not on portals:** countdown-timer FOMO popups before the player has fallen in love. Portals reject it and players bounce off it.
- Ethical lines (permanent): visible pity, no fake near-misses, no hidden difficulty shifts, rewarded ads always opt-in, no dark patterns aimed at kids.

## 13. FTUE — first 90 seconds

1. Zero menus: ball 1 bowled at you within 5 seconds of load (portal requirement AND good design).
2. Balls 1–2: wide "rookie assist" windows (labeled as such; off in ranked). Ball 3: scripted learnable Slog → the first SIX breaks the gully window pane (§8.5) — full juice, iconic, clippable.
3. First crate at minute 1 (endowed progress). Trophy road pre-filled 2/10. Career Tour 1 Boss teaches the Honey Trap *by doing it to the player, visibly* — losing to it once is the best lesson in the game.

## 14. Tuning defaults (playtest-adjustable, single source of truth)

| Parameter | Default |
|---|---|
| Shot windows | table in §5.1 |
| Perfect zone | center 40% of window |
| Edge zone | ≤40ms outside window |
| Input buffer | 80ms early-tap forgiveness |
| Heat gain | +2 Perfect scoring / +1 Good boundary |
| Heat reset | to 0 on Miss/dot-Edge (A/B: −3) |
| Window shrink | −4% per Heat point (cap −32%) |
| Multiplier tiers | ×1 / ×1.5 / ×2 / ×3 at 0–2 / 3–4 / 5–6 / 7–8 |
| Bank | Block/Nudge at Heat ≥3 → +Heat runs, meter→0 |
| Bowler hand | 2 Easy / 2 Medium / 2 Hard, free order |
| Release meter | Perfect 15% / Good 35% / Poor rest |
| Disguise | 1/over, needs Perfect release |
| Lives | 2 per innings |
| Shot clock | 7s bowler, shot locked at release |
| Pressure gain | +1 per consecutive dot; resets on any runs |
| Pressure effect | −4% batter windows per point; combined Heat+Pressure shrink cap −40% |
| Second Wind | at Pressure 3: recover 1 spent Hard (once per over) |
| Overnight trophy loss cap | −30/night (defense wins uncapped) |
| Ghost target matching | tuned so ~40% of matches reach a live final ball |

## 15. Prototype plan & gates

**Week 1 build:** batting core only vs authored AI overs. Two input schemes A/B: (A) pick-chip-then-tap vs (B) hold-to-charge-release. Instrument everything.
**Proceed gates (from 2026 casual benchmarks):** D1 ≥ 30%, ≥2 matches/session median, ≥40% instant-retry after a loss, and the eyeball test: does a Perfect Slog make YOU grin on the 50th rep?
**Week 2–3:** bowling (incl. Pressure/Second Wind) + ghosts + career Tour 1 (The Gully) + juice pass + Golden Over. **Week 4:** portal SDK, crates, polish, submit (CrazyGames exclusivity for +50% rev share) + publisher prototype submissions.
**Scope valve:** if bowling tests <fun, v1 ships batting-only chases (Stick Cricket did this for years); bowling returns in v1.1.

## 16. Out of scope v1

Real-time PvP, licensed players/teams, team management meta, tournaments, clans, IAP, native apps. Every one of these is a phase-2+ decision gated on retention data.

---
*Design principles owed to: Skinner (variable ratio), Kahneman–Tversky (loss aversion), Csikszentmihalyi (flow), Reid (near-miss), Deci–Ryan (SDT), the Clash Royale chest ritual, Balatro's push-your-luck math, Stick Cricket's one-thumb purity — and the FIFA scripting saga as the eternal warning against hidden dice.*
