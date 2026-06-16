import { Quote, Star } from "lucide-react";
import { Reveal } from "@/components/ui/Reveal";

const REVIEWS = [
  {
    quote:
      "JobPosted turned my weekly application block into a 10-minute review. The best part is seeing exactly what is ready before anything goes out.",
    name: "Aisha Raman",
    role: "Product Operations Lead",
  },
  {
    quote:
      "It caught roles I would have missed on smaller Greenhouse and Lever boards, then tailored each resume without making it sound generic.",
    name: "Daniel Cho",
    role: "Senior Frontend Engineer",
  },
  {
    quote:
      "The daily acknowledgement gives me confidence. I get the leverage of automation without feeling like I handed over my whole job search.",
    name: "Maya Patel",
    role: "Data Analyst",
  },
] as const;

export function Reviews() {
  return (
    <section className="relative isolate bg-transparent px-5 pt-20 pb-10 sm:pt-24 sm:pb-12">
      <div className="mx-auto w-full max-w-6xl">
        <Reveal className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-bold text-brand-700">Trusted by job seekers</p>
          <h2 className="mt-4 text-4xl font-extrabold tracking-[-0.035em] text-balance text-ink sm:text-5xl lg:text-6xl">
            Less Application Grind More Interviews
          </h2>
        </Reveal>

        <div className="mt-12 grid gap-5 lg:grid-cols-[1.08fr_1fr] lg:items-stretch">
          <Reveal delay={0.04} className="h-full">
            <ReviewCard review={REVIEWS[0]} featured />
          </Reveal>

          <div className="grid gap-5">
            <Reveal delay={0.16}>
              <ReviewCard review={REVIEWS[1]} compact />
            </Reveal>
            <Reveal delay={0.22}>
              <ReviewCard review={REVIEWS[2]} compact />
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  );
}

function ReviewCard({
  review,
  compact = false,
  featured = false,
}: {
  review: (typeof REVIEWS)[number];
  compact?: boolean;
  featured?: boolean;
}) {
  return (
    <article
      className={
        featured
          ? "relative flex h-full min-h-[19rem] flex-col overflow-hidden rounded-2xl bg-[#1e7bff] p-6 text-white shadow-[0_18px_46px_rgba(30,123,255,0.24)]"
          : "relative flex h-full flex-col overflow-hidden rounded-2xl bg-white/82 p-6 text-ink ring-1 ring-inset ring-white/90 " +
            (compact ? "min-h-[13rem]" : "min-h-[19rem]")
      }
    >
      <span
        aria-hidden
        className={
          featured
            ? "pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.72),transparent)]"
            : "pointer-events-none absolute inset-x-5 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(31,100,224,0.25),transparent)]"
        }
      />
      <div className="mb-6 flex items-center justify-between gap-4">
        <span
          className={
            featured
              ? "grid size-10 place-items-center rounded-2xl bg-white/16 text-white ring-1 ring-inset ring-white/18"
              : "grid size-10 place-items-center rounded-2xl bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-100"
          }
        >
          <Quote className="size-5" />
        </span>
        <span className="flex text-sun" aria-label="Five star review signal">
          {Array.from({ length: 5 }).map((_, index) => (
            <Star key={index} className="size-3.5 fill-current" />
          ))}
        </span>
      </div>

      <p
        className={
          featured
            ? "text-pretty text-xl leading-8 font-extrabold text-white sm:text-2xl sm:leading-9"
            : "text-base leading-7 font-semibold text-pretty text-ink/84"
        }
      >
        &ldquo;{review.quote}&rdquo;
      </p>

      <div className="mt-auto pt-7">
        <p className={featured ? "font-extrabold text-white" : "font-extrabold text-ink"}>
          {review.name}
        </p>
        <p className={featured ? "mt-1 text-sm font-semibold text-white/72" : "mt-1 text-sm font-semibold text-muted"}>
          {review.role}
        </p>
      </div>
    </article>
  );
}
