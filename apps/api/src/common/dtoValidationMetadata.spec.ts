import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getMetadataStorage } from 'class-validator';
import { en } from '@repo/contracts';
import { decodeValidationMessage } from './validation.js';

const SRC_DIR = join(import.meta.dirname, '..');

/** Every class exported by a `*.dto.ts` file, so a new DTO is checked without being listed. */
async function loadAllDtoClasses(): Promise<Function[]> {
  const files = readdirSync(SRC_DIR, { recursive: true, encoding: 'utf8' })
    .filter((file) => file.endsWith('.dto.ts'))
    .sort();
  const classes: Function[] = [];
  for (const file of files) {
    const module = (await import(join(SRC_DIR, file))) as Record<string, unknown>;
    for (const value of Object.values(module)) {
      if (typeof value === 'function') classes.push(value);
    }
  }
  return classes;
}

function keyExistsInEnCatalog(key: string): boolean {
  const [ns, ...rest] = key.split(':');
  const path = rest.join(':');
  const nsCatalog = (en as Record<string, Record<string, unknown>>)[ns];
  if (!nsCatalog) return false;
  return nsCatalog[path] !== undefined;
}

describe('DTO Validation Metadata (AC-14, BA M-5)', () => {
  it('every constraint with a custom message uses a valid MessageRef in the en catalog', async () => {
    const storage = getMetadataStorage();
    const dtos = await loadAllDtoClasses();
    let totalConstraintsWithCustomMessage = 0;

    // Request DTOs from every feature module, not only the ones listed by hand.
    expect(dtos.length).toBeGreaterThanOrEqual(20);
    for (const dto of dtos) {
      const metadatas = storage.getTargetValidationMetadatas(dto, '', true, false);
      for (const meta of metadatas) {
        // Skip class-validator internal default message for nested validation
        if (
          meta.type === 'nestedValidation' &&
          typeof meta.message === 'string' &&
          meta.message.includes('must be either object or array')
        ) {
          continue;
        }

        if (meta.message !== undefined && meta.message !== null && meta.message !== '') {
          totalConstraintsWithCustomMessage++;
          const ref = decodeValidationMessage(meta.message);
          expect(
            ref,
            `Expected ${dto.name}.${meta.propertyName} (${meta.name ?? meta.type}) message to decode to a MessageRef, received: ${String(meta.message)}`,
          ).not.toBeNull();

          expect(
            ref?.key,
            `Expected ${dto.name}.${meta.propertyName} MessageRef to have a string key`,
          ).toBeTypeOf('string');

          const exists = keyExistsInEnCatalog(ref!.key);
          expect(
            exists,
            `Key "${ref!.key}" used in ${dto.name}.${meta.propertyName} does not exist in the "en" contracts catalog`,
          ).toBe(true);
        }
      }
    }

    // Verify we tested a substantial set of custom messages across DTOs
    expect(totalConstraintsWithCustomMessage).toBeGreaterThan(25);
  });
});
