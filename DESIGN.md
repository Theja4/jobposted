---
name: JobPosted
description: A trustworthy job-application copilot that queues tailored applications for user confirmation.
colors:
  brand-50: "#eff6ff"
  brand-100: "#dbeafe"
  brand-200: "#bfdbfe"
  brand-300: "#93c5fd"
  brand-400: "#60a5fa"
  brand-500: "#2f7df4"
  brand-600: "#1f64e0"
  brand-700: "#174fb8"
  brand-800: "#143f91"
  brand-900: "#102f66"
  ink: "#0b1220"
  muted: "#526173"
  navy: "#071a33"
  panel: "#f7fbff"
  white: "#ffffff"
  zinc-50: "#fafafa"
  zinc-100: "#f4f4f5"
  zinc-200: "#e4e4e7"
  zinc-300: "#d4d4d8"
  zinc-400: "#a1a1aa"
  zinc-500: "#71717a"
  amber-50: "#fffbeb"
  amber-700: "#b45309"
  red-600: "#dc2626"
typography:
  display:
    fontFamily: "Plus Jakarta Sans, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "3.75rem"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Plus Jakarta Sans, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Plus Jakarta Sans, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.5
  body:
    fontFamily: "Plus Jakarta Sans, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.625
  label:
    fontFamily: "Plus Jakarta Sans, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.25
rounded:
  lg: "8px"
  xl: "12px"
  2xl: "16px"
  brand-xl: "14px"
  brand-2xl: "18px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  section-y: "80px"
components:
  button-primary:
    backgroundColor: "{colors.brand-600}"
    textColor: "{colors.white}"
    typography: "{typography.label}"
    rounded: "{rounded.xl}"
    padding: "0 20px"
    height: "44px"
  button-secondary:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.xl}"
    padding: "0 20px"
    height: "44px"
  input:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.xl}"
    padding: "0 14px"
    height: "44px"
  job-card:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.brand-2xl}"
    padding: "20px"
---

# Design System: JobPosted

## 1. Overview

**Creative North Star: "The Confirmed Queue"**

JobPosted should feel like a calm operations console for a high-stakes job search. The system is task-first: matched roles, queue status, resume tailoring, apply path, and confirmation are always easier to see than decorative brand expression.

The product earns trust through restraint. White and pale blue surfaces carry most of the interface, vivid blue marks the actions and states that matter, and the copy stays plain about consent, privacy, and application boundaries. The landing page can be more expressive, but it should still demonstrate the actual product loop instead of abstract AI spectacle.

**Key Characteristics:**
- Restrained blue accent used for primary action, selection, positive status, and confirmation.
- Dense but breathable product surfaces with clear hierarchy and modest cards.
- Plainspoken trust language: user confirmation, no spraying, no hidden server-side account use.
- Lightweight motion that supports state changes and reveals content without delaying work.

## 2. Colors

The palette is a restrained blue system on white, pale blue panels, and cool zinc neutrals, with amber and red reserved for warnings and errors.

### Primary
- **Confirmed Blue** (#1f64e0): The primary action and confirmation color. Use for submit, queue, selected navigation, progress, focus outlines, and the most important status badges.
- **Deep Trust Navy** (#071a33 / #102f66): Use for high-contrast trust sections and rare deep emphasis.
- **Soft Queue Blue** (#eff6ff / #dbeafe): Use for selected states, success banners, gentle callouts, and low-emphasis chips.

### Secondary
- **Operational Amber** (#fffbeb / #b45309): Use only for warning states such as manual apply paths, quota pressure, or attention-needed notices.
- **Failure Red** (#dc2626): Use only for errors and failed actions.

### Neutral
- **Ink** (#0b1220): Primary text and high-emphasis UI.
- **Muted Blue Gray** (#526173): Secondary prose, hints, helper text, and metadata.
- **White** (#ffffff): Main page and card surface.
- **Zinc Field System** (#fafafa, #f4f4f5, #e4e4e7, #d4d4d8, #a1a1aa, #71717a): Dividers, control rings, secondary backgrounds, placeholder text, and disabled states.

### Named Rules

**The Blue Means Progress Rule.** Blue should mean the user can act, has selected something, or has reached a safe positive state. Do not spend it on unrelated decoration.

**The No Spray Rule.** Color should never make automation feel reckless. Confirmation and control language should remain visually prominent.

## 3. Typography

**Display Font:** Plus Jakarta Sans with ui-sans-serif, system-ui, -apple-system, Segoe UI fallbacks.
**Body Font:** Plus Jakarta Sans with the same fallback stack.
**Label/Mono Font:** No separate mono or label family is currently used.

**Character:** A single modern sans family keeps the product consistent, readable, and operational. Weight and spacing create hierarchy without making the UI feel like a campaign.

### Hierarchy

- **Display** (800, up to 60px on desktop, tight line-height): Landing hero headlines only. Use `tracking-tight` but keep letter spacing at or above -0.04em.
- **Headline** (700, 24-30px): Page titles, major section headings, and dashboard headers.
- **Title** (600, 16px): Card titles, form labels with higher emphasis, pricing plan names, and component headings.
- **Body** (400-500, 14-18px): Explanatory copy, queue descriptions, dashboard prose, and FAQ answers. Keep long prose around 65-75ch.
- **Label** (600, 11-14px): Buttons, badges, chips, nav links, helper labels, and small status text.

### Named Rules

**The Product Sans Rule.** Do not introduce a display font for dashboard UI. Product screens should feel familiar and precise.

**The Copy Clarity Rule.** Prefer direct phrases such as "Queued", "You confirm", and "Nothing is submitted" over clever labels.

## 4. Elevation

JobPosted is mostly flat, using borders, tonal fills, and modest hover shadows for depth. Shadows should clarify a surface relationship or interactivity, not create glossy floating cards.

### Shadow Vocabulary

- **Button Rest** (`shadow-sm shadow-brand-600/20`): Primary buttons only, used to make the action feel tactile.
- **Card Hover** (`hover:shadow-md hover:shadow-brand-900/5`): Repeated cards and pricing panels on hover.
- **Product Preview** (`ring-brand-100` plus CSS motion): The landing page product-loop preview uses crisp borders and code-native SVG motion instead of a heavy floating-card shadow.

### Named Rules

**The Border First Rule.** Use `border-zinc-100` or `ring-zinc-200` before adding a shadow. If both appear, the shadow must stay subtle and stateful.

## 5. Components

### Buttons

- **Shape:** Rounded but controlled, usually `rounded-xl` (12px) with 44px height for standard buttons and 52px for large CTAs.
- **Primary:** `bg-brand-600 text-white`, hovering to `brand-700` and active to `brand-800`. Include icon + label where the action benefits from a familiar cue.
- **Hover / Focus:** Hover may lift by -0.5 translate and shift background. Focus uses a visible 2px `brand-600` outline or `brand-500` ring.
- **Secondary / Ghost:** Secondary buttons are white with zinc inset rings. Ghost buttons use blue text and a soft blue hover fill.

### Chips

- **Style:** Rounded pills or small rounded tags. Brand chips use `brand-50` with `brand-700`; selected or decisive chips may use `brand-600` with white text.
- **State:** Match scores, apply paths, selected steps, and status badges should use text plus icon or label. Do not rely on color alone.

### Cards / Containers

- **Corner Style:** `rounded-2xl` (16-18px) for cards and panels; `rounded-xl` for internal controls. Avoid larger radii unless the element is a pill.
- **Background:** White cards on white or zinc-50 page backgrounds, separated by zinc-100 borders or subtle rings.
- **Shadow Strategy:** Flat at rest for most dashboard cards; hover shadow is allowed for clickable repeated cards.
- **Border:** Prefer `border-zinc-100` for cards and `ring-zinc-200` for controls.
- **Internal Padding:** 20-24px for cards, 14-16px for compact fields and chips.

### Inputs / Fields

- **Style:** 44px height, white background, 12px radius, zinc-200 inset ring, dark ink text, visible placeholder contrast.
- **Focus:** Move to a 2px `brand-500` ring or the global `brand-600` focus outline.
- **Error / Disabled:** Errors use red text with clear message copy. Disabled controls reduce opacity but must remain readable.

### Navigation

- **Landing Nav:** Sticky white with 80% opacity and backdrop blur, subtle zinc bottom border, compact links, and a primary CTA.
- **Dashboard Sidebar:** 240px desktop rail with icon + label links. Active item uses `brand-50` and `brand-700`; inactive items use muted text and zinc hover fills.
- **Mobile:** Product navigation collapses horizontally; labels can hide when needed but icons must remain recognizable.

### Product Loop Preview

The landing preview should show the real four-step promise: queued, tailored, form filled, user confirms. Keep it static or CSS-light, with no fake agent spectacle and no JS-heavy animation.

## 6. Do's and Don'ts

### Do:

- **Do** keep the confirmation step visible whenever an application could be submitted.
- **Do** use `brand-600` for the primary action and `brand-50` / `brand-700` for selected or safe states.
- **Do** preserve readable body contrast: `ink` for primary text and `muted` only for secondary content.
- **Do** use lucide icons consistently for actions, statuses, and navigation.
- **Do** honor reduced motion and keep transitions in the 150-250ms range.

### Don't:

- **Don't** make JobPosted look like a mass auto-apply spam tool, growth-hack dashboard, or hidden autonomous agent.
- **Don't** imply LinkedIn, Workday, or login-gated platforms run from JobPosted servers.
- **Don't** use dark neon AI-console styling, purple gradient SaaS gloss, glassmorphism, gradient text, fake stock imagery, or abstract "AI magic" visuals.
- **Don't** use colored side-stripe borders, oversized hero metrics, or identical decorative card grids as a default pattern.
- **Don't** introduce inconsistent button, input, or badge vocabularies across dashboard screens.
