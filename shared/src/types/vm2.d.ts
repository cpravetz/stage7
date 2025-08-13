declare module 'vm2' {
  export interface VMOptions {
    timeout?: number;
    sandbox?: any;
    eval?: boolean;
    wasm?: boolean;
    allowAsync?: boolean;
    compiler?: string;
  }

  export class VM {
    constructor(options?: VMOptions);
    run(script: VMScript | string): any;
    freeze(object: any, name: string): void;
    protect(object: any, name: string): void;
  }

  export interface VMScriptOptions {
    filename?: string;
    lineOffset?: number;
    columnOffset?: number;
  }

  export class VMScript {
    constructor(code: string, filename?: string, options?: VMScriptOptions);
    compile(): VMScript;
  }

  export interface NodeVMOptions extends VMOptions {
    console?: 'inherit' | 'redirect' | 'off';
    require?: boolean | {
      external?: boolean | string[];
      builtin?: string[];
      root?: string;
      mock?: Record<string, any>;
    };
    nesting?: boolean;
    wrapper?: 'commonjs' | 'none';
    sourceExtensions?: string[];
  }

  export class NodeVM {
    constructor(options?: NodeVMOptions);
    run(script: VMScript | string, filename?: string): any;
    freeze(object: any, name: string): void;
    protect(object: any, name: string): void;
    require(module: string): any;
  }
}
