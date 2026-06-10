// In-memory user store — shared by v1 and v2 routes
export function createStore() {
  return {
    users: new Map(),
    payments: new Map(),
  };
}
