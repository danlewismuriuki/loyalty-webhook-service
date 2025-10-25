export type OrderStatus = 'pending' | 'completed' | 'cancelled' | 'failed';

export interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  price: number;
}

export interface Order {
  PK: string;
  SK: string;
  GSI1PK: string;
  GSI1SK: string;
  GSI2PK: string;
  GSI2SK: string;
  entityType: 'ORDER';
  orderId: string;
  userId: string;
  amount: number;
  currency: string;
  items: OrderItem[];
  status: OrderStatus;
  paymentMethod?: string | null;
  shippingAddress?: string | null;
  metadata: Record<string, any>;
  pointsEarned: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateOrderInput {
  userId: string;
  amount: number;
  currency?: string;
  items?: OrderItem[];
  status?: OrderStatus;
  paymentMethod?: string;
  shippingAddress?: string;
  metadata?: Record<string, any>;
}

export interface OrderStats {
  totalOrders: number;
  completedOrders: number;
  cancelledOrders: number;
  totalSpent: number;
  totalPointsEarned: number;
}
