export abstract class ModelInterface {
    abstract name: string;
    abstract generate(messages: Array<{ role: string, content: string }>, options: { max_length?: number, temperature?: number }): Promise<string>;
}