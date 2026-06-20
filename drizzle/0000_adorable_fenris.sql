CREATE TABLE "alerts" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"price_history_id" integer NOT NULL,
	"effective_price" double precision NOT NULL,
	"prior_price" double precision,
	"trailing_low" double precision,
	"sent_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "match_issues" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"acknowledged" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pending_matches" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"canonical_title" text NOT NULL,
	"canonical_upc" text,
	"image_url" text,
	"offers" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"resolved" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"seller" text NOT NULL,
	"link" text NOT NULL,
	"listed_price" double precision NOT NULL,
	"shipping" double precision DEFAULT 0 NOT NULL,
	"rewards_points" double precision DEFAULT 0 NOT NULL,
	"point_value_usd" double precision DEFAULT 0 NOT NULL,
	"rewards_value" double precision DEFAULT 0 NOT NULL,
	"effective_price" double precision NOT NULL,
	"in_stock" boolean NOT NULL,
	"is_best" boolean DEFAULT false NOT NULL,
	"checked_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_confirmations" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"canonical_title" text NOT NULL,
	"canonical_upc" text,
	"image_url" text,
	"confirmed_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "product_confirmations_product_id_unique" UNIQUE("product_id")
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"search_term" text NOT NULL,
	"must_include" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"must_exclude" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"upc" text,
	"price_min" double precision,
	"price_max" double precision,
	"check_interval_hours" integer DEFAULT 6 NOT NULL,
	"alert_window_days" integer DEFAULT 90 NOT NULL,
	"alert_margin_pct" double precision DEFAULT 3 NOT NULL,
	"alert_cooldown_hours" integer DEFAULT 24 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_checked_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "seller_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"seller" text NOT NULL,
	"point_value_usd" double precision DEFAULT 0.01 NOT NULL,
	"points_per_dollar" double precision DEFAULT 0 NOT NULL,
	CONSTRAINT "seller_settings_seller_unique" UNIQUE("seller")
);
--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_price_history_id_price_history_id_fk" FOREIGN KEY ("price_history_id") REFERENCES "public"."price_history"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_issues" ADD CONSTRAINT "match_issues_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_matches" ADD CONSTRAINT "pending_matches_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_history" ADD CONSTRAINT "price_history_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_confirmations" ADD CONSTRAINT "product_confirmations_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
