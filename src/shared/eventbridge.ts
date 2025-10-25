// import { 
//     EventBridgeClient, 
//     PutEventsCommand, 
//     PutEventsCommandInput,
//     PutEventsResultEntry 
//   } from '@aws-sdk/client-eventbridge';
//   import config from '../config';
//   import { logger } from '../utils/logger';
//   import { metrics } from '../utils/metrics';
  
//   // Initialize client with retry configuration
//   const client = new EventBridgeClient({ 
//     region: config.aws.region,
//     maxAttempts: 3, // Retry failed requests
//   });
  
//   // ==================== TYPES ====================
  
//   export interface EventDetail {
//     [key: string]: any;
//   }
  
//   export interface BatchEvent {
//     source?: string;
//     eventType: string;
//     detail: EventDetail;
//     traceId?: string; // For distributed tracing
//   }
  
//   export interface PublishResult {
//     success: boolean;
//     failedCount: number;
//     failedEntries?: PutEventsResultEntry[];
//   }
  
//   // Event type constants for type safety
//   export enum EventType {
//     ORDER_COMPLETED = 'ORDER_COMPLETED',
//     ORDER_CANCELLED = 'ORDER_CANCELLED',
//     USER_CREATED = 'USER_CREATED',
//     USER_UPDATED = 'USER_UPDATED',
//     POINTS_AWARDED = 'POINTS_AWARDED',
//     POINTS_REDEEMED = 'POINTS_REDEEMED',
//     CAMPAIGN_TRIGGERED = 'CAMPAIGN_TRIGGERED',
//     NOTIFICATION_SENT = 'NOTIFICATION_SENT',
//   }
  
//   // ==================== FUNCTIONS ====================
  
//   /**
//    * Publish a single event to EventBridge
//    * 
//    * @param eventType - Type of event (use EventType enum)
//    * @param detail - Event payload (must be JSON-serializable)
//    * @param source - Event source identifier
//    * @returns PublishResult indicating success/failure
//    * 
//    * @example
//    * ```typescript
//    * await publishEvent(EventType.ORDER_COMPLETED, {
//    *   orderId: '123',
//    *   userId: 'user_456',
//    *   amount: 99.99
//    * });
//    * ```
//    */
//   export async function publishEvent(
//     eventType: EventType | string,
//     detail: EventDetail,
//     source: string = 'loyalty-system'
//   ): Promise<PublishResult> {
//     const startTime = Date.now();
    
//     // Validate detail is serializable
//     if (!isSerializable(detail)) {
//       throw new Error('Event detail must be JSON-serializable');
//     }
  
//     const params: PutEventsCommandInput = {
//       Entries: [
//         {
//           Source: source,
//           DetailType: eventType,
//           Detail: JSON.stringify(detail),
//           EventBusName: config.aws.eventBusName || 'default',
//           // Add timestamp for event ordering
//           Time: new Date(),
//         },
//       ],
//     };
  
//     try {
//       const command = new PutEventsCommand(params);
//       const result = await client.send(command);
  
//       // Track metrics
//       const duration = Date.now() - startTime;
//       metrics.recordEventPublish(eventType, duration, result.FailedEntryCount === 0);
  
//       if (result.FailedEntryCount && result.FailedEntryCount > 0) {
//         logger.error('Failed to publish event', {
//           eventType,
//           failedEntries: result.Entries,
//           detail: config.features.enableDebugLogs ? detail : undefined,
//         });
  
//         return {
//           success: false,
//           failedCount: result.FailedEntryCount,
//           failedEntries: result.Entries,
//         };
//       }
  
//       logger.debug('Event published successfully', { 
//         eventType, 
//         source,
//         duration: `${duration}ms` 
//       });
  
//       return {
//         success: true,
//         failedCount: 0,
//       };
  
//     } catch (error) {
//       logger.error('Error publishing event', { 
//         eventType, 
//         error: error instanceof Error ? error.message : 'Unknown error',
//         stack: error instanceof Error ? error.stack : undefined,
//       });
      
//       // Re-throw for caller to handle
//       throw error;
//     }
//   }
  
//   /**
//    * Publish multiple events in a single batch (max 10 events per AWS limit)
//    * 
//    * @param events - Array of events to publish
//    * @returns PublishResult with aggregated success/failure info
//    * 
//    * @example
//    * ```typescript
//    * await publishEvents([
//    *   { eventType: EventType.ORDER_COMPLETED, detail: {...} },
//    *   { eventType: EventType.POINTS_AWARDED, detail: {...} }
//    * ]);
//    * ```
//    */
//   export async function publishEvents(events: BatchEvent[]): Promise<PublishResult> {
//     if (events.length === 0) {
//       logger.warn('publishEvents called with empty array');
//       return { success: true, failedCount: 0 };
//     }
  
//     // AWS EventBridge limit is 10 events per batch
//     if (events.length > 10) {
//       logger.warn('Batch size exceeds AWS limit, splitting into multiple requests', {
//         totalEvents: events.length,
//       });
      
//       // Process in chunks of 10
//       const results = await Promise.allSettled(
//         chunk(events, 10).map(batch => publishEventsBatch(batch))
//       );
      
//       // Aggregate results
//       let totalFailed = 0;
//       const allFailedEntries: PutEventsResultEntry[] = [];
      
//       results.forEach(result => {
//         if (result.status === 'fulfilled') {
//           totalFailed += result.value.failedCount;
//           if (result.value.failedEntries) {
//             allFailedEntries.push(...result.value.failedEntries);
//           }
//         } else {
//           totalFailed += 10; // Assume all failed if request failed
//         }
//       });
  
//       return {
//         success: totalFailed === 0,
//         failedCount: totalFailed,
//         failedEntries: allFailedEntries.length > 0 ? allFailedEntries : undefined,
//       };
//     }
  
//     return publishEventsBatch(events);
//   }
  
//   /**
//    * Internal function to publish a single batch (max 10 events)
//    */
//   async function publishEventsBatch(events: BatchEvent[]): Promise<PublishResult> {
//     const entries = events.map((event) => ({
//       Source: event.source || 'loyalty-system',
//       DetailType: event.eventType,
//       Detail: JSON.stringify(event.detail),
//       EventBusName: config.aws.eventBusName || 'default',
//       Time: new Date(),
//     }));
  
//     const params: PutEventsCommandInput = { Entries: entries };
  
//     try {
//       const command = new PutEventsCommand(params);
//       const result = await client.send(command);
  
//       if (result.FailedEntryCount && result.FailedEntryCount > 0) {
//         logger.error('Some events in batch failed', {
//           totalEvents: events.length,
//           failedCount: result.FailedEntryCount,
//           failedEntries: result.Entries,
//         });
//       }
  
//       return {
//         success: (result.FailedEntryCount || 0) === 0,
//         failedCount: result.FailedEntryCount || 0,
//         failedEntries: result.FailedEntryCount ? result.Entries : undefined,
//       };
  
//     } catch (error) {
//       logger.error('Error publishing event batch', { 
//         batchSize: events.length,
//         error: error instanceof Error ? error.message : 'Unknown error',
//       });
//       throw error;
//     }
//   }
  
//   // ==================== HELPER FUNCTIONS ====================
  
//   /**
//    * Check if an object is JSON-serializable
//    */
//   function isSerializable(obj: any): boolean {
//     try {
//       JSON.stringify(obj);
//       return true;
//     } catch {
//       return false;
//     }
//   }
  
//   /**
//    * Split array into chunks of specified size
//    */
//   function chunk<T>(array: T[], size: number): T[][] {
//     const chunks: T[][] = [];
//     for (let i = 0; i < array.length; i += size) {
//       chunks.push(array.slice(i, i + size));
//     }
//     return chunks;
//   }
  
//   /**
//    * Create a typed event for better type safety
//    * 
//    * @example
//    * ```typescript
//    * const orderEvent = createEvent(EventType.ORDER_COMPLETED, {
//    *   orderId: '123',
//    *   amount: 99.99
//    * });
//    * await publishEvent(orderEvent.eventType, orderEvent.detail);
//    * ```
//    */
//   export function createEvent<T extends EventDetail>(
//     eventType: EventType | string,
//     detail: T,
//     source?: string
//   ): BatchEvent {
//     return {
//       eventType,
//       detail,
//       source,
//       traceId: generateTraceId(), // For X-Ray tracing
//     };
//   }
  
//   /**
//    * Generate a unique trace ID for distributed tracing
//    */
//   function generateTraceId(): string {
//     return `${Date.now()}-${Math.random().toString(36).substring(7)}`;
//   }
  
//   // ==================== EXPORTS ====================
  
//   export default {
//     publishEvent,
//     publishEvents,
//     createEvent,
//     EventType,
//   };


import { EventBridgeClient, PutEventsCommand, PutEventsRequestEntry, PutEventsCommandOutput } from '@aws-sdk/client-eventbridge';
import config from '../config';

/**
 * Initialize EventBridge client
 */
const client = new EventBridgeClient({ region: config.aws.region });

/**
 * Interface representing the detail payload of an event
 */
export interface EventDetail {
  [key: string]: any;
}

/**
 * Interface representing a single event entry for publishing
 */
export interface EventEntry {
  eventType: string;
  detail: EventDetail;
  source?: string;
}

/**
 * Publish a single event to EventBridge
 */
export async function publishEvent(
  eventType: string,
  detail: EventDetail,
  source = 'loyalty-system'
): Promise<PutEventsCommandOutput> {
  const params = {
    Entries: [
      {
        Source: source,
        DetailType: eventType,
        Detail: JSON.stringify(detail),
        EventBusName: 'default', // Use default event bus (free tier)
      },
    ],
  };

  try {
    const command = new PutEventsCommand(params);
    const result = await client.send(command);

    if (result.FailedEntryCount && result.FailedEntryCount > 0) {
      console.error('Failed to publish event:', result.Entries);
      throw new Error('Failed to publish event to EventBridge');
    }

    if (config.features?.enableDebugLogs) {
      console.log('Event published:', { eventType, detail });
    }

    return result;
  } catch (error) {
    console.error('Error publishing event:', error);
    throw error;
  }
}

/**
 * Publish multiple events in batch
 */
export async function publishEvents(events: EventEntry[]): Promise<PutEventsCommandOutput> {
  const entries: PutEventsRequestEntry[] = events.map((event) => ({
    Source: event.source || 'loyalty-system',
    DetailType: event.eventType,
    Detail: JSON.stringify(event.detail),
    EventBusName: 'default',
  }));

  const params = { Entries: entries };

  try {
    const command = new PutEventsCommand(params);
    const result = await client.send(command);

    if (result.FailedEntryCount && result.FailedEntryCount > 0) {
      console.error('Some events failed:', result.Entries);
    }

    return result;
  } catch (error) {
    console.error('Error publishing events:', error);
    throw error;
  }
}
