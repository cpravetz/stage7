import { MapSerializer, SerializedMap } from '../src/Serializer';

describe('MapSerializer', () => {
  describe('serialize', () => {
    it('should serialize a Map correctly', () => {
        const map = new Map<string, string | number>([['key1', 'value1'], ['key2', 2]]);
      const serialized = MapSerializer.serialize(map);
      expect(serialized).toEqual({
        _type: 'Map',
        entries: [['key1', 'value1'], ['key2', 2]]
      });
    });
  });

  describe('deserialize', () => {
    it('should deserialize a SerializedMap correctly', () => {
      const serialized: SerializedMap = {
        _type: 'Map',
        entries: [['key1', 'value1'], ['key2', 2]]
      };
      const deserialized = MapSerializer.deserialize(serialized);
      expect(deserialized).toBeInstanceOf(Map);
      expect(Array.from(deserialized.entries())).toEqual([['key1', 'value1'], ['key2', 2]]);
    });

    it('should throw an error for invalid serialized data', () => {
      const invalid = { _type: 'NotAMap', entries: [] };
      expect(() => MapSerializer.deserialize(invalid as SerializedMap)).toThrow('Invalid serialized Map data');
    });
  });

  describe('isSerializedMap', () => {
    it('should return true for valid SerializedMap objects', () => {
      const valid: SerializedMap = { _type: 'Map', entries: [] };
      expect(MapSerializer.isSerializedMap(valid)).toBe(true);
    });

    it('should return false for invalid objects', () => {
      expect(MapSerializer.isSerializedMap({ _type: 'NotAMap' })).toBe(false);
      expect(MapSerializer.isSerializedMap(null)).toBe(false);
      expect(MapSerializer.isSerializedMap(undefined)).toBe(false);
      expect(MapSerializer.isSerializedMap({ entries: [] })).toBe(false);
    });
  });

  describe('transformForSerialization', () => {
    it('should transform Maps in nested objects', () => {
      const nested = {
        map: new Map([['key', 'value']]),
        array: [new Map([['arrayKey', 'arrayValue']])],
        object: { nestedMap: new Map([['nestedKey', 'nestedValue']]) }
      };
      const transformed = MapSerializer.transformForSerialization(nested);
      expect(transformed).toEqual({
        map: { _type: 'Map', entries: [['key', 'value']] },
        array: [{ _type: 'Map', entries: [['arrayKey', 'arrayValue']] }],
        object: { nestedMap: { _type: 'Map', entries: [['nestedKey', 'nestedValue']] } }
      });
    });

    it('should not modify non-Map values', () => {
      const data = { string: 'value', number: 42, boolean: true };
      const transformed = MapSerializer.transformForSerialization(data);
      expect(transformed).toEqual(data);
    });
  });

  describe('transformFromSerialization', () => {
    it('should restore Maps in nested objects', () => {
      const serialized = {
        map: { _type: 'Map', entries: [['key', 'value']] },
        array: [{ _type: 'Map', entries: [['arrayKey', 'arrayValue']] }],
        object: { nestedMap: { _type: 'Map', entries: [['nestedKey', 'nestedValue']] } }
      };
      const deserialized = MapSerializer.transformFromSerialization(serialized);
      expect(deserialized.map).toBeInstanceOf(Map);
      expect(deserialized.array[0]).toBeInstanceOf(Map);
      expect(deserialized.object.nestedMap).toBeInstanceOf(Map);
      expect(Array.from(deserialized.map.entries())).toEqual([['key', 'value']]);
      expect(Array.from(deserialized.array[0].entries())).toEqual([['arrayKey', 'arrayValue']]);
      expect(Array.from(deserialized.object.nestedMap.entries())).toEqual([['nestedKey', 'nestedValue']]);
    });

    it('should not modify non-SerializedMap values', () => {
      const data = { string: 'value', number: 42, boolean: true };
      const deserialized = MapSerializer.transformFromSerialization(data);
      expect(deserialized).toEqual(data);
    });
  });
});