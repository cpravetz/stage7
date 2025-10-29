import { BaseInterface, ConvertParamsType } from './baseInterface';
import { LLMConversationType } from '@cktmcs/shared';
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
        super('gemini');
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
        this.converters.set(LLMConversationType.TextToJSON, {
            conversationType: LLMConversationType.TextToJSON,
            requiredParams: ['service', 'prompt'],
            converter: this.convertTextToJSON,
        });
    }

    async convertTextToText(args: ConvertParamsType): Promise<string> {
        const { service, prompt, modelName, responseType } = args;
        if (!service) {
            throw new Error('GeminiInterface: No service provided for text-to-text conversion');
        }

        const messages: ExchangeType = [{ role: 'user', content: prompt || '' }];
        return this.chat(service, messages, { modelName, responseType} );
    }

    async convertTextToJSON(args: ConvertParamsType): Promise<string> {
        const { service, prompt, modelName } = args;
        if (!service) {
            throw new Error('GeminiInterface: No service provided for text-to-JSON conversion');
        }

        const systemMessage = 'You are a JSON generation assistant. You must respond with valid JSON only. No explanations, no markdown, no code blocks - just pure JSON starting with { or [ and ending with } or ].';

        const messages: ExchangeType = [
            { role: 'system', content: systemMessage },
            { role: 'user', content: prompt || '' }
        ];

        const response = await this.chat(service, messages, { modelName, responseType: 'json' });

        // Always apply JSON cleanup for TextToJSON conversion type
        const jsonResponse = await this.ensureJsonResponse(response, true, service);
        if (jsonResponse === null) {
            throw new Error("Failed to extract valid JSON from the model's response.");
        }
        return jsonResponse;
    }

    async convertImageToText(args: ConvertParamsType): Promise<string> {
        const { service, image, prompt } = args;
        if (!image || !prompt) {
            throw new Error('No image file provided or prompt for Gemini image-to-text conversion');
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
            console.error('Error in Gemini image analysis:', error instanceof Error ? error.message : error);
            throw error;
        }
    }

    async convertTextToImage(args: ConvertParamsType): Promise<string> {
        const { service, prompt } = args;
        if (!prompt) {
            throw new Error('No prompt provided for Gemini image generation');
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
            console.error('Error in Gemini image generation:', error instanceof Error ? error.message : error);

            // Check if the error is related to the model not being available
            if (error instanceof Error && error.message.includes('not found')) {
                return 'Image generation model is not available. This feature may be in experimental stage or requires special access.';
            }

            throw error;
        }
    }

    async chat(service: BaseService, messages: ExchangeType, options: { max_length?: number, temperature?: number, modelName?: string, responseType:string }): Promise<string> {
        try {
            if (!service || !service.isAvailable() || !service.apiKey) {
                throw new Error('Gemini service is not available or API key is missing');
            }

            // Initialize the Google Generative AI client
            const genAI = new GoogleGenerativeAI(service.apiKey);

            // Try to get model info
            try {
                console.log('Trying to get Gemini model info...');
                genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });
                console.log('Successfully created model instance for gemini-1.5-pro');
            } catch (err) {
                console.error('Error creating Gemini model instance:', err);
            }

            // Get the model name from options or use a default
            // Strip the 'google/' prefix if present
            let modelName = options.modelName || 'gemini-1.5-pro';
            if (modelName.startsWith('google/')) {
                modelName = modelName.substring(7);
            }

            console.log(`Using Gemini model: ${modelName}`);

            // If responseType is 'json', prepend a system prompt to enforce JSON output
            let contentParts = messages;
            if (options.responseType === 'json') {
                contentParts = [
                    { role: 'system', content: 'You must respond with valid JSON only. No explanations, no markdown, no code blocks - just pure JSON starting with { and ending with }.' },
                    ...messages
                ];
            }

            // Create the model instance
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
            const formattedMessages = contentParts.map(msg => {
                return {
                    role: msg.role === 'user' ? 'user' : (msg.role === 'system' ? 'system' : 'model'),
                    parts: [{ text: msg.content || '' }]
                };
            });

            console.log(`Sending request to Gemini with model ${modelName}`);

            // For single message, use generateContent
            if (formattedMessages.length === 1) {
                const prompt = formattedMessages[0].parts[0].text || '';
                const result = await model.generateContent(prompt);
                const response = result.response;
                const requireJson = options.responseType === 'json';
                if (requireJson) {
                    const jsonResponse = await this.ensureJsonResponse(response.text(), true, service);
                    if (jsonResponse === null) {
                        throw new Error("Failed to extract valid JSON from the model's response.");
                    }
                    return jsonResponse;
                }
                return response.text();
            } else {
                // For chat conversations, use startChat and sendMessage
                const chat = model.startChat({
                    history: formattedMessages.slice(0, -1),
                    generationConfig: {
                        temperature: options.temperature || 0.7,
                        maxOutputTokens: options.max_length || 2048,
                    },
                });
                const lastMessage = formattedMessages[formattedMessages.length - 1].parts[0].text || '';
                const result = await chat.sendMessage(lastMessage);
                const fullResponse = result.response.text();
                console.log(`GeminiInterface: Received response with content: ${fullResponse.substring(0, 140)}... (truncated)`);
                const requireJson = options.responseType === 'json';
                if (requireJson) {
                    const jsonResponse = await this.ensureJsonResponse(fullResponse, true, service);
                    if (jsonResponse === null) {
                        throw new Error("Failed to extract valid JSON from the model's response.");
                    }
                    return jsonResponse;
                }
                return fullResponse;
            }
        } catch (error) {
            console.error('Error generating response from Gemini:', error instanceof Error ? error.message : error);
            throw error;
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
        const missingParams = requiredParams.filter((param: any) => !(param in convertParams));
        if (missingParams.length > 0) {
            console.log(`Missing required parameters: ${missingParams.join(', ')}`);
            return undefined;
        }
        return converter.converter(convertParams);
    }
}

const aiInterface = new GeminiInterface();
export default aiInterface;