import { BaseInterface, LLMConversationType, ConvertParamsType } from './baseInterface';
import { analyzeError } from '@cktmcs/errorhandler';
import { BaseService, ExchangeType } from '../services/baseService';
import fs from 'fs';
import { GoogleGenerativeAI } from '@google/generative-ai';

export class GeminiInterface extends BaseInterface {
    interfaceName = 'gemini';

    // Helper method to process image parts from the response
    private processImageParts(parts: any[]): string {
        for (const part of parts) {
            if (part.inlineData) {
                // Save the image to a file
                const imageData = part.inlineData.data;
                const buffer = Buffer.from(imageData, 'base64');

                // Generate a unique filename
                const timestamp = Date.now();
                const filename = `gemini-image-${timestamp}.png`;
                const outputPath = `./generated-images/${filename}`;

                // Ensure the directory exists
                const dir = './generated-images';
                if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir, { recursive: true });
                }

                // Write the image file
                fs.writeFileSync(outputPath, buffer);
                console.log(`Image saved as ${outputPath}`);

                // Return the path to the saved image
                return outputPath;
            }
        }

        // If no image was found in the response
        return 'No image was found in the response';
    }

    constructor() {
        super();
        this.converters.set(LLMConversationType.TextToText, {
            conversationType: LLMConversationType.TextToText,
            requiredParams: ['service', 'prompt'],
            converter: this.convertTextToText,
        });
        this.converters.set(LLMConversationType.TextToCode, {
            conversationType: LLMConversationType.TextToCode,
            requiredParams: ['service', 'prompt'],
            converter: this.convertTextToText,
        });
        this.converters.set(LLMConversationType.TextToImage, {
            conversationType: LLMConversationType.TextToImage,
            requiredParams: ['service', 'prompt'],
            converter: this.convertTextToImage,
        });
        this.converters.set(LLMConversationType.ImageToText, {
            conversationType: LLMConversationType.ImageToText,
            requiredParams: ['service', 'image', 'prompt'],
            converter: this.convertImageToText,
        });
    }

    async convertTextToText(args: ConvertParamsType): Promise<string> {
        const { service, prompt, modelName } = args;
        const messages: ExchangeType = [{ role: 'user', content: prompt || '' }];
        return this.chat(service, messages, { modelName });
    }

    async convertImageToText(args: ConvertParamsType): Promise<string> {
        const { service, image, prompt } = args;
        if (!image || !prompt) {
            console.log('No image file provided or prompt');
            return '';
        }

        if (!service || !service.isAvailable() || !service.apiKey) {
            throw new Error('Gemini service is not available or API key is missing');
        }

        try {
            // Initialize the Google Generative AI client
            const genAI = new GoogleGenerativeAI(service.apiKey);

            // Use gemini-1.5-pro-vision model for image analysis
            const modelName = args.modelName || 'gemini-1.5-pro-vision';
            const model = genAI.getGenerativeModel({ model: modelName });

            // Read the image file
            let imageData: Buffer;
            try {
                imageData = fs.readFileSync(image);
            } catch (err) {
                console.error(`Error reading image file ${image}:`, err);
                throw new Error(`Failed to read image file: ${image}`);
            }

            // Convert image to base64
            const imageBase64 = imageData.toString('base64');

            // Determine MIME type based on file extension
            const fileExtension = image.split('.').pop()?.toLowerCase() || '';
            let mimeType = 'image/jpeg'; // Default

            if (fileExtension === 'png') {
                mimeType = 'image/png';
            } else if (fileExtension === 'gif') {
                mimeType = 'image/gif';
            } else if (fileExtension === 'webp') {
                mimeType = 'image/webp';
            }

            // Create the content parts with both image and text
            const imagePart = {
                inlineData: {
                    data: imageBase64,
                    mimeType: mimeType
                }
            };

            const promptPart = {
                text: prompt
            };

            console.log(`Sending image analysis request to Gemini with model ${modelName}`);

            // Generate content with the image and prompt
            const result = await model.generateContent([imagePart, promptPart]);
            const response = result.response;
            return response.text();
        } catch (error) {
            analyzeError(error as Error);
            console.error('Error in Gemini image analysis:', error instanceof Error ? error.message : error);
            throw error;
        }
    }

    async convertTextToImage(args: ConvertParamsType): Promise<string> {
        const { service, prompt } = args;
        if (!prompt) {
            console.log('No prompt provided for image generation');
            return '';
        }

        if (!service || !service.isAvailable() || !service.apiKey) {
            throw new Error('Gemini service is not available or API key is missing');
        }

        try {
            // Initialize the Google Generative AI client
            const genAI = new GoogleGenerativeAI(service.apiKey);

            // Use gemini-1.5-pro model for image generation
            const modelName = args.modelName || 'gemini-1.5-pro';
            const model = genAI.getGenerativeModel({ model: modelName });

            console.log(`Sending image generation request to Gemini with model ${modelName}`);

            // Generate image from text prompt
            // Note: The exact API for image generation might vary based on the version of the library
            // This is based on the example provided, but may need adjustments
            try {
                // First try with the structure from the example
                const result = await (model as any).generateContent({
                    contents: prompt,
                    generationConfig: {
                        responseModalities: ['TEXT', 'IMAGE'],
                    }
                });

                // Process the response
                const response = result.response;

                // Check if candidates exist
                if (response.candidates && response.candidates.length > 0 &&
                    response.candidates[0].content && response.candidates[0].content.parts) {
                    const parts = response.candidates[0].content.parts;
                    return this.processImageParts(parts);
                }

                // If we get here, try the alternative approach
                if (response.text) {
                    return response.text();
                }

                // If we have parts directly on the response
                if (response.parts) {
                    return this.processImageParts(response.parts);
                }

                return 'Image generation response format not recognized';
            } catch (error) {
                // If the first approach fails, try a simpler approach
                console.log('First image generation approach failed, trying alternative:', error);

                const result = await model.generateContent(prompt);
                const response = result.response;
                return response.text();
            }


        } catch (error) {
            analyzeError(error as Error);
            console.error('Error in Gemini image generation:', error instanceof Error ? error.message : error);

            // Check if the error is related to the model not being available
            if (error instanceof Error && error.message.includes('not found')) {
                return 'Image generation model is not available. This feature may be in experimental stage or requires special access.';
            }

            throw error;
        }
    }

    async chat(service: BaseService, messages: ExchangeType, options: { max_length?: number, temperature?: number, modelName?: string }): Promise<string> {
        try {
            if (!service || !service.isAvailable() || !service.apiKey) {
                throw new Error('Gemini service is not available or API key is missing');
            }

            // Initialize the Google Generative AI client
            const genAI = new GoogleGenerativeAI(service.apiKey);

            // Try to get model info
            try {
                console.log('Trying to get Gemini model info...');
                // We can't list models directly, but we can try a known model
                genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });
                console.log('Successfully created model instance for gemini-1.5-pro');
            } catch (err) {
                console.error('Error creating Gemini model instance:', err);
            }

            // Get the model name from options or use a default
            // Strip the 'google/' prefix if present
            let modelName = options.modelName || 'gemini-1.5-pro';
            if (modelName.startsWith('google/')) {
                modelName = modelName.substring(7); // Remove 'google/' prefix
            }

            console.log(`Using Gemini model: ${modelName}`);

            // Create the model instance
            // Note: The Google Generative AI client uses v1 by default
            const model = genAI.getGenerativeModel({
                model: modelName,
                generationConfig: {
                    temperature: options.temperature || 0.7,
                    maxOutputTokens: options.max_length || 2048,
                    topP: 0.95,
                    topK: 40,
                }
            });

            // Format messages for Gemini API
            const formattedMessages = messages.map(msg => {
                return {
                    role: msg.role === 'user' ? 'user' : 'model',
                    parts: [{ text: msg.content || '' }]
                };
            });

            console.log(`Sending request to Gemini with model ${modelName}`);

            // For single message, use generateContent
            if (messages.length === 1) {
                const prompt = messages[0].content || '';
                const result = await model.generateContent(prompt);
                const response = result.response;
                return response.text();
            }
            // For chat conversations, use startChat and sendMessage
            else {
                // Create a chat session
                const chat = model.startChat({
                    history: formattedMessages.slice(0, -1), // All messages except the last one
                    generationConfig: {
                        temperature: options.temperature || 0.7,
                        maxOutputTokens: options.max_length || 2048,
                    },
                });

                // Send the last message
                const lastMessage = messages[messages.length - 1].content || '';
                const result = await chat.sendMessage(lastMessage);
                return result.response.text();
            }
        } catch (error) {
            analyzeError(error as Error);
            console.error('Error generating response from Gemini:', error instanceof Error ? error.message : error);
            throw error; // Rethrow to allow the Brain to handle the error
        }
    }

    async convert(service: BaseService, conversionType: LLMConversationType, convertParams: ConvertParamsType): Promise<any> {
        const converter = this.converters.get(conversionType);
        if (!converter) {
            console.log(`Unsupported conversion type: ${conversionType}`);
            return undefined;
        }
        const requiredParams = converter.requiredParams;
        convertParams.service = service;
        const missingParams = requiredParams.filter(param => !(param in convertParams));
        if (missingParams.length > 0) {
            console.log(`Missing required parameters: ${missingParams.join(', ')}`);
            return undefined;
        }
        return converter.converter(convertParams);
    }
}

const aiInterface = new GeminiInterface();
export default aiInterface;