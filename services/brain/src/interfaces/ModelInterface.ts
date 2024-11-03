export abstract class ModelInterface {
    abstract name: string;
    abstract generate(messages: string[], options: { max_length?: number, temperature?: number }): Promise<string>;
}