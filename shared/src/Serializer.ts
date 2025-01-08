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
            return new Map(); // this won't happen, we check before calling this method
        }
        return new Map(serialized.entries);
    }

    static isSerializedMap(obj: any): obj is SerializedMap {
        return obj && obj._type === 'Map' && Array.isArray(obj.entries);
    }

    // Recursively transforms Maps in an object for serialization
    static transformForSerialization(obj: any): any {
        if (obj === null || obj === undefined) return obj;
        
        // Handle top-level Map specifically
        if (obj instanceof Map) {
            return MapSerializer.serialize(obj);
        }
    
        const stack: Array<{
            current: any,
            result: any,
            keys?: string[],
            currentKey?: string,
            index?: number,
            isArray?: boolean
        }> = [];
       
        stack.push({ current: obj, result: undefined });
       
        while (stack.length > 0) {
            const frame = stack[stack.length - 1];
           
            try {
                if (frame.current instanceof Map) {
                    frame.result = MapSerializer.serialize(frame.current);
                    stack.pop();
                }
                else if (Array.isArray(frame.current)) {
                    if (frame.index === undefined) {
                        frame.index = 0;
                        frame.result = new Array(frame.current.length);
                        frame.isArray = true;
                    }
                   
                    if (frame.index < frame.current.length) {
                        stack.push({
                            current: frame.current[frame.index],
                            result: undefined
                        });
                        frame.index++;
                    } else {
                        stack.pop();
                    }
                }
                else if (frame.current && typeof frame.current === 'object') {
                    if (!frame.keys) {
                        frame.keys = Object.keys(frame.current);
                        frame.result = {};
                        frame.index = 0;
                    }
                   
                    if (frame.index! < frame.keys.length) {
                        const key = frame.keys[frame.index!];
                        stack.push({
                            current: frame.current[key],
                            result: undefined,
                            currentKey: key
                        });
                        frame.index!++;
                    } else {
                        stack.pop();
                    }
                }
                else {
                    frame.result = frame.current;
                    stack.pop();
                }
               
                if (stack.length > 1) {
                    const parent = stack[stack.length - 2];
                    if (parent.isArray) {
                        parent.result[parent.index! - 1] = frame.result;
                    } else if (parent.keys) {
                        parent.result[frame.currentKey!] = frame.result;
                    }
                }
            } catch (error) {
                console.error('Error transforming object for serialization:', error);
                return obj;
            }
        }
       
        return stack[0]?.result ?? obj;
    }

    
    // Recursively restores Maps in a deserialized object
    static transformFromSerialization(obj: any): any {
        if (obj === null || obj === undefined) return obj;

        // Handle top-level SerializedMap
        if (MapSerializer.isSerializedMap(obj)) {
            return MapSerializer.deserialize(obj);
        }

        const stack: Array<{
            current: any,
            result: any,
            keys?: string[],
            currentKey?: string,
            index?: number,
            isArray?: boolean
        }> = [];

        stack.push({ current: obj, result: undefined });

        while (stack.length > 0) {
            const frame = stack[stack.length - 1];

            try {
                if (MapSerializer.isSerializedMap(frame.current)) {
                    frame.result = MapSerializer.deserialize(frame.current);
                    stack.pop();
                }
                else if (Array.isArray(frame.current)) {
                    if (frame.index === undefined) {
                        frame.index = 0;
                        frame.result = new Array(frame.current.length);
                        frame.isArray = true;
                    }
                    if (frame.index < frame.current.length) {
                        stack.push({
                            current: frame.current[frame.index],
                            result: undefined
                        });
                        frame.index++;
                    } else {
                        stack.pop();
                    }
                }
                else if (typeof frame.current === 'object' && frame.current !== null) {
                    if (frame.keys === undefined) {
                        frame.keys = Object.keys(frame.current);
                        frame.result = {};
                    }

                    if (frame.keys.length > 0) {
                        const key = frame.keys.pop()!;
                        frame.currentKey = key;
                        stack.push({
                            current: frame.current[key],
                            result: undefined
                        });
                    } else {
                        stack.pop();
                    }
                }
                else {
                    frame.result = frame.current;
                    stack.pop();
                }

                if (stack.length > 1) {
                    const parent = stack[stack.length - 2];
                    if (parent.isArray) {
                        parent.result[parent.index! - 1] = frame.result;
                    } else if (parent.keys) {
                        parent.result[frame.currentKey!] = frame.result;
                    }
                }
            } catch (error) {
                console.error('Error transforming object from serialization:', error);
                return obj;
            }
        }

        return stack[0]?.result ?? obj;
    }
    
}