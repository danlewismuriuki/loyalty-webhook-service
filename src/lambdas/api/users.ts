import { APIGatewayProxyHandler, APIGatewayProxyEvent } from 'aws-lambda';
// import { UserService } from '../../services/user-service';
import UserService from './user-service';
import { validateJWT } from '../../shared/auth';
import { successResponse, errorResponse } from '../../shared/utils';
import { AuthenticatedUser, CreateUserInput, UpdateUserInput } from '../../types/user.types';

/**
 * Main Lambda handler for Users API
 */
export const handler: APIGatewayProxyHandler = async (event: APIGatewayProxyEvent) => {
  console.log('Event:', JSON.stringify(event, null, 2));

  try {
    // Validate JWT token
    const user = await validateJWT(event.headers?.Authorization || '');
    if (!user) {
      return errorResponse(401, 'Unauthorized', 'UNAUTHORIZED');
    }

    const { httpMethod, pathParameters, queryStringParameters, body } = event;
    const userId = pathParameters?.userId;

    switch (httpMethod) {
      case 'POST':
        return await createUser(body || '', user);
      case 'GET':
        if (userId) return await getUser(userId, user);
        return await listUsers(queryStringParameters, user);
      case 'PUT':
        if (!userId) return errorResponse(400, 'User ID is required', 'VALIDATION_ERROR');
        return await updateUser(userId, body || '', user);
      case 'DELETE':
        if (!userId) return errorResponse(400, 'User ID is required', 'VALIDATION_ERROR');
        return await deleteUser(userId, user);
      default:
        return errorResponse(405, 'Method not allowed', 'METHOD_NOT_ALLOWED');
    }
  } catch (error: any) {
    console.error('Error:', error);
    return errorResponse(500, error.message, 'INTERNAL_ERROR');
  }
};

/**
 * Create a new user
 */
async function createUser(bodyString: string, authenticatedUser: AuthenticatedUser) {
  try {
    const userData: CreateUserInput = JSON.parse(bodyString);

    if (!userData.email || !userData.name) {
      return errorResponse(400, 'Email and name are required', 'VALIDATION_ERROR');
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(userData.email)) {
      return errorResponse(400, 'Invalid email format', 'VALIDATION_ERROR');
    }

    const user = await UserService.createUser(userData);

    return successResponse(201, {
      message: 'User created successfully',
      data: user,
    });
  } catch (error: any) {
    if (error.message.includes('already exists')) {
      return errorResponse(409, error.message, 'CONFLICT');
    }
    throw error;
  }
}

/**
 * Get user by ID
 */
async function getUser(userId: string, authenticatedUser: AuthenticatedUser) {
  if (userId !== authenticatedUser.userId && authenticatedUser.role !== 'admin') {
    return errorResponse(403, 'Forbidden', 'FORBIDDEN');
  }

  const user = await UserService.getUserById(userId);
  if (!user) {
    return errorResponse(404, 'User not found', 'NOT_FOUND');
  }

  return successResponse(200, { data: user });
}

/**
 * List users (admin only)
 */
async function listUsers(queryParams: any, authenticatedUser: AuthenticatedUser) {
  if (authenticatedUser.role !== 'admin') {
    return errorResponse(403, 'Forbidden - Admin access required', 'FORBIDDEN');
  }

  const limit = parseInt(queryParams?.limit || '50');
  const lastEvaluatedKey = queryParams?.nextToken
    ? JSON.parse(Buffer.from(queryParams.nextToken, 'base64').toString())
    : undefined;

  const result = await UserService.listUsers({ limit, lastEvaluatedKey });

  const nextToken = result.nextToken
    ? Buffer.from(JSON.stringify(result.nextToken)).toString('base64')
    : null;

  return successResponse(200, {
    data: {
      users: result.users,
      count: result.count,
      ...(nextToken && { nextToken }),
    },
  });
}

/**
 * Update user
 */
async function updateUser(userId: string, bodyString: string, authenticatedUser: AuthenticatedUser) {
  if (userId !== authenticatedUser.userId && authenticatedUser.role !== 'admin') {
    return errorResponse(403, 'Forbidden', 'FORBIDDEN');
  }

  try {
    const updates: UpdateUserInput = JSON.parse(bodyString);

    delete (updates as any).userId;
    delete (updates as any).points;
    delete (updates as any).lifetimePoints;
    delete (updates as any).tier;
    delete (updates as any).createdAt;

    const updatedUser = await UserService.updateUser(userId, updates);

    return successResponse(200, {
      message: 'User updated successfully',
      data: updatedUser,
    });
  } catch (error: any) {
    if (error.message.includes('not found')) {
      return errorResponse(404, error.message, 'NOT_FOUND');
    }
    throw error;
  }
}

/**
 * Delete user
 */
async function deleteUser(userId: string, authenticatedUser: AuthenticatedUser) {
  if (userId !== authenticatedUser.userId && authenticatedUser.role !== 'admin') {
    return errorResponse(403, 'Forbidden', 'FORBIDDEN');
  }

  try {
    await UserService.deleteUser(userId);

    return successResponse(200, {
      message: 'User deleted successfully',
      data: { userId },
    });
  } catch (error: any) {
    if (error.message.includes('not found')) {
      return errorResponse(404, error.message, 'NOT_FOUND');
    }
    throw error;
  }
}
