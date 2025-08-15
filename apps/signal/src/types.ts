export type WireMessage = {
  type: string;
  txn?: string;
  payload?: unknown;
  sentAt?: number;
};
