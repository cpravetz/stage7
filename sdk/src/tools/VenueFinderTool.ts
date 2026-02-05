import { Tool } from '../Tool';
import { ICoreEngineClient, JsonSchema } from '../types';

export class VenueFinderTool extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'VenueFinderTool',
      description: 'Identifies and evaluates potential event venues based on criteria.',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The action to perform with the venue finder tool.',
            enum: ['searchVenues', 'compareOptions', 'checkAvailability'],
          },
          payload: {
            type: 'object',
            description: 'The payload for the specific venue finder action.',
          },
        },
        required: ['action', 'payload'],
      },
      coreEngineClient: coreEngineClient,
    });
  }

  public async searchVenues(
    location: string,
    capacity: number,
    amenities: string[],
    conversationId: string,
    options?: {
      venueType?: ('ballroom' | 'outdoor' | 'intimate' | 'theater_style' | 'classroom')[];
      priceRange?: 'budget' | 'moderate' | 'upscale' | 'luxury';
      sortBy?: 'price' | 'rating' | 'availability' | 'capacity_fit';
      includeUnavailable?: boolean;
      limit?: number;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'searchVenues',
        payload: {
          location,
          capacity,
          amenities,
          venueType: options?.venueType,
          priceRange: options?.priceRange,
          sortBy: options?.sortBy,
          includeUnavailable: options?.includeUnavailable,
          limit: options?.limit,
        },
      },
      conversationId
    );
  }

  public async compareOptions(
    venueIds: string[],
    conversationId: string,
    options?: {
      compareMetrics?: ('price' | 'amenities' | 'rating' | 'availability' | 'parking')[];
      groupBy?: 'price_range' | 'venue_type' | 'rating';
      sortBy?: 'price' | 'rating' | 'recommended';
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'compareOptions',
        payload: {
          venueIds,
          compareMetrics: options?.compareMetrics,
          groupBy: options?.groupBy,
          sortBy: options?.sortBy,
        },
      },
      conversationId
    );
  }

  public async checkAvailability(
    venueId: string,
    dateRange: { start: string; end: string },
    conversationId: string,
    options?: {
      checkParallel?: boolean;
      alternativeDates?: boolean;
      requireConfirmation?: boolean;
    }
  ): Promise<any> {
    return this.execute(
      {
        action: 'checkAvailability',
        payload: {
          venueId,
          dateRange,
          checkParallel: options?.checkParallel,
          alternativeDates: options?.alternativeDates,
          requireConfirmation: options?.requireConfirmation,
        },
      },
      conversationId
    );
  }
}
