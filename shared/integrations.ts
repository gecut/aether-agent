export interface GitHubConnection {
  state:
    "unavailable" | "signed-out" | "awaiting-signin" | "connected" | "error";
  login?: string;
  message: string;
  checkedAt?: string;
}
export interface GitHubRepository {
  nameWithOwner: string;
  url: string;
  isPrivate: boolean;
}
export interface TelegramConnection {
  version: 1;
  configured: boolean;
  enabled: boolean;
  remoteDecisions: boolean;
  bot?: string;
  recipient?: { userId: number; chatId: number; name: string };
  pendingRecipient?: { userId: number; chatId: number; name: string };
  pairingCode?: string;
  pairingExpiresAt?: number;
  message: string;
  lastDeliveryAt?: string;
  error?: string;
}
