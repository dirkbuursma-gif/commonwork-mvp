/// <reference types="astro/client" />

declare global {
  namespace App {
    interface User {
      id: string;
      email: string;
      user_metadata: Record<string, unknown>;
      isLocalTestUser?: boolean;
    }

    interface Locals {
      user: User | null;
    }
  }
}

export {};
