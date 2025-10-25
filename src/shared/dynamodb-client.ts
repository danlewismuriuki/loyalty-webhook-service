import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  GetCommandInput,
  PutCommand,
  PutCommandInput,
  UpdateCommand,
  UpdateCommandInput,
  DeleteCommand,
  DeleteCommandInput,
  QueryCommand,
  QueryCommandInput,
  ScanCommand,
  ScanCommandInput,
  BatchGetCommand,
  BatchGetCommandInput,
  BatchWriteCommand,
  BatchWriteCommandInput,
  TransactWriteCommand,
  TransactWriteCommandInput,
} from "@aws-sdk/lib-dynamodb";
import config from "../config";

// Initialize DynamoDB client
const client = new DynamoDBClient({
  region: config.aws.region,
  ...(config.dynamodb.endpoint && { endpoint: config.dynamodb.endpoint }),
});

// Document client for easier operations
const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    removeUndefinedValues: true,
    convertEmptyValues: false,
  },
  unmarshallOptions: {
    wrapNumbers: false,
  },
});

// Types
interface DynamoDBKey {
  pk: string;
  sk: string;
}

interface QueryResult<T = any> {
  items: T[];
  lastEvaluatedKey?: Record<string, any>;
  count: number;
}

interface TransactionOperation {
  type: "Put" | "Update" | "Delete" | "ConditionCheck";
  item?: Record<string, any>;
  pk?: string;
  sk?: string;
  updateExpression?: string;
  expressionAttributeNames?: Record<string, string>;
  expressionAttributeValues?: Record<string, any>;
  conditionExpression?: string;
}

export class DynamoDBService {
  private tableName: string;

  constructor(tableName: string = config.dynamodb.tableName) {
    this.tableName = tableName;
  }

  /**
   * Get a single item by PK and SK
   */
  async get<T = any>(pk: string, sk: string): Promise<T | null> {
    const params: GetCommandInput = {
      TableName: this.tableName,
      Key: { PK: pk, SK: sk },
    };

    const result = await docClient.send(new GetCommand(params));
    return (result.Item as T) || null;
  }

  /**
   * Put (create or replace) an item
   */
  async put<T = any>(
    item: Record<string, any>,
    options: Partial<PutCommandInput> = {}
  ): Promise<T> {
    const timestamp = new Date().toISOString();

    const params: PutCommandInput = {
      TableName: this.tableName,
      Item: {
        ...item,
        createdAt: item.createdAt || timestamp,
        updatedAt: timestamp,
      },
      ...options,
    };

    await docClient.send(new PutCommand(params));
    return params.Item as T;
  }

  /**
   * Update an item
   */
  async update<T = any>(
    pk: string,
    sk: string,
    updates: Record<string, any>,
    options: Partial<UpdateCommandInput> = {}
  ): Promise<T> {
    const timestamp = new Date().toISOString();

    // Build update expression
    const updateExpressions: string[] = [];
    const expressionAttributeNames: Record<string, string> = {};
    const expressionAttributeValues: Record<string, any> = {};

    Object.keys(updates).forEach((key, index) => {
      const placeholder = `#attr${index}`;
      const valuePlaceholder = `:val${index}`;

      updateExpressions.push(`${placeholder} = ${valuePlaceholder}`);
      expressionAttributeNames[placeholder] = key;
      expressionAttributeValues[valuePlaceholder] = updates[key];
    });

    // Add updatedAt timestamp
    updateExpressions.push("#updatedAt = :updatedAt");
    expressionAttributeNames["#updatedAt"] = "updatedAt";
    expressionAttributeValues[":updatedAt"] = timestamp;

    const params: UpdateCommandInput = {
      TableName: this.tableName,
      Key: { PK: pk, SK: sk },
      UpdateExpression: `SET ${updateExpressions.join(", ")}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: "ALL_NEW", // ✅ This is now correctly typed
      ...options,
    };

    const result = await docClient.send(new UpdateCommand(params));
    return result.Attributes as T;
  }

  /**
   * Delete an item
   */
  async delete(
    pk: string,
    sk: string,
    options: Partial<DeleteCommandInput> = {}
  ): Promise<boolean> {
    const params: DeleteCommandInput = {
      TableName: this.tableName,
      Key: { PK: pk, SK: sk },
      ...options,
    };

    await docClient.send(new DeleteCommand(params));
    return true;
  }

  /**
   * Query items by PK (and optional SK condition)
   */
  async query<T = any>(
    pk: string,
    options: Partial<QueryCommandInput> = {}
  ): Promise<QueryResult<T>> {
    const params: QueryCommandInput = {
      TableName: this.tableName,
      KeyConditionExpression: "PK = :pk",
      ExpressionAttributeValues: {
        ":pk": pk,
      },
      ...options,
    };

    const result = await docClient.send(new QueryCommand(params));
    return {
      items: (result.Items as T[]) || [],
      lastEvaluatedKey: result.LastEvaluatedKey,
      count: result.Count || 0,
    };
  }

  /**
   * Query using GSI
   */
  async queryGSI<T = any>(
    indexName: string,
    gsiPK: string,
    options: Partial<QueryCommandInput> = {}
  ): Promise<QueryResult<T>> {
    const params: QueryCommandInput = {
      TableName: this.tableName,
      IndexName: indexName,
      KeyConditionExpression: `${indexName}PK = :pk`,
      ExpressionAttributeValues: {
        ":pk": gsiPK,
      },
      ...options,
    };

    const result = await docClient.send(new QueryCommand(params));
    return {
      items: (result.Items as T[]) || [],
      lastEvaluatedKey: result.LastEvaluatedKey,
      count: result.Count || 0,
    };
  }

  /**
   * Batch get multiple items
   */
  async batchGet<T = any>(keys: DynamoDBKey[]): Promise<T[]> {
    const params: BatchGetCommandInput = {
      RequestItems: {
        [this.tableName]: {
          Keys: keys.map(({ pk, sk }) => ({ PK: pk, SK: sk })),
        },
      },
    };

    const result = await docClient.send(new BatchGetCommand(params));
    return (result.Responses?.[this.tableName] as T[]) || [];
  }

  /**
   * Batch write (put or delete) multiple items
   */
  async batchWrite(
    putItems: Record<string, any>[] = [],
    deleteKeys: DynamoDBKey[] = []
  ): Promise<boolean> {
    const requests = [
      ...putItems.map((item) => ({
        PutRequest: { Item: item },
      })),
      ...deleteKeys.map(({ pk, sk }) => ({
        DeleteRequest: { Key: { PK: pk, SK: sk } },
      })),
    ];

    const params: BatchWriteCommandInput = {
      RequestItems: {
        [this.tableName]: requests,
      },
    };

    await docClient.send(new BatchWriteCommand(params));
    return true;
  }

  /**
   * Transactional write (atomic operations)
   */
  async transactWrite(operations: TransactionOperation[]): Promise<boolean> {
    const params: TransactWriteCommandInput = {
      TransactItems: operations.map((op) => {
        if (op.type === "Put") {
          return {
            Put: {
              TableName: this.tableName,
              Item: op.item,
            },
          };
        }
        if (op.type === "Update") {
          return {
            Update: {
              TableName: this.tableName,
              Key: { PK: op.pk!, SK: op.sk! },
              UpdateExpression: op.updateExpression,
              ExpressionAttributeNames: op.expressionAttributeNames,
              ExpressionAttributeValues: op.expressionAttributeValues,
            },
          };
        }
        if (op.type === "Delete") {
          return {
            Delete: {
              TableName: this.tableName,
              Key: { PK: op.pk!, SK: op.sk! },
            },
          };
        }
        if (op.type === "ConditionCheck") {
          return {
            ConditionCheck: {
              TableName: this.tableName,
              Key: { PK: op.pk!, SK: op.sk! },
              ConditionExpression: op.conditionExpression,
              ExpressionAttributeValues: op.expressionAttributeValues,
            },
          };
        }
        throw new Error(`Unknown transaction type: ${op.type}`);
      }),
    };

    await docClient.send(new TransactWriteCommand(params));
    return true;
  }

  /**
   * Scan table (avoid in production - use query instead)
   */
  async scan<T = any>(
    options: Partial<ScanCommandInput> = {}
  ): Promise<QueryResult<T>> {
    const params: ScanCommandInput = {
      TableName: this.tableName,
      ...options,
    };

    const result = await docClient.send(new ScanCommand(params));
    return {
      items: (result.Items as T[]) || [],
      lastEvaluatedKey: result.LastEvaluatedKey,
      count: result.Count || 0,
    };
  }

  /**
   * Check if item exists
   */
  async exists(pk: string, sk: string): Promise<boolean> {
    const item = await this.get(pk, sk);
    return !!item;
  }

  /**
   * Conditional put (only if item doesn't exist)
   */
  async putIfNotExists<T = any>(item: Record<string, any>): Promise<T> {
    return this.put(item, {
      ConditionExpression: "attribute_not_exists(PK)",
    });
  }

  /**
   * Increment a numeric attribute
   */
  async increment<T = any>(
    pk: string,
    sk: string,
    attribute: string,
    amount: number = 1
  ): Promise<T> {
    const params: UpdateCommandInput = {
      TableName: this.tableName,
      Key: { PK: pk, SK: sk },
      UpdateExpression: `SET #attr = if_not_exists(#attr, :zero) + :amount, updatedAt = :timestamp`,
      ExpressionAttributeNames: {
        "#attr": attribute,
      },
      ExpressionAttributeValues: {
        ":amount": amount,
        ":zero": 0,
        ":timestamp": new Date().toISOString(),
      },
      ReturnValues: "ALL_NEW",
    };

    const result = await docClient.send(new UpdateCommand(params));
    return result.Attributes as T;
  }

  /**
   * Decrement a numeric attribute
   */
  async decrement<T = any>(
    pk: string,
    sk: string,
    attribute: string,
    amount: number = 1
  ): Promise<T> {
    return this.increment(pk, sk, attribute, -amount);
  }
}

// Export singleton instance
const dynamoDBService = new DynamoDBService();
export default dynamoDBService;

// Also export the class for testing
export { DynamoDBService as DynamoDBServiceClass };