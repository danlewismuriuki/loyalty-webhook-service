# Loyalty System Architecture

## Overview

This loyalty and rewards system is serverless, event-driven, and built entirely on AWS Free Tier services.

## External Systems

- **Client Apps**: Admin dashboard, mobile apps, POS systems.
- **Third-Party Webhooks**: Payment gateways, CRM systems.

## AWS Free Tier Services

- **API Gateway**: REST endpoints for webhooks and APIs.
- **Lambda**: Webhook handlers, API handlers, background workers.
- **DynamoDB**: Single-table design for users, orders, campaigns, points ledger.
- **SQS**: Standard queue for campaign jobs, FIFO queue for notifications, DLQ for failed messages.
- **S3**: Store logs, notification templates, backups.
- **SNS/SES**: Notifications via email/SMS.
- **CloudWatch**: Logging, metrics, and alarms.
- **EventBridge**: Event routing from service to queues.

## Application Logic

- **Order Service**: Create/update orders, emit events.
- **User Service**: Manage user profiles in DynamoDB.
- **Campaign Service**: Run rules engine for campaigns.
- **Points Service**: Maintain points ledger.
- **Notification Service**: Send notifications via SES/SNS.
- **Cache Layer**: Optional DynamoDB caching for fast lookups.

## Data Flow

1. Client Apps or Webhooks send requests → API Gateway.
2. API Gateway triggers Lambda functions (webhook handler or API handler).
3. Lambda validates requests, checks idempotency, writes to DynamoDB, emits events.
4. EventBridge routes events to SQS queues → triggers worker Lambdas.
5. Workers process campaigns, notifications, update cache, and write logs to S3.
6. Notifications sent via SES/SNS.
7. CloudWatch monitors logs, metrics, and triggers alarms for failed messages.

## Notes

- All services are designed to stay within AWS Free Tier limits.
- DynamoDB streams and TTL ensure event-driven processing and data expiration.
