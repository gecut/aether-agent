import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  unlinkSync,
} from "node:fs";
import path from "node:path";
export interface IntegrationSecrets {
  get(): string | undefined;
  set(value: string): void;
  remove(): void;
}
export function encryptedIntegrationSecret(
  directory: string,
  codec: {
    isEncryptionAvailable(): boolean;
    encryptString(value: string): Buffer;
    decryptString(value: Buffer): string;
    getSelectedStorageBackend?(): string;
  },
): IntegrationSecrets {
  const file = path.join(directory, "telegram-bot.enc");
  const check = () => {
    if (
      !codec.isEncryptionAvailable() ||
      codec.getSelectedStorageBackend?.() === "basic_text"
    )
      throw new Error(
        "Secure OS credential storage is unavailable. Enable your system keyring before connecting Telegram.",
      );
  };
  return {
    get() {
      if (!existsSync(file)) return undefined;
      check();
      return codec.decryptString(readFileSync(file));
    },
    set(value) {
      check();
      mkdirSync(directory, { recursive: true, mode: 0o700 });
      writeFileSync(file + ".tmp", codec.encryptString(value), { mode: 0o600 });
      renameSync(file + ".tmp", file);
    },
    remove() {
      if (existsSync(file)) unlinkSync(file);
    },
  };
}
