/**
 * Derives every number the Investigator workspace shows from the real
 * canonical-demo detection (buildGraphSnapshot -> ml/rules port), never from
 * invented figures. Fields this dataset genuinely has no basis for (device/IP
 * telemetry, cross-border corridor data, KYC identity) are represented as
 * `null`/absent, not backfilled with a plausible-looking number -- callers
 * must render those as "not available in this dataset," never as a value.
 */

import { accountRiskFromFindings } from "./rules/accountRisk";

import { labelFor } from "./labels";
import { formatINR } from "@/lib/format";
import type { Finding } from "@/types/finding";
import type { AccountRisk } from "@/types/risk";
import type { GraphSnapshot } from "@/types/graph";
import type { Transaction } from "@/types/transaction";

export interface EvidencePolicyResult {
  policy: "strict" | "permissive";
  label: string;
  description: string;
  transactionIds: string[];
  exposure: number;
}

export interface InvestigatorScenario {
  /** The one real detected pattern in the canonical demo. Null before it's ever computed (never happens here -- the canonical fixture always contains it). */
  finding: Finding | null;
  accountRisk: Map<string, AccountRisk>;
  graph: GraphSnapshot;
  allTransactions: Transaction[];

  flaggedAccountId: string | null;
  flaggedAccountLabel: string | null;
  sourceAccountId: string | null;
  intermediaryIds: string[];
  /** Accounts that sent funds into the network's source but never themselves received a revealed inbound transfer -- the real analog of "verified senders/victims." */
  victimIds: string[];

  connectedAccountCount: number;
  strict: EvidencePolicyResult;
  permissive: EvidencePolicyResult;
}

function transactionsAmong(transactions: readonly Transaction[], accountIds: ReadonlySet<string>): Transaction[] {
  return transactions.filter((tx) => accountIds.has(tx.sender) || accountIds.has(tx.receiver));
}

function sumAmount(transactions: readonly Transaction[]): number {
  return transactions.reduce((sum, tx) => sum + tx.amount, 0);
}

export function buildInvestigatorScenario(
  graph: GraphSnapshot, transactions: Transaction[], findings: Finding[], selectedFinding?: Finding,
): InvestigatorScenario {
  const accountRisk = accountRiskFromFindings(findings);
  for (const node of graph.nodes) {
    const risk = accountRisk.get(node.id);
    if (risk && node.riskScore !== null && node.riskLevel !== "UNASSESSED") {
      risk.maxScore = node.riskScore;
      risk.riskLevel = node.riskLevel;
    }
  }
  const finding = selectedFinding ?? findings[0] ?? null;

  if (!finding) {
    return {
      finding: null,
      accountRisk,
      graph,
      allTransactions: transactions,
      flaggedAccountId: null,
      flaggedAccountLabel: null,
      sourceAccountId: null,
      intermediaryIds: [],
      victimIds: [],
      connectedAccountCount: graph.nodes.length,
      strict: { policy: "strict", label: "Strict", description: "No finding to evaluate.", transactionIds: [], exposure: 0 },
      permissive: { policy: "permissive", label: "Permissive", description: "No finding to evaluate.", transactionIds: [], exposure: 0 },
    };
  }

  const networkAccountIds = new Set<string>([
    finding.sourceAccount,
    finding.collectorAccount,
    ...finding.intermediaryAccounts,
  ]);

  // "Victims": accounts that sent funds reaching the source account but never
  // themselves received a revealed inbound transfer -- computed the same way
  // lib/services/metrics.ts's uniqueFundsEntering identifies outside principal.
  const hasInflow = new Set<string>();
  for (const tx of transactions) hasInflow.add(tx.receiver);
  const victimIds = [...new Set(
    transactions.filter((tx) => tx.receiver === finding.sourceAccount && !hasInflow.has(tx.sender)).map((tx) => tx.sender),
  )];

  const strictIds = [...new Set([...finding.fanOutTransactionIds, ...finding.convergenceTransactionIds])];
  const strictTransactions = transactions.filter((tx) => strictIds.includes(tx.id));

  const permissiveTransactions = transactionsAmong(transactions, networkAccountIds);
  const permissiveIds = permissiveTransactions.map((tx) => tx.id);

  return {
    finding,
    accountRisk,
    graph,
    allTransactions: transactions,
    flaggedAccountId: finding.collectorAccount,
    flaggedAccountLabel: labelFor(finding.collectorAccount),
    sourceAccountId: finding.sourceAccount,
    intermediaryIds: finding.intermediaryAccounts,
    victimIds,
    connectedAccountCount: networkAccountIds.size,
    strict: {
      policy: "strict",
      label: "Strict policy",
      description: "Only the transactions ml/rules actually counted as this finding's evidence (the fan-out and convergence legs).",
      transactionIds: strictIds,
      exposure: sumAmount(strictTransactions),
    },
    permissive: {
      policy: "permissive",
      label: "Permissive policy",
      description: "Every transaction touching any account in this network, including transfers the detector itself didn't count as evidence (e.g. the victim's initial deposit into the source account).",
      transactionIds: permissiveIds,
      exposure: sumAmount(permissiveTransactions),
    },
  };
}

export function formatExposureDelta(strict: EvidencePolicyResult, permissive: EvidencePolicyResult): string {
  const delta = permissive.exposure - strict.exposure;
  if (delta === 0) return "No difference between policies for this case.";
  return `${formatINR(delta)} more counted under the permissive policy.`;
}
