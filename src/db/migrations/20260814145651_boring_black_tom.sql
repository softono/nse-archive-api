CREATE TABLE "deals" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"trade_date" date NOT NULL,
	"deal_type" text NOT NULL,
	"symbol" text NOT NULL,
	"security_name" text,
	"client_name" text NOT NULL,
	"buy_sell" text NOT NULL,
	"quantity" bigint NOT NULL,
	"price" numeric(12, 2) NOT NULL,
	"remarks" text,
	"source" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "deals_dedupe_uq" UNIQUE("trade_date","deal_type","symbol","client_name","buy_sell","quantity","price")
);
--> statement-breakpoint
CREATE TABLE "fo_daily_candles" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"symbol" text NOT NULL,
	"instrument_type" text NOT NULL,
	"trade_date" date NOT NULL,
	"expiry_date" date NOT NULL,
	"strike_price" numeric(12, 2),
	"option_type" text,
	"open" numeric(12, 2) NOT NULL,
	"high" numeric(12, 2) NOT NULL,
	"low" numeric(12, 2) NOT NULL,
	"close" numeric(12, 2) NOT NULL,
	"settle_price" numeric(12, 2),
	"open_interest" bigint,
	"change_in_oi" bigint,
	"volume" bigint NOT NULL,
	"traded_value" numeric(18, 2),
	"trades_count" integer,
	"lot_size" integer,
	"source" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "fo_daily_candles_contract_date_uq" UNIQUE("symbol","instrument_type","expiry_date","strike_price","option_type","trade_date")
);
--> statement-breakpoint
CREATE TABLE "participant_activity" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"trade_date" date NOT NULL,
	"metric" text NOT NULL,
	"client_type" text NOT NULL,
	"future_index_long" bigint,
	"future_index_short" bigint,
	"future_stock_long" bigint,
	"future_stock_short" bigint,
	"option_index_call_long" bigint,
	"option_index_put_long" bigint,
	"option_index_call_short" bigint,
	"option_index_put_short" bigint,
	"option_stock_call_long" bigint,
	"option_stock_put_long" bigint,
	"option_stock_call_short" bigint,
	"option_stock_put_short" bigint,
	"total_long" bigint,
	"total_short" bigint,
	"source" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "participant_activity_date_metric_client_uq" UNIQUE("trade_date","metric","client_type")
);
--> statement-breakpoint
ALTER TABLE "index_daily_close" ADD COLUMN "points_change" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "index_daily_close" ADD COLUMN "pct_change" numeric(6, 2);--> statement-breakpoint
CREATE INDEX "deals_symbol_date_idx" ON "deals" USING btree ("symbol","trade_date");--> statement-breakpoint
CREATE INDEX "fo_daily_candles_symbol_date_idx" ON "fo_daily_candles" USING btree ("symbol","trade_date");