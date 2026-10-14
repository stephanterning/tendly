ALTER TABLE "account_tokens" ADD COLUMN "verifies_email" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
-- Invitations issued before code delivery existed were all delivered by email.
UPDATE "account_tokens" SET "verifies_email" = true WHERE "purpose" = 'invite';
