export enum ContentConversationType {
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
}
export class Model {
    public name: string;
    public modelName: string;
    public interfaceKey: string;
    public costScore: number;
    public accuracyScore: number;
    public creativityScore: number;
    public speedScore: number;
    public contentConversation: ContentConversationType;

constructor(
    options: {
        name: string,
        modelName: string,
        interfaceKey: string,
        costScore: number,
        accuracyScore: number,
        creativityScore: number,
        speedScore: number,
        contentConversation: ContentConversationType }) {
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