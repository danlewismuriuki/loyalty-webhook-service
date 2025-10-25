import { v4 as uuidv4 } from 'uuid';
import dynamodb from '../shared/dynamodb-client';
import { publishEvent } from '../shared/eventbridge';
import UserService from './user-service';
import { Order, CreateOrderInput, OrderStatus, OrderStats } from '../types/order.types';

/**
 * OrderService handles creation, retrieval, updates, and events for orders
 */
class OrderService {
  /**
   * Create a new order
   */
  async createOrder(orderData: CreateOrderInput): Promise<Order> {
    const orderId = uuidv4();
    const timestamp = new Date().toISOString();

    if (!orderData.userId || !orderData.amount) {
      throw new Error('UserId and amount are required');
    }

    const user = await UserService.getUserById(orderData.userId);
    if (!user) throw new Error('User not found');

    const order: Order = {
      PK: `USER#${orderData.userId}`,
      SK: `ORDER#${orderId}#${timestamp}`,
      GSI1PK: `ORDER#${orderId}`,
      GSI1SK: `DATE#${timestamp}`,
      GSI2PK: `STATUS#${orderData.status || 'pending'}`,
      GSI2SK: `DATE#${timestamp}`,
      entityType: 'ORDER',
      orderId,
      userId: orderData.userId,
      amount: parseFloat(orderData.amount.toString()),
      currency: orderData.currency || 'USD',
      items: orderData.items || [],
      status: orderData.status || 'pending',
      paymentMethod: orderData.paymentMethod || null,
      shippingAddress: orderData.shippingAddress || null,
      metadata: orderData.metadata || {},
      pointsEarned: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    await dynamodb.put(order);

    await publishEvent('order.created', {
      orderId,
      userId: order.userId,
      amount: order.amount,
      currency: order.currency,
      status: order.status,
      timestamp,
    });

    return this.sanitizeOrder(order);
  }

  /**
   * Get order by ID
   */
  async getOrderById(orderId: string): Promise<Order | null> {
    const result = await dynamodb.queryGSI('GSI1', `ORDER#${orderId}`, { Limit: 1 });
    return result.items.length > 0 ? this.sanitizeOrder(result.items[0]) : null;
  }

  /**
   * Get all orders by user ID
   */
  async getOrdersByUserId(
    userId: string,
    options: { limit?: number; lastEvaluatedKey?: any; status?: OrderStatus } = {},
  ): Promise<{ orders: Order[]; nextToken?: any; count: number }> {
    const { limit = 50, lastEvaluatedKey, status } = options;

    let filterExpression: string | undefined;
    const expressionAttributeValues: Record<string, any> = {
      ':pk': `USER#${userId}`,
      ':sk': 'ORDER#',
    };

    if (status) {
      filterExpression = 'status = :status';
      expressionAttributeValues[':status'] = status;
    }

    const result = await dynamodb.query(`USER#${userId}`, {
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: expressionAttributeValues,
      ...(filterExpression && { FilterExpression: filterExpression }),
      Limit: limit,
      ScanIndexForward: false,
      ...(lastEvaluatedKey && { ExclusiveStartKey: lastEvaluatedKey }),
    });

    return {
      orders: result.items.map((o: any) => this.sanitizeOrder(o)),
      nextToken: result.lastEvaluatedKey,
      count: result.count,
    };
  }

  /**
   * Update order status
   */
  async updateOrderStatus(orderId: string, status: OrderStatus, metadata: Record<string, any> = {}): Promise<Order> {
    const order = await this.getOrderById(orderId);
    if (!order) throw new Error('Order not found');

    const timestamp = new Date().toISOString();

    const updatedOrder = await dynamodb.update(
      `USER#${order.userId}`,
      `ORDER#${orderId}#${order.createdAt}`,
      {
        status,
        GSI2PK: `STATUS#${status}`,
        metadata: { ...order.metadata, ...metadata },
      },
    );

    await publishEvent('order.status_changed', {
      orderId,
      userId: order.userId,
      oldStatus: order.status,
      newStatus: status,
      timestamp,
    });

    if (status === 'completed') {
      await publishEvent('order.completed', {
        orderId,
        userId: order.userId,
        amount: order.amount,
        currency: order.currency,
        items: order.items,
        timestamp,
      });
    }

    return this.sanitizeOrder(updatedOrder);
  }

  /**
   * Update points earned for an order
   */
  async updateOrderPoints(orderId: string, pointsEarned: number): Promise<Order> {
    const order = await this.getOrderById(orderId);
    if (!order) throw new Error('Order not found');

    const updatedOrder = await dynamodb.update(
      `USER#${order.userId}`,
      `ORDER#${orderId}#${order.createdAt}`,
      { pointsEarned },
    );

    return this.sanitizeOrder(updatedOrder);
  }

  /**
   * Cancel order
   */
  async cancelOrder(orderId: string, reason = 'customer_request'): Promise<Order> {
    const order = await this.getOrderById(orderId);
    if (!order) throw new Error('Order not found');

    if (['completed', 'cancelled'].includes(order.status)) {
      throw new Error(`Cannot cancel order with status: ${order.status}`);
    }

    const updatedOrder = await this.updateOrderStatus(orderId, 'cancelled', {
      cancellationReason: reason,
    });

    await publishEvent('order.cancelled', {
      orderId,
      userId: order.userId,
      amount: order.amount,
      reason,
      timestamp: new Date().toISOString(),
    });

    return updatedOrder;
  }

  /**
   * Get order statistics for a user
   */
  async getOrderStats(userId: string): Promise<OrderStats> {
    const ordersResult = await this.getOrdersByUserId(userId);

    return ordersResult.orders.reduce<OrderStats>(
      (acc, order) => {
        acc.totalOrders += 1;
        acc.totalSpent += order.amount;

        if (order.status === 'completed') {
          acc.completedOrders += 1;
          acc.totalPointsEarned += order.pointsEarned || 0;
        } else if (order.status === 'cancelled') {
          acc.cancelledOrders += 1;
        }

        return acc;
      },
      {
        totalOrders: 0,
        completedOrders: 0,
        cancelledOrders: 0,
        totalSpent: 0,
        totalPointsEarned: 0,
      },
    );
  }

  /**
   * Get orders by status (admin view)
   */
  async getOrdersByStatus(
    status: OrderStatus,
    options: { limit?: number } = {},
  ): Promise<{ orders: Order[]; count: number }> {
    const { limit = 50 } = options;

    const result = await dynamodb.queryGSI('GSI2', `STATUS#${status}`, {
      Limit: limit,
      ScanIndexForward: false,
    });

    return {
      orders: result.items.map((order: any) => this.sanitizeOrder(order)),
      count: result.count,
    };
  }

  /**
   * Search orders within date range
   */
  async getOrdersByDateRange(startDate: string, endDate: string, options: { limit?: number } = {}): Promise<Order[]> {
    const { limit = 100 } = options;

    const result = await dynamodb.scan({
      FilterExpression: 'entityType = :type AND createdAt BETWEEN :start AND :end',
      ExpressionAttributeValues: {
        ':type': 'ORDER',
        ':start': startDate,
        ':end': endDate,
      },
      Limit: limit,
    });

    return result.items.map((order: any) => this.sanitizeOrder(order));
  }

  /**
   * Remove DynamoDB metadata fields
   */
  private sanitizeOrder(order: any): Order {
    const { PK, SK, GSI1PK, GSI1SK, GSI2PK, GSI2SK, ...clean } = order;
    return clean as Order;
  }
}

export default new OrderService();
