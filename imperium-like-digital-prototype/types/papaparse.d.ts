declare module "papaparse" {
  export type ParseError = { message: string };
  export type ParseResult<T> = { data: T[]; errors: ParseError[] };

  export function parse<T = Record<string, string>>(input: string, config: { header: true; skipEmptyLines: true }): ParseResult<T>;
  export function parse<T = Record<string, string>>(input: string, config?: unknown): ParseResult<T>;
  export function unparse<T>(rows: T[], config?: unknown): string;

  const Papa: {
    parse: typeof parse;
    unparse: typeof unparse;
  };

  export default Papa;
}
