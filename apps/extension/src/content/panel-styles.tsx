/**
 * JobPosted in-page dock — design system.
 *
 * Everything sits on a strict token grid: 4px spacing, three radii, four type
 * sizes, four weights, one easing curve. Surfaces separate with hairline rings
 * and a quiet blue-gray canvas instead of border-on-border boxes. Blue is spent
 * only where it means something: the primary action, selection, progress, and
 * safe-positive status ("blue means progress").
 */
export function PanelStyles() {
  return (
    <style>{`
      :host {
        all: initial;
        color-scheme: light;

        /* Brand ramp (unchanged hues) */
        --blue-50: #eff5ff;
        --blue-100: #dce8fe;
        --blue-200: #bcd4fd;
        --blue-300: #93bafb;
        --blue-500: #2f6bf0;
        --blue-600: #1f5fe0;
        --blue-700: #1846b8;

        /* Ink + neutrals */
        --ink: #0b1220;
        --ink-2: #33405a;
        --muted: #5a6a81;
        --line: #e6ecf5;
        --line-2: #d9e2ef;
        --surface: #ffffff;
        --surface-2: #f4f7fc;
        --canvas: #f7f9fd;

        /* Semantic */
        --ok: #0e9f6e;
        --ok-bg: #e7f7f0;
        --warn: #b45309;
        --warn-bg: #fdf3e3;
        --warn-ink: #7c3b0a;

        /* Elevation — hairline ring + soft ambient lift so surfaces float off the canvas */
        --ring-card: 0 0 0 1px rgba(13, 40, 97, 0.06), 0 1px 2px rgba(13, 40, 97, 0.04), 0 6px 16px -10px rgba(13, 40, 97, 0.16);
        --ring-card-hover: 0 0 0 1px rgba(31, 95, 224, 0.32), 0 2px 4px rgba(13, 40, 97, 0.05), 0 10px 24px -12px rgba(31, 95, 224, 0.28);
        --shadow-raise: 0 1px 2px rgba(13, 40, 97, 0.05), 0 8px 20px -14px rgba(13, 40, 97, 0.25);
        --shadow-pop: 0 2px 4px rgba(13, 40, 97, 0.06), 0 16px 36px -18px rgba(13, 40, 97, 0.45);
        --shadow-primary: inset 0 1px 0 rgba(255, 255, 255, 0.28), 0 1px 2px rgba(11, 18, 32, 0.18), 0 12px 22px -12px rgba(31, 95, 224, 0.7);

        /* Radii */
        --r-s: 8px;
        --r-m: 12px;
        --r-l: 16px;

        /* Motion */
        --ease: cubic-bezier(0.2, 0.8, 0.2, 1);
        --ease-settle: cubic-bezier(0.16, 1, 0.3, 1);

        font-family: "Plus Jakarta Sans", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
        -webkit-font-smoothing: antialiased;
      }
      * { box-sizing: border-box; }
      button { font: inherit; border: 0; background: none; padding: 0; cursor: pointer; }
      img { display: block; }
      h1, h2, h3, p, dl, dd, ol, ul { margin: 0; }

      /* One focus vocabulary for every control. */
      button:focus-visible, input:focus-visible, textarea:focus-visible, [role='switch']:focus-visible {
        outline: 2px solid var(--blue-600);
        outline-offset: 2px;
        border-radius: var(--r-s);
      }

      /* ══ Shell ═════════════════════════════════════════════════════════ */
      .jp-panel {
        position: fixed;
        z-index: 2147483646;
        inset: 0 0 0 auto;
        width: min(392px, 96vw);
        height: 100vh;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        background: var(--surface);
        color: var(--ink);
        font-size: 13px;
        line-height: 1.45;
        box-shadow: -1px 0 0 var(--line-2), -32px 0 80px -48px rgba(13, 40, 97, 0.5);
        animation: jp-slide-in 380ms var(--ease-settle);
      }
      @keyframes jp-slide-in {
        from { transform: translateX(102%); }
        to { transform: translateX(0); }
      }
      .jp-panel-col { position: relative; flex: 1 1 auto; min-width: 0; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }

      /* ══ Header ════════════════════════════════════════════════════════ */
      .jp-panel-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        flex: 0 0 auto;
        height: 68px;
        padding: 0 14px 0 18px;
        background: linear-gradient(180deg, #ffffff, var(--surface));
        border-bottom: 1px solid var(--line);
        box-shadow: 0 1px 0 rgba(255, 255, 255, 0.6), 0 6px 14px -12px rgba(13, 40, 97, 0.28);
        position: relative;
        z-index: 1;
      }
      .jp-brand { display: flex; min-width: 0; align-items: center; gap: 12px; }
      .jp-brand > div { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
      .jp-brand-mark {
        display: grid;
        place-items: center;
        width: 40px;
        height: 40px;
        flex: 0 0 auto;
        border-radius: 11px;
        background: linear-gradient(180deg, #ffffff, var(--blue-50));
        box-shadow: 0 0 0 1px rgba(31, 95, 224, 0.12), 0 6px 14px -8px rgba(31, 95, 224, 0.4);
      }
      .jp-brand-mark img { width: 28px; height: 28px; object-fit: contain; }
      .jp-brand strong { font-size: 19px; font-weight: 800; letter-spacing: -0.02em; color: var(--ink); line-height: 1.15; }

      /* Live status line: the header always says what the copilot is doing. */
      .jp-status {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        max-width: 200px;
        font-size: 12px;
        font-weight: 600;
        color: var(--muted);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .jp-status i {
        flex: 0 0 auto;
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: var(--blue-500);
      }
      .jp-status[data-s='scanning'] i, .jp-status[data-s='planning'] i, .jp-status[data-s='filling'] i {
        animation: jp-dot-pulse 1.1s ease-in-out infinite;
      }
      .jp-status[data-s='done'] i { background: var(--ok); }
      .jp-status[data-s='done'] { color: var(--ok); }
      .jp-status[data-s='error'] i { background: var(--warn); }
      @keyframes jp-dot-pulse {
        0%, 100% { opacity: 1; transform: scale(1); }
        50% { opacity: 0.45; transform: scale(0.8); }
      }

      .jp-header-actions { display: flex; align-items: center; gap: 2px; }
      .jp-text-action {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 6px 9px;
        border-radius: var(--r-s);
        color: var(--muted);
        font-size: 11px;
        font-weight: 700;
        transition: background 140ms var(--ease), color 140ms var(--ease);
      }
      .jp-text-action svg { width: 13px; height: 13px; }
      .jp-full-tracker-action {
        color: var(--blue-700);
        background: var(--blue-50);
      }
      .jp-icon-action {
        display: grid;
        width: 30px;
        height: 30px;
        place-items: center;
        border-radius: var(--r-s);
        color: var(--muted);
        transition: background 140ms var(--ease), color 140ms var(--ease);
      }
      .jp-icon-action svg { width: 16px; height: 16px; }
      .jp-icon-action:hover, .jp-text-action:hover { background: var(--surface-2); color: var(--ink); }

      /* ══ Scroll area ═══════════════════════════════════════════════════ */
      .jp-panel-scroll {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        overflow-x: hidden;
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding: 16px;
        background: var(--canvas);
        scrollbar-width: thin;
        scrollbar-color: var(--line-2) transparent;
      }
      .jp-panel-scroll::-webkit-scrollbar { width: 6px; }
      .jp-panel-scroll::-webkit-scrollbar-thumb { background: var(--line-2); border-radius: 99px; }
      .jp-panel-scroll::-webkit-scrollbar-thumb:hover { background: #c3d0e4; }
      .jp-panel-body { display: flex; flex-direction: column; gap: 12px; }
      .jp-panel-body.jp-fill-body { gap: 12px; }

      /* ══ Footer ════════════════════════════════════════════════════════ */
      .jp-panel-footer {
        flex: 0 0 auto;
        padding: 10px 16px;
        border-top: 1px solid var(--line);
        background: var(--surface);
      }
      .jp-foot-hint { display: flex; align-items: center; gap: 8px; color: var(--muted); font-size: 11px; font-weight: 600; }
      .jp-foot-hint svg { width: 13px; height: 13px; flex: 0 0 auto; color: var(--ok); }
      .jp-synced { display: flex; align-items: center; gap: 8px; color: var(--ok); font-weight: 700; font-size: 12px; }
      .jp-synced svg { width: 15px; height: 15px; flex: 0 0 auto; }
      .jp-synced-error { color: var(--warn); }
      .jp-synced-error span { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
      .jp-synced button {
        margin-left: auto;
        border-radius: 99px;
        background: var(--ok-bg);
        color: var(--ok);
        padding: 4px 11px;
        font-weight: 700;
        font-size: 11px;
        transition: filter 140ms var(--ease);
      }
      .jp-synced button:hover { filter: brightness(0.96); }

      .jp-toast {
        position: absolute;
        z-index: 3;
        top: 68px;
        left: 16px;
        right: 16px;
        display: flex;
        align-items: center;
        gap: 8px;
        min-height: 38px;
        padding: 9px 11px;
        border-radius: var(--r-m);
        background: var(--surface);
        color: var(--ink-2);
        font-size: 12px;
        font-weight: 750;
        box-shadow: 0 0 0 1px rgba(14, 159, 110, 0.2), 0 14px 28px -18px rgba(13, 40, 97, 0.45);
        animation: jp-toast-in 260ms var(--ease-settle) both;
        pointer-events: none;
      }
      .jp-toast svg { width: 15px; height: 15px; flex: 0 0 auto; color: var(--ok); }
      .jp-toast span { min-width: 0; overflow-wrap: anywhere; }
      @keyframes jp-toast-in {
        from { opacity: 0; transform: translateY(-6px) scale(0.985); }
        to { opacity: 1; transform: none; }
      }

      /* ══ Rail — bottom tab bar ═════════════════════════════════════════ */
      .jp-rail {
        flex: 0 0 auto;
        width: 100%;
        display: flex;
        flex-direction: row;
        gap: 6px;
        padding: 8px 10px calc(8px + env(safe-area-inset-bottom, 0px));
        background: linear-gradient(180deg, var(--surface), var(--surface-2));
        border-top: 1px solid var(--line);
        box-shadow: 0 -1px 0 rgba(255, 255, 255, 0.7), 0 -10px 24px -18px rgba(13, 40, 97, 0.3);
      }
      .jp-rail-tab {
        position: relative;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 4px;
        flex: 1 1 0;
        min-width: 0;
        padding: 8px 4px 7px;
        border-radius: var(--r-m);
        color: var(--muted);
        font-size: 11px;
        font-weight: 700;
        letter-spacing: -0.005em;
        transition: background 140ms var(--ease), color 140ms var(--ease), box-shadow 140ms var(--ease), transform 140ms var(--ease);
      }
      .jp-rail-tab svg { width: 21px; height: 21px; transition: transform 160ms var(--ease-settle); }
      .jp-rail-tab:hover { color: var(--blue-700); background: rgba(31, 95, 224, 0.06); }
      .jp-rail-tab:active { transform: scale(0.96); }
      .jp-rail-tab-on {
        background: linear-gradient(180deg, #ffffff, var(--blue-50));
        color: var(--blue-700);
        box-shadow: 0 0 0 1px rgba(31, 95, 224, 0.14), 0 1px 2px rgba(13, 40, 97, 0.05), 0 6px 14px -7px rgba(31, 95, 224, 0.32);
      }
      .jp-rail-tab-on svg { transform: translateY(-1px); }
      .jp-rail-tab-on::before {
        content: "";
        position: absolute;
        top: -8px;
        left: 50%;
        width: 22px;
        height: 3px;
        border-radius: 0 0 99px 99px;
        transform: translateX(-50%);
        background: linear-gradient(90deg, var(--blue-500), var(--blue-600));
      }

      /* ══ Job identity ══════════════════════════════════════════════════ */
      .jp-job-card {
        position: relative;
        display: flex;
        gap: 12px;
        align-items: flex-start;
        padding: 14px;
        border-radius: var(--r-l);
        background: var(--surface);
        box-shadow: var(--ring-card);
      }
      .jp-job-card-review { background: #fffcf5; box-shadow: 0 0 0 1px #f0dcb4; }
      .jp-job-logo {
        display: grid;
        place-items: center;
        width: 40px;
        height: 40px;
        flex: 0 0 auto;
        border-radius: var(--r-m);
        font-weight: 800;
        font-size: 16px;
      }
      .jp-job-logo svg { width: 19px; height: 19px; }
      .jp-job-logo-img { overflow: hidden; background: var(--surface); box-shadow: var(--ring-card); }
      .jp-job-logo-img img { width: 100%; height: 100%; object-fit: contain; }
      .jp-job-meta { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 2px; padding-right: 24px; }
      .jp-job-meta strong { font-size: 13px; font-weight: 800; letter-spacing: -0.01em; color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .jp-job-meta > span { font-size: 12px; font-weight: 600; color: var(--ink-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .jp-job-loc { display: flex; align-items: center; gap: 4px; color: var(--muted); font-size: 11px; font-weight: 600; }
      .jp-job-loc svg { width: 12px; height: 12px; flex: 0 0 auto; }
      .jp-job-review {
        margin-top: 8px;
        display: inline-flex;
        align-self: flex-start;
        align-items: center;
        gap: 6px;
        border-radius: 99px;
        background: var(--warn-bg);
        color: var(--warn);
        padding: 5px 10px;
        font-size: 11px;
        font-weight: 700;
        line-height: 1.35;
        text-align: left;
        transition: filter 140ms var(--ease);
      }
      .jp-job-review:hover { filter: brightness(0.97); }
      .jp-job-review svg { width: 13px; height: 13px; }
      .jp-job-edit { position: absolute; top: 10px; right: 10px; width: 28px; height: 28px; }
      .jp-job-card-edit { flex-direction: column; gap: 12px; }
      .jp-input-label { display: flex; flex-direction: column; gap: 5px; font-size: 11px; font-weight: 700; color: var(--muted); }
      .jp-input {
        width: 100%;
        height: 38px;
        border: 1px solid var(--line-2);
        border-radius: 10px;
        padding: 0 11px;
        background: var(--surface);
        color: var(--ink);
        font-size: 13px;
        font-weight: 600;
        outline: none;
        transition: border-color 140ms var(--ease), box-shadow 140ms var(--ease);
      }
      .jp-input::placeholder { color: var(--muted); font-weight: 500; }
      .jp-input:focus { border-color: var(--blue-500); box-shadow: 0 0 0 3px var(--blue-100); }
      .jp-job-card-actions { display: flex; gap: 8px; justify-content: flex-end; }
      .jp-mini-ghost, .jp-mini-solid {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        border-radius: 10px;
        padding: 8px 13px;
        font-weight: 700;
        font-size: 12px;
        transition: background 140ms var(--ease), color 140ms var(--ease);
      }
      .jp-mini-ghost { color: var(--muted); }
      .jp-mini-ghost:hover { background: var(--surface-2); color: var(--ink); }
      .jp-mini-solid { background: var(--blue-600); color: #fff; }
      .jp-mini-solid:hover { background: var(--blue-700); }
      .jp-mini-ghost svg, .jp-mini-solid svg { width: 14px; height: 14px; }

      /* ══ Primary action ════════════════════════════════════════════════ */
      .jp-action-group { display: flex; flex-direction: column; gap: 8px; }
      .jp-autofill-button {
        display: inline-flex;
        width: 100%;
        height: 56px;
        align-items: center;
        justify-content: center;
        gap: 9px;
        border-radius: var(--r-l);
        background: linear-gradient(180deg, #3b74f2, var(--blue-600) 58%, #1a52cf);
        color: #fff;
        font-weight: 800;
        font-size: 15px;
        letter-spacing: -0.01em;
        box-shadow: var(--shadow-primary);
        transition: background 140ms var(--ease), transform 140ms var(--ease), box-shadow 140ms var(--ease);
      }
      .jp-autofill-button:hover:not(:disabled) {
        background: linear-gradient(180deg, #3369ec, var(--blue-700) 60%, #143f9e);
        transform: translateY(-1px);
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.3), 0 2px 4px rgba(11, 18, 32, 0.18), 0 18px 30px -14px rgba(31, 95, 224, 0.85);
      }
      .jp-autofill-button:active:not(:disabled) { transform: translateY(0); }
      .jp-autofill-button:disabled { cursor: not-allowed; opacity: 0.5; box-shadow: none; }
      .jp-autofill-button svg { width: 19px; height: 19px; }

      .jp-autotrack {
        display: flex;
        align-items: center;
        gap: 9px;
        width: 100%;
        text-align: left;
        border-radius: var(--r-m);
        padding: 9px 12px;
        background: var(--surface);
        box-shadow: var(--ring-card);
        color: var(--muted);
        font-size: 12px;
        font-weight: 600;
        transition: background 160ms var(--ease), color 160ms var(--ease), box-shadow 160ms var(--ease);
      }
      .jp-autotrack > svg { width: 15px; height: 15px; flex: 0 0 auto; transition: color 160ms var(--ease); }
      .jp-autotrack-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .jp-autotrack-on { color: var(--ink); }
      .jp-autotrack-on > svg { color: var(--blue-600); }

      .jp-switch {
        position: relative;
        flex: 0 0 auto;
        width: 36px;
        height: 21px;
        border-radius: 99px;
        background: #c7d3e6;
        transition: background 180ms var(--ease);
      }
      .jp-switch-knob {
        position: absolute;
        top: 2px;
        left: 2px;
        width: 17px;
        height: 17px;
        border-radius: 50%;
        background: #fff;
        box-shadow: 0 1px 3px rgba(13, 40, 97, 0.35);
        transition: transform 200ms var(--ease-settle);
      }
      .jp-switch-sm { width: 32px; height: 19px; }
      .jp-switch-sm .jp-switch-knob { width: 15px; height: 15px; }
      .jp-autotrack-on .jp-switch { background: var(--blue-600); }
      .jp-autotrack-on .jp-switch-sm .jp-switch-knob { transform: translateX(13px); }
      .jp-settings-switch-on.jp-switch { background: var(--blue-600); }
      .jp-settings-switch-on .jp-switch-knob { transform: translateX(15px); }

      /* ══ Settings view ═════════════════════════════════════════════════ */
      .jp-settings { padding: 14px 16px 20px; display: flex; flex-direction: column; gap: 12px; }
      .jp-settings-card { background: var(--surface); border-radius: var(--r-l); box-shadow: var(--ring-card); overflow: hidden; }
      .jp-settings-title {
        padding: 14px 16px 4px;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        color: var(--muted);
      }
      .jp-settings-policy { display: flex; align-items: flex-start; gap: 12px; padding: 8px 16px 16px; }
      .jp-settings-policy-icon {
        display: grid;
        flex: 0 0 auto;
        place-items: center;
        width: 34px;
        height: 34px;
        border-radius: var(--r-m);
        background: var(--blue-50);
        color: var(--blue-700);
      }
      .jp-settings-policy-icon svg { width: 17px; height: 17px; }
      .jp-settings-row {
        display: flex;
        width: 100%;
        align-items: center;
        justify-content: space-between;
        gap: 20px;
        padding: 13px 16px;
        text-align: left;
        border-top: 1px solid var(--line);
        transition: background 140ms var(--ease);
      }
      .jp-settings-row:hover { background: var(--surface-2); }
      .jp-settings-row-last { padding-bottom: 15px; }
      .jp-settings-row-text { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
      .jp-settings-row-label { font-size: 13px; font-weight: 700; color: var(--ink); }
      .jp-settings-row-desc { font-size: 11.5px; font-weight: 500; line-height: 1.45; color: var(--muted); }
      .jp-settings-note {
        display: flex;
        align-items: flex-start;
        gap: 10px;
        padding: 13px 14px;
        border-radius: var(--r-l);
        background: var(--blue-50);
        color: var(--ink);
        font-size: 12px;
        font-weight: 500;
        line-height: 1.5;
      }
      .jp-settings-note svg { flex: 0 0 auto; width: 17px; height: 17px; margin-top: 2px; color: var(--blue-700); }
      .jp-settings-note p { margin: 0; }

      .jp-save-button {
        display: inline-flex;
        width: 100%;
        height: 42px;
        align-items: center;
        justify-content: center;
        gap: 8px;
        border-radius: var(--r-m);
        background: var(--surface);
        box-shadow: var(--ring-card);
        color: var(--ink-2);
        font-weight: 700;
        font-size: 12px;
        transition: background 140ms var(--ease), color 140ms var(--ease), box-shadow 140ms var(--ease);
      }
      .jp-save-button:hover:not(:disabled) { box-shadow: var(--ring-card-hover); color: var(--blue-700); }
      .jp-save-button svg { width: 16px; height: 16px; }
      .jp-save-button:disabled { cursor: default; }
      .jp-save-button:disabled:not(.jp-save-button-done) { opacity: 0.5; }
      .jp-save-button-done { background: var(--ok-bg); box-shadow: none; color: var(--ok); opacity: 1; }

      /* ══ Document generators ═══════════════════════════════════════════ */
      .jp-gen-card {
        position: relative;
        display: flex;
        align-items: center;
        gap: 13px;
        width: 100%;
        text-align: left;
        padding: 13px 14px;
        border-radius: var(--r-l);
        background: var(--surface);
        box-shadow: var(--ring-card);
        overflow: hidden;
        transition: box-shadow 180ms var(--ease), transform 180ms var(--ease), background 180ms var(--ease);
      }
      .jp-gen-card:hover:not(:disabled) {
        transform: translateY(-1px);
        box-shadow: var(--ring-card-hover), var(--shadow-raise);
      }
      .jp-gen-card:active:not(:disabled) { transform: translateY(0); }
      .jp-gen-card:disabled { cursor: default; }
      .jp-gen-busy { background: var(--blue-50); box-shadow: 0 0 0 1px var(--blue-200); }

      .jp-gen-doc { position: relative; width: 40px; height: 48px; flex: 0 0 auto; }
      .jp-gen-sheet { position: absolute; border-radius: 6px; }
      .jp-gen-sheet-back {
        inset: 7px 1px 1px 9px;
        background: var(--blue-100);
        transform: rotate(6deg);
        transform-origin: bottom right;
        transition: transform 220ms var(--ease-settle);
      }
      .jp-gen-card:hover:not(:disabled) .jp-gen-sheet-back, .jp-gen-busy .jp-gen-sheet-back { transform: rotate(10deg); }
      .jp-gen-sheet-front {
        inset: 1px 7px 1px 1px;
        background: #fff;
        box-shadow: 0 0 0 1px var(--line-2), 0 5px 12px -7px rgba(13, 40, 97, 0.4);
        padding: 7px 7px 0;
        display: flex;
        flex-direction: column;
        gap: 3.5px;
        overflow: hidden;
      }
      .jp-gen-line { height: 3px; border-radius: 2px; background: #dbe4f3; }
      .jp-gen-line-head { height: 5px; width: 72%; margin-bottom: 1px; background: var(--blue-500); }
      .jp-gen-line-short { width: 54%; }
      .jp-gen-line-date { width: 38%; align-self: flex-end; }
      .jp-gen-sign { width: 40%; height: 4px; margin-top: auto; margin-bottom: 6px; background: var(--blue-200); }
      .jp-gen-scan {
        position: absolute;
        left: 0;
        right: 0;
        top: -45%;
        height: 45%;
        background: linear-gradient(180deg, transparent, rgba(47, 107, 240, 0.35), transparent);
        opacity: 0;
        pointer-events: none;
      }
      .jp-gen-busy .jp-gen-scan { opacity: 1; animation: jp-scan 1150ms ease-in-out infinite; }
      @keyframes jp-scan { to { transform: translateY(380%); } }

      .jp-gen-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
      .jp-gen-title { font-size: 13px; font-weight: 800; letter-spacing: -0.01em; color: var(--ink); }
      .jp-gen-file { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; font-weight: 600; color: var(--muted); }
      .jp-gen-go {
        display: grid;
        place-items: center;
        width: 30px;
        height: 30px;
        flex: 0 0 auto;
        border-radius: 50%;
        background: var(--blue-50);
        color: var(--blue-700);
        transition: background 180ms var(--ease), transform 220ms var(--ease-settle);
      }
      .jp-gen-go svg { width: 15px; height: 15px; }
      .jp-gen-card:hover:not(:disabled) .jp-gen-go { background: var(--blue-100); transform: translateX(3px); }
      .jp-gen-busy .jp-gen-go { background: var(--blue-600); color: #fff; }

      /* ══ Generation loader ═════════════════════════════════════════════ */
      .jp-gl {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 20px;
        padding: 16px 4px 8px;
        animation: jp-rise 320ms var(--ease-settle) both;
      }
      .jp-gl-ring-wrap { position: relative; width: 148px; height: 148px; flex: 0 0 auto; }
      .jp-gl-ring { width: 148px; height: 148px; transform: rotate(-90deg); overflow: visible; }
      .jp-gl-track { fill: none; stroke: var(--blue-100); stroke-width: 8; }
      .jp-gl-bar {
        fill: none;
        stroke: var(--blue-600);
        stroke-width: 8;
        stroke-linecap: round;
        transition: stroke-dashoffset 140ms linear, stroke 360ms var(--ease);
      }
      .jp-gl-done .jp-gl-bar { stroke: var(--ok); }
      .jp-gl-error .jp-gl-bar { stroke: var(--warn); }

      .jp-gl-orbit { position: absolute; inset: 0; animation: jp-spin 2.4s linear infinite; }
      .jp-gl-orbit::after {
        content: "";
        position: absolute;
        top: -1px;
        left: 50%;
        width: 8px;
        height: 8px;
        margin-left: -4px;
        border-radius: 50%;
        background: #fff;
        box-shadow: 0 0 0 2.5px var(--blue-300), 0 0 10px 2px rgba(47, 107, 240, 0.6);
      }
      .jp-gl-done .jp-gl-orbit, .jp-gl-error .jp-gl-orbit { display: none; }

      .jp-gl-center { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; }
      .jp-gl-num { display: inline-flex; align-items: baseline; gap: 1px; line-height: 1; font-variant-numeric: tabular-nums; }
      .jp-gl-pct { font-size: 38px; font-weight: 800; letter-spacing: -0.03em; color: var(--ink); }
      .jp-gl-unit { font-size: 16px; font-weight: 700; color: var(--muted); }
      .jp-gl-center-warn { width: 34px; height: 34px; color: var(--warn); }
      .jp-gl-center-check { width: 42px; height: 42px; color: var(--ok); stroke-width: 3; animation: jp-pop 380ms var(--ease-settle) both; }
      @keyframes jp-pop { from { transform: scale(0.4); opacity: 0; } to { transform: scale(1); opacity: 1; } }

      .jp-gl-title { font-size: 15px; font-weight: 800; letter-spacing: -0.01em; color: var(--ink); text-align: center; }
      .jp-gl-done .jp-gl-title { color: var(--ok); }
      .jp-gl-error .jp-gl-title { color: var(--warn); }

      .jp-gl-steps { list-style: none; padding: 0; width: 100%; display: flex; flex-direction: column; gap: 2px; }
      .jp-gl-step {
        display: flex;
        align-items: center;
        gap: 11px;
        padding: 9px 12px;
        border-radius: var(--r-m);
        color: var(--muted);
        font-size: 12px;
        font-weight: 600;
        transition: background 240ms var(--ease), color 240ms var(--ease);
      }
      .jp-gl-step-dot {
        flex: 0 0 auto;
        width: 20px;
        height: 20px;
        border-radius: 50%;
        display: grid;
        place-items: center;
        border: 2px solid var(--line-2);
        background: #fff;
        color: #fff;
        transition: border-color 240ms var(--ease), background 240ms var(--ease);
      }
      .jp-gl-step-dot svg { width: 12px; height: 12px; }
      .jp-gl-step-active { background: var(--blue-50); color: var(--blue-700); font-weight: 700; }
      .jp-gl-step-active .jp-gl-step-dot { border-color: var(--blue-500); }
      .jp-gl-step-pulse { width: 8px; height: 8px; border-radius: 50%; background: var(--blue-500); animation: jp-dot-pulse 1s ease-in-out infinite; }
      .jp-gl-step-done { color: var(--ink-2); }
      .jp-gl-step-done .jp-gl-step-dot { border-color: var(--ok); background: var(--ok); }
      .jp-gl-step-error { color: var(--warn); }
      .jp-gl-step-error .jp-gl-step-dot { border-color: var(--warn); background: var(--warn); }

      .jp-gl-foot { display: inline-flex; align-items: center; gap: 7px; text-align: center; font-size: 11px; font-weight: 600; color: var(--muted); }
      .jp-gl-foot svg { width: 13px; height: 13px; flex: 0 0 auto; color: var(--blue-500); }
      .jp-gl-error .jp-gl-foot, .jp-gl-error .jp-gl-foot svg { color: var(--warn); }

      /* ══ Completion card ═══════════════════════════════════════════════ */
      .jp-done-card {
        position: relative;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 14px;
        padding: 12px 16px 18px;
        border-radius: var(--r-l);
        background: var(--surface);
        box-shadow: var(--ring-card);
        animation: jp-rise 320ms var(--ease-settle) both;
      }
      .jp-done-top { width: 100%; display: flex; justify-content: flex-start; }
      .jp-done-back {
        display: inline-flex;
        align-items: center;
        gap: 3px;
        padding: 6px 11px 6px 7px;
        border-radius: var(--r-s);
        color: var(--ink-2);
        font-size: 12px;
        font-weight: 700;
        transition: background 140ms var(--ease), color 140ms var(--ease);
      }
      .jp-done-back:hover { background: var(--surface-2); color: var(--ink); }
      .jp-done-back svg { width: 16px; height: 16px; }
      .jp-done-badge {
        display: grid;
        place-items: center;
        width: 52px;
        height: 52px;
        border-radius: 50%;
        background: var(--ok);
        color: #fff;
        box-shadow: 0 10px 22px -10px rgba(14, 159, 110, 0.85);
        animation: jp-pop 380ms var(--ease-settle) both;
      }
      .jp-done-badge svg { width: 27px; height: 27px; stroke-width: 3; }
      .jp-done-head { display: flex; flex-direction: column; align-items: center; gap: 3px; text-align: center; }
      .jp-done-head strong { font-size: 15px; font-weight: 800; letter-spacing: -0.01em; color: var(--ink); }
      .jp-done-head span { font-size: 12px; font-weight: 600; color: var(--muted); }
      .jp-done-actions { display: flex; flex-direction: column; gap: 8px; width: 100%; }
      .jp-done-primary, .jp-done-secondary {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        width: 100%;
        height: 44px;
        border-radius: var(--r-m);
        font-size: 13px;
        font-weight: 800;
        transition: background 140ms var(--ease), transform 140ms var(--ease), box-shadow 140ms var(--ease);
      }
      .jp-done-primary svg, .jp-done-secondary svg { width: 16px; height: 16px; }
      .jp-done-primary { color: #fff; background: linear-gradient(180deg, #3b74f2, var(--blue-600) 58%, #1a52cf); box-shadow: var(--shadow-primary); }
      .jp-done-primary:hover { background: linear-gradient(180deg, #3369ec, var(--blue-700) 60%, #143f9e); transform: translateY(-1px); }
      .jp-done-secondary { color: var(--blue-700); background: var(--surface); box-shadow: var(--ring-card); }
      .jp-done-secondary:hover { box-shadow: var(--ring-card-hover); }
      .jp-done-primary:active, .jp-done-secondary:active { transform: translateY(0); }
      .jp-done-hint { font-size: 11px; font-weight: 600; color: var(--muted); text-align: center; }

      /* ══ Run experience ════════════════════════════════════════════════ */
      .jp-cancel {
        padding: 6px 10px;
        color: var(--ink-2);
        font-size: 12px;
        font-weight: 700;
        border-radius: var(--r-s);
        transition: background 140ms var(--ease), color 140ms var(--ease);
      }
      .jp-cancel:hover { background: var(--surface-2); color: var(--ink); }
      .jp-progress-head { display: flex; align-items: center; gap: 8px; }
      .jp-progress-head strong { flex: 1; min-width: 0; font-size: 15px; font-weight: 800; letter-spacing: -0.01em; color: var(--ink); }
      .jp-run-back { width: 28px; height: 28px; margin-left: -6px; flex: 0 0 auto; }

      /* Idle-view pointer back to the finished run. */
      .jp-last-run {
        display: flex;
        align-items: center;
        gap: 8px;
        width: 100%;
        text-align: left;
        padding: 10px 12px;
        border-radius: var(--r-m);
        background: var(--surface);
        box-shadow: var(--ring-card);
        color: var(--ink-2);
        font-size: 12px;
        font-weight: 600;
        transition: box-shadow 140ms var(--ease), color 140ms var(--ease);
      }
      .jp-last-run > svg:first-child { width: 15px; height: 15px; flex: 0 0 auto; color: var(--ok); }
      .jp-last-run[data-s='error'] > svg:first-child { color: var(--warn); }
      .jp-last-run > svg:last-child { width: 14px; height: 14px; flex: 0 0 auto; color: var(--muted); }
      .jp-last-run span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-variant-numeric: tabular-nums; }
      .jp-last-run em { font-style: normal; font-weight: 700; color: var(--blue-700); }
      .jp-last-run:hover { box-shadow: var(--ring-card-hover); color: var(--ink); }
      .jp-run-count {
        flex: 0 0 auto;
        font-size: 13px;
        font-weight: 800;
        color: var(--blue-700);
        font-variant-numeric: tabular-nums;
        letter-spacing: -0.01em;
      }
      .jp-run-count em { font-style: normal; font-weight: 600; color: var(--muted); }
      .jp-progress { position: relative; height: 4px; overflow: hidden; border-radius: 99px; background: var(--blue-100); }
      .jp-progress > div {
        height: 100%;
        border-radius: inherit;
        background: var(--blue-600);
        transition: width 360ms var(--ease-settle);
      }
      .jp-progress-live::after {
        content: "";
        position: absolute;
        inset: 0;
        background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.5), transparent);
        transform: translateX(-100%);
        animation: jp-shimmer 1.3s ease-in-out infinite;
      }
      @keyframes jp-shimmer { to { transform: translateX(100%); } }
      .jp-parse-caption { color: var(--muted); font-size: 12px; font-weight: 600; }
      .jp-empty-state {
        border: 1px dashed var(--blue-200);
        border-radius: var(--r-m);
        padding: 16px 14px;
        color: var(--muted);
        font-size: 12px;
        font-weight: 600;
        text-align: center;
        background: var(--surface);
      }

      .jp-checklist { display: flex; flex-direction: column; gap: 14px; }
      .jp-checklist-group { display: flex; flex-direction: column; gap: 3px; }
      .jp-checklist-group h3 {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 8px;
        padding: 0 8px 5px;
        color: var(--muted);
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.05em;
        text-transform: uppercase;
      }
      .jp-checklist-group h3 em {
        font-style: normal;
        font-weight: 700;
        letter-spacing: 0;
        font-variant-numeric: tabular-nums;
        color: var(--ink-2);
      }
      /* Rows are buttons: clicking one scrolls the page to that form field. */
      .jp-field-row {
        display: grid;
        width: 100%;
        min-height: 34px;
        grid-template-columns: 16px minmax(0, 1fr);
        align-items: start;
        gap: 10px;
        border-radius: 10px;
        padding: 8px;
        color: var(--ink-2);
        font-size: 12px;
        font-weight: 600;
        text-align: left;
        transition: background 120ms var(--ease);
      }
      .jp-field-row > svg { margin-top: 1px; }
      .jp-field-row:hover { background: var(--surface-2); }
      .jp-field-row:active { background: var(--line); }
      .jp-field-main { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
      .jp-field-label {
        display: -webkit-box;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 2;
        overflow: hidden;
        overflow-wrap: anywhere;
        line-height: 1.35;
      }
      .jp-field-val {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 11px;
        font-weight: 500;
        color: var(--muted);
      }
      .jp-field-row-warn { background: var(--warn-bg); color: var(--warn-ink); }
      .jp-field-row-warn:hover { background: #f9ead0; }
      .jp-field-row-warn:active { background: #f4e0bd; }
      .jp-field-row-warn .jp-field-val { color: var(--warn); }
      .jp-field-row-active { background: var(--blue-50); color: var(--blue-700); }
      .jp-row-icon { width: 15px; height: 15px; color: #a9b8cd; }
      .jp-ok { color: var(--ok); }
      .jp-warn { color: var(--warn); }

      .jp-message {
        display: grid;
        grid-template-columns: 16px minmax(0, 1fr) auto;
        align-items: center;
        gap: 9px;
        border-radius: var(--r-m);
        padding: 10px 12px;
        font-size: 12px;
        font-weight: 600;
      }
      .jp-message svg { width: 15px; height: 15px; }
      .jp-message button { color: inherit; font-weight: 800; }
      .jp-message-warn { background: var(--warn-bg); color: var(--warn-ink); box-shadow: 0 0 0 1px #f0dcb4; }

      .jp-review-pill {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        width: fit-content;
        max-width: 100%;
        border-radius: 99px;
        padding: 6px 11px;
        font-size: 11px;
        font-weight: 700;
        background: var(--warn-bg);
        color: var(--warn);
      }
      .jp-review-pill svg { width: 13px; height: 13px; flex: 0 0 auto; }
      .jp-review-pill span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .jp-action-note {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        width: fit-content;
        max-width: 100%;
        border-radius: 10px;
        padding: 7px 11px;
        font-size: 11px;
        font-weight: 700;
        background: var(--blue-50);
        color: var(--blue-700);
      }
      .jp-action-note svg { width: 13px; height: 13px; flex: 0 0 auto; }
      .jp-action-note span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

      /* ══ Profile tab ═══════════════════════════════════════════════════ */
      .jp-profile { display: flex; flex-direction: column; gap: 12px; }
      .jp-profile-hint { display: inline-flex; align-items: center; gap: 7px; font-size: 11px; font-weight: 600; color: var(--muted); }
      .jp-profile-hint svg { width: 13px; height: 13px; flex: 0 0 auto; color: var(--blue-500); }
      .jp-profile-empty { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 32px 18px; text-align: center; }
      .jp-profile-empty > svg { width: 28px; height: 28px; color: var(--blue-300); }
      .jp-profile-empty strong { font-size: 14px; font-weight: 800; color: var(--ink); }
      .jp-profile-empty span { font-size: 12px; font-weight: 600; color: var(--muted); max-width: 260px; line-height: 1.5; }
      .jp-pf-open {
        margin-top: 4px;
        height: 38px;
        padding: 0 16px;
        border-radius: 10px;
        font-size: 12px;
        font-weight: 800;
        color: #fff;
        background: var(--blue-600);
        box-shadow: var(--shadow-primary);
        transition: background 140ms var(--ease);
      }
      .jp-pf-open:hover { background: var(--blue-700); }

      .jp-pf-section {
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding: 14px;
        border-radius: var(--r-l);
        background: var(--surface);
        box-shadow: var(--ring-card);
      }
      .jp-pf-section-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
      .jp-pf-section-title { display: inline-flex; align-items: center; gap: 7px; font-size: 12px; font-weight: 800; letter-spacing: -0.005em; color: var(--ink); }
      .jp-pf-section-title svg { width: 15px; height: 15px; color: var(--blue-600); }
      .jp-pf-selectable { -webkit-user-select: text; user-select: text; cursor: text; }

      .jp-copy-btn {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        flex: 0 0 auto;
        padding: 5px;
        border-radius: var(--r-s);
        color: var(--muted);
        transition: background 140ms var(--ease), color 140ms var(--ease);
      }
      .jp-copy-btn svg { width: 14px; height: 14px; }
      .jp-copy-btn:hover { background: var(--blue-50); color: var(--blue-700); }
      .jp-copy-btn-label { padding: 5px 9px; font-size: 11px; font-weight: 700; color: var(--blue-700); background: var(--blue-50); }
      .jp-copy-btn-label:hover { background: var(--blue-100); }
      .jp-copy-done, .jp-copy-done:hover { color: var(--ok); background: var(--ok-bg); }

      .jp-pf-fields { display: flex; flex-direction: column; gap: 2px; }
      .jp-pf-field { display: flex; align-items: center; gap: 10px; padding: 4px 0; }
      .jp-pf-field dt { flex: 0 0 66px; font-size: 11px; font-weight: 700; color: var(--muted); }
      .jp-pf-field dd { flex: 1; min-width: 0; display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; color: var(--ink); }
      .jp-pf-field dd .jp-pf-selectable { min-width: 0; overflow-wrap: anywhere; }
      .jp-pf-field .jp-copy-btn { margin-left: auto; }

      .jp-pf-item { display: flex; flex-direction: column; gap: 6px; padding-top: 10px; border-top: 1px solid var(--line); }
      .jp-pf-section .jp-pf-item:first-of-type { padding-top: 0; border-top: none; }
      .jp-pf-item-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
      .jp-pf-item-title { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
      .jp-pf-item-title strong { font-size: 12px; font-weight: 700; color: var(--ink); overflow-wrap: anywhere; }
      .jp-pf-meta { font-size: 11px; font-weight: 600; color: var(--muted); overflow-wrap: anywhere; }
      .jp-pf-para { font-size: 12px; font-weight: 500; line-height: 1.5; color: var(--ink-2); overflow-wrap: anywhere; }
      .jp-pf-bullets { padding-left: 16px; display: flex; flex-direction: column; gap: 3px; }
      .jp-pf-bullets li { font-size: 12px; font-weight: 500; line-height: 1.45; color: var(--ink-2); }
      .jp-pf-chips { display: flex; flex-wrap: wrap; gap: 6px; }
      .jp-pf-chip {
        padding: 4px 10px;
        border-radius: 99px;
        font-size: 11px;
        font-weight: 700;
        color: var(--blue-700);
        background: var(--blue-50);
      }

      /* ══ Tracker tab ═══════════════════════════════════════════════════ */
      .jp-tracker { display: flex; flex-direction: column; gap: 12px; }
      .jp-tracker-empty { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 34px 18px; text-align: center; color: var(--muted); }
      .jp-tracker-empty > svg { width: 26px; height: 26px; color: var(--blue-300); }
      .jp-tracker-empty strong { font-size: 14px; font-weight: 800; color: var(--ink); }
      .jp-tracker-empty span { font-size: 12px; font-weight: 600; max-width: 240px; line-height: 1.5; }

      /* Segmented control — equal-width tabs on a recessed track, with a
         sliding "glow" chip that follows the active filter. Fits four tabs
         (Saved · Applied · Interview · Offer) in the panel with no scrolling. */
      .jp-tk-tabs {
        position: relative;
        display: flex;
        padding: 4px;
        border-radius: 13px;
        background: var(--surface-2);
        box-shadow: inset 0 0 0 1px var(--line);
        isolation: isolate;
      }
      .jp-tk-tabs-glow {
        position: absolute;
        z-index: 0;
        top: 4px;
        bottom: 4px;
        left: 4px;
        width: calc((100% - 8px) / 4);
        border-radius: 9px;
        background: var(--surface);
        box-shadow: 0 1px 2px rgba(13, 40, 97, 0.14), 0 0 0 1px rgba(31, 95, 224, 0.2);
        transition: transform 300ms var(--ease-settle);
      }
      .jp-tk-tab {
        position: relative;
        z-index: 1;
        flex: 1 1 0;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 7px 4px;
        background: transparent;
        color: var(--ink-2);
        font-size: 11px;
        font-weight: 700;
        letter-spacing: -0.01em;
        white-space: nowrap;
        transition: color 180ms var(--ease);
      }
      .jp-tk-tab:hover { color: var(--ink); }
      .jp-tk-tab-on { color: var(--blue-600); }

      .jp-tk-list { display: flex; flex-direction: column; gap: 10px; }
      .jp-tk-pagination {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        padding: 8px 2px 0;
        color: var(--muted);
        font-size: 11px;
        font-weight: 700;
      }
      .jp-tk-page-summary { min-width: 0; line-height: 1.35; }
      .jp-tk-page-controls {
        display: flex;
        flex: 0 0 auto;
        align-items: center;
        gap: 4px;
      }
      .jp-tk-page-numbers { display: flex; align-items: center; gap: 3px; }
      .jp-tk-pagination button,
      .jp-tk-page-arrow,
      .jp-tk-page-ellipsis {
        display: inline-grid;
        place-items: center;
        width: 28px;
        height: 28px;
        border-radius: var(--r-s);
        font-size: 11px;
        font-weight: 800;
      }
      .jp-tk-pagination button {
        background: var(--surface);
        color: var(--ink-2);
        box-shadow: inset 0 0 0 1px var(--line);
        transition: background 140ms var(--ease), color 140ms var(--ease), box-shadow 140ms var(--ease);
      }
      .jp-tk-pagination button:hover:not(:disabled) {
        background: var(--blue-50);
        color: var(--blue-700);
        box-shadow: inset 0 0 0 1px rgba(31, 95, 224, 0.2);
      }
      .jp-tk-page-arrow svg { width: 15px; height: 15px; }
      .jp-tk-page-arrow-hidden { visibility: hidden; pointer-events: none; }
      .jp-tk-page-number-on:disabled {
        color: var(--blue-700);
        background: var(--blue-50);
        box-shadow: inset 0 0 0 1px rgba(31, 95, 224, 0.24);
        opacity: 1;
      }
      .jp-tk-page-ellipsis { color: var(--muted); }
      .jp-tk-card {
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding: 13px;
        border-radius: var(--r-l);
        background: var(--surface);
        box-shadow: var(--ring-card);
        animation: jp-row-in 280ms var(--ease-settle) both;
      }
      .jp-tk-card-main { display: flex; align-items: flex-start; gap: 11px; }
      .jp-tk-logo { flex: 0 0 auto; width: 40px; height: 40px; border-radius: var(--r-m); overflow: hidden; }
      .jp-tk-logo img { width: 100%; height: 100%; object-fit: cover; }
      .jp-tk-mono { display: grid; place-items: center; width: 100%; height: 100%; border-radius: var(--r-m); font-size: 16px; font-weight: 800; }
      .jp-tk-mono svg { width: 18px; height: 18px; }
      .jp-tk-card-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
      .jp-tk-card-top { display: flex; align-items: center; gap: 8px; }
      .jp-tk-card-top strong { font-size: 13px; font-weight: 800; letter-spacing: -0.01em; color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .jp-tk-match {
        display: inline-flex;
        align-items: center;
        gap: 3px;
        flex: 0 0 auto;
        margin-left: auto;
        padding: 2px 7px;
        border-radius: 99px;
        font-size: 11px;
        font-weight: 700;
        color: var(--ok);
        background: var(--ok-bg);
        font-variant-numeric: tabular-nums;
      }
      .jp-tk-match svg { width: 12px; height: 12px; }
      .jp-tk-role { font-size: 12px; font-weight: 600; color: var(--ink-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .jp-tk-meta { display: flex; align-items: center; gap: 7px; font-size: 11px; font-weight: 600; color: var(--muted); }
      .jp-tk-stage { display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 99px; font-size: 10px; font-weight: 700; letter-spacing: 0.02em; text-transform: uppercase; }
      .jp-tk-stage-applied { background: var(--blue-50); color: var(--blue-700); }
      .jp-tk-stage-inbox { background: #fdf3e3; color: #a15c07; }
      .jp-tk-stage-interview { background: #e8f4fd; color: #0369a1; }
      .jp-tk-stage-offer { background: var(--ok-bg); color: var(--ok); }
      .jp-tk-stage-closed { background: #eef1f5; color: #5c6b80; }
      .jp-tk-open {
        flex: 0 0 auto;
        display: grid;
        place-items: center;
        width: 30px;
        height: 30px;
        border-radius: var(--r-s);
        color: var(--muted);
        transition: background 140ms var(--ease), color 140ms var(--ease);
      }
      .jp-tk-open:hover { background: var(--blue-50); color: var(--blue-700); }
      .jp-tk-open svg { width: 16px; height: 16px; }
      .jp-tk-note-preview {
        padding: 8px 10px;
        border-radius: 10px;
        background: var(--surface-2);
        font-size: 12px;
        font-weight: 500;
        line-height: 1.45;
        color: var(--ink-2);
        overflow-wrap: anywhere;
      }

      .jp-tk-actions { display: flex; gap: 8px; }
      .jp-tk-action {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        flex: 1;
        padding: 9px 10px;
        border-radius: 10px;
        background: var(--surface);
        box-shadow: var(--ring-card);
        color: var(--ink-2);
        font-size: 12px;
        font-weight: 700;
        transition: box-shadow 140ms var(--ease), color 140ms var(--ease), background 140ms var(--ease);
      }
      .jp-tk-action svg { width: 14px; height: 14px; }
      .jp-tk-action:hover { box-shadow: var(--ring-card-hover); color: var(--blue-700); }
      .jp-tk-action-on { background: var(--blue-50); box-shadow: 0 0 0 1px var(--blue-200); color: var(--blue-700); }

      .jp-tk-markmenu, .jp-tk-resumemenu {
        display: flex;
        flex-direction: column;
        gap: 2px;
        padding: 6px;
        border-radius: var(--r-m);
        background: var(--surface);
        box-shadow: var(--ring-card), var(--shadow-pop);
        animation: jp-rise 180ms var(--ease-settle) both;
      }
      .jp-tk-markopt, .jp-tk-resumeopt {
        display: flex;
        align-items: center;
        gap: 9px;
        padding: 9px 10px;
        border-radius: var(--r-s);
        color: var(--ink);
        font-size: 12px;
        font-weight: 600;
        text-align: left;
        transition: background 120ms var(--ease);
      }
      .jp-tk-markopt:hover:not(:disabled), .jp-tk-resumeopt:hover:not(:disabled) { background: var(--surface-2); }
      .jp-tk-markopt:disabled, .jp-tk-resumeopt:disabled { opacity: 0.6; cursor: default; }
      .jp-tk-markopt-on, .jp-tk-resumeopt-on { font-weight: 700; }
      .jp-tk-markopt svg { width: 15px; height: 15px; margin-left: auto; color: var(--blue-600); }
      .jp-tk-dot { width: 8px; height: 8px; border-radius: 50%; flex: 0 0 auto; }
      .jp-tk-dot-inbox { background: #eab308; }
      .jp-tk-dot-applied { background: var(--blue-600); }
      .jp-tk-dot-interview { background: #0ea5e9; }
      .jp-tk-dot-offer { background: var(--ok); }
      .jp-tk-dot-closed { background: #94a3b8; }

      .jp-tk-noteedit { display: flex; flex-direction: column; gap: 8px; animation: jp-rise 180ms var(--ease-settle) both; }
      .jp-tk-noteedit textarea {
        width: 100%;
        resize: vertical;
        min-height: 66px;
        padding: 10px;
        border-radius: var(--r-m);
        border: 1px solid var(--blue-500);
        box-shadow: 0 0 0 3px var(--blue-100);
        background: var(--surface);
        color: var(--ink);
        font: inherit;
        font-size: 12px;
        font-weight: 500;
        outline: none;
      }
      .jp-tk-noteedit textarea::placeholder { color: var(--muted); }
      .jp-tk-noteedit-foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
      .jp-tk-count { font-size: 11px; font-weight: 600; color: var(--muted); font-variant-numeric: tabular-nums; }
      .jp-tk-noteedit-btns { display: flex; gap: 8px; }
      .jp-tk-note-cancel, .jp-tk-note-save { padding: 7px 14px; border-radius: var(--r-s); font-size: 12px; font-weight: 700; }
      .jp-tk-note-cancel { background: var(--surface); box-shadow: var(--ring-card); color: var(--ink-2); }
      .jp-tk-note-cancel:hover { background: var(--surface-2); }
      .jp-tk-note-save { color: #fff; background: var(--blue-600); }
      .jp-tk-note-save:hover:not(:disabled) { background: var(--blue-700); }
      .jp-tk-note-save:disabled { opacity: 0.6; cursor: default; }

      .jp-tk-resume {
        display: flex;
        align-items: center;
        gap: 7px;
        padding: 7px 10px;
        border-radius: 10px;
        background: var(--surface-2);
        font-size: 11px;
        font-weight: 600;
        color: var(--ink-2);
      }
      .jp-tk-resume svg { width: 14px; height: 14px; flex: 0 0 auto; color: var(--blue-600); }
      .jp-tk-resume span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .jp-tk-resumemenu-head { padding: 2px 6px 6px; font-size: 12px; font-weight: 800; color: var(--ink); }
      .jp-tk-resume-loading { display: flex; align-items: center; gap: 7px; padding: 10px 6px; font-size: 12px; font-weight: 600; color: var(--muted); }
      .jp-tk-resume-loading svg { width: 14px; height: 14px; }
      .jp-tk-resumeopt svg { width: 15px; height: 15px; flex: 0 0 auto; color: var(--blue-600); }
      .jp-tk-resumeopt-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .jp-tk-resumeopt-on > svg:last-child { color: var(--blue-600); }
      .jp-tk-resume-upload {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-top: 4px;
        padding: 9px 8px;
        border-top: 1px solid var(--line);
        border-radius: 0 0 var(--r-s) var(--r-s);
        color: var(--blue-700);
        font-size: 12px;
        font-weight: 700;
      }
      .jp-tk-resume-upload:hover:not(:disabled) { background: var(--blue-50); }
      .jp-tk-resume-upload:disabled { opacity: 0.65; cursor: default; }
      .jp-tk-resume-upload svg { width: 15px; height: 15px; }
      .jp-tk-resume-err { padding: 6px 8px; font-size: 11px; font-weight: 600; color: var(--warn); }

      /* ══ Collapsed handle ══════════════════════════════════════════════ */
      .jp-tab-handle {
        position: fixed;
        z-index: 2147483646;
        right: 16px;
        transform: translateY(-50%);
        animation: jp-tab-in 320ms var(--ease-settle);
        touch-action: none;
      }
      .jp-collapse-wrap { position: relative; width: 64px; height: 64px; }
      .jp-collapse-tab {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 64px;
        height: 64px;
        border-radius: 50%;
        background: radial-gradient(125% 125% at 32% 22%, #4b80f5, var(--blue-600) 52%, #1a4fca);
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.32), 0 2px 6px rgba(13, 40, 97, 0.28), 0 16px 32px -10px rgba(31, 95, 224, 0.5);
        cursor: grab;
        transition: box-shadow 160ms var(--ease), transform 200ms var(--ease-settle), background 160ms var(--ease);
        touch-action: none;
      }
      .jp-collapse-wrap:hover .jp-collapse-tab {
        background: radial-gradient(125% 125% at 32% 22%, #4276f0, var(--blue-700) 54%, #143f9e);
        transform: scale(1.05);
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.32), 0 3px 8px rgba(13, 40, 97, 0.3), 0 20px 38px -10px rgba(31, 95, 224, 0.58);
      }
      .jp-collapse-tab:active { cursor: grabbing; transform: scale(0.98); }

      .jp-handle-grip {
        position: absolute;
        left: 5px;
        top: 50%;
        transform: translate(-3px, -50%);
        display: grid;
        grid-template-columns: repeat(2, 3px);
        grid-auto-rows: 3px;
        gap: 3px;
        opacity: 0;
        pointer-events: none;
        transition: opacity 160ms var(--ease), transform 160ms var(--ease);
      }
      .jp-handle-grip i { width: 3px; height: 3px; border-radius: 50%; background: rgba(255, 255, 255, 0.85); }
      .jp-collapse-wrap:hover .jp-handle-grip { opacity: 1; transform: translate(0, -50%); }

      .jp-handle-close {
        position: absolute;
        top: -3px;
        left: -3px;
        display: grid;
        place-items: center;
        width: 24px;
        height: 24px;
        border-radius: 50%;
        background: #fff;
        color: var(--ink-2);
        box-shadow: 0 3px 10px -2px rgba(13, 40, 97, 0.4), inset 0 0 0 1px rgba(13, 40, 97, 0.08);
        opacity: 0;
        transform: scale(0.6);
        pointer-events: none;
        transition: opacity 140ms var(--ease), transform 180ms var(--ease-settle), background 140ms var(--ease), color 140ms var(--ease);
      }
      .jp-handle-close svg { width: 14px; height: 14px; stroke-width: 2.5; }
      .jp-handle-close:hover { background: var(--ink); color: #fff; }
      .jp-collapse-wrap:hover .jp-handle-close { opacity: 1; transform: scale(1); pointer-events: auto; }
      .jp-collapse-mark {
        position: relative;
        width: 52px;
        height: 52px;
        border-radius: 50%;
        background: #fff;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .jp-collapse-mark > img { width: 42px; height: 42px; object-fit: contain; pointer-events: none; }
      .jp-collapse-badge {
        position: absolute;
        right: -5px;
        bottom: -5px;
        width: 22px;
        height: 22px;
        border-radius: 50%;
        background: #fff;
        border: 2px solid #fff;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
        box-shadow: 0 2px 6px rgba(13, 40, 97, 0.3);
        pointer-events: none;
      }
      .jp-collapse-badge img { width: 14px; height: 14px; object-fit: contain; border-radius: 50%; }
      @keyframes jp-tab-in {
        from { transform: translate(46px, -50%); opacity: 0; }
        to { transform: translate(0, -50%); opacity: 1; }
      }

      /* ══ Motion utilities ══════════════════════════════════════════════ */
      .jp-rise { animation: jp-rise 260ms var(--ease-settle) both; }
      @keyframes jp-rise { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: none; } }
      .jp-row-in { animation: jp-row-in 260ms var(--ease-settle) both; }
      @keyframes jp-row-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
      .jp-spin { animation: jp-spin 850ms linear infinite; }
      @keyframes jp-spin { to { transform: rotate(360deg); } }

      @media (prefers-reduced-motion: reduce) {
        .jp-panel, .jp-tab-handle, .jp-rise, .jp-row-in, .jp-done-badge, .jp-gl, .jp-done-card,
        .jp-tk-card, .jp-tk-markmenu, .jp-tk-resumemenu, .jp-tk-noteedit, .jp-gl-center-check, .jp-toast { animation: none !important; }
        .jp-progress > div, .jp-gl-bar, .jp-switch-knob { transition: none !important; }
        .jp-progress-live::after, .jp-gen-scan { display: none; }
        .jp-status i, .jp-gl-step-pulse, .jp-gl-orbit { animation: none !important; }
        .jp-gen-card:hover:not(:disabled), .jp-autofill-button:hover:not(:disabled), .jp-done-primary:hover { transform: none; }
      }
      @media (max-width: 440px) {
        .jp-panel { width: 100vw; box-shadow: none; }
      }
    `}</style>
  );
}
