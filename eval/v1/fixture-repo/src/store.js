// Toy in-memory store standing in for the database layer.
const users = [
  { id: 'u1', name: 'Ada' },
  { id: 'u2', name: 'Grace' },
  { id: 'u3', name: 'Edsger' },
  { id: 'u4', name: 'Barbara' },
  { id: 'u5', name: 'Donald' },
];

const orders = [
  { id: 'o1', userId: 'u1', total: 1200 },
  { id: 'o2', userId: 'u1', total: 350 },
  { id: 'o3', userId: 'u2', total: 990 },
];

export const listUsers = () => users.slice();
export const listOrders = () => orders.slice();
