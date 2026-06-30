-- CreateTable
CREATE TABLE "PortfolioSettings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "cashUsd" REAL NOT NULL DEFAULT 0,
    "cashEur" REAL NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "quoteSymbol" TEXT,
    "assetType" TEXT NOT NULL DEFAULT 'stock',
    "companyName" TEXT,
    "shares" REAL NOT NULL,
    "price" REAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "amount" REAL NOT NULL,
    "costBasis" REAL,
    "gainLossAbs" REAL,
    "gainLossPct" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Insert default portfolio settings row
INSERT INTO "PortfolioSettings" ("id", "cashUsd", "cashEur", "updatedAt")
VALUES ('default', 0, 0, CURRENT_TIMESTAMP);
