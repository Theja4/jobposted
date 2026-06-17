/**
 * Placeholder dashboard data. The real figures will come from the `jobposted`
 * Postgres schema + the Rezoomed sync once the backend is wired; until then the
 * UI renders against these samples so the layout and interactions are real.
 */

export type ApplicationStatus =
  | "queued"
  | "filled"
  | "submitted"
  | "applied"
  | "viewed"
  | "interview"
  | "offer"
  | "rejected";

export interface JobApplication {
  id: string;
  role: string;
  company: string;
  companyDomain?: string | null;
  companyLogoUrl?: string | null;
  location: string;
  appliedOn: string; // ISO date
  appliedAt?: string; // time-of-day label, e.g. "09:14"
  status: ApplicationStatus;
  rawStatus?: string | null;
  applyPath?: string | null;
  matchScore: number; // 0–100
  resumeName: string;
  resumeUrl: string;
}

export const STATUS_META: Record<
  ApplicationStatus,
  { label: string; className: string }
> = {
  queued: { label: "Queued", className: "bg-sky-50 text-sky-700 shadow-[0_8px_16px_-14px_rgba(2,132,199,0.5)]" },
  filled: { label: "Filled", className: "bg-amber-50 text-amber-700 shadow-[0_8px_16px_-14px_rgba(217,119,6,0.5)]" },
  submitted: { label: "Submitted", className: "bg-brand-50 text-brand-700 shadow-[0_8px_16px_-14px_rgba(31,100,224,0.5)]" },
  applied: { label: "Applied", className: "bg-brand-50 text-brand-700 shadow-[0_8px_16px_-14px_rgba(31,100,224,0.5)]" },
  viewed: { label: "Viewed", className: "bg-sky-50 text-sky-700 shadow-[0_8px_16px_-14px_rgba(2,132,199,0.5)]" },
  interview: { label: "Interview", className: "bg-[#fff4dd] text-[#9a6a09] shadow-[0_8px_16px_-14px_rgba(217,119,6,0.5)]" },
  offer: { label: "Offer", className: "bg-emerald-50 text-emerald-700 shadow-[0_8px_16px_-14px_rgba(5,150,105,0.5)]" },
  rejected: { label: "Closed", className: "bg-zinc-100 text-zinc-500 shadow-[0_8px_16px_-14px_rgba(15,23,42,0.42)]" },
};

export const APPLICATIONS: JobApplication[] = [
  {
    id: "app_01",
    role: "Senior Product Designer",
    company: "Stripe",
    location: "Remote · US",
    appliedOn: "2026-06-11",
    status: "interview",
    matchScore: 96,
    resumeName: "Resume · Stripe Sr Product Designer.pdf",
    resumeUrl: "#",
  },
  {
    id: "app_02",
    role: "Product Designer, Growth",
    company: "Linear",
    location: "Remote",
    appliedOn: "2026-06-11",
    status: "viewed",
    matchScore: 91,
    resumeName: "Resume · Linear Growth Designer.pdf",
    resumeUrl: "#",
  },
  {
    id: "app_03",
    role: "Staff Product Designer",
    company: "Figma",
    location: "San Francisco, CA",
    appliedOn: "2026-06-10",
    status: "applied",
    matchScore: 88,
    resumeName: "Resume · Figma Staff Designer.pdf",
    resumeUrl: "#",
  },
  {
    id: "app_04",
    role: "Senior UX Designer",
    company: "Notion",
    location: "Remote · US",
    appliedOn: "2026-06-10",
    status: "applied",
    matchScore: 90,
    resumeName: "Resume · Notion Sr UX.pdf",
    resumeUrl: "#",
  },
  {
    id: "app_05",
    role: "Design Lead",
    company: "Vercel",
    location: "Remote",
    appliedOn: "2026-06-09",
    status: "offer",
    matchScore: 94,
    resumeName: "Resume · Vercel Design Lead.pdf",
    resumeUrl: "#",
  },
  {
    id: "app_06",
    role: "Product Designer",
    company: "Ramp",
    location: "New York, NY",
    appliedOn: "2026-06-09",
    status: "rejected",
    matchScore: 79,
    resumeName: "Resume · Ramp Product Designer.pdf",
    resumeUrl: "#",
  },
  {
    id: "app_07",
    role: "Senior Designer, Platform",
    company: "Retool",
    location: "Remote · US",
    appliedOn: "2026-06-08",
    status: "viewed",
    matchScore: 86,
    resumeName: "Resume · Retool Platform.pdf",
    resumeUrl: "#",
  },
  {
    id: "app_08",
    role: "Product Designer II",
    company: "Webflow",
    location: "Remote",
    appliedOn: "2026-06-08",
    status: "applied",
    matchScore: 92,
    resumeName: "Resume · Webflow Designer II.pdf",
    resumeUrl: "#",
  },
];

export const DASHBOARD_STATS = {
  sentThisWeek: 119,
  responses: 38,
  interviews: 9,
  avgMatch: 95,
};

/* ── Daily auto-apply queue ─────────────────────────────────────────────────
   JobPosted applies automatically each day. The user logs in and reviews the
   applications JobPosted prepared for the current worker run. */

/** Applications JobPosted already sent today, on the user's behalf. */
export const QUEUE_TODAY: JobApplication[] = [
  { id: "td_01", role: "Senior Product Designer", company: "Stripe", location: "Remote · US", appliedOn: "2026-06-12", appliedAt: "08:12", status: "applied", matchScore: 96, resumeName: "Resume · Stripe Sr Product Designer.pdf", resumeUrl: "#" },
  { id: "td_02", role: "Product Designer, Growth", company: "Linear", location: "Remote", appliedOn: "2026-06-12", appliedAt: "08:31", status: "applied", matchScore: 91, resumeName: "Resume · Linear Growth Designer.pdf", resumeUrl: "#" },
  { id: "td_03", role: "Senior UX Designer", company: "Notion", location: "Remote · US", appliedOn: "2026-06-12", appliedAt: "09:05", status: "applied", matchScore: 90, resumeName: "Resume · Notion Sr UX.pdf", resumeUrl: "#" },
  { id: "td_04", role: "Product Designer II", company: "Webflow", location: "Remote", appliedOn: "2026-06-12", appliedAt: "09:40", status: "applied", matchScore: 92, resumeName: "Resume · Webflow Designer II.pdf", resumeUrl: "#" },
  { id: "td_05", role: "Senior Designer, Platform", company: "Retool", location: "Remote · US", appliedOn: "2026-06-12", appliedAt: "10:18", status: "applied", matchScore: 86, resumeName: "Resume · Retool Platform.pdf", resumeUrl: "#" },
  { id: "td_06", role: "Design Systems Engineer", company: "Shopify", location: "Hybrid · Toronto", appliedOn: "2026-06-12", appliedAt: "11:02", status: "applied", matchScore: 81, resumeName: "Resume · Shopify Design Systems.pdf", resumeUrl: "#" },
];

/* ── Job board ──────────────────────────────────────────────────────────── */

export type Workplace = "Remote" | "Hybrid" | "On-site";
export type JobType = "Full-time" | "Contract" | "Part-time" | "Internship";

export interface JobListing {
  id: string;
  title: string;
  company: string;
  companyDomain?: string | null;
  companyLogoUrl?: string | null;
  location: string;
  workplace: Workplace;
  type: JobType;
  level: string;
  salary: string;
  tags: string[];
  postedOn: string; // ISO date
  matchScore: number; // 0–100 fit for the user
  description: string;
  applyUrl?: string | null;
  atsType?: string | null;
  source?: string | null;
  canSaveTailoredResume?: boolean;
  featured?: boolean;
}

export const JOBS: JobListing[] = [
  {
    id: "job_01",
    title: "Senior Product Designer",
    company: "Stripe",
    location: "Remote · US",
    workplace: "Remote",
    type: "Full-time",
    level: "Senior",
    salary: "$170k – $210k",
    tags: ["Design systems", "Fintech", "Figma", "B2B"],
    postedOn: "2026-06-11",
    matchScore: 96,
    description:
      "Own end-to-end design for payments surfaces used by millions of businesses. Partner with engineering on a mature design system.",
    featured: true,
  },
  {
    id: "job_02",
    title: "Staff Product Designer",
    company: "Figma",
    location: "San Francisco, CA",
    workplace: "Hybrid",
    type: "Full-time",
    level: "Staff",
    salary: "$200k – $250k",
    tags: ["Design systems", "Prototyping", "Tooling"],
    postedOn: "2026-06-10",
    matchScore: 92,
    description:
      "Set the design direction for creative tooling. Mentor designers and drive craft across the org.",
    featured: true,
  },
  {
    id: "job_03",
    title: "Product Designer, Growth",
    company: "Linear",
    location: "Remote",
    workplace: "Remote",
    type: "Full-time",
    level: "Mid–Senior",
    salary: "$150k – $190k",
    tags: ["Growth", "Experimentation", "B2B SaaS"],
    postedOn: "2026-06-11",
    matchScore: 91,
    description:
      "Design onboarding and activation experiments. Ship fast, measure, and iterate with the growth squad.",
  },
  {
    id: "job_04",
    title: "Senior UX Designer",
    company: "Notion",
    location: "Remote · US",
    workplace: "Remote",
    type: "Full-time",
    level: "Senior",
    salary: "$160k – $200k",
    tags: ["UX", "Research", "Productivity"],
    postedOn: "2026-06-10",
    matchScore: 90,
    description:
      "Shape collaborative editing experiences. Lead research-driven design for power users and teams.",
  },
  {
    id: "job_05",
    title: "Design Lead",
    company: "Vercel",
    location: "Remote",
    workplace: "Remote",
    type: "Full-time",
    level: "Lead",
    salary: "$210k – $260k",
    tags: ["Leadership", "Design systems", "Developer tools"],
    postedOn: "2026-06-09",
    matchScore: 94,
    description:
      "Lead a small, senior design team building the frontend cloud. Balance hands-on craft with team direction.",
    featured: true,
  },
  {
    id: "job_06",
    title: "Product Designer",
    company: "Ramp",
    location: "New York, NY",
    workplace: "On-site",
    type: "Full-time",
    level: "Mid",
    salary: "$140k – $175k",
    tags: ["Fintech", "Dashboards", "0→1"],
    postedOn: "2026-06-09",
    matchScore: 84,
    description:
      "Design finance automation products. Work closely with PM and eng in a fast-moving environment.",
  },
  {
    id: "job_07",
    title: "Senior Designer, Platform",
    company: "Retool",
    location: "Remote · US",
    workplace: "Remote",
    type: "Full-time",
    level: "Senior",
    salary: "$165k – $205k",
    tags: ["Platform", "Developer tools", "Complex UI"],
    postedOn: "2026-06-08",
    matchScore: 86,
    description:
      "Design the building blocks teams use to assemble internal tools. Tackle dense, data-heavy interfaces.",
  },
  {
    id: "job_08",
    title: "Product Designer II",
    company: "Webflow",
    location: "Remote",
    workplace: "Remote",
    type: "Full-time",
    level: "Mid",
    salary: "$135k – $170k",
    tags: ["No-code", "Visual editing", "Web"],
    postedOn: "2026-06-08",
    matchScore: 88,
    description:
      "Design the visual canvas that lets anyone build for the web. Obsess over direct-manipulation interactions.",
  },
  {
    id: "job_09",
    title: "Senior UX Researcher",
    company: "Airbnb",
    location: "Remote · US",
    workplace: "Remote",
    type: "Full-time",
    level: "Senior",
    salary: "$155k – $195k",
    tags: ["Research", "Mixed methods", "Marketplace"],
    postedOn: "2026-06-07",
    matchScore: 79,
    description:
      "Run generative and evaluative research that shapes host and guest experiences worldwide.",
  },
  {
    id: "job_10",
    title: "Senior Frontend Engineer",
    company: "Linear",
    location: "Remote",
    workplace: "Remote",
    type: "Full-time",
    level: "Senior",
    salary: "$180k – $220k",
    tags: ["React", "TypeScript", "Performance"],
    postedOn: "2026-06-10",
    matchScore: 72,
    description:
      "Build a famously fast issue tracker. Sweat the details of latency, animation, and keyboard UX.",
  },
  {
    id: "job_11",
    title: "Design Systems Engineer",
    company: "Shopify",
    location: "Hybrid · Toronto",
    workplace: "Hybrid",
    type: "Full-time",
    level: "Senior",
    salary: "$160k – $200k",
    tags: ["Design systems", "React", "Accessibility"],
    postedOn: "2026-06-06",
    matchScore: 81,
    description:
      "Bridge design and engineering by owning the component library used across commerce surfaces.",
  },
  {
    id: "job_12",
    title: "Lead Product Designer (Contract)",
    company: "Anthropic",
    location: "Remote · US",
    workplace: "Remote",
    type: "Contract",
    level: "Lead",
    salary: "$120 – $160 / hr",
    tags: ["AI", "0→1", "Research tools"],
    postedOn: "2026-06-05",
    matchScore: 89,
    description:
      "Help design interfaces for frontier AI products on a 6-month contract with extension potential.",
  },
  {
    id: "job_13",
    title: "Senior Product Manager",
    company: "Figma",
    location: "San Francisco, CA",
    workplace: "Hybrid",
    type: "Full-time",
    level: "Senior",
    salary: "$190k – $230k",
    tags: ["Product", "Strategy", "Tooling"],
    postedOn: "2026-06-07",
    matchScore: 68,
    description:
      "Own a core product area from strategy to launch. Partner deeply with design and engineering.",
  },
  {
    id: "job_14",
    title: "Brand & Marketing Designer",
    company: "Notion",
    location: "Remote",
    workplace: "Remote",
    type: "Full-time",
    level: "Mid–Senior",
    salary: "$130k – $165k",
    tags: ["Brand", "Marketing", "Motion"],
    postedOn: "2026-06-04",
    matchScore: 74,
    description:
      "Craft brand campaigns and marketing surfaces. Blend visual systems with storytelling and motion.",
  },
];

/** Master profile used to auto-fill applications from Setup. */
export const MASTER_PROFILE = {
  fullName: "Your Name",
  headline: "Senior Product Designer",
  email: "you@email.com",
  phone: "+1 (555) 012-3456",
  location: "Remote · United States",
  links: [
    { label: "Portfolio", value: "yourname.design" },
    { label: "LinkedIn", value: "linkedin.com/in/yourname" },
    { label: "GitHub", value: "github.com/yourname" },
  ],
  summary:
    "Product designer with 8+ years shipping B2B SaaS and fintech products. Leads end-to-end design from research to polished, accessible UI, and partners closely with engineering on design systems.",
  experience: [
    {
      role: "Senior Product Designer",
      company: "Acme Fintech",
      period: "2022 — Present",
      bullets: [
        "Owned the redesign of the core dashboard, lifting activation 23%.",
        "Built and maintained the company design system used by 40+ engineers.",
      ],
    },
    {
      role: "Product Designer",
      company: "Bright SaaS",
      period: "2019 — 2022",
      bullets: [
        "Shipped onboarding flows that cut time-to-value from 9 to 4 minutes.",
        "Ran the research practice across 3 product squads.",
      ],
    },
  ],
  education: [{ school: "State University", degree: "B.A. Design", period: "2015 — 2019" }],
  skills: ["Product strategy", "Design systems", "Prototyping", "User research", "Figma", "Accessibility"],
};
