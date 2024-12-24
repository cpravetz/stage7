import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import express from 'express';
import { MessageType } from './types/Message';
import { AuthenticatedApiClient } from './AuthenticatedApiClient';

export class BaseEntity {
  id: string;
  componentType: string;
  postOfficeUrl: string;
  url: string;
  questions: string[] = [];
  port : string;
  registeredWithPostOffice: boolean = false;
  lastAnswer: string = '';
  authenticatedApi: AuthenticatedApiClient;

  constructor(id: string, componentType: string, urlBase: string, port: string) {
    this.id = id;
    this.componentType = componentType;
    this.postOfficeUrl = process.env.POSTOFFICE_URL || 'postoffice:5020'
    this.port = port;
    this.url = `${urlBase}:${port}` //url;
    this.authenticatedApi = new AuthenticatedApiClient(this);
    this.registerWithPostOffice();
  }

  protected async registerWithPostOffice(retryCount: number = 10) {
    const register = async () => {
      try {
        const response = await this.authenticatedApi.post(`http://${this.postOfficeUrl}/registerComponent`, {
          id: this.id,
          type: this.componentType,
          url: this.url
        });
        if (response.status === 200) {
          console.log(`${this.componentType} registered successfully with PostOffice`);
          this.registeredWithPostOffice = true;
        }
      } catch (error) {
        console.error(`Failed to register ${this.componentType} with PostOffice:`, error);
        throw error;
      }
    };

    await register();
  }

  sendMessage(type: string, recipient: string, content: any): void {
    axios.post(`http://${this.postOfficeUrl}/message`, {
      type: type``,
      content,
      sender: this.id,
      recipient
    });
  }

  say(content: string): void {
    this.sendMessage('say', 'user', content);
  }

  async handleBaseMessage(message: any): Promise<void> {
    if (message.type === MessageType.ANSWER && this.onAnswer) {
      this.onAnswer(message.answer);
    }
  }

  logAndSay(message: string) {
    console.log(message);
    this.say(message);
  }
 
  private askPromises: Map<string, Promise<string>> = new Map();

  ask(content: string, choices?: string[]): Promise<string> {
    return new Promise((resolve) => {
      const questionGuid = uuidv4();
      this.questions.push(questionGuid);
      this.askPromises.set(questionGuid, Promise.resolve(''));

      this.sendMessage(MessageType.REQUEST, 'user', { question: content, questionGuid: questionGuid, choices: choices, asker: this.id });

      this.askPromises.set(questionGuid, new Promise((resolve) => {
        const checkAnswer = setInterval(() => {
          if (!this.questions.includes(questionGuid)) {
            clearInterval(checkAnswer);
            resolve(this.lastAnswer);
          }
        }, 100);
      }));

      this.askPromises.get(questionGuid)!.then(resolve);
    });
  }

  onAnswer(answer: express.Request): void {
    if (answer.body.questionGuid && this.questions.includes(answer.body.questionGuid)) {
      this.questions = this.questions.filter(q => q !== answer.body.questionGuid);
      this.lastAnswer = answer.body.answer;
    }
  }  
}