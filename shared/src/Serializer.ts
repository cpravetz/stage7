// mapSerializer.ts
export interface SerializedMap {
    _type: 'Map';
    entries: [string, any][];
}

export class MapSerializer {
    static serialize(map: Map<string, any>): SerializedMap {
        return {
            _type: 'Map',
            entries: Array.from(map.entries())
        };
    }

    static deserialize(serialized: SerializedMap): Map<string, any> {
        if (serialized._type !== 'Map') {
            return new Map(); // this wont' happen we check before calling this method
        }
        return new Map(serialized.entries);
    }

    static isSerializedMap(obj: any): obj is SerializedMap {
        return obj && obj._type === 'Map' && Array.isArray(obj.entries);
    }

    // Recursively transforms Maps in an object for serialization
    static transformForSerialization(obj: any): any {
        try {
            if (obj instanceof Map) {
                return MapSerializer.serialize(obj);
            } else if (Array.isArray(obj)) {
                return obj.map(item => MapSerializer.transformForSerialization(item));
            } else if (obj && typeof obj === 'object') {
                const transformed: Record<string, any> = {};
                for (const [key, value] of Object.entries(obj)) {
                    transformed[key] = MapSerializer.transformForSerialization(value);
                }
                return transformed;
            }
            return obj;
        } catch (error) {
            console.error('Error transforming object for serialization:', error);
            return '';
        }
    }

    // Recursively restores Maps in a deserialized object
    static transformFromSerialization(obj: any): any {
        if (MapSerializer.isSerializedMap(obj)) {
            return MapSerializer.deserialize(obj);
        } else if (Array.isArray(obj)) {
            return obj.map(item => MapSerializer.transformFromSerialization(item));
        } else if (obj && typeof obj === 'object') {
            const transformed: Record<string, any> = {};
            for (const [key, value] of Object.entries(obj)) {
                transformed[key] = MapSerializer.transformFromSerialization(value);
            }
            return transformed;
        }
        return obj;
    }
}