export function failUnsupportedBotTableTool(toolName: string): never {
  console.error(`${toolName} is not implemented yet. Bot table CSV import scaffolding must not be treated as a successful validation or import.`);
  process.exit(1);
}
