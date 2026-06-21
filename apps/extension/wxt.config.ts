import tailwindcss from "@tailwindcss/vite";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "wxt";

const EXTENSION_NAME = "JobPosted";
const webEnvPath = fileURLToPath(new URL("../web/.env.local", import.meta.url));

function readEnvFile(path: string) {
  if (!existsSync(path)) return {};
  return Object.fromEntries(
    readFileSync(path, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const [key, ...valueParts] = line.split("=");
        const rawValue = valueParts.join("=").trim();
        const value = rawValue.replace(/^['"]|['"]$/g, "");
        return [key.trim(), value];
      }),
  );
}

const webEnv = readEnvFile(webEnvPath) as Record<string, string | undefined>;

function env(name: string, fallbackName?: string) {
  return process.env[name] || webEnv[fallbackName ?? name] || "";
}

function cleanOrigin(value: string) {
  return value.replace(/\/+$/, "");
}

const configuredWebOrigin = cleanOrigin(
  env("WXT_JOBPOSTED_WEB_ORIGIN") || "https://jobposted.app",
);
const configuredSupabaseUrl = env("WXT_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL");
const configuredSupabaseAnonKey = env("WXT_SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY");

const includeLocalhost =
  process.env.WXT_INCLUDE_LOCALHOST === "1" ||
  process.env.INCLUDE_LOCALHOST === "1" ||
  /^http:\/\/(localhost|127\.0\.0\.1)(?::\d+)?$/i.test(configuredWebOrigin);

function originMatch(origin: string) {
  try {
    const url = new URL(origin);
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
      return `${url.protocol}//${url.hostname}/*`;
    }
    return `${url.origin}/*`;
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
  ...(includeLocalhost ? ["http://localhost/*", "http://127.0.0.1/*"] : []),
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
const UNIVERSAL_AUTOFILL_HOSTS = ["https://*/*", "http://*/*"];

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
    define: {
      "import.meta.env.WXT_JOBPOSTED_WEB_ORIGIN": JSON.stringify(configuredWebOrigin),
      "import.meta.env.WXT_SUPABASE_URL": JSON.stringify(configuredSupabaseUrl),
      "import.meta.env.WXT_SUPABASE_ANON_KEY": JSON.stringify(configuredSupabaseAnonKey),
      "import.meta.env.WXT_INCLUDE_LOCALHOST": JSON.stringify(includeLocalhost ? "1" : ""),
    },
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
    permissions: ["storage", "activeTab", "scripting", "alarms", "cookies", "sidePanel"],
    host_permissions: [...UNIVERSAL_AUTOFILL_HOSTS, ...ATS_HOSTS, ...JOBPOSTED_HOSTS, ...API_HOSTS],
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
