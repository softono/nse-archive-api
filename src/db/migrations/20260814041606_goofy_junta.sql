CREATE TABLE "daily_candles" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"symbol" text NOT NULL,
	"series" text DEFAULT 'EQ' NOT NULL,
	"trade_date" date NOT NULL,
	"open" numeric(12, 2) NOT NULL,
	"high" numeric(12, 2) NOT NULL,
	"low" numeric(12, 2) NOT NULL,
	"close" numeric(12, 2) NOT NULL,
	"prev_close" numeric(12, 2),
	"volume" bigint NOT NULL,
	"traded_value" numeric(18, 2),
	"trades_count" integer,
	"delivery_qty" bigint,
	"delivery_pct" numeric(5, 2),
	"source" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "daily_candles_symbol_series_date_uq" UNIQUE("symbol","series","trade_date")
);
--> statement-breakpoint
CREATE TABLE "index_daily_close" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"index_name" text NOT NULL,
	"trade_date" date NOT NULL,
	"open" numeric(12, 2),
	"high" numeric(12, 2),
	"low" numeric(12, 2),
	"close" numeric(12, 2) NOT NULL,
	"volume" bigint,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "index_daily_close_name_date_uq" UNIQUE("index_name","trade_date")
);
--> statement-breakpoint
CREATE TABLE "ingestion_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"trade_date" date NOT NULL,
	"status" text NOT NULL,
	"rows_written" integer,
	"error" text,
	"fetched_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ingestion_log_source_date_uq" UNIQUE("source","trade_date")
);
--> statement-breakpoint
CREATE INDEX "daily_candles_symbol_date_idx" ON "daily_candles" USING btree ("symbol","trade_date");