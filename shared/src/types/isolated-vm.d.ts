declare module 'isolated-vm' {
  export interface IsolateOptions {
    memoryLimit?: number;
    inspector?: boolean;
    snapshot?: Buffer;
  }

  export class Isolate {
    constructor(options?: IsolateOptions);
    createContext(): Promise<Context>;
    compileScript(code: string): Promise<Script>;
    compileScriptSync(code: string): Script;
    createSnapshot(scripts?: Array<{ code: string; filename?: string }>): Buffer;
    dispose(): void;
  }

  export interface ContextOptions {
    inspector?: boolean;
  }

  export class Context {
    constructor(isolate: Isolate, options?: ContextOptions);
    global: Reference<object>;
    eval(code: string): Promise<any>;
    evalSync(code: string): any;
    evalClosure(code: string, args?: any[]): Promise<any>;
    evalClosureSync(code: string, args?: any[]): any;
    release(): void;
  }

  export interface ScriptOptions {
    filename?: string;
    lineOffset?: number;
    columnOffset?: number;
    cachedData?: Buffer;
    produceCachedData?: boolean;
  }

  export class Script {
    constructor(isolate: Isolate, code: string, options?: ScriptOptions);
    run(context: Context): Promise<any>;
    runSync(context: Context): any;
    runIgnored(): Promise<void>;
    runIgnoredSync(): void;
    createCachedData(): Buffer;
    release(): void;
  }

  export interface ReferenceOptions {
    copy?: boolean;
    reference?: boolean;
    promise?: boolean;
  }

  export class Reference<T> {
    constructor(isolate: Isolate, value: T, options?: ReferenceOptions);
    deref(): Promise<T>;
    derefSync(): T;
    release(): void;
    copy(): Promise<T>;
    copySync(): T;
    typeof(): Promise<string>;
    typeofSync(): string;
    set(key: string, value: any, options?: ReferenceOptions): Promise<void>;
    setSync(key: string, value: any, options?: ReferenceOptions): void;
    get(key: string, options?: ReferenceOptions): Promise<Reference<any>>;
    getSync(key: string, options?: ReferenceOptions): Reference<any>;
    delete(key: string): Promise<boolean>;
    deleteSync(key: string): boolean;
  }
}
