import * as dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

interface AWSConfig {
  region: string;
  accountId: string;
}

interface DynamoDBConfig {
  tableName: string;
  endpoint?: string;
  gsi1Name: string;
  gsi2Name: string;
}

interface SQSConfig {
  campaignQueueUrl: string;
  notificationQueueUrl: string;
  dlqUrl: string;
}

interface S3Config {
  bucketName: string;
  region: string;
}

interface AuthConfig {
  jwtSecret: string;
  jwtExpiry: string;
  jwtIssuer: string;
}

interface NotificationConfig {
  sesFromEmail: string;
  sesRegion: string;
  snsTopicArn: string;
}

interface WebhookConfig {
  stripeSecret: string;
  shopifySecret: string;
  hubspotSecret: string;
}

interface FeatureFlags {
  enableWebhooks: boolean;
  enableNotifications: boolean;
  enableDebugLogs: boolean;
  enableCaching: boolean;
}

interface AppConfig {
  nodeEnv: string;
  port: number;
  logLevel: string;
}

interface Config {
  aws: AWSConfig;
  dynamodb: DynamoDBConfig;
  sqs: SQSConfig;
  s3: S3Config;
  auth: AuthConfig;
  notifications: NotificationConfig;
  webhooks: WebhookConfig;
  features: FeatureFlags;
  app: AppConfig;
}

// Helper function to get required environment variable
function getEnvVar(key: string, defaultValue?: string): string {
  const value = process.env[key] || defaultValue;
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

// Helper function to get optional environment variable
function getOptionalEnvVar(key: string, defaultValue: string = ''): string {
  return process.env[key] || defaultValue;
}

// Helper function to parse boolean from environment variable
function parseBool(key: string, defaultValue: boolean = false): boolean {
  const value = process.env[key];
  if (!value) return defaultValue;
  return value.toLowerCase() === 'true';
}

// Helper function to parse number from environment variable
function parseNumber(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

// Configuration object
const config: Config = {
  // AWS Configuration
  aws: {
    region: getEnvVar('AWS_REGION', 'us-east-1'),
    accountId: getOptionalEnvVar('AWS_ACCOUNT_ID'),
  },

  // DynamoDB Configuration
  dynamodb: {
    tableName: getEnvVar('DYNAMODB_TABLE_NAME', 'loyalty-system-table'),
    endpoint: getOptionalEnvVar('DYNAMODB_ENDPOINT'), // For local development
    gsi1Name: 'GSI1',
    gsi2Name: 'GSI2',
  },

  // SQS Configuration
  sqs: {
    campaignQueueUrl: getEnvVar('SQS_CAMPAIGN_QUEUE_URL'),
    notificationQueueUrl: getEnvVar('SQS_NOTIFICATION_QUEUE_URL'),
    dlqUrl: getEnvVar('SQS_DLQ_URL'),
  },

  // S3 Configuration
  s3: {
    bucketName: getEnvVar('S3_BUCKET_NAME'),
    region: getEnvVar('S3_REGION', 'us-east-1'),
  },

  // Authentication Configuration
  auth: {
    jwtSecret: getEnvVar('JWT_SECRET'),
    jwtExpiry: getEnvVar('JWT_EXPIRY', '24h'),
    jwtIssuer: 'loyalty-system',
  },

  // Notifications Configuration
  notifications: {
    sesFromEmail: getEnvVar('SES_FROM_EMAIL'),
    sesRegion: getEnvVar('SES_REGION', 'us-east-1'),
    snsTopicArn: getEnvVar('SNS_TOPIC_ARN'),
  },

  // Webhook Secrets Configuration
  webhooks: {
    stripeSecret: getOptionalEnvVar('STRIPE_WEBHOOK_SECRET'),
    shopifySecret: getOptionalEnvVar('SHOPIFY_WEBHOOK_SECRET'),
    hubspotSecret: getOptionalEnvVar('HUBSPOT_WEBHOOK_SECRET'),
  },

  // Feature Flags
  features: {
    enableWebhooks: parseBool('ENABLE_WEBHOOKS', true),
    enableNotifications: parseBool('ENABLE_NOTIFICATIONS', true),
    enableDebugLogs: parseBool('ENABLE_DEBUG_LOGS', false),
    enableCaching: parseBool('ENABLE_CACHING', true),
  },

  // Application Configuration
  app: {
    nodeEnv: getEnvVar('NODE_ENV', 'development'),
    port: parseNumber('PORT', 3000),
    logLevel: getEnvVar('LOG_LEVEL', 'info'),
  },
};

// Validate critical configuration on startup
function validateConfig(): void {
  const requiredFields = [
    'aws.region',
    'dynamodb.tableName',
    'auth.jwtSecret',
  ];

  const errors: string[] = [];

  for (const field of requiredFields) {
    const keys = field.split('.');
    let value: any = config;
    
    for (const key of keys) {
      value = value[key];
    }

    if (!value) {
      errors.push(`Missing required configuration: ${field}`);
    }
  }

  if (errors.length > 0) {
    console.error('Configuration validation failed:');
    errors.forEach((error) => console.error(`  - ${error}`));
    throw new Error('Invalid configuration');
  }
}

// Validate configuration on module load (only in production)
if (config.app.nodeEnv === 'production') {
  validateConfig();
}

// Export configuration
export default config;

// Export types for use in other modules
export type {
  Config,
  AWSConfig,
  DynamoDBConfig,
  SQSConfig,
  S3Config,
  AuthConfig,
  NotificationConfig,
  WebhookConfig,
  FeatureFlags,
  AppConfig,
};

// Export helper function for runtime config updates (testing only)
export function updateConfig(updates: Partial<Config>): void {
  if (config.app.nodeEnv === 'production') {
    throw new Error('Cannot update config in production');
  }
  Object.assign(config, updates);
}

// Export validation function
export { validateConfig };