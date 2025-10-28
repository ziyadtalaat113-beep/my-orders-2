
export type UserRole = 'admin' | 'guest';

export interface User {
  id: string;
  email: string;
  role: UserRole;
}

export type OrderType = 'income' | 'expense';
export type OrderStatus = 'pending' | 'completed';

export interface Order {
  id: string;
  name: string;
  ref?: string;
  date: string; // ISO string format
  type: OrderType;
  status: OrderStatus;
  addedBy: string; // User email
}
