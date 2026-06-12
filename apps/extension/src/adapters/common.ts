import type { PlatformAdapter } from "../autofill/types";

export function visible(element: HTMLElement | null): element is HTMLElement {
  if (!element) return false;
  if (element.hasAttribute("hidden") || element.getAttribute("aria-hidden") === "true") return false;
  const getComputedStyle = element.ownerDocument.defaultView?.getComputedStyle;
  const style = typeof getComputedStyle === "function" ? getComputedStyle(element) : null;
  if (style && (style.display === "none" || style.visibility === "hidden")) return false;
  const rect = element.getBoundingClientRect();
  if (rect.width > 0 && rect.height > 0) return true;
  return !element.closest("[hidden]");
}

export function buttonByText(dom: Document, patterns: RegExp[]) {
  const candidates = Array.from(
    dom.querySelectorAll<HTMLElement>("button, a, [role='button'], input[type='button'], input[type='submit']"),
  );
  return (
    candidates.find((candidate) => {
      if (!visible(candidate)) return false;
      const text =
        candidate instanceof HTMLInputElement
          ? candidate.value
          : candidate.textContent || candidate.getAttribute("aria-label") || "";
      return patterns.some((pattern) => pattern.test(text.trim()));
    }) ?? null
  );
}

export function genericStep(dom: Document) {
  const active =
    dom.querySelector("[aria-current='step'], [data-automation-id*='current'], [class*='active']")?.textContent ??
    dom.querySelector("h1,h2")?.textContent ??
    "Application";
  return { name: active.replace(/\s+/g, " ").trim() || "Application" };
}

export function genericAdvance(dom: Document) {
  return buttonByText(dom, [/^(next|continue|save and continue|save & continue|review)$/i]);
}

export function genericSubmit(dom: Document) {
  return buttonByText(dom, [/^(submit|submit application|send application|apply)$/i]);
}

export function makeGenericAdapter(): PlatformAdapter {
  return {
    id: "generic",
    label: "Generic form",
    match: () => true,
    detectStep: genericStep,
    mapFields: () => [],
    findAdvance: genericAdvance,
    findSubmit: genericSubmit,
    notes:
      "Generic fallback relies on labels, ARIA, placeholder text, fieldset context, reusable answers, and LLM fallback. It avoids all-site permissions; it runs when a supported host has no specific adapter.",
  };
}
