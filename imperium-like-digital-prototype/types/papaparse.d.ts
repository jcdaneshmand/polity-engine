declare module "papaparse" {
  export type ParseError = { message: string };
  export type ParseResult<T> = { data: T[]; errors: ParseError[] };
  const Papa: {
    parse<T = Record<string, string>>(input: string, config: { header: true; skipEmptyLines: true }): ParseResult<T>;
  };
  export default Papa;
}
