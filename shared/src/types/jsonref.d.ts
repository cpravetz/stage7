declare module 'jsonref' {
  export function resolveRefs(obj: any): any;
  export function resolveRefsAt(url: string): Promise<any>;
  export default {
    resolveRefs,
    resolveRefsAt
  };
}
