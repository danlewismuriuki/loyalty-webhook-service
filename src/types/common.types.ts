/**
 * Standard API response wrapper
 */
export interface APIResponse<T = any> {
    success: boolean;
    data?: T;
    error?: ErrorResponse;
    message?: string;
  }
  
  /**
   * Error response structure
   */
  export interface ErrorResponse {
    code: string;
    message: string;
    details?: any;
  }
  
  /**
   * Pagination options
   */
  export interface PaginationOptions {
    limit?: number;
    nextToken?: string;
    lastEvaluatedKey?: Record<string, any>;
  }
  
  /**
   * Paginated response wrapper
   */
  export interface PaginatedResponse<T> {
    items: T[];
    count: number;
    nextToken?: string;
    lastEvaluatedKey?: Record<string, any>;
  }
  
  /**
   * DynamoDB primary key
   */
  export interface DynamoDBKey {
    PK: string;
    SK: string;
  }
  
  /**
   * Base entity with timestamps
   */
  export interface BaseEntity {
    entityType: string;
    createdAt: string;
    updatedAt: string;
  }
  
  /**
   * Query filter options
   */
  export interface QueryOptions {
    limit?: number;
    sortOrder?: 'asc' | 'desc';
    filterExpression?: string;
    expressionAttributeValues?: Record<string, any>;
  }
  
  /**
   * Metadata for extensibility
   */
  export type Metadata = Record<string, any>;
  
  /**
   * Date range filter
   */
  export interface DateRange {
    startDate: string;
    endDate: string;
  }
  
  /**
   * Sort options
   */
  export interface SortOptions {
    field: string;
    order: 'asc' | 'desc';
  }
  
  /**
   * Event payload structure
   */
  export interface EventPayload {
    eventType: string;
    timestamp: string;
    data: Record<string, any>;
    source?: string;
  }