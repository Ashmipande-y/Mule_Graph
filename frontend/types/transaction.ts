/**
 * A single UPI transfer, exactly as shaped by `data/demo_transactions.json`
 * and the backend's `/api/graph` derivation (see docs/api-contract.md).
 * `timestamp` is a full UTC ISO 8601 string, second precision, ending in "Z".
 */
export interface Transaction {
  id: string;
  sender: string;
  receiver: string;
  amount: number;
  timestamp: string;
}
