export enum LLMConversionType {
    TextToText = 'text/text',
    TextToImage = 'text/image',
    TextToAudio = 'text/audio',
    TextToVideo = 'text/video',
    AudioToText = 'audio/text',
    ImageToText = 'image/text',
    ImageToImage = 'image/image',
    ImageToAudio = 'image/audio',
    ImageToVideo = 'image/video',
    VideoToText = 'video/text',
    VideoToImage = 'video/image',
    VideoToAudio = 'video/audio',
    VideoToVideo = 'video/video',
    TextToCode = 'text/code',
    CodeToText = 'code/text',
}
export class Model {
    public name: string;
    public modelName: string;
    public interfaceKey: string;
    public costScore: number;
    public accuracyScore: number;
    public creativityScore: number;
    public speedScore: number;
    public contentConversation: LLMConversionType[];

constructor(
    options: {
        name: string,
        modelName: string,
        interfaceKey: string,
        costScore: number,
        accuracyScore: number,
        creativityScore: number,
        speedScore: number,
        contentConversation: LLMConversionType[] }) {
        this.name = options.name;
        this.modelName = options.modelName;
        this.interfaceKey = options.interfaceKey;
        this.costScore = options.costScore;
        this.accuracyScore = options.accuracyScore;
        this.creativityScore = options.creativityScore;
        this.speedScore = options.speedScore;
        this.contentConversation = options.contentConversation;
    }
}