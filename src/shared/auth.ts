// import jwt, { SignOptions } from 'jsonwebtoken';
// import crypto from 'crypto';
// import config from '../config';
// import { APIGatewayTokenAuthorizerEvent, APIGatewayAuthorizerResult } from 'aws-lambda';

// /**
//  * JWT payload structure
//  */
// export interface JWTPayload {
//   userId: string;
//   email: string;
//   role: 'user' | 'admin';
//   [key: string]: any;
// }

// /**
//  * Decoded JWT with standard claims
//  */
// export interface DecodedJWT extends JWTPayload {
//   iat?: number;  // Issued at
//   exp?: number;  // Expiration time
//   iss?: string;  // Issuer
// }

// /**
//  * Auth tokens response
//  */
// export interface AuthTokens {
//   accessToken: string;
//   refreshToken: string;
//   expiresIn: string;
// }

// /**
//  * User for token creation
//  */
// export interface TokenUser {
//   userId: string;
//   email: string;
//   role?: 'user' | 'admin';
// }

// /**
//  * Generate JWT token
//  */
// export function generateToken(
//   payload: JWTPayload,
//   expiresIn: string | number = config.auth.jwtExpiry
// ): string {
//   return jwt.sign(payload, config.auth.jwtSecret, {
//     expiresIn: expiresIn,
//     issuer: config.auth.jwtIssuer,
//   });
// }

// /**
//  * Verify and decode JWT token
//  */
// export function verifyToken(token: string): DecodedJWT {
//   try {
//     // Remove 'Bearer ' prefix if present
//     const cleanToken = token.replace('Bearer ', '').trim();

//     const decoded = jwt.verify(cleanToken, config.auth.jwtSecret, {
//       issuer: config.auth.jwtIssuer,
//     }) as DecodedJWT;

//     return decoded;
//   } catch (error: any) {
//     if (error.name === 'TokenExpiredError') {
//       throw new Error('Token has expired');
//     }
//     if (error.name === 'JsonWebTokenError') {
//       throw new Error('Invalid token');
//     }
//     throw error;
//   }
// }

// /**
//  * Validate JWT from API Gateway event
//  */
// export async function validateJWT(
//   authorizationHeader?: string
// ): Promise<DecodedJWT | null> {
//   if (!authorizationHeader) {
//     throw new Error('No authorization header provided');
//   }

//   try {
//     const decoded = verifyToken(authorizationHeader);

//     // Check if token is expired
//     if (decoded.exp && decoded.exp < Math.floor(Date.now() / 1000)) {
//       throw new Error('Token has expired');
//     }

//     // Return decoded token with explicit role fallback
//     return {
//       ...decoded,
//       role: decoded.role || 'user',
//     } as DecodedJWT;
//   } catch (error: any) {
//     console.error('JWT validation error:', error.message);
//     return null;
//   }
// }

// /**
//  * Generate refresh token
//  */
// export function generateRefreshToken(payload: JWTPayload): string {
//   return jwt.sign(payload, config.auth.jwtSecret, {
//     expiresIn: '7d',
//     issuer: config.auth.jwtIssuer,
//   });
// }

// /**
//  * Create auth tokens (access + refresh)
//  */
// export function createAuthTokens(user: TokenUser): AuthTokens {
//   const payload: JWTPayload = {
//     userId: user.userId,
//     email: user.email,
//     role: user.role || 'user',
//   };

//   return {
//     accessToken: generateToken(payload),
//     refreshToken: generateRefreshToken(payload),
//     expiresIn: config.auth.jwtExpiry,
//   };
// }

// /**
//  * Lambda authorizer handler for API Gateway
//  */
// export async function authorizerHandler(
//   event: APIGatewayTokenAuthorizerEvent
// ): Promise<APIGatewayAuthorizerResult> {
//   console.log('Authorizer event:', JSON.stringify(event, null, 2));

//   try {
//     const token = event.authorizationToken || (event as any).headers?.Authorization;

//     if (!token) {
//       return generatePolicy('user', 'Deny', event.methodArn);
//     }

//     const decoded = verifyToken(token);

//     // Generate IAM policy
//     return generatePolicy(decoded.userId, 'Allow', event.methodArn, {
//       userId: decoded.userId,
//       email: decoded.email,
//       role: decoded.role || 'user',
//     });
//   } catch (error) {
//     console.error('Authorization error:', error);
//     return generatePolicy('user', 'Deny', event.methodArn);
//   }
// }

// /**
//  * Generate IAM policy for API Gateway
//  */
// function generatePolicy(
//   principalId: string,
//   effect: 'Allow' | 'Deny',
//   resource: string,
//   context: Record<string, any> = {}
// ): APIGatewayAuthorizerResult {
//   const authResponse: APIGatewayAuthorizerResult = {
//     principalId,
//     policyDocument: {
//       Version: '2012-10-17',
//       Statement: [
//         {
//           Action: 'execute-api:Invoke',
//           Effect: effect,
//           Resource: resource,
//         },
//       ],
//     },
//   };

//   // Add user context to be passed to Lambda functions
//   if (Object.keys(context).length > 0) {
//     authResponse.context = context;
//   }

//   return authResponse;
// }

// /**
//  * Hash password (for future password-based auth)
//  */
// export async function hashPassword(password: string): Promise<string> {
//   return new Promise((resolve, reject) => {
//     const salt = crypto.randomBytes(16).toString('hex');
//     crypto.scrypt(password, salt, 64, (err, derivedKey) => {
//       if (err) reject(err);
//       else resolve(salt + ':' + derivedKey.toString('hex'));
//     });
//   });
// }

// /**
//  * Verify password (for future password-based auth)
//  */
// export async function verifyPassword(
//   password: string,
//   hash: string
// ): Promise<boolean> {
//   return new Promise((resolve, reject) => {
//     const [salt, key] = hash.split(':');
//     crypto.scrypt(password, salt, 64, (err, derivedKey) => {
//       if (err) reject(err);
//       else resolve(key === derivedKey.toString('hex'));
//     });
//   });
// }

// /**
//  * Extract user ID from JWT token
//  */
// export function extractUserId(authorizationHeader?: string): string | null {
//   if (!authorizationHeader) return null;

//   try {
//     const decoded = verifyToken(authorizationHeader);
//     return decoded.userId;
//   } catch {
//     return null;
//   }
// }

// /**
//  * Check if user has admin role
//  */
// export function isAdmin(authorizationHeader?: string): boolean {
//   if (!authorizationHeader) return false;

//   try {
//     const decoded = verifyToken(authorizationHeader);
//     return decoded.role === 'admin';
//   } catch {
//     return false;
//   }
// }

// /**
//  * Validate token expiration
//  */
// export function isTokenExpired(token: string): boolean {
//   try {
//     const decoded = verifyToken(token);
//     if (!decoded.exp) return false;
//     return decoded.exp < Math.floor(Date.now() / 1000);
//   } catch {
//     return true;
//   }
// }





import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import config from '../config';
import { APIGatewayTokenAuthorizerEvent, APIGatewayAuthorizerResult } from 'aws-lambda';

/**
 * JWT payload structure
 */
export interface JWTPayload {
  userId: string;
  email: string;
  role: 'user' | 'admin';
  [key: string]: any;
}

/**
 * Decoded JWT with standard claims
 */
export interface DecodedJWT extends JWTPayload {
  iat?: number;
  exp?: number;
  iss?: string;
}

/**
 * Auth tokens response
 */
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
}

/**
 * User for token creation
 */
export interface TokenUser {
  userId: string;
  email: string;
  role?: 'user' | 'admin';
}

export function generateToken(
    payload: JWTPayload,
    expiresIn?: string | number
  ): string {
    const jwtExpiry = expiresIn !== undefined ? expiresIn : config.auth.jwtExpiry;
    
    return jwt.sign(payload, config.auth.jwtSecret, {
      issuer: config.auth.jwtIssuer,
      expiresIn: jwtExpiry as any, // Type assertion to bypass strict type checking
    });
  }

/**
 * Verify and decode JWT token
 */
export function verifyToken(token: string): DecodedJWT {
  try {
    const cleanToken = token.replace('Bearer ', '').trim();

    const decoded = jwt.verify(cleanToken, config.auth.jwtSecret, {
      issuer: config.auth.jwtIssuer,
    }) as DecodedJWT;

    return decoded;
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      throw new Error('Token has expired');
    }
    if (error.name === 'JsonWebTokenError') {
      throw new Error('Invalid token');
    }
    throw error;
  }
}

/**
 * Validate JWT from API Gateway event
 */
export async function validateJWT(
  authorizationHeader?: string
): Promise<DecodedJWT | null> {
  if (!authorizationHeader) {
    throw new Error('No authorization header provided');
  }

  try {
    const decoded = verifyToken(authorizationHeader);

    if (decoded.exp && decoded.exp < Math.floor(Date.now() / 1000)) {
      throw new Error('Token has expired');
    }

    return {
      ...decoded,
      role: decoded.role || 'user',
    } as DecodedJWT;
  } catch (error: any) {
    console.error('JWT validation error:', error.message);
    return null;
  }
}

/**
 * Generate refresh token
 */
export function generateRefreshToken(payload: JWTPayload): string {
  return jwt.sign(payload, config.auth.jwtSecret, {
    expiresIn: '7d',
    issuer: config.auth.jwtIssuer,
  });
}

/**
 * Create auth tokens (access + refresh)
 */
export function createAuthTokens(user: TokenUser): AuthTokens {
  const payload: JWTPayload = {
    userId: user.userId,
    email: user.email,
    role: user.role || 'user',
  };

  return {
    accessToken: generateToken(payload),
    refreshToken: generateRefreshToken(payload),
    expiresIn: config.auth.jwtExpiry,
  };
}

/**
 * Lambda authorizer handler for API Gateway
 */
export async function authorizerHandler(
  event: APIGatewayTokenAuthorizerEvent
): Promise<APIGatewayAuthorizerResult> {
  console.log('Authorizer event:', JSON.stringify(event, null, 2));

  try {
    const token = event.authorizationToken || (event as any).headers?.Authorization;

    if (!token) {
      return generatePolicy('user', 'Deny', event.methodArn);
    }

    const decoded = verifyToken(token);

    return generatePolicy(decoded.userId, 'Allow', event.methodArn, {
      userId: decoded.userId,
      email: decoded.email,
      role: decoded.role || 'user',
    });
  } catch (error) {
    console.error('Authorization error:', error);
    return generatePolicy('user', 'Deny', event.methodArn);
  }
}

/**
 * Generate IAM policy for API Gateway
 */
function generatePolicy(
  principalId: string,
  effect: 'Allow' | 'Deny',
  resource: string,
  context: Record<string, any> = {}
): APIGatewayAuthorizerResult {
  const authResponse: APIGatewayAuthorizerResult = {
    principalId,
    policyDocument: {
      Version: '2012-10-17',
      Statement: [
        {
          Action: 'execute-api:Invoke',
          Effect: effect,
          Resource: resource,
        },
      ],
    },
  };

  if (Object.keys(context).length > 0) {
    authResponse.context = context;
  }

  return authResponse;
}

/**
 * Hash password (for future password-based auth)
 */
export async function hashPassword(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString('hex');
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(salt + ':' + derivedKey.toString('hex'));
    });
  });
}

/**
 * Verify password (for future password-based auth)
 */
export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const [salt, key] = hash.split(':');
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(key === derivedKey.toString('hex'));
    });
  });
}

/**
 * Extract user ID from JWT token
 */
export function extractUserId(authorizationHeader?: string): string | null {
  if (!authorizationHeader) return null;

  try {
    const decoded = verifyToken(authorizationHeader);
    return decoded.userId;
  } catch {
    return null;
  }
}

/**
 * Check if user has admin role
 */
export function isAdmin(authorizationHeader?: string): boolean {
  if (!authorizationHeader) return false;

  try {
    const decoded = verifyToken(authorizationHeader);
    return decoded.role === 'admin';
  } catch {
    return false;
  }
}

/**
 * Validate token expiration
 */
export function isTokenExpired(token: string): boolean {
  try {
    const decoded = verifyToken(token);
    if (!decoded.exp) return false;
    return decoded.exp < Math.floor(Date.now() / 1000);
  } catch {
    return true;
  }
}