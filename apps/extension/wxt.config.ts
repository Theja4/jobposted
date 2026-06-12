import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "wxt";

const EXTENSION_NAME = "JobPosted";

const includeLocalhost =
  process.env.NODE_ENV !== "production" || process.env.INCLUDE_LOCALHOST === "1";

const JOBPOSTED_HOSTS = [
  "https://jobposted.ai/*",
  "https://www.jobposted.ai/*",
  ...(includeLocalhost ? ["http://localhost:3000/*"] : []),
];

const ATS_HOSTS = [
  "https://*.myworkdayjobs.com/*",
  "https://boards.greenhouse.io/*",
  "https://*.greenhouse.io/*",
  "https://jobs.lever.co/*",
  "https://jobs.ashbyhq.com/*",
  "https://*.ashbyhq.com/*",
  "https://www.linkedin.com/*",
  "https://*.icims.com/*",
  "https://*.workable.com/*",
  "https://*.smartrecruiters.com/*",
  "https://*.taleo.net/*",
  "https://*.oraclecloud.com/*",
  "https://*.successfactors.com/*",
  "https://*.jobvite.com/*",
  "https://*.bamboohr.com/*",
  "https://*.dover.com/*",
  "https://*.indeed.com/*",
  "https://*.rippling.com/*",
  "https://*.paylocity.com/*",
];

const API_HOSTS = ["https://*.supabase.co/*"];

export default defineConfig({
  manifestVersion: 3,
  modules: ["@wxt-dev/module-react"],
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: {
    name: EXTENSION_NAME,
    short_name: "JobPosted",
    description:
      "Autofill login-gated job applications with your JobPosted master profile and tailored resume.",
    icons: {
      16: "icon/16.png",
      32: "icon/32.png",
      48: "icon/48.png",
      96: "icon/96.png",
      128: "icon/128.png",
    },
    permissions: ["storage", "activeTab", "scripting"],
    host_permissions: [...ATS_HOSTS, ...JOBPOSTED_HOSTS, ...API_HOSTS],
    action: {
      default_title: EXTENSION_NAME,
      default_icon: {
        16: "icon/16.png",
        32: "icon/32.png",
        48: "icon/48.png",
        96: "icon/96.png",
        128: "icon/128.png",
      },
    },
    options_ui: {
      page: "options.html",
      open_in_tab: true,
    },
    externally_connectable: {
      matches: JOBPOSTED_HOSTS,
    },
    web_accessible_resources: [
      {
        resources: ["brand/*", "icon/*"],
        matches: ATS_HOSTS,
      },
    ],
    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'self';",
    },
  },
});
