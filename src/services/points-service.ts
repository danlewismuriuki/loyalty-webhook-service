// import { v4 as uuidv4 } from 'uuid';
// import dynamodb from '../shared/dynamodb-client';
// import { publishEvent } from '../shared/eventbridge';
// import UserService from './user-service';

// import { User } from '../types/user.types';

// export interface PointsTransaction {
//   PK: string;
//   SK: string;
//   GSI1PK: string;
//   GSI1SK: string;
//   entityType: 'POINTS';
//   transactionId: string;
//   userId: string;
//   type: 'earned' | 'redeemed' | 'expired' | 'transferred_in' | 'transferred_out';
//   points: number;
//   balance: number;
//   lifetimePoints: number;
//   reason: string;
//   metadata?: Record<string, any>;
//   createdAt: string;
// }

// export interface PointsStats {
//   totalEarned: number;
//   totalRedeemed: number;
//   totalExpired: number;
//   earnedCount: number;
//   redeemedCount: number;
//   netPoints: number;
//   points: number;
//   lifetimePoints: number;
//   tier?: string;
//   userId: string;
// }

// export class PointsService {
//   /**
//    * Award points to a user
//    */
//   async awardPoints(userId: string, points: number, reason: string, metadata: Record<string, any> = {}) {
//     if (points <= 0) throw new Error('Points must be greater than 0');

//     const transactionId = uuidv4();
//     const timestamp = new Date().toISOString();

//     const user: User | null = await UserService.getUserById(userId);
//     if (!user) throw new Error('User not found');

//     const newBalance = user.points + points;
//     const newLifetimePoints = user.lifetimePoints + points;

//     const transaction: PointsTransaction = {
//       PK: `USER#${userId}`,
//       SK: `POINTS#${transactionId}`,
//       GSI1PK: `POINTS#${userId}`,
//       GSI1SK: `DATE#${timestamp}`,
//       entityType: 'POINTS',
//       transactionId,
//       userId,
//       type: 'earned',
//       points,
//       balance: newBalance,
//       lifetimePoints: newLifetimePoints,
//       reason,
//       metadata,
//       createdAt: timestamp,
//     };

//     await dynamodb.transactWrite([
//       { type: 'Put', item: transaction },
//       {
//         type: 'Update',
//         pk: `USER#${userId}`,
//         sk: 'PROFILE',
//         updateExpression: 'SET points = :points, lifetimePoints = :lifetime, updatedAt = :timestamp',
//         expressionAttributeValues: {
//           ':points': newBalance,
//           ':lifetime': newLifetimePoints,
//           ':timestamp': timestamp,
//         },
//       },
//     ]);

//     await publishEvent('points.awarded', {
//       userId,
//       transactionId,
//       points,
//       newBalance,
//       reason,
//       timestamp,
//     });

//     return this.sanitizeTransaction(transaction);
//   }

//   /**
//    * Redeem points
//    */
//   async redeemPoints(userId: string, points: number, reason: string, metadata: Record<string, any> = {}) {
//     if (points <= 0) throw new Error('Points must be greater than 0');

//     const transactionId = uuidv4();
//     const timestamp = new Date().toISOString();

//     const user = await UserService.getUserById(userId);
//     if (!user) throw new Error('User not found');
//     if (user.points < points) throw new Error(`Insufficient points. Available: ${user.points}, Required: ${points}`);

//     const newBalance = user.points - points;

//     const transaction: PointsTransaction = {
//       PK: `USER#${userId}`,
//       SK: `POINTS#${transactionId}`,
//       GSI1PK: `POINTS#${userId}`,
//       GSI1SK: `DATE#${timestamp}`,
//       entityType: 'POINTS',
//       transactionId,
//       userId,
//       type: 'redeemed',
//       points: -points,
//       balance: newBalance,
//       lifetimePoints: user.lifetimePoints,
//       reason,
//       metadata,
//       createdAt: timestamp,
//     };

//     await dynamodb.transactWrite([
//       { type: 'Put', item: transaction },
//       {
//         type: 'Update',
//         pk: `USER#${userId}`,
//         sk: 'PROFILE',
//         updateExpression: 'SET points = :points, updatedAt = :timestamp',
//         expressionAttributeValues: {
//           ':points': newBalance,
//           ':timestamp': timestamp,
//         },
//       },
//     ]);

//     await publishEvent('points.redeemed', {
//       userId,
//       transactionId,
//       points,
//       newBalance,
//       reason,
//       timestamp,
//     });

//     return this.sanitizeTransaction(transaction);
//   }

//   /**
//    * Expire points
//    */
//   async expirePoints(userId: string, points: number, reason = 'expired') {
//     if (points <= 0) throw new Error('Points must be greater than 0');

//     const transactionId = uuidv4();
//     const timestamp = new Date().toISOString();

//     const user = await UserService.getUserById(userId);
//     if (!user) throw new Error('User not found');

//     const newBalance = Math.max(0, user.points - points);
//     const actualExpired = user.points - newBalance;
//     if (actualExpired === 0) throw new Error('No points to expire');

//     const transaction: PointsTransaction = {
//       PK: `USER#${userId}`,
//       SK: `POINTS#${transactionId}`,
//       GSI1PK: `POINTS#${userId}`,
//       GSI1SK: `DATE#${timestamp}`,
//       entityType: 'POINTS',
//       transactionId,
//       userId,
//       type: 'expired',
//       points: -actualExpired,
//       balance: newBalance,
//       lifetimePoints: user.lifetimePoints,
//       reason,
//       metadata: { originalPoints: points, actualExpired },
//       createdAt: timestamp,
//     };

//     await dynamodb.transactWrite([
//       { type: 'Put', item: transaction },
//       {
//         type: 'Update',
//         pk: `USER#${userId}`,
//         sk: 'PROFILE',
//         updateExpression: 'SET points = :points, updatedAt = :timestamp',
//         expressionAttributeValues: {
//           ':points': newBalance,
//           ':timestamp': timestamp,
//         },
//       },
//     ]);

//     await publishEvent('points.expired', {
//       userId,
//       transactionId,
//       points: actualExpired,
//       newBalance,
//       reason,
//       timestamp,
//     });

//     return this.sanitizeTransaction(transaction);
//   }

//   /**
//    * Get user's points balance
//    */
//   async getBalance(userId: string) {
//     const user = await UserService.getUserById(userId);
//     if (!user) throw new Error('User not found');

//     return {
//       userId,
//       points: user.points,
//       lifetimePoints: user.lifetimePoints,
//       tier: user.tier,
//     };
//   }

//   /**
//    * Get transaction history
//    */
//   async getTransactionHistory(userId: string, options: { limit?: number; lastEvaluatedKey?: any } = {}) {
//     const { limit = 50, lastEvaluatedKey } = options;

//     const result = await dynamodb.query(`USER#${userId}`, {
//       KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
//       ExpressionAttributeValues: {
//         ':pk': `USER#${userId}`,
//         ':sk': 'POINTS#',
//       },
//       Limit: limit,
//       ScanIndexForward: false,
//       ...(lastEvaluatedKey && { ExclusiveStartKey: lastEvaluatedKey }),
//     });

//     return {
//       transactions: result.items.map((t: PointsTransaction) => this.sanitizeTransaction(t)),
//       nextToken: result.lastEvaluatedKey,
//       count: result.count,
//     };
//   }

//   /**
//    * Sanitize transaction object
//    */
//   sanitizeTransaction(transaction: PointsTransaction) {
//     const { PK, SK, GSI1PK, GSI1SK, ...sanitized } = transaction;
//     return sanitized;
//   }
// }

// export const pointsService = new PointsService();



import { v4 as uuidv4 } from 'uuid';
import dynamodb from '../shared/dynamodb-client';
import { publishEvent } from '../shared/eventbridge';
import UserService from './user-service';

import { User } from '../types/user.types';

// ==================== TYPES ====================

// Create a sanitized user type (without DynamoDB keys)
export type SanitizedUser = Omit<User, 'PK' | 'SK' | 'GSI1PK' | 'GSI1SK' | 'GSI2PK' | 'GSI2SK'>;

export interface PointsTransaction {
  PK: string;
  SK: string;
  GSI1PK: string;
  GSI1SK: string;
  entityType: 'POINTS';
  transactionId: string;
  userId: string;
  type: 'earned' | 'redeemed' | 'expired' | 'transferred_in' | 'transferred_out';
  points: number;
  balance: number;
  lifetimePoints: number;
  reason: string;
  metadata?: Record<string, any>;
  createdAt: string;
}

export type SanitizedTransaction = Omit<PointsTransaction, 'PK' | 'SK' | 'GSI1PK' | 'GSI1SK'>;

export interface PointsBalance {
  userId: string;
  points: number;
  lifetimePoints: number;
  tier?: string;
}

export interface TransactionHistoryResult {
  transactions: SanitizedTransaction[];
  nextToken?: any;
  count: number;
}

export interface AwardPointsOptions {
  reason: string;
  metadata?: Record<string, any>;
}

export interface RedeemPointsOptions {
  reason: string;
  metadata?: Record<string, any>;
}

// ==================== SERVICE ====================

export class PointsService {
  /**
   * Award points to a user
   * 
   * @param userId - The user's ID
   * @param points - Amount of points to award (must be > 0)
   * @param reason - Reason for awarding points
   * @param metadata - Optional metadata for the transaction
   * @returns The sanitized transaction record
   * 
   * @throws Error if points <= 0 or user not found
   * 
   * @example
   * ```typescript
   * await pointsService.awardPoints('user_123', 50, 'Birthday bonus', {
   *   campaignId: 'birthday_2024'
   * });
   * ```
   */
  async awardPoints(
    userId: string,
    points: number,
    reason: string,
    metadata: Record<string, any> = {}
  ): Promise<SanitizedTransaction> {
    // Validation
    if (points <= 0) {
      throw new Error('Points must be greater than 0');
    }

    const transactionId = uuidv4();
    const timestamp = new Date().toISOString();

    // Get user - handle sanitized return type
    const user: SanitizedUser | null = await UserService.getUserById(userId);
    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    // Calculate new balances
    const newBalance = user.points + points;
    const newLifetimePoints = user.lifetimePoints + points;

    // Create transaction record
    const transaction: PointsTransaction = {
      PK: `USER#${userId}`,
      SK: `POINTS#${transactionId}`,
      GSI1PK: `POINTS#${userId}`,
      GSI1SK: `DATE#${timestamp}`,
      entityType: 'POINTS',
      transactionId,
      userId,
      type: 'earned',
      points,
      balance: newBalance,
      lifetimePoints: newLifetimePoints,
      reason,
      metadata,
      createdAt: timestamp,
    };

    // Atomic transaction to update both points record and user balance
    await dynamodb.transactWrite([
      {
        type: 'Put',
        item: transaction,
      },
      {
        type: 'Update',
        pk: `USER#${userId}`,
        sk: 'PROFILE',
        updateExpression: 'SET points = :points, lifetimePoints = :lifetime, updatedAt = :timestamp',
        expressionAttributeValues: {
          ':points': newBalance,
          ':lifetime': newLifetimePoints,
          ':timestamp': timestamp,
        },
      },
    ]);

    // Publish event for downstream processing (campaigns, notifications, etc.)
    await publishEvent('points.awarded', {
      userId,
      transactionId,
      points,
      newBalance,
      newLifetimePoints,
      reason,
      metadata,
      timestamp,
    });

    return this.sanitizeTransaction(transaction);
  }

  /**
   * Redeem (deduct) points from a user
   * 
   * @param userId - The user's ID
   * @param points - Amount of points to redeem (must be > 0)
   * @param reason - Reason for redeeming points
   * @param metadata - Optional metadata for the transaction
   * @returns The sanitized transaction record
   * 
   * @throws Error if points <= 0, user not found, or insufficient balance
   * 
   * @example
   * ```typescript
   * await pointsService.redeemPoints('user_123', 100, 'Redeemed for discount', {
   *   orderId: 'order_456',
   *   discountAmount: 10.00
   * });
   * ```
   */
  async redeemPoints(
    userId: string,
    points: number,
    reason: string,
    metadata: Record<string, any> = {}
  ): Promise<SanitizedTransaction> {
    // Validation
    if (points <= 0) {
      throw new Error('Points must be greater than 0');
    }

    const transactionId = uuidv4();
    const timestamp = new Date().toISOString();

    // Get user
    const user: SanitizedUser | null = await UserService.getUserById(userId);
    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    // Check sufficient balance
    if (user.points < points) {
      throw new Error(
        `Insufficient points. Available: ${user.points}, Required: ${points}`
      );
    }

    // Calculate new balance
    const newBalance = user.points - points;

    // Create transaction record (negative points for redemption)
    const transaction: PointsTransaction = {
      PK: `USER#${userId}`,
      SK: `POINTS#${transactionId}`,
      GSI1PK: `POINTS#${userId}`,
      GSI1SK: `DATE#${timestamp}`,
      entityType: 'POINTS',
      transactionId,
      userId,
      type: 'redeemed',
      points: -points, // Negative for deduction
      balance: newBalance,
      lifetimePoints: user.lifetimePoints, // Lifetime doesn't decrease
      reason,
      metadata,
      createdAt: timestamp,
    };

    // Atomic transaction
    await dynamodb.transactWrite([
      {
        type: 'Put',
        item: transaction,
      },
      {
        type: 'Update',
        pk: `USER#${userId}`,
        sk: 'PROFILE',
        updateExpression: 'SET points = :points, updatedAt = :timestamp',
        expressionAttributeValues: {
          ':points': newBalance,
          ':timestamp': timestamp,
        },
      },
    ]);

    // Publish event
    await publishEvent('points.redeemed', {
      userId,
      transactionId,
      points,
      newBalance,
      reason,
      metadata,
      timestamp,
    });

    return this.sanitizeTransaction(transaction);
  }

  /**
   * Expire points for a user (e.g., points expiration policy)
   * 
   * @param userId - The user's ID
   * @param points - Amount of points to expire
   * @param reason - Reason for expiration
   * @returns The sanitized transaction record
   * 
   * @throws Error if points <= 0, user not found, or no points to expire
   */
  async expirePoints(
    userId: string,
    points: number,
    reason: string = 'Points expired'
  ): Promise<SanitizedTransaction> {
    if (points <= 0) {
      throw new Error('Points must be greater than 0');
    }

    const transactionId = uuidv4();
    const timestamp = new Date().toISOString();

    const user: SanitizedUser | null = await UserService.getUserById(userId);
    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    // Don't expire more than available
    const newBalance = Math.max(0, user.points - points);
    const actualExpired = user.points - newBalance;

    if (actualExpired === 0) {
      throw new Error('No points to expire');
    }

    const transaction: PointsTransaction = {
      PK: `USER#${userId}`,
      SK: `POINTS#${transactionId}`,
      GSI1PK: `POINTS#${userId}`,
      GSI1SK: `DATE#${timestamp}`,
      entityType: 'POINTS',
      transactionId,
      userId,
      type: 'expired',
      points: -actualExpired,
      balance: newBalance,
      lifetimePoints: user.lifetimePoints,
      reason,
      metadata: { 
        requestedExpiration: points, 
        actualExpired 
      },
      createdAt: timestamp,
    };

    await dynamodb.transactWrite([
      {
        type: 'Put',
        item: transaction,
      },
      {
        type: 'Update',
        pk: `USER#${userId}`,
        sk: 'PROFILE',
        updateExpression: 'SET points = :points, updatedAt = :timestamp',
        expressionAttributeValues: {
          ':points': newBalance,
          ':timestamp': timestamp,
        },
      },
    ]);

    await publishEvent('points.expired', {
      userId,
      transactionId,
      points: actualExpired,
      newBalance,
      reason,
      timestamp,
    });

    return this.sanitizeTransaction(transaction);
  }

  /**
   * Get a user's current points balance
   * 
   * @param userId - The user's ID
   * @returns Balance information including current points, lifetime points, and tier
   * 
   * @throws Error if user not found
   */
  async getBalance(userId: string): Promise<PointsBalance> {
    const user: SanitizedUser | null = await UserService.getUserById(userId);
    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    return {
      userId,
      points: user.points,
      lifetimePoints: user.lifetimePoints,
      tier: user.tier,
    };
  }

  /**
   * Get transaction history for a user
   * 
   * @param userId - The user's ID
   * @param options - Pagination options
   * @returns Paginated transaction history
   * 
   * @example
   * ```typescript
   * const history = await pointsService.getTransactionHistory('user_123', {
   *   limit: 20
   * });
   * 
   * // Get next page
   * const nextPage = await pointsService.getTransactionHistory('user_123', {
   *   limit: 20,
   *   lastEvaluatedKey: history.nextToken
   * });
   * ```
   */
  async getTransactionHistory(
    userId: string,
    options: { limit?: number; lastEvaluatedKey?: any } = {}
  ): Promise<TransactionHistoryResult> {
    const { limit = 50, lastEvaluatedKey } = options;

    const result = await dynamodb.query(`USER#${userId}`, {
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': `USER#${userId}`,
        ':sk': 'POINTS#',
      },
      Limit: limit,
      ScanIndexForward: false, // Most recent first
      ...(lastEvaluatedKey && { ExclusiveStartKey: lastEvaluatedKey }),
    });

    return {
      transactions: result.items.map((t: PointsTransaction) => 
        this.sanitizeTransaction(t)
      ),
      nextToken: result.lastEvaluatedKey,
      count: result.count,
    };
  }

  /**
   * Get points statistics for a user
   * 
   * @param userId - The user's ID
   * @returns Aggregated points statistics
   */
  async getPointsStats(userId: string): Promise<{
    totalEarned: number;
    totalRedeemed: number;
    totalExpired: number;
    currentBalance: number;
    lifetimePoints: number;
    transactionCount: number;
  }> {
    const history = await this.getTransactionHistory(userId, { limit: 1000 });
    
    const stats = history.transactions.reduce(
      (acc, transaction) => {
        if (transaction.type === 'earned') {
          acc.totalEarned += transaction.points;
        } else if (transaction.type === 'redeemed') {
          acc.totalRedeemed += Math.abs(transaction.points);
        } else if (transaction.type === 'expired') {
          acc.totalExpired += Math.abs(transaction.points);
        }
        return acc;
      },
      { totalEarned: 0, totalRedeemed: 0, totalExpired: 0 }
    );

    const balance = await this.getBalance(userId);

    return {
      ...stats,
      currentBalance: balance.points,
      lifetimePoints: balance.lifetimePoints,
      transactionCount: history.count,
    };
  }

  /**
   * Remove DynamoDB keys from transaction object
   * @private
   */
  private sanitizeTransaction(transaction: PointsTransaction): SanitizedTransaction {
    const { PK, SK, GSI1PK, GSI1SK, ...sanitized } = transaction;
    return sanitized;
  }
}

// Export singleton instance
export const pointsService = new PointsService();
export default pointsService;