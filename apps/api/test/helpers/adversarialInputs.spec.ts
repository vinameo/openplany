import { adversarialBodies } from './adversarialInputs.js';

describe('adversarialBodies', () => {
  const valid = {
    name: 'Web',
    icon: { color: '#000000' },
    tags: [{ id: 'a' }],
  };
  const cases = adversarialBodies(valid);
  const byLabel = new Map(cases.map((c) => [c.label, c.body]));

  it('breaks the body as a whole', () => {
    expect(byLabel.get('body is an array')).toEqual([]);
    expect(byLabel.get('body is an empty object')).toEqual({});
  });

  it('removes each field, nested ones and array items included', () => {
    expect(byLabel.get('name missing')).toEqual({
      icon: { color: '#000000' },
      tags: [{ id: 'a' }],
    });
    expect(byLabel.get('icon.color missing')).toEqual({
      name: 'Web',
      icon: {},
      tags: [{ id: 'a' }],
    });
    expect(byLabel.get('tags.0 missing')).toEqual({
      name: 'Web',
      icon: { color: '#000000' },
      tags: [],
    });
    expect(byLabel.get('tags.0.id missing')).toEqual({
      name: 'Web',
      icon: { color: '#000000' },
      tags: [{}],
    });
  });

  it('replaces each field with values of another shape', () => {
    expect(byLabel.get('icon is an array')).toMatchObject({ icon: [] });
    expect(byLabel.get('name is a NUL character')).toMatchObject({
      name: 'a\u0000b',
    });
    expect(byLabel.get('icon.color is null')).toMatchObject({
      icon: { color: null },
    });
  });

  it('leaves the valid body untouched', () => {
    expect(valid).toEqual({
      name: 'Web',
      icon: { color: '#000000' },
      tags: [{ id: 'a' }],
    });
  });
});
