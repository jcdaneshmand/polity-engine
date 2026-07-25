import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { privateImportSources, type PrivateImportSource } from "./privateImportSources";

export type PrivateCsvScaffoldResult = {
  created: string[];
  existing: string[];
};

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function readHeaderLine(filePath: string): string {
  const content = fs.readFileSync(filePath, "utf8");
  const firstLine = content.split(/\r?\n/, 1)[0]?.trimEnd();
  if (!firstLine) throw new Error(`Template has no CSV header: ${filePath}`);
  return firstLine;
}

export function scaffoldPrivateCsvSources(args: {
  root: string;
  sources?: PrivateImportSource[];
}): PrivateCsvScaffoldResult {
  const root = path.resolve(args.root);
  const created: string[] = [];
  const existing: string[] = [];

  for (const source of args.sources ?? privateImportSources) {
    const inputPath = path.join(root, source.input);
    if (fs.existsSync(inputPath)) {
      existing.push(source.input);
      continue;
    }

    const templatePath = path.join(root, source.template);
    if (!fs.existsSync(templatePath)) throw new Error(`Missing scaffold template: ${source.template}`);
    fs.mkdirSync(path.dirname(inputPath), { recursive: true });
    fs.writeFileSync(inputPath, `${readHeaderLine(templatePath)}\n`, "utf8");
    created.push(source.input);
  }

  return { created, existing };
}

if (process.argv[1] && path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1])) {
  try {
    const result = scaffoldPrivateCsvSources({ root: arg("--root") ?? "." });
    process.stdout.write("Private CSV scaffold complete.\n");
    if (result.created.length > 0) {
      process.stdout.write("Created local ignored private CSV files:\n");
      for (const file of result.created) process.stdout.write(`- ${file}\n`);
    }
    if (result.existing.length > 0) {
      process.stdout.write("Left existing private CSV files unchanged:\n");
      for (const file of result.existing) process.stdout.write(`- ${file}\n`);
    }
    if (result.created.length === 0 && result.existing.length === 0) process.stdout.write("No private CSV sources configured.\n");
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}
