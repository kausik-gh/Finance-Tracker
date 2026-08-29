import { Transaction, TransactionType } from "./types";

export type CategoryMapping = Record<string, string>;

export const commonMerchantCategories: CategoryMapping = {
  zepto: "Grocery",
  swiggy: "Food",
  zomato: "Food",
  boomyshow: "Entertainment",
  netflix: "Entertainment",
  uber: "Transport",
  ola: "Transport",
  amazon: "Shopping",
  flipkart: "Shopping",
  salary: "Income",
  "hdfc credit": "Income",
};

function normalize(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

class TrieNode {
  children = new Map<string, TrieNode>();
  values = new Set<string>();
}

export class MerchantTrie {
  private readonly root = new TrieNode();

  add(value: string) {
    const merchant = value.trim();
    if (!merchant) return;
    let node = this.root;
    for (const character of normalize(merchant)) {
      node = node.children.get(character) ?? this.createChild(node, character);
      node.values.add(merchant);
    }
  }

  suggest(prefix: string, limit = 5) {
    const normalizedPrefix = normalize(prefix);
    if (!normalizedPrefix) return [];
    let node: TrieNode | undefined = this.root;
    for (const character of normalizedPrefix) {
      node = node.children.get(character);
      if (!node) return [];
    }
    return [...node.values]
      .sort((left, right) => {
        const leftExact = normalize(left) === normalizedPrefix ? 0 : 1;
        const rightExact = normalize(right) === normalizedPrefix ? 0 : 1;
        return leftExact - rightExact || left.localeCompare(right);
      })
      .slice(0, limit);
  }

  private createChild(node: TrieNode, character: string) {
    const child = new TrieNode();
    node.children.set(character, child);
    return child;
  }
}

export function buildMerchantTrie(transactions: Transaction[]) {
  const trie = new MerchantTrie();
  Object.keys(commonMerchantCategories).forEach((merchant) => trie.add(merchant));
  transactions.forEach((transaction) => {
    if (transaction.merchant) trie.add(transaction.merchant);
  });
  return trie;
}

export function categorySuggestion(
  merchant: string,
  amount: number,
  type: TransactionType,
  learned: CategoryMapping,
) {
  const normalizedMerchant = normalize(merchant);
  const mappings = { ...commonMerchantCategories, ...learned };
  if (normalizedMerchant && mappings[normalizedMerchant]) return mappings[normalizedMerchant];

  const matchingKeyword = Object.keys(mappings)
    .filter((keyword) => normalizedMerchant.includes(normalize(keyword)))
    .sort((left, right) => right.length - left.length)[0];
  if (matchingKeyword) return mappings[matchingKeyword];

  if (type === "debit" && amount > 5000) return "Bills/Rent";
  if (type === "debit" && amount > 0 && amount < 100) return "Misc";
  return null;
}

export function categoryFrequency(transactions: Transaction[]) {
  return transactions.reduce<Record<string, number>>((frequency, transaction) => {
    if (transaction.category) frequency[transaction.category] = (frequency[transaction.category] ?? 0) + 1;
    return frequency;
  }, {});
}

export function orderedCategorySuggestions(
  frequency: Record<string, number>,
  mappedCategory: string | null,
  categories: readonly string[],
) {
  const frequent = Object.entries(frequency)
    .sort(([, left], [, right]) => right - left)
    .map(([category]) => category);
  return [...new Set([mappedCategory, ...frequent.slice(0, 2), ...categories].filter(Boolean) as string[])];
}

export function normalizeMerchant(value: string) {
  return normalize(value);
}
