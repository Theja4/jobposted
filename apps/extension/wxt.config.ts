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
// Publishable logo.dev key — client-safe (it ships in <img src=img.logo.dev?token=…>),
// baked in so the panel can render real company logos without a round-trip.
const configuredLogoDevToken = env("WXT_LOGO_DEV_TOKEN", "LOGO_DEV_PUBLISHABLE_KEY");

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

function unique(values: string[]) {
  return values.filter((value, index, all) => all.indexOf(value) === index);
}

const JOBPOSTED_HOSTS = [
  originMatch(configuredWebOrigin),
  "https://jobposted.app/*",
  "https://www.jobposted.app/*",
  "https://jobposted.ai/*",
  "https://www.jobposted.ai/*",
  ...(includeLocalhost ? ["http://localhost/*", "http://127.0.0.1/*"] : []),
];

const ATS_HOSTS = [
  "https://*.adp.com/*",
  "https://*.ashbyhq.com/*",
  "https://*.avature.net/*",
  "https://*.bamboohr.com/*",
  "https://*.brassring.com/*",
  "https://*.eightfold.ai/*",
  "https://*.greenhouse.io/*",
  "https://*.icims.com/*",
  "https://*.icimscloud.com/*",
  "https://*.jobvite.com/*",
  "https://*.lever.co/*",
  "https://*.myworkdayjobs.com/*",
  "https://*.oraclecloud.com/*",
  "https://*.paycomonline.net/*",
  "https://*.paylocity.com/*",
  "https://*.personio.com/*",
  "https://*.phenompeople.com/*",
  "https://*.recruitee.com/*",
  "https://*.rippling.com/*",
  "https://*.smartrecruiters.com/*",
  "https://*.successfactors.com/*",
  "https://*.taleo.net/*",
  "https://*.teamtailor.com/*",
  "https://*.ultipro.com/*",
  "https://*.workable.com/*",
  "https://adp.com/*",
  "https://ashbyhq.com/*",
  "https://bamboohr.com/*",
  "https://*.myworkdayjobs.com/*",
  "https://boards.greenhouse.io/*",
  "https://eightfold.ai/*",
  "https://greenhouse.io/*",
  "https://icims.com/*",
  "https://job-boards.greenhouse.io/*",
  "https://*.greenhouse.io/*",
  "https://jobs.ashbyhq.com/*",
  "https://jobs.lever.co/*",
  "https://jobvite.com/*",
  "https://lever.co/*",
  "https://oraclecloud.com/*",
  "https://smartrecruiters.com/*",
  "https://workable.com/*",
];

const JOB_BOARD_HOSTS = [
  "https://*.builtin.com/*",
  "https://*.dice.com/*",
  "https://*.flexjobs.com/*",
  "https://*.glassdoor.com/*",
  "https://*.indeed.com/*",
  "https://*.linkedin.com/*",
  "https://*.monster.com/*",
  "https://*.remote.co/*",
  "https://*.remotive.com/*",
  "https://*.simplyhired.com/*",
  "https://*.wellfound.com/*",
  "https://*.weworkremotely.com/*",
  "https://*.ziprecruiter.com/*",
  "https://angel.co/*",
  "https://builtin.com/*",
  "https://dice.com/*",
  "https://flexjobs.com/*",
  "https://glassdoor.com/*",
  "https://*.dover.com/*",
  "https://himalayas.app/*",
  "https://indeed.com/*",
  "https://jobs.workable.com/*",
  "https://linkedin.com/*",
  "https://monster.com/*",
  "https://otta.com/*",
  "https://remote.co/*",
  "https://remoteok.com/*",
  "https://remotive.com/*",
  "https://simplyhired.com/*",
  "https://wellfound.com/*",
  "https://weworkremotely.com/*",
  "https://www.glassdoor.com/*",
  "https://www.linkedin.com/*",
  "https://www.remoteok.com/*",
  "https://www.wellfound.com/*",
  "https://www.ziprecruiter.com/*",
  "https://ziprecruiter.com/*",
];

const COMPANY_CAREER_HOSTS = [
  "https://*.adobe.com/*",
  "https://*.airbnb.com/*",
  "https://*.amazon.jobs/*",
  "https://*.apple.com/*",
  "https://*.atlassian.com/*",
  "https://*.bytedance.com/*",
  "https://*.canva.com/*",
  "https://*.databricks.com/*",
  "https://*.figma.com/*",
  "https://*.google.com/*",
  "https://*.microsoft.com/*",
  "https://*.netflix.com/*",
  "https://*.notion.so/*",
  "https://*.openai.com/*",
  "https://*.salesforce.com/*",
  "https://*.shopify.com/*",
  "https://*.stripe.com/*",
  "https://*.uber.com/*",
  "https://*.vercel.com/*",
  "https://adobe.com/*",
  "https://airbnb.com/*",
  "https://amazon.jobs/*",
  "https://apple.com/*",
  "https://atlassian.com/*",
  "https://bytedance.com/*",
  "https://canva.com/*",
  "https://careers.google.com/*",
  "https://careers.microsoft.com/*",
  "https://databricks.com/*",
  "https://figma.com/*",
  "https://jobs.apple.com/*",
  "https://jobs.careers.microsoft.com/*",
  "https://jobs.netflix.com/*",
  "https://metacareers.com/*",
  "https://microsoft.com/*",
  "https://netflix.com/*",
  "https://notion.so/*",
  "https://openai.com/*",
  "https://salesforce.com/*",
  "https://shopify.com/*",
  "https://stripe.com/*",
  "https://uber.com/*",
  "https://vercel.com/*",
  "https://www.google.com/*",
  "https://www.metacareers.com/*",
  "https://www.microsoft.com/*",
  "https://www.stripe.com/*",
];

const SUPPORTED_AUTOFILL_HOSTS = unique([...ATS_HOSTS, ...JOB_BOARD_HOSTS, ...COMPANY_CAREER_HOSTS]);
const WEB_ACCESSIBLE_HOSTS = unique([...SUPPORTED_AUTOFILL_HOSTS, ...JOBPOSTED_HOSTS]);
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
    build:
      process.env.WXT_DEBUG_BUILD === "1"
        ? {
            minify: false,
            sourcemap: true,
          }
        : undefined,
    define: {
      "import.meta.env.WXT_JOBPOSTED_WEB_ORIGIN": JSON.stringify(configuredWebOrigin),
      "import.meta.env.WXT_SUPABASE_URL": JSON.stringify(configuredSupabaseUrl),
      "import.meta.env.WXT_SUPABASE_ANON_KEY": JSON.stringify(configuredSupabaseAnonKey),
      "import.meta.env.WXT_LOGO_DEV_TOKEN": JSON.stringify(configuredLogoDevToken),
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
    permissions: ["storage", "activeTab", "scripting", "alarms", "cookies"],
    host_permissions: unique([...SUPPORTED_AUTOFILL_HOSTS, ...JOBPOSTED_HOSTS, ...API_HOSTS]),
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
    web_accessible_resources: [
      {
        resources: ["brand/*", "icon/*", "fonts/*"],
        matches: WEB_ACCESSIBLE_HOSTS,
      },
    ],
    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'self';",
    },
  },
});
