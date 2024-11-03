/**
 * Represents a request for user input.
 */
export interface UserInputRequest {
    /**
     * The question to be presented to the user.
     */
    question: string;

    /**
     * Optional array of choices for multiple choice questions.
     */
    choices?: string[];

    /**
     * The type of answer expected from the user.
     */
    answerType: 'text' | 'number' | 'boolean' | 'multipleChoice';
}

/**
 * Represents the response to a user input request.
 */
export interface UserInputResponse {
    /**
     * The unique identifier of the request this response is for.
     */
    requestId: string;

    /**
     * The user's response. The type depends on the answerType of the request.
     */
    response: string | number | boolean;
}