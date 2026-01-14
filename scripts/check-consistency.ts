/**
 * open-nof1.ai - AI cryptocurrency automated trading system
 * Copyright (C) 2025 195440
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

/**
 * Checks consistency between exchange positions and database records.
 */

import "dotenv/config";
import { createClient } from "@libsql/client";
import { createExchangeClient, getExchangeType } from "../src/services/exchangeClient";

type ExchangePosition = {
  symbol: string;
  size: number;
  side: "long" | "short";
  entryPrice: number;
  markPrice: number;
  leverage: number;
  unrealizedPnl: number;
};

type DbPosition = {
  symbol: string;
  quantity: number;
  entryPrice: number;
  currentPrice: number;
  leverage: number;
  side: "long" | "short";
  openedAt: string;
};

const dbClient = createClient({
  url: process.env.DATABASE_URL || "file:./.voltagent/trading.db",
});

const QUANTITY_EPS = 0.0001;

function formatSide(side: "long" | "short") {
  return side === "long" ? "Long" : "Short";
}

function formatSigned(value: number, decimals = 2) {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(decimals)}`;
}

function parseNumber(value: unknown) {
  const parsed = Number.parseFloat(String(value ?? "0"));
  return Number.isFinite(parsed) ? parsed : 0;
}

async function checkConsistency() {
  const exchangeType = getExchangeType();
  const exchangeName = exchangeType === "okx" ? "OKX" : "Gate.io";
  const divider = "=".repeat(70);

  console.log(divider);
  console.log("Position Consistency Check (Exchange vs Database)");
  console.log(`Exchange: ${exchangeName}`);
  console.log(divider);
  console.log("");

  try {
    const exchangeClient = createExchangeClient();

    // Step 1: Fetch exchange positions
    const rawPositions = await exchangeClient.getPositions();
    const exchangePositions = rawPositions
      .map((pos: any): ExchangePosition | null => {
        const size = parseNumber(pos.size);
        if (!size) return null;

        const contract = String(pos.contract || "");
        const symbol = contract.replace("_USDT", "");
        if (!symbol) return null;

        return {
          symbol,
          size,
          side: size > 0 ? "long" : "short",
          entryPrice: parseNumber(pos.entryPrice),
          markPrice: parseNumber(pos.markPrice),
          leverage: Math.trunc(parseNumber(pos.leverage)),
          unrealizedPnl: parseNumber(pos.unrealisedPnl),
        };
      })
      .filter((pos: ExchangePosition | null): pos is ExchangePosition => Boolean(pos));

    console.log(`Exchange positions: ${exchangePositions.length}`);
    if (exchangePositions.length > 0) {
      for (const pos of exchangePositions) {
        const qty = Math.abs(pos.size);
        const lev = pos.leverage ? `${pos.leverage}x` : "N/A";
        console.log(
          `- ${pos.symbol}: ${qty} contracts (${formatSide(pos.side)}) ` +
            `entry ${pos.entryPrice.toFixed(4)}, mark ${pos.markPrice.toFixed(4)}, ` +
            `lev ${lev}, P&L ${formatSigned(pos.unrealizedPnl)}`
        );
      }
    } else {
      console.log("No active positions on the exchange.");
    }

    console.log("");

    // Step 2: Fetch database positions
    const dbResult = await dbClient.execute(
      "SELECT symbol, quantity, entry_price, current_price, leverage, side, opened_at FROM positions"
    );
    const dbPositions = (dbResult.rows || []).map((row: any): DbPosition => ({
      symbol: String(row.symbol),
      quantity: parseNumber(row.quantity),
      entryPrice: parseNumber(row.entry_price),
      currentPrice: parseNumber(row.current_price),
      leverage: Math.trunc(parseNumber(row.leverage)),
      side: row.side === "short" ? "short" : "long",
      openedAt: String(row.opened_at || ""),
    }));

    console.log(`Database positions: ${dbPositions.length}`);
    if (dbPositions.length > 0) {
      for (const pos of dbPositions) {
        const lev = pos.leverage ? `${pos.leverage}x` : "N/A";
        console.log(
          `- ${pos.symbol}: ${pos.quantity} contracts (${formatSide(pos.side)}) ` +
            `entry ${pos.entryPrice.toFixed(4)}, current ${pos.currentPrice.toFixed(4)}, ` +
            `lev ${lev}, opened ${pos.openedAt || "N/A"}`
        );
      }
    } else {
      console.log("No positions in the database.");
    }

    console.log("");

    // Step 3: Compare exchange vs database
    const exchangeMap = new Map(exchangePositions.map((p) => [p.symbol, p]));
    const dbMap = new Map(dbPositions.map((p) => [p.symbol, p]));

    const missingInDb = exchangePositions.filter((p) => !dbMap.has(p.symbol));
    const missingOnExchange = dbPositions.filter((p) => !exchangeMap.has(p.symbol));
    const mismatches: string[] = [];

    for (const [symbol, exchangePos] of exchangeMap) {
      const dbPos = dbMap.get(symbol);
      if (!dbPos) continue;

      const issues: string[] = [];
      if (dbPos.side !== exchangePos.side) {
        issues.push(`side db=${formatSide(dbPos.side)} exchange=${formatSide(exchangePos.side)}`);
      }

      const exchangeQty = Math.abs(exchangePos.size);
      const dbQty = Math.abs(dbPos.quantity);
      if (Math.abs(exchangeQty - dbQty) > QUANTITY_EPS) {
        issues.push(`qty db=${dbQty} exchange=${exchangeQty}`);
      }

      if (dbPos.leverage && exchangePos.leverage && dbPos.leverage !== exchangePos.leverage) {
        issues.push(`leverage db=${dbPos.leverage} exchange=${exchangePos.leverage}`);
      }

      if (issues.length > 0) {
        mismatches.push(`${symbol}: ${issues.join(", ")}`);
      }
    }

    console.log(divider);
    console.log("Comparison Summary");
    console.log(divider);
    console.log(`Missing in DB: ${missingInDb.length}`);
    if (missingInDb.length > 0) {
      for (const pos of missingInDb) {
        console.log(`- ${pos.symbol} (${formatSide(pos.side)}, ${Math.abs(pos.size)} contracts)`);
      }
    }
    console.log(`Missing on Exchange: ${missingOnExchange.length}`);
    if (missingOnExchange.length > 0) {
      for (const pos of missingOnExchange) {
        console.log(`- ${pos.symbol} (${formatSide(pos.side)}, ${Math.abs(pos.quantity)} contracts)`);
      }
    }
    console.log(`Mismatched Positions: ${mismatches.length}`);
    if (mismatches.length > 0) {
      for (const mismatch of mismatches) {
        console.log(`- ${mismatch}`);
      }
    }

    console.log("");

    // Step 4: Recent trades
    console.log(divider);
    console.log("Recent Trades (Last 10)");
    console.log(divider);
    const recentTrades = await dbClient.execute({
      sql: "SELECT order_id, symbol, side, type, price, quantity, leverage, pnl, fee, timestamp, status FROM trades ORDER BY timestamp DESC LIMIT 10",
    });

    if (!recentTrades.rows || recentTrades.rows.length === 0) {
      console.log("No trades found.");
    } else {
      for (const trade of recentTrades.rows) {
        const pnl = parseNumber(trade.pnl);
        const fee = parseNumber(trade.fee);
        console.log(
          `- ${trade.timestamp} ${trade.symbol} ${String(trade.type).toUpperCase()} ` +
            `${formatSide(trade.side === "short" ? "short" : "long")} ` +
            `qty ${parseNumber(trade.quantity)} @ ${parseNumber(trade.price).toFixed(4)} ` +
            `lev ${parseNumber(trade.leverage)}x pnl ${formatSigned(pnl)} fee ${formatSigned(fee)} ` +
            `status ${trade.status}`
        );
      }
    }

    console.log("");

    // Step 5: Recent open/close trade breakdown
    console.log(divider);
    console.log("Recent Open Trades (Last 5)");
    console.log(divider);
    const openTrades = await dbClient.execute({
      sql: "SELECT order_id, symbol, side, price, quantity, leverage, timestamp, status FROM trades WHERE type = 'open' ORDER BY timestamp DESC LIMIT 5",
    });

    if (!openTrades.rows || openTrades.rows.length === 0) {
      console.log("No open trades found.");
    } else {
      for (const trade of openTrades.rows) {
        console.log(
          `- ${trade.timestamp} ${trade.symbol} ${formatSide(trade.side === "short" ? "short" : "long")} ` +
            `qty ${parseNumber(trade.quantity)} @ ${parseNumber(trade.price).toFixed(4)} ` +
            `lev ${parseNumber(trade.leverage)}x status ${trade.status}`
        );
      }
    }

    console.log("");
    console.log(divider);
    console.log("Recent Close Trades (Last 5)");
    console.log(divider);
    const closeTrades = await dbClient.execute({
      sql: "SELECT order_id, symbol, side, price, quantity, leverage, pnl, fee, timestamp, status FROM trades WHERE type = 'close' ORDER BY timestamp DESC LIMIT 5",
    });

    if (!closeTrades.rows || closeTrades.rows.length === 0) {
      console.log("No close trades found.");
    } else {
      for (const trade of closeTrades.rows) {
        const pnl = parseNumber(trade.pnl);
        const fee = parseNumber(trade.fee);
        console.log(
          `- ${trade.timestamp} ${trade.symbol} ${formatSide(trade.side === "short" ? "short" : "long")} ` +
            `qty ${parseNumber(trade.quantity)} @ ${parseNumber(trade.price).toFixed(4)} ` +
            `lev ${parseNumber(trade.leverage)}x pnl ${formatSigned(pnl)} fee ${formatSigned(fee)} ` +
            `status ${trade.status}`
        );
      }
    }

    console.log("");
    console.log(divider);
    console.log("Done. Consistency check complete.");
    console.log(divider);
    console.log(
      "Note: Exchange sizes use sign for direction (positive=long, negative=short)."
    );
  } catch (error) {
    console.error("Error during consistency check:", error);
  } finally {
    await dbClient.close();
  }
}

checkConsistency().catch((error) => {
  console.error("Consistency check failed:", error);
  process.exit(1);
});
