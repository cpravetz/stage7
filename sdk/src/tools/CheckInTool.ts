import { Tool } from '../Tool';
import { ICoreEngineClient, JsonSchema } from '../types';

export class CheckInTool extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'CheckInTool',
      description: 'Manages attendee check-in and registration processes.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the check-in tool.',
            enum: ['setupCheckInSystem', 'manageAttendeeArrivals', 'generateAttendanceReport', 'handleLateArrivals'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific check-in action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  public async setupCheckInSystem(
    eventId: string,
    conversationId: string,
    options?: {
      checkInMethod?: 'qr' | 'manual' | 'badgeScan' | 'hybrid';
      requireValidation?: boolean;
      trackDepartures?: boolean;
      capturingBiometrics?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'setupCheckInSystem',
        payload: {
          eventId,
          checkInMethod: options?.checkInMethod,
          requireValidation: options?.requireValidation,
          trackDepartures: options?.trackDepartures,
          capturingBiometrics: options?.capturingBiometrics,
        },
      },
      conversationId
    );
  }

  public async manageAttendeeArrivals(
    guestList: any[],
    conversationId: string,
    options?: {
      updateStatus?: boolean;
      notifyOrganizers?: boolean;
      flagAbsentees?: boolean;
      timeThreshold?: number;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'manageAttendeeArrivals',
        payload: {
          guestList,
          updateStatus: options?.updateStatus,
          notifyOrganizers: options?.notifyOrganizers,
          flagAbsentees: options?.flagAbsentees,
          timeThreshold: options?.timeThreshold,
        },
      },
      conversationId
    );
  }

  public async generateAttendanceReport(
    conversationId: string,
    options?: {
      reportFormat?: 'summary' | 'detailed' | 'byRole';
      includeTimestamps?: boolean;
      includeAbsentees?: boolean;
      generateStatistics?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'generateAttendanceReport',
        payload: {
          reportFormat: options?.reportFormat,
          includeTimestamps: options?.includeTimestamps,
          includeAbsentees: options?.includeAbsentees,
          generateStatistics: options?.generateStatistics,
        },
      },
      conversationId
    );
  }

  public async handleLateArrivals(
    conversationId: string,
    options?: {
      lateThreshold?: number;
      notifyVenue?: boolean;
      adjustSchedule?: boolean;
      generateAlert?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'handleLateArrivals',
        payload: {
          lateThreshold: options?.lateThreshold,
          notifyVenue: options?.notifyVenue,
          adjustSchedule: options?.adjustSchedule,
          generateAlert: options?.generateAlert,
        },
      },
      conversationId
    );
  }
}
