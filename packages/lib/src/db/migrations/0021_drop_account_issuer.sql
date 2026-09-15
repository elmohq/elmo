-- Better-auth 1.7.3 dropped `issuer` from the account model: nothing writes
-- the column now, and its NOT NULL turns every new account into a constraint
-- violation.
DROP INDEX "account_issuer_accountId_uidx";--> statement-breakpoint
ALTER TABLE "account" DROP COLUMN "issuer";