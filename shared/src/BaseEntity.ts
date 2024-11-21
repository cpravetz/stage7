import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import express from 'express';
import { MessageType } from './types/Message';

export class BaseEntity {
  id: string;
  componentType: string;
  postOfficeUrl: string;
  url: string;
  questions: string[] = [];
  port : string;
  registeredWithPostOffice: boolean = false;
  lastAnswer: string = '';

  constructor(id: string, componentType: string, urlBase: string, port: string) {
    this.id = id;
    this.componentType = componentType;
    this.postOfficeUrl = process.env.POSTOFFICE_URL || 'postoffice:5020'
    this.port = port;
    this.url = `${urlBase}:${port}` //url;
    this.registerWithPostOffice();
  }

  protected async registerWithPostOffice(retryCount: number = 10) {
    const register = async () => {
      try {
        const response = await axios.post(`http://${this.postOfficeUrl}/registerComponent`, {
          id: this.id,
          type: this.componentType,
          url: this.url,
        });

        console.log(`${this.id} registered with PostOffice:`, response.data);
      } catch (error) { 
        if (retryCount > 0) {
          console.log(`Retrying registration in 2 seconds... (${retryCount} attempts left)`);
          setTimeout(() => this.registerWithPostOffice(retryCount - 1), 3000);
        } else {
          console.error(`Failed to register ${this.id} after multiple attempts`);
        }
      }
    };

    await register();
  }


  say(content: string): void {
    console.log(`${this.id} says: ${content}`);
    axios.post(`http://${this.postOfficeUrl}/message`, {
      type: 'say',
      content,
      sender: this.id,
      recipient: 'user'
    });
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

      axios.post(`http://${this.postOfficeUrl}/message`, {
        type: MessageType.REQUEST,
        recipient: 'user',
        content: { question: content, questionGuid: questionGuid, choices: choices, asker: this.id },
        sender: this.id
      });

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