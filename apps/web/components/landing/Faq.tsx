"use client";

import { ArrowLeft, ArrowRight, Plus } from "lucide-react";
import {
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Reveal } from "@/components/ui/Reveal";
import { cn } from "@/lib/cn";

const FAQS = [
  {
    q: "Do applications really get sent automatically?",
    a: "Yes. JobPosted matches roles, tailors a resume to each one, fills the application, and submits it for you each day. To keep it running, you log in once a day and acknowledge the batch that went out. Miss a day and it simply pauses until you're back, so it never runs unsupervised.",
  },
  {
    q: "Will this get my LinkedIn or other accounts banned?",
    a: "No. Platforms that require sign in, like LinkedIn and Workday, run inside your own browser session at human pace. Open ATS applications on Greenhouse, Lever, and Ashby are tailored and submitted automatically, and every one shows up in your daily queue to review.",
  },
  {
    q: "What happens to my data and my resume?",
    a: "Your profile and resumes stay isolated to your account. We never sell your data, and we do not store LinkedIn or Workday passwords.",
  },
  {
    q: "Which platforms does it support?",
    a: "At launch: Greenhouse, Lever, and Ashby for direct ATS flows, plus LinkedIn and Workday through your own browser session.",
  },
  {
    q: "Do you guarantee a number of applications?",
    a: "We show an honest upper bound based on genuinely relevant roles in your pool. Bad matches are not padded in to inflate the count.",
  },
  {
    q: "Can I cancel or get a refund?",
    a: "Plans are monthly, and you can pause anytime. You can see exactly how JobPosted works before committing.",
  },
];

export function Faq() {
  const [active, setActive] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const cardRefs = useRef<Array<HTMLDivElement | null>>([]);
  const dragRef = useRef({
    active: false,
    dragging: false,
    pointerId: -1,
    startX: 0,
    startY: 0,
    startScrollLeft: 0,
  });
  const suppressClickRef = useRef(false);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQS.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  /**
   * Scroll only when the expanded card would be clipped by the viewport edge
   * (e.g. the last card). Cards that already fit stay exactly where they were
   * clicked — no centering, no bounce. Runs once, after the width transition
   * settles, so it never fights the expansion animation.
   */
  function revealIfClipped(index: number) {
    const viewport = viewportRef.current;
    const card = cardRefs.current[index];
    if (!viewport || !card) return;

    const styles = window.getComputedStyle(viewport);
    const padLeft = Number.parseFloat(styles.paddingLeft) || 0;
    const padRight = Number.parseFloat(styles.paddingRight) || 0;
    const margin = 12; // breathing room so the card edge isn't flush

    const cardLeft = card.offsetLeft;
    const cardRight = cardLeft + card.offsetWidth;
    const visibleLeft = viewport.scrollLeft + padLeft;
    const visibleRight = viewport.scrollLeft + viewport.clientWidth - padRight;

    let target: number | null = null;
    if (cardRight > visibleRight) {
      // Clipped on the right (the last-card case): nudge just enough to reveal it.
      target = cardRight - (viewport.clientWidth - padRight) + margin;
    } else if (cardLeft < visibleLeft) {
      // Clipped on the left (arrow-nav backwards): same minimal nudge.
      target = cardLeft - padLeft - margin;
    }
    if (target === null) return;

    const maxScroll = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
    viewport.scrollTo({
      left: Math.min(Math.max(target, 0), maxScroll),
      behavior: "smooth",
    });
  }

  function activate(index: number) {
    setActive(index);
    // Wait for the 300ms width transition to finish before measuring.
    window.setTimeout(() => revealIfClipped(index), 340);
  }

  function step(direction: -1 | 1) {
    activate((active + direction + FAQS.length) % FAQS.length);
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) return;

    dragRef.current = {
      active: true,
      dragging: false,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startScrollLeft: event.currentTarget.scrollLeft,
    };
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag.active || drag.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    const horizontal = Math.abs(deltaX);
    const vertical = Math.abs(deltaY);

    if (!drag.dragging) {
      if (vertical > 8 && vertical > horizontal) {
        dragRef.current.active = false;
        return;
      }

      if (horizontal < 8) return;

      drag.dragging = true;
      suppressClickRef.current = true;
      setIsDragging(true);
      event.currentTarget.setPointerCapture(event.pointerId);
    }

    event.preventDefault();
    event.currentTarget.scrollLeft = drag.startScrollLeft - deltaX;
  }

  function finishDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag.active || drag.pointerId !== event.pointerId) return;

    if (drag.dragging && event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    dragRef.current.active = false;
    dragRef.current.dragging = false;
    setIsDragging(false);

    if (suppressClickRef.current) {
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 120);
    }
  }

  function handleClickCapture(event: ReactMouseEvent<HTMLDivElement>) {
    if (!suppressClickRef.current) return;

    event.preventDefault();
    event.stopPropagation();
    suppressClickRef.current = false;
  }

  return (
    <section
      id="faq"
      className="relative isolate bg-transparent pt-20 pb-28 sm:pt-24 sm:pb-32"
    >
      <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">
        <div className="grid gap-8 md:grid-cols-[1.2fr_0.8fr] md:items-start">
          <Reveal>
            <p className="text-sm font-bold text-brand-700">Need to know</p>
            <h2 className="mt-4 max-w-xl text-4xl font-extrabold tracking-[-0.032em] text-balance text-ink sm:text-6xl">
              Frequently asked <span className="text-brand-700">questions</span>
            </h2>
          </Reveal>

          <Reveal delay={0.06}>
            <div className="md:pt-8">
              <p className="max-w-sm text-base leading-7 text-ink/78">
                Quick answers about automatic sending, safety, data, and the daily check in.
              </p>
              <div className="mt-5 flex gap-3">
                <button
                  type="button"
                  onClick={() => step(-1)}
                  className="grid size-10 place-items-center rounded-full bg-white text-ink ring-1 ring-inset ring-brand-100 transition duration-200 hover:-translate-y-0.5 hover:bg-brand-50 hover:text-brand-700"
                  aria-label="Previous FAQ"
                >
                  <ArrowLeft className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => step(1)}
                  className="grid size-10 place-items-center rounded-full bg-[#1e7bff] text-white shadow-[0_8px_18px_rgba(30,123,255,0.24)] transition duration-200 hover:-translate-y-0.5 hover:bg-brand-700"
                  aria-label="Next FAQ"
                >
                  <ArrowRight className="size-4" />
                </button>
              </div>
            </div>
          </Reveal>
        </div>

        <div
          ref={viewportRef}
          className={cn(
            "-mx-5 mt-8 overflow-x-auto overscroll-x-contain px-5 pb-16 pt-6 touch-pan-y [scrollbar-width:none] sm:-mx-8 sm:px-8 [&::-webkit-scrollbar]:hidden",
            isDragging ? "cursor-grabbing" : "cursor-grab",
          )}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishDrag}
          onPointerCancel={finishDrag}
          onClickCapture={handleClickCapture}
        >
          <div className="flex snap-x snap-proximity select-none gap-5 pr-14 sm:pr-20">
            {FAQS.map((faq, index) => (
              <div
                key={faq.q}
                ref={(node) => {
                  cardRefs.current[index] = node;
                }}
                className="shrink-0 snap-center"
              >
                <FaqCard
                  faq={faq}
                  active={active === index}
                  onActivate={() => activate(index)}
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    </section>
  );
}

function FaqCard({
  faq,
  active,
  onActivate,
}: {
  faq: (typeof FAQS)[number];
  active: boolean;
  onActivate: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onActivate}
      className={cn(
        "group relative flex min-h-[22rem] shrink-0 cursor-pointer flex-col overflow-hidden rounded-2xl p-6 text-left transition-[width,transform,background-color,box-shadow] duration-300 ease-out focus-visible:outline-brand-600",
        active
          ? "w-[82vw] max-w-[24rem] bg-[#1e7bff] text-white shadow-[0_18px_46px_rgba(30,123,255,0.24)] sm:w-[24rem]"
          : "w-[72vw] max-w-[17rem] bg-[#eaf4ff] text-ink/66 hover:-translate-y-2 hover:bg-[#dbeafe] hover:text-ink hover:shadow-[0_18px_45px_rgba(30,123,255,0.18)] sm:w-[17rem]",
        active && "hover:-translate-y-2 hover:shadow-[0_24px_64px_rgba(30,123,255,0.34)]",
      )}
      aria-expanded={active}
    >
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute -top-24 left-8 h-40 w-32 rotate-12 rounded-full blur-2xl transition-opacity duration-300",
          active ? "bg-white/40 opacity-100" : "bg-white/0 opacity-0 group-hover:bg-white/60 group-hover:opacity-100",
        )}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 translate-x-[-120%] bg-[linear-gradient(105deg,transparent_32%,rgba(255,255,255,0.42)_50%,transparent_68%)] transition-transform duration-700 group-hover:translate-x-[120%]"
      />
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.18),transparent_42%)] opacity-0 transition-opacity duration-300",
          active && "opacity-100",
        )}
      />

      <div className="relative z-10 flex flex-1 flex-col justify-end">
        <div className="mb-auto flex justify-end">
          <span
            className={cn(
              "grid size-9 place-items-center rounded-full transition duration-200",
              active ? "bg-white/20 text-white" : "bg-white text-brand-700",
            )}
          >
            <Plus className={cn("size-4 transition-transform duration-200", active && "rotate-45")} />
          </span>
        </div>
        <h3
          className={cn(
            "text-balance tracking-[-0.035em] transition-[color,transform] duration-300 ease-out",
            active
              ? "-translate-y-3 text-3xl font-semibold leading-tight text-white"
              : "translate-y-0 text-2xl font-medium leading-tight text-ink/68",
          )}
        >
          {faq.q}
        </h3>
        <div
          className={cn(
            "mt-2 overflow-hidden rounded-2xl bg-white transition-[max-height,opacity,padding,transform] duration-300 ease-out",
            active
              ? "max-h-48 translate-y-0 p-4 opacity-100 shadow-[0_12px_28px_rgba(16,47,102,0.14)]"
              : "max-h-0 translate-y-3 p-0 opacity-0",
          )}
        >
          <p className="text-base leading-7 text-brand-900/80">{faq.a}</p>
        </div>
      </div>
    </button>
  );
}
