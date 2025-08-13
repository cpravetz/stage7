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
    static transformForSerialization(obj: any, visited = new WeakSet()): any {
        if (obj === null || obj === undefined) return obj;

        // Prevent circular references
        if (typeof obj === 'object' && obj !== null) {
            if (visited.has(obj)) {
                return '[Circular Reference]';
            }
            visited.add(obj);
        }

        if (obj instanceof Map) {
            const result = this.serialize(obj);
            visited.delete(obj);
            return result;
        } else if (Array.isArray(obj)) {
            const result = obj.map(item => this.transformForSerialization(item, visited));
            visited.delete(obj);
            return result;
        } else if (typeof obj === 'object' && obj !== null) {
            const result: any = {};
            for (const [key, value] of Object.entries(obj)) {
                result[key] = this.transformForSerialization(value, visited);
            }
            visited.delete(obj);
            return result;
        }
        return obj;
    }


    // Recursively restores Maps in a deserialized object
    static transformFromSerialization(obj: any, visited = new WeakSet()): any {
        if (obj === null || obj === undefined) return obj;

        // Handle circular reference markers
        if (obj === '[Circular Reference]') {
            return obj;
        }

        // Prevent circular references during deserialization
        if (typeof obj === 'object' && obj !== null) {
            if (visited.has(obj)) {
                return '[Circular Reference]';
            }
            visited.add(obj);
        }

        if (obj && obj._type === 'Map') {
            const result = new Map(obj.entries);
            visited.delete(obj);
            return result;
        } else if (Array.isArray(obj)) {
            const result = obj.map(item => this.transformFromSerialization(item, visited));
            visited.delete(obj);
            return result;
        } else if (typeof obj === 'object' && obj !== null) {
            const result: any = {};
            for (const [key, value] of Object.entries(obj)) {
                result[key] = this.transformFromSerialization(value, visited);
            }
            visited.delete(obj);
            return result;
        }
        return obj;
    }

}