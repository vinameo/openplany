/**
 * Adversarial inputs (CLAUDE.md §8 design pass): every way a client can break
 * one valid JSON body. An endpoint must answer each with 4xx, never 500.
 */

export interface AdversarialCase {
  label: string;
  body: unknown;
}

const REPLACEMENTS: readonly (readonly [string, unknown])[] = [
  ['null', null],
  ['an array', []],
  ['an object', {}],
  ['a number', 12345],
  ['a boolean', true],
  ['an empty string', ''],
  ['a NUL character', 'a\u0000b'],
  ['a control character', 'a\u0007b'],
  ['10 000 characters', 'x'.repeat(10_000)],
];

type Path = readonly (string | number)[];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function edit(
  root: unknown,
  path: Path,
  change: (
    parent: Record<string | number, unknown>,
    key: string | number,
  ) => void,
): unknown {
  const copy: unknown = structuredClone(root);
  let parent = copy as Record<string | number, unknown>;
  for (const key of path.slice(0, -1)) {
    parent = parent[key] as Record<string | number, unknown>;
  }
  change(parent, path[path.length - 1]!);
  return copy;
}

function collectPaths(value: unknown, path: Path, out: Path[]): void {
  if (isPlainObject(value)) {
    for (const [key, child] of Object.entries(value)) {
      out.push([...path, key]);
      collectPaths(child, [...path, key], out);
    }
  } else if (Array.isArray(value) && value.length > 0) {
    out.push([...path, 0]);
    collectPaths(value[0], [...path, 0], out);
  }
}

/** Cases for a valid body: each field (nested objects and the first array item included) missing or replaced by a value of another shape. */
export function adversarialBodies(
  valid: Record<string, unknown>,
): AdversarialCase[] {
  const cases: AdversarialCase[] = [
    { label: 'body is an array', body: [] },
    { label: 'body is an empty object', body: {} },
  ];
  const paths: Path[] = [];
  collectPaths(valid, [], paths);

  for (const path of paths) {
    const name = path.join('.');
    cases.push({
      label: `${name} missing`,
      body: edit(valid, path, (parent, key) => {
        if (Array.isArray(parent)) parent.splice(Number(key), 1);
        else delete parent[key];
      }),
    });
    for (const [label, replacement] of REPLACEMENTS) {
      cases.push({
        label: `${name} is ${label}`,
        body: edit(valid, path, (parent, key) => {
          parent[key] = structuredClone(replacement);
        }),
      });
    }
  }
  return cases;
}

/**
 * Sends every case and fails with the list of cases answered with 5xx.
 * `send` gets the case index so the caller can rotate users past rate limits.
 */
export async function expectNoServerErrors(
  cases: readonly AdversarialCase[],
  send: (
    body: unknown,
    index: number,
  ) => Promise<{ status: number; body: unknown }>,
): Promise<void> {
  const failures: string[] = [];
  let blocked = 0;
  for (const [index, c] of cases.entries()) {
    const res = await send(c.body, index);
    if (res.status >= 500) {
      failures.push(`${c.label}: ${res.status} ${JSON.stringify(res.body)}`);
    }
    if ([401, 403, 429].includes(res.status)) blocked += 1;
  }
  expect(failures).toEqual([]);
  // Cases stopped by auth or a rate limit never reached validation.
  expect(blocked, 'most cases must reach validation').toBeLessThan(
    cases.length / 2,
  );
}
