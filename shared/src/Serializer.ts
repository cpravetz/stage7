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

    static deserialize(obj: any): Map<any, any> {
        if (obj._type === 'Map' && Array.isArray(obj.entries)) {
            return new Map(obj.entries);
        }
        return new Map();
    }

    static isSerializedMap(obj: any): any {
        return obj && obj._type === 'Map' && Array.isArray(obj.entries);
    }

    // Recursively transforms Maps in an object for serialization
    static transformForSerialization(obj: any): any {
        if (obj === null || obj === undefined) return obj;
        
        if (obj instanceof Map) {
            return this.serialize(obj);
        } else if (Array.isArray(obj)) {
            return obj.map(item => this.transformForSerialization(item));
        } else if (typeof obj === 'object' && obj !== null) {
            const result: any = {};
            for (const [key, value] of Object.entries(obj)) {
                result[key] = this.transformForSerialization(value);
            }
            return result;
        }
        return obj;
    }

    
    // Recursively restores Maps in a deserialized object
    static transformFromSerialization(obj: any): any {
        if (obj && obj._type === 'Map') {
            return this.deserialize(obj);
        } else if (Array.isArray(obj)) {
            return obj.map(item => this.transformFromSerialization(item));
        } else if (typeof obj === 'object' && obj !== null) {
            const result: any = {};
            for (const [key, value] of Object.entries(obj)) {
                result[key] = this.transformFromSerialization(value);
            }
            return result;
        }
        return obj;
    }

}