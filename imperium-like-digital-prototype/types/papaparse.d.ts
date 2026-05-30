declare module "papaparse" {
  export interface ParseResult<T> {
    data: T[];
    errors: Array<{ message: string }>;
  }

  export function parse<T>(input: string, config?: unknown): ParseResult<T>;
  export function unparse<T>(rows: T[], config?: unknown): string;

  const Papa: {
    parse: typeof parse;
    unparse: typeof unparse;
  };

  export default Papa;
}
