import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "wxt";

const EXTENSION_NAME = "JobPosted";
const configuredWebOrigin = process.env.WXT_JOBPOSTED_WEB_ORIGIN || "https://jobposted.app";

const includeLocalhost =
  process.env.WXT_INCLUDE_LOCALHOST === "1" ||
  process.env.INCLUDE_LOCALHOST === "1" ||
  configuredWebOrigin.startsWith("http://localhost");

function originMatch(origin: string) {
  try {
    return `${new URL(origin).origin}/*`;
  } catch {
    return "https://jobposted.app/*";
  }
}

const JOBPOSTED_HOSTS = [
  originMatch(configuredWebOrigin),
  "https://jobposted.app/*",
  "https://www.jobposted.app/*",
  "https://jobposted.ai/*",
  "https://www.jobposted.ai/*",
  ...(includeLocalhost ? ["http://localhost:3000/*"] : []),
].filter((value, index, all) => all.indexOf(value) === index);

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
  dev: {
    server: {
      port: 3001,
    },
  },
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
    permissions: ["storage", "activeTab", "scripting", "alarms"],
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
