-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Holding" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "symbol" TEXT NOT NULL,
    "quoteSymbol" TEXT,
    "assetType" TEXT NOT NULL DEFAULT 'stock',
    "shares" REAL NOT NULL,
    "purchasePrice" REAL NOT NULL,
    "purchaseCurrency" TEXT NOT NULL DEFAULT 'USD',
    "purchaseDate" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Holding" ("assetType", "createdAt", "id", "purchaseDate", "purchasePrice", "quoteSymbol", "shares", "symbol", "updatedAt") SELECT "assetType", "createdAt", "id", "purchaseDate", "purchasePrice", "quoteSymbol", "shares", "symbol", "updatedAt" FROM "Holding";
DROP TABLE "Holding";
ALTER TABLE "new_Holding" RENAME TO "Holding";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
