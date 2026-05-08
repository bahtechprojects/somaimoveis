-- CreateTable
CREATE TABLE "owner_payout_beneficiaries" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pixKey" TEXT NOT NULL,
    "pixKeyType" TEXT NOT NULL,
    "percentage" REAL NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "owner_payout_beneficiaries_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "owners" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "owner_payout_beneficiaries_ownerId_idx" ON "owner_payout_beneficiaries"("ownerId");
