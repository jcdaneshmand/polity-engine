import { pathToFileURL } from "node:url";
import { buildBrowserQAConfig, runBrowserQA } from "./local-browser-qa.mjs";

export function buildHostedBrowserQAConfig(env = process.env) {
  const baseURL = env.POLITY_HOSTED_BASE_URL ?? env.POLITY_BROWSER_QA_BASE_URL;
  if (!baseURL) {
    throw new Error("Set POLITY_HOSTED_BASE_URL to the deployed Polity Engine origin.");
  }
  return buildBrowserQAConfig({
    ...env,
    POLITY_BROWSER_QA_BASE_URL: baseURL
  });
}

async function main() {
  const result = await runBrowserQA(buildHostedBrowserQAConfig());
  console.log(JSON.stringify(result, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
