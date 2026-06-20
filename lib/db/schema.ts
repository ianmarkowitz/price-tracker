import {
  pgTable,
  serial,
  text,
  integer,
  doublePrecision,
  boolean,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";

export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(), // human label, e.g. "UPPAbaby Vista V3 Stroller"
  searchTerm: text("search_term").notNull(),
  mustInclude: jsonb("must_include").$type<string[]>().notNull().default([]),
  mustExclude: jsonb("must_exclude").$type<string[]>().notNull().default([]),
  upc: text("upc"),
  priceMin: doublePrecision("price_min"),
  priceMax: doublePrecision("price_max"),
  checkIntervalHours: integer("check_interval_hours").notNull().default(6),
  alertWindowDays: integer("alert_window_days").notNull().default(90),
  alertMarginPct: doublePrecision("alert_margin_pct").notNull().default(3),
  alertCooldownHours: integer("alert_cooldown_hours").notNull().default(24),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  lastCheckedAt: timestamp("last_checked_at"),
});

// The confirmed canonical identity for a product, set once by the human.
export const productConfirmations = pgTable("product_confirmations", {
  id: serial("id").primaryKey(),
  productId: integer("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" })
    .unique(),
  canonicalTitle: text("canonical_title").notNull(),
  canonicalUpc: text("canonical_upc"),
  imageUrl: text("image_url"),
  confirmedAt: timestamp("confirmed_at").notNull().defaultNow(),
});

// Pending discovery results awaiting human confirmation.
export const pendingMatches = pgTable("pending_matches", {
  id: serial("id").primaryKey(),
  productId: integer("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  canonicalTitle: text("canonical_title").notNull(),
  canonicalUpc: text("canonical_upc"),
  imageUrl: text("image_url"),
  offers: jsonb("offers").$type<DiscoveredOffer[]>().notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  resolved: boolean("resolved").notNull().default(false),
});

export type DiscoveredOffer = {
  seller: string;
  link: string;
  listedPrice: number;
  shipping: number;
  inStock: boolean;
  upc?: string;
};

// Per-seller reward point valuation, configurable, default applies if not set.
export const sellerSettings = pgTable("seller_settings", {
  id: serial("id").primaryKey(),
  seller: text("seller").notNull().unique(),
  pointValueUsd: doublePrecision("point_value_usd").notNull().default(0.01),
  // Points earned per dollar spent at this seller (e.g. a 5x rewards card -> 5).
  // Default 0: sellers with no configured rewards program earn nothing.
  pointsPerDollar: doublePrecision("points_per_dollar").notNull().default(0),
});

// Append-only price history. One row per seller offer per check run.
export const priceHistory = pgTable("price_history", {
  id: serial("id").primaryKey(),
  productId: integer("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  seller: text("seller").notNull(),
  link: text("link").notNull(),
  listedPrice: doublePrecision("listed_price").notNull(),
  shipping: doublePrecision("shipping").notNull().default(0),
  rewardsPoints: doublePrecision("rewards_points").notNull().default(0),
  pointValueUsd: doublePrecision("point_value_usd").notNull().default(0),
  rewardsValue: doublePrecision("rewards_value").notNull().default(0),
  effectivePrice: doublePrecision("effective_price").notNull(),
  inStock: boolean("in_stock").notNull(),
  isBest: boolean("is_best").notNull().default(false), // best in-stock offer for this product in this run
  checkedAt: timestamp("checked_at").notNull().defaultNow(),
});

export const alerts = pgTable("alerts", {
  id: serial("id").primaryKey(),
  productId: integer("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  priceHistoryId: integer("price_history_id")
    .notNull()
    .references(() => priceHistory.id),
  effectivePrice: doublePrecision("effective_price").notNull(),
  priorPrice: doublePrecision("prior_price"),
  trailingLow: doublePrecision("trailing_low"),
  sentAt: timestamp("sent_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Products that failed to find a confident match during a scheduled run.
export const matchIssues = pgTable("match_issues", {
  id: serial("id").primaryKey(),
  productId: integer("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  reason: text("reason").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  acknowledged: boolean("acknowledged").notNull().default(false),
});
