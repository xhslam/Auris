import type { AccountIdentifierType } from "@/features/auth/account-identifier";

export type AuthProfileRecord = {
  id: string;
  accountIdentifier: string;
  accountType: AccountIdentifierType;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string;
};
