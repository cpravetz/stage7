export class MissionTerminationRequestedError extends Error {
  constructor() {
    super('Mission termination requested at a safe task checkpoint');
    this.name = 'MissionTerminationRequestedError';
  }
}
