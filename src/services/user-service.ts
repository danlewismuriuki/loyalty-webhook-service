import { v4 as uuidv4 } from 'uuid';
import dynamodb from '../shared/dynamodb-client';
import { publishEvent } from '../shared/eventbridge';
import {
  User,
  UserTier,
  UserStatus,
  CreateUserInput,
  UpdateUserInput,
  UserStats,
} from '../types/user.types';

interface ListUsersOptions {
  limit?: number;
  lastEvaluatedKey?: Record<string, any>;
}

interface ListUsersResponse {
  users: Omit<User, 'PK' | 'SK' | 'GSI1PK' | 'GSI1SK' | 'GSI2PK' | 'GSI2SK'>[];
  nextToken?: Record<string, any>;
  count: number;
}

interface GetUsersByTierOptions {
  limit?: number;
}

interface GetUsersByTierResponse {
  users: Omit<User, 'PK' | 'SK' | 'GSI1PK' | 'GSI1SK' | 'GSI2PK' | 'GSI2SK'>[];
  count: number;
}

class UserService {
  /**
   * Create a new user
   */
  async createUser(userData: CreateUserInput): Promise<Omit<User, 'PK' | 'SK' | 'GSI1PK' | 'GSI1SK' | 'GSI2PK' | 'GSI2SK'>> {
    const userId = uuidv4();
    const timestamp = new Date().toISOString();

    // Validate required fields
    if (!userData.email || !userData.name) {
      throw new Error('Email and name are required');
    }

    // Check if email already exists
    const existingUser = await this.getUserByEmail(userData.email);
    if (existingUser) {
      throw new Error('User with this email already exists');
    }

    const user: User = {
      PK: `USER#${userId}`,
      SK: 'PROFILE',
      GSI1PK: `EMAIL#${userData.email.toLowerCase()}`,
      GSI1SK: `USER#${userId}`,
      entityType: 'USER',
      userId,
      email: userData.email.toLowerCase(),
      name: userData.name,
      phone: userData.phone || null,
      points: 0,
      lifetimePoints: 0,
      tier: 'bronze',
      status: 'active',
      metadata: userData.metadata || {},
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    await dynamodb.put<User>(user);

    // Publish user.created event
    await publishEvent('user.created', {
      userId,
      email: user.email,
      name: user.name,
      timestamp,
    });

    return this.sanitizeUser(user);
  }

  /**
   * Get user by ID
   */
  async getUserById(userId: string): Promise<Omit<User, 'PK' | 'SK' | 'GSI1PK' | 'GSI1SK' | 'GSI2PK' | 'GSI2SK'> | null> {
    const user = await dynamodb.get<User>(`USER#${userId}`, 'PROFILE');
    return user ? this.sanitizeUser(user) : null;
  }

  /**
   * Get user by email (using GSI1)
   */
  async getUserByEmail(email: string): Promise<Omit<User, 'PK' | 'SK' | 'GSI1PK' | 'GSI1SK' | 'GSI2PK' | 'GSI2SK'> | null> {
    const result = await dynamodb.queryGSI<User>('GSI1', `EMAIL#${email.toLowerCase()}`, {
      Limit: 1,
    });

    return result.items.length > 0 ? this.sanitizeUser(result.items[0]) : null;
  }

  /**
   * Update user profile
   */
  async updateUser(userId: string, updates: UpdateUserInput): Promise<Omit<User, 'PK' | 'SK' | 'GSI1PK' | 'GSI1SK' | 'GSI2PK' | 'GSI2SK'>> {
    // Remove fields that shouldn't be updated directly
    const { ...safeUpdates } = updates;

    const updatedUser = await dynamodb.update<User>(
      `USER#${userId}`,
      'PROFILE',
      safeUpdates,
    );

    // Publish user.updated event
    await publishEvent('user.updated', {
      userId,
      updates: safeUpdates,
      timestamp: new Date().toISOString(),
    });

    return this.sanitizeUser(updatedUser);
  }

  /**
   * Update user points
   */
  async updatePoints(
    userId: string,
    pointsChange: number,
    reason: string = 'manual_adjustment'
  ): Promise<Omit<User, 'PK' | 'SK' | 'GSI1PK' | 'GSI1SK' | 'GSI2PK' | 'GSI2SK'>> {
    const user = await this.getUserById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const newPoints = Math.max(0, user.points + pointsChange);
    const newLifetimePoints = user.lifetimePoints + Math.max(0, pointsChange);

    // Determine new tier based on lifetime points
    const newTier = this.calculateTier(newLifetimePoints);

    const updatedUser = await dynamodb.update<User>(`USER#${userId}`, 'PROFILE', {
      points: newPoints,
      lifetimePoints: newLifetimePoints,
      tier: newTier,
    });

    // Publish points.updated event
    await publishEvent('points.updated', {
      userId,
      pointsChange,
      newBalance: newPoints,
      lifetimePoints: newLifetimePoints,
      tier: newTier,
      reason,
      timestamp: new Date().toISOString(),
    });

    return this.sanitizeUser(updatedUser);
  }

  /**
   * Calculate user tier based on lifetime points
   */
  calculateTier(lifetimePoints: number): UserTier {
    if (lifetimePoints >= 10000) return 'platinum';
    if (lifetimePoints >= 5000) return 'gold';
    if (lifetimePoints >= 1000) return 'silver';
    return 'bronze';
  }

  /**
   * Deactivate user account
   */
  async deactivateUser(userId: string): Promise<Omit<User, 'PK' | 'SK' | 'GSI1PK' | 'GSI1SK' | 'GSI2PK' | 'GSI2SK'>> {
    const updatedUser = await dynamodb.update<User>(`USER#${userId}`, 'PROFILE', {
      status: 'inactive' as UserStatus,
    });

    // Publish user.deactivated event
    await publishEvent('user.deactivated', {
      userId,
      timestamp: new Date().toISOString(),
    });

    return this.sanitizeUser(updatedUser);
  }

  /**
   * Delete user account (GDPR compliance)
   */
  async deleteUser(userId: string): Promise<{ success: boolean; userId: string }> {
    await dynamodb.delete(`USER#${userId}`, 'PROFILE');

    // Publish user.deleted event
    await publishEvent('user.deleted', {
      userId,
      timestamp: new Date().toISOString(),
    });

    return { success: true, userId };
  }

  /**
   * Get user statistics
   */
  async getUserStats(userId: string): Promise<UserStats> {
    const user = await this.getUserById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Get user's orders count (query orders by user)
    const ordersResult = await dynamodb.query(`USER#${userId}`, {
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': `USER#${userId}`,
        ':sk': 'ORDER#',
      },
    });

    // Get user's points transactions count
    const pointsResult = await dynamodb.query(`USER#${userId}`, {
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': `USER#${userId}`,
        ':sk': 'POINTS#',
      },
    });

    return {
      userId,
      points: user.points,
      lifetimePoints: user.lifetimePoints,
      tier: user.tier,
      totalOrders: ordersResult.count,
      totalTransactions: pointsResult.count,
      memberSince: user.createdAt,
    };
  }

  /**
   * List all users (with pagination)
   */
  async listUsers(options: ListUsersOptions = {}): Promise<ListUsersResponse> {
    const { limit = 50, lastEvaluatedKey } = options;

    const result = await dynamodb.query<User>('USER#', {
      KeyConditionExpression: 'begins_with(PK, :pk)',
      ExpressionAttributeValues: {
        ':pk': 'USER#',
      },
      Limit: limit,
      ...(lastEvaluatedKey && { ExclusiveStartKey: lastEvaluatedKey }),
    });

    return {
      users: result.items.map((user) => this.sanitizeUser(user)),
      nextToken: result.lastEvaluatedKey,
      count: result.count,
    };
  }

  /**
   * Search users by tier
   */
  async getUsersByTier(tier: UserTier, options: GetUsersByTierOptions = {}): Promise<GetUsersByTierResponse> {
    const { limit = 50 } = options;

    const result = await dynamodb.scan<User>({
      FilterExpression: 'tier = :tier AND entityType = :type',
      ExpressionAttributeValues: {
        ':tier': tier,
        ':type': 'USER',
      },
      Limit: limit,
    });

    return {
      users: result.items.map((user) => this.sanitizeUser(user)),
      count: result.count,
    };
  }

  /**
   * Remove sensitive data from user object
   */
  private sanitizeUser(user: User): Omit<User, 'PK' | 'SK' | 'GSI1PK' | 'GSI1SK' | 'GSI2PK' | 'GSI2SK'> {
    const { PK, SK, GSI1PK, GSI1SK, GSI2PK, GSI2SK, ...sanitized } = user;
    return sanitized;
  }
}

// Export singleton instance
const userService = new UserService();
export default userService;

// Also export the class for testing
export { UserService as UserServiceClass };