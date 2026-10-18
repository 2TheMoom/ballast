import type { ChainName } from "./contracts/types";

const BASE: Record<ChainName, string> = { ethereum: "https://etherscan.io", base: "https://basescan.org" };

export const chainLabel = (c: string) => (c === "base" ? "Base" : c === "ethereum" ? "Ethereum" : c);
export const addressUrl = (chain: ChainName, hex: string) => `${BASE[chain] ?? BASE.ethereum}/address/0x${hex.replace(/^0x/, "")}`;
export const blockUrl = (chain: ChainName, n: number) => `${BASE[chain] ?? BASE.ethereum}/block/${n}`;
export const assetLabel = (asset: string) => (asset === "native" ? "ETH" : `token 0x${asset.slice(0, 6)}…`);
