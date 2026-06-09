import type { Page } from "playwright";
import type { PageField } from "@jobposted/field-match";

/**
 * Extract fillable form controls as `PageField` descriptors (selector + label + type + options).
 *
 * The browser-side code is passed as a STRING (not a function) on purpose: tsx/esbuild rewrites
 * inline `page.evaluate` callbacks with a `__name` helper that isn't defined in the page context.
 * A string expression sidesteps the transform entirely. Selectors use `[name=…]` with
 * `CSS.escape` (quote-free) so values like `urls[LinkedIn]` work.
 */
export async function extractFields(page: Page, formSelector?: string): Promise<PageField[]> {
  const rootSel = JSON.stringify(formSelector ?? null);
  const script = `(() => {
    const rootSel = ${rootSel};
    const root = rootSel ? (document.querySelector(rootSel) || document) : document;
    const sel = (el) => {
      const id = el.getAttribute('id');
      if (id) return '#' + CSS.escape(id);
      const name = el.getAttribute('name');
      if (name) return '[name=' + CSS.escape(name) + ']';
      return null;
    };
    const labelFor = (el) => {
      const id = el.getAttribute('id');
      if (id) { const l = document.querySelector('label[for="' + (window.CSS ? CSS.escape(id) : id) + '"]'); if (l && l.textContent) return l.textContent.trim(); }
      const w = el.closest('label'); if (w && w.textContent) return w.textContent.trim();
      const aria = el.getAttribute('aria-label'); if (aria) return aria.trim();
      const lb = el.getAttribute('aria-labelledby'); if (lb) { const r = document.getElementById(lb); if (r && r.textContent) return r.textContent.trim(); }
      const ph = el.getAttribute('placeholder'); if (ph) return ph.trim();
      return el.getAttribute('name') || '';
    };
    const out = [];
    const seenRadio = {};
    root.querySelectorAll('input, select, textarea').forEach((el) => {
      const tag = el.tagName.toLowerCase();
      const it = (el.getAttribute('type') || 'text').toLowerCase();
      if (['hidden','submit','button','reset','image'].indexOf(it) >= 0) return;
      if (el.disabled) return;
      const s = sel(el); if (!s) return;
      const label = labelFor(el).slice(0, 200);
      const required = el.hasAttribute('required') || el.getAttribute('aria-required') === 'true';
      const name = el.getAttribute('name') || undefined;
      if (tag === 'textarea') {
        out.push({ selector: s, type: 'textarea', label, name, required });
      } else if (tag === 'select') {
        const options = Array.from(el.options).map((o) => (o.textContent || '').trim()).filter(Boolean);
        out.push({ selector: s, type: 'select', label, name, required, options });
      } else if (it === 'radio') {
        if (name && seenRadio[name]) return; if (name) seenRadio[name] = 1;
        const groupSel = name ? 'input[type=radio][name=' + CSS.escape(name) + ']' : s;
        const group = name ? root.querySelectorAll(groupSel) : [el];
        const options = Array.from(group).map((r) => labelFor(r) || r.value);
        out.push({ selector: groupSel, type: 'radio', label, name, required, options });
      } else if (it === 'checkbox') {
        out.push({ selector: s, type: 'checkbox', label, name, required });
      } else if (it === 'file') {
        out.push({ selector: s, type: 'file', label, name, required });
      } else {
        const m = { tel: 'phone', url: 'url', email: 'email' };
        out.push({ selector: s, type: m[it] || 'text', label, name, required });
      }
    });
    return out;
  })()`;

  return page.evaluate(script) as Promise<PageField[]>;
}
