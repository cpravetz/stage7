import { BaseService, ExchangeType } from '../services/baseService';

export enum LLMConversationType {
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

export type converterType = {
    conversationType : LLMConversationType,
    requiredParams: string[],
    converter : Function
}

export type ConvertParamsType = {
    service: BaseService,
    prompt?: string,
    modelName?: string,
    audio? : string,
    video? : string,
    image? : string,
    file? : string,
    input?: string,
    text?: string,
    language?: string,
    quality?: string,
    style?: string,
    mask?: string,
    voice?: string,
    temperature?: number,
    response_format?: string,
    size?: string,
    messages?: ExchangeType[],
    max_length?: number,
    format?: string,
}

export abstract class BaseInterface {
    abstract interfaceName: string;
    converters: Map<LLMConversationType, converterType> = new Map();

    constructor() {

    }

    abstract chat(service: BaseService, messages: ExchangeType, options: { max_length?: number, temperature?: number }): Promise<string>;

    abstract convert(service: BaseService, conversionType: LLMConversationType, convertParams: ConvertParamsType): Promise<any> ;

}

export default BaseInterface;