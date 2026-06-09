# Concept: the Interview & Offer Copilot (JobPosted)

**Status:** concept (not built). The "post-match" layer that takes a user from *applied* →
*interview* → *offer* → *hired*. This is the career-ops insight ported into JobPosted in a
web-first, contextual way, and the strongest differentiator vs. commodity auto-apply tools.

## Why JobPosted (not Rezoomed) owns this
The value is in being **bound to a specific application**. JobPosted already knows the job, the
JD, the company, and the application's status. So it can say *"You're interviewing at Stripe for
Backend Engineer — here's your tailored prep,"* and after an offer, *"here's your negotiation
plan for this comp."* Rezoomed only has the résumé; it can't anchor to *which* interview. The
generic résumé→story logic is shared and can also surface in Rezoomed, but the **contextual**
experience lives here, hanging off the applications CRM.

## Where it hangs off the existing flow
It extends the applications CRM (design doc §23.3 — "a CRM, not a graveyard"). The
`applications.status` already includes `interview`; we treat the lifecycle as:

```
queued → ready_for_review → submitted → viewed → interview → offer → hired / rejected
                                            │          │
                                   [Prep for this]  [Negotiate this]   ← toolkit unlocks contextually
```

As an application advances (user marks status, or auto-detect from connected email later), the
relevant copilot surfaces unlock on that application.

## Three modules

### 1. Story Bank (user-level, reusable)
A library of **STAR + Reflection** stories generated from the user's résumé/experience (the
career-ops "interview story bank"). Generated once, editable, reused across every interview.
Each story is tagged to a competency (leadership, conflict, ownership, failure, scope, impact).

### 2. Interview Prep (per application, contextual)
Unlocks when status = `interview`. Generates, for *this* role:
- **Company brief** — what they do, recent news, what they likely value for this role.
- **Likely questions** — role/JD-specific, each mapped to the **best-fit story** from the bank
  + talking points.
- **Your angle** — how to position your background against this JD's priorities.

### 3. Negotiation Coach (per offer, contextual)
Unlocks when status = `offer`. User enters the offer (base/bonus/equity/deadline, any competing
offers); generates:
- An **offer assessment** (vs. their salary expectations + role/market signal).
- A **counter strategy** + ready-to-send **email and call scripts** in their voice.
- Guardrails (don't accept on the spot, anchor high-but-justified, get it in writing).

## Data model (additive, `jobposted` schema)
```sql
-- user-level STAR story bank
create table jobposted.interview_stories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  competency text,                 -- leadership | conflict | ownership | failure | impact | ...
  title text,
  situation text, task text, action text, result text, reflection text,
  source text,                     -- which résumé experience it came from
  created_at timestamptz default now(), updated_at timestamptz default now()
);

-- per-application generated artifacts — persisted like the referral generator (§10.7):
-- generate on demand, render from the stored value, Regenerate overwrites one slot.
create table jobposted.application_artifacts (
  application_id uuid references jobposted.applications(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,   -- for RLS
  type text,                       -- company_brief | interview_prep | negotiation_plan
  content jsonb,
  generated_at timestamptz default now(),
  primary key (application_id, type)
);

-- offer details for the negotiation coach
alter table jobposted.applications add column offer jsonb;  -- { base, bonus, equity, currency, deadline, competing }
```
RLS: owner-only on both tables (`auth.uid() = user_id`), same pattern as every other table.

## Generation logic (shared service, reuses existing patterns)
A `@jobposted/career-toolkit` package (mirrors `@jobposted/field-match`): pure functions + LLM,
imported by `apps/web` route handlers.
- `generateStoryBank(profile, resume)` → `Story[]`
- `generateInterviewPrep(profile, job, company, stories)` → company brief + mapped Q&A
- `generateNegotiation(profile, job, offer)` → assessment + scripts
- **Model tiering** (same as field-match, §11.2): **DeepSeek** for drafting; **Claude** for the
  higher-stakes negotiation reasoning. Truthful to the résumé — never fabricate experience.
- **Résumé source:** the user's base résumé in `jobposted.documents`, or Rezoomed's parsed
  résumé data (shared Supabase). When the Rezoomed tailoring endpoint lands (Phase 3 follow-up),
  reuse it here too.
- **Persistence & cost** (the §10.7 rule): generate on demand, store in `application_artifacts`,
  render from the stored value, never regenerate on page load; a per-artifact **Regenerate**
  button makes one fresh call. Keeps LLM spend to one call per explicit action.

## UX surfaces
- **Story Bank** — a new dashboard nav item: "Generate from my résumé," then edit/add. Cards by
  competency. Copy buttons.
- **Applications CRM** (the page users return to): status pills; on an `interview` row a **Prep**
  button opens the prep panel (brief + mapped questions + your stories); on an `offer` row a
  **Negotiate** button opens the negotiation panel (enter offer → plan + scripts, copy buttons).
- Tasteful motion + mobile-first (design doc §23.8, §23.9). Render persisted content instantly;
  shimmer only while a Regenerate call is in flight.

## Phasing
- **MVP:** Story Bank + Interview Prep (brief + mapped questions) on `interview`-status apps.
- **V2:** Negotiation Coach on `offer`-status apps.
- **V3:** auto-detect interview/offer status from connected/forwarded recruiter email (§23.3);
  **story performance analytics** — which stories correlate with offers (ties to §23.4).

## Positioning
This is the **"land the offer"** layer — premium (Pro) differentiator. Commodity auto-apply
tools stop at "submitted"; this carries the user to *hired*, which is the outcome they actually
pay for and rave about. It also reinforces the trust thesis: JobPosted is a career copilot, not
a spray bot.
