declare module '@apidevtools/json-schema-ref-parser' {
  class $RefParser {
    static dereference(obj: any): Promise<any>;
    static bundle(obj: any): Promise<any>;
    static resolve(obj: any): Promise<any>;
    static parse(obj: any): Promise<any>;
  }
  
  export default $RefParser;
}
