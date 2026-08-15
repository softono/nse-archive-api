CREATE TABLE "securities" (
	"id" serial PRIMARY KEY NOT NULL,
	"symbol" text NOT NULL,
	"exchange" text DEFAULT 'NSE' NOT NULL,
	"isin" text,
	"provider_token" text,
	"series" text,
	"name" text,
	"sector" text,
	"industry" text,
	"lot_size" integer,
	"price_band_pct" numeric(5, 2),
	"surveillance" text,
	"listed_on" date,
	"delisted_on" date,
	"is_active" boolean DEFAULT true,
	"is_primary" boolean DEFAULT true,
	"updated_at" timestamp DEFAULT now(),
	"is_quarantined" boolean DEFAULT false,
	"quarantine_reason" text,
	"quarantined_at" timestamp,
	CONSTRAINT "securities_symbol_exchange_series_uq" UNIQUE("symbol","exchange","series")
);
--> statement-breakpoint
CREATE INDEX "securities_symbol_idx" ON "securities" USING btree ("symbol");--> statement-breakpoint
CREATE INDEX "securities_sector_idx" ON "securities" USING btree ("sector");--> statement-breakpoint
CREATE INDEX "securities_industry_idx" ON "securities" USING btree ("industry");