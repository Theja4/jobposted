import type { ExtensionFieldFillRecord, ExtensionFieldMapping, MasterProfile } from "@jobposted/shared";
import { fillField, isVisible } from "./fill";
import { resolveField } from "./resolve";
import { normalizeText, visibleText } from "./text";
import type { FieldDescriptor, FillContext } from "./types";

type WorkAuthFallback = {
  id: string;
  label: string;
  canonicalKey: ExtensionFieldMapping["canonicalKey"];
  patterns: RegExp[];
};

const CHOICE_SELECTOR = [
  "select",
  "[role='combobox']",
  "[aria-haspopup='listbox']",
  "[aria-haspopup='menu']",
  "[class~='select']",
  "[class*='select2-container' i]",
].join(",");

const FALLBACKS: WorkAuthFallback[] = [
  {
    id: "authorized-to-work",
    label: "Are you legally authorized to work in the country in which you are applying?",
    canonicalKey: "workAuth.authorizedToWork",
    patterns: [
      /\blegally authorized to work\b/,
      /\bauthorized to work in the country\b/,
      /\bright to work\b/,
      /\beligible to work\b/,
    ],
  },
  {
    id: "requires-sponsorship",
    label: "Do you now or will you in the future need sponsorship for employment visa status in the country in which you are applying?",
    canonicalKey: "workAuth.requiresSponsorship",
    patterns: [
      /\bneed sponsorship\b/,
      /\brequire sponsorship\b/,
      /\bvisa sponsorship\b/,
      /\bemployment visa status\b/,
    ],
  },
];

function fieldType(element: HTMLElement): FieldDescriptor["type"] {
  if (element instanceof HTMLSelectElement) return element.multiple ? "multiselect" : "select";
  return "combobox";
}

function optionsFor(element: HTMLElement) {
  if (element instanceof HTMLSelectElement) {
    return Array.from(element.options).map((option) => visibleText(option.textContent || option.value)).filter(Boolean);
  }
  const ids = [element.getAttribute("aria-controls"), element.getAttribute("aria-owns")]
    .filter(Boolean)
    .join(" ")
    .split(/\s+/)
    .filter(Boolean);
  const controlled = ids
    .map((id) => element.ownerDocument.getElementById(id))
    .filter((node): node is HTMLElement => Boolean(node));
  const scoped = [element, ...controlled];
  const options = scoped.flatMap((root) =>
    Array.from(root.querySelectorAll<HTMLElement>("[role='option'], [role='menuitem'], option, li, [class*='option' i]")).map((option) =>
      visibleText(option.textContent || option.getAttribute("aria-label") || option.getAttribute("data-value") || option.getAttribute("value")),
    ),
  );
  return options.filter((option, index, all) => option && all.indexOf(option) === index);
}

function ownsOtherChoiceControl(container: HTMLElement, control: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>(CHOICE_SELECTOR)).some(
    (candidate) => candidate !== control && !candidate.contains(control) && !control.contains(candidate),
  );
}

function matchingContainer(control: HTMLElement, fallback: WorkAuthFallback) {
  for (let node: HTMLElement | null = control; node && node !== control.ownerDocument.body; node = node.parentElement) {
    const text = normalizeText(visibleText(node.textContent));
    if (text.length > 1200) break;
    if (fallback.patterns.some((pattern) => pattern.test(text))) {
      return ownsOtherChoiceControl(node, control) ? null : node;
    }
  }
  return null;
}

function choiceControls(doc: Document) {
  return Array.from(doc.querySelectorAll<HTMLElement>(CHOICE_SELECTOR)).filter((element, index, all) => {
    if (!isVisible(element)) return false;
    if (all.some((other) => other !== element && other.contains(element) && other.matches(CHOICE_SELECTOR))) return false;
    return true;
  });
}

function directFallbackValue(
  key: ExtensionFieldMapping["canonicalKey"],
  profile: MasterProfile,
): ExtensionFieldMapping["value"] {
  if (key === "workAuth.authorizedToWork") {
    return profile.workAuth.authorizedToWork ?? (profile.workAuth.requiresSponsorship === false ? true : null);
  }
  if (key === "workAuth.requiresSponsorship") return profile.workAuth.requiresSponsorship;
  return null;
}

function fallbackField(control: HTMLElement, container: HTMLElement, fallback: WorkAuthFallback, platform: FillContext["platform"]): FieldDescriptor {
  const type = fieldType(control);
  const context = visibleText(container.textContent).slice(0, 360);
  const options = optionsFor(control);
  const signature = normalizeText([platform, "work-auth-fallback", fallback.id, fallback.label, options.join("|")].join(" ")).slice(0, 240);
  return {
    id: `work-auth-fallback:${fallback.id}`,
    element: control,
    label: fallback.label,
    context,
    type,
    required: /\*/.test(context) || /required/i.test(context),
    options,
    signature,
  };
}

export async function fillWorkAuthFallbacks(args: {
  profile: MasterProfile;
  platform: FillContext["platform"];
  url: string;
  demographicsEnabled: boolean;
  context: FillContext;
  existingRecords: ExtensionFieldFillRecord[];
}) {
  const records: ExtensionFieldFillRecord[] = [];
  const controls = choiceControls(document);

  for (const fallback of FALLBACKS) {
    if (args.existingRecords.some((record) => record.canonicalKey === fallback.canonicalKey && record.status === "filled")) continue;
    const match = controls
      .map((control) => ({ control, container: matchingContainer(control, fallback) }))
      .find((item): item is { control: HTMLElement; container: HTMLElement } => Boolean(item.container));
    if (!match) continue;

    const field = fallbackField(match.control, match.container, fallback, args.platform);
    const resolved = await resolveField({
      field,
      profile: args.profile,
      platform: args.platform,
      url: args.url,
      demographicsEnabled: args.demographicsEnabled,
    });
    const mapping =
      resolved.canonicalKey !== "unknown" && resolved.value != null
        ? resolved
        : {
            canonicalKey: fallback.canonicalKey,
            value: directFallbackValue(fallback.canonicalKey, args.profile),
            confidence: 0.87,
            source: "heuristic" as const,
            reason: "Filled a visible Greenhouse work-authorization fallback question.",
          };

    const record = await fillField(field, mapping, args.context);
    records.push(record);
  }

  return records;
}
