declare module "bun:test" {
  type Matcher = {
    toBe(expected: unknown): void;
    toContain(expected: string): void;
    not: Matcher;
  };

  export function expect(actual: unknown): Matcher;
  export function test(name: string, fn: () => void | Promise<void>): void;
}
