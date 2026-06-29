import { Settings } from "lucide-react";

const SUPPORTED = [
  "LinkedIn",
  "Greenhouse",
  "Workday",
  "Lever",
  "Ashby",
  "iCIMS",
  "Workable",
];

export function PopupApp() {
  return (
    <main className="jp-popup">
      <span className="jp-mark">
        <img src={chrome.runtime.getURL("brand/jobposted-mark.png")} alt="" />
      </span>

      <div className="jp-copy">
        <h1>Open a job application</h1>
        <p>
          JobPosted runs on job application forms. This page isn’t one yet — open
          a posting and click the JobPosted icon to autofill it.
        </p>
      </div>

      <div className="jp-chips" aria-label="Supported job sites">
        {SUPPORTED.map((name) => (
          <span key={name} className="jp-chip">
            {name}
          </span>
        ))}
        <span className="jp-chip jp-chip-more">+ more</span>
      </div>

      <button
        type="button"
        className="jp-settings"
        onClick={() => chrome.runtime.openOptionsPage()}
      >
        <Settings aria-hidden="true" />
        Settings
      </button>
    </main>
  );
}
