import os
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone

import pandas as pd
import yfinance as yf
from dotenv import load_dotenv
from flask import Flask, jsonify
from flask_cors import CORS
from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String, create_engine
from sqlalchemy.orm import DeclarativeBase, Session

from markets import taiwan, us

load_dotenv()

app = Flask(__name__)
CORS(app, origins=[
    "http://localhost:3000",
    os.getenv("FRONTEND_URL", ""),
])

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///data/stock_roi.db")
connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, connect_args=connect_args)


# ── Models ────────────────────────────────────────────────────────────────────

class Base(DeclarativeBase):
    pass


class Snapshot(Base):
    __tablename__ = "snapshots"
    id           = Column(Integer, primary_key=True)
    market       = Column(String, nullable=False)           # "tw" | "us"
    captured_at  = Column(DateTime(timezone=True), nullable=False)
    benchmark_1y = Column(Float, nullable=True)
    benchmark_5y = Column(Float, nullable=True)
    status       = Column(String, nullable=True, default="complete")  # "in_progress" | "complete"


class StockData(Base):
    __tablename__ = "stock_data"
    id              = Column(Integer, primary_key=True)
    snapshot_id     = Column(Integer, ForeignKey("snapshots.id"), nullable=False)
    code            = Column(String, nullable=False)
    name            = Column(String, nullable=False)
    market_cap      = Column(Float, nullable=True)
    market_cap_rank = Column(Integer, nullable=True)
    roi_1y          = Column(Float, nullable=True)
    roi_5y          = Column(Float, nullable=True)
    industry        = Column(String, nullable=True)


Base.metadata.create_all(engine)


# ── Per-market concurrency control ────────────────────────────────────────────

_fetch_running = {"tw": False, "us": False}
_fetch_lock    = {"tw": threading.Lock(), "us": threading.Lock()}

_MARKETS = {"tw": taiwan, "us": us}


# ── Fetch job ─────────────────────────────────────────────────────────────────

def fetch_and_store(market: str):
    mod = _MARKETS[market]
    app.logger.info(f"fetch_and_store({market}): starting")

    # 1. Scrape stock list
    stocks = mod.scrape()
    app.logger.info(f"fetch_and_store({market}): got {len(stocks)} stocks")
    if not stocks:
        app.logger.warning(f"fetch_and_store({market}): 0 stocks — aborting to preserve existing data")
        return

    # 2. Benchmark
    bench_raw = yf.download(mod.BENCHMARK_TICKER, period="5y", auto_adjust=True, progress=False)
    if isinstance(bench_raw.columns, pd.MultiIndex):
        bench = bench_raw["Close"][mod.BENCHMARK_TICKER].dropna()
    else:
        bench = bench_raw["Close"].dropna()

    bench_1y = float((bench.iloc[-1] - bench.iloc[-252]) / bench.iloc[-252] * 100)
    bench_5y = float((bench.iloc[-1] - bench.iloc[0])   / bench.iloc[0]   * 100)
    app.logger.info(f"fetch_and_store({market}): benchmark 1Y={bench_1y:.2f}% 5Y={bench_5y:.2f}%")

    now_utc = datetime.now(timezone.utc)

    # 3. Create snapshot immediately so frontend can see it while ROI loads
    with Session(engine) as session:
        snap = Snapshot(
            market=market,
            captured_at=now_utc,
            benchmark_1y=bench_1y,
            benchmark_5y=bench_5y,
            status="in_progress",
        )
        session.add(snap)
        session.commit()
        snap_id = snap.id
    app.logger.info(f"fetch_and_store({market}): created snapshot id={snap_id} (in_progress)")

    # 4. Parallel ROI fetching — write to DB in batches of 50 as futures complete
    total = len(stocks)
    batch = []
    completed = 0

    with ThreadPoolExecutor(max_workers=mod.CONCURRENCY) as executor:
        futures = {executor.submit(mod.fetch_stock, s, now_utc): s for s in stocks}
        for future in as_completed(futures):
            s = futures[future]
            roi_1y, roi_5y, sector = future.result()
            batch.append(StockData(
                snapshot_id=snap_id,
                code=s["code"],
                name=s["name"],
                market_cap=s["market_cap"],
                market_cap_rank=s["rank"],
                roi_1y=roi_1y,
                roi_5y=roi_5y,
                industry=sector,
            ))
            completed += 1
            if len(batch) >= 50:
                with Session(engine) as session:
                    session.add_all(batch)
                    session.commit()
                app.logger.info(f"fetch_and_store({market}): wrote batch, {completed}/{total} done")
                batch = []

    if batch:
        with Session(engine) as session:
            session.add_all(batch)
            session.commit()
        app.logger.info(f"fetch_and_store({market}): wrote final batch, {completed}/{total} done")

    # 5. Mark snapshot complete
    with Session(engine) as session:
        snap = session.get(Snapshot, snap_id)
        snap.status = "complete"
        session.commit()
    app.logger.info(f"fetch_and_store({market}): snapshot id={snap_id} complete with {completed} stocks")


# ── Routes ────────────────────────────────────────────────────────────────────

# ── Index chart constants ─────────────────────────────────────────────────────

MA_PERIODS = {
    "daily":   [5, 10, 20, 60, 200],
    "weekly":  [5, 10, 20, 60, 120],
    "monthly": [5, 10, 20, 60, 120],
}
PERIOD_MAP   = {"daily": "1y",  "weekly": "5y",  "monthly": "max"}
INTERVAL_MAP = {"daily": "1d",  "weekly": "1wk", "monthly": "1mo"}


# ── Index chart route ─────────────────────────────────────────────────────────

@app.route("/api/index/<ticker>/chart")
def index_chart(ticker):
    from flask import request
    interval = request.args.get("interval", "daily")
    if interval not in MA_PERIODS:
        return jsonify({"error": "invalid interval"}), 400
    try:
        df = yf.download(
            ticker,
            period=PERIOD_MAP[interval],
            interval=INTERVAL_MAP[interval],
            auto_adjust=True,
            progress=False,
            multi_level_index=False,
        )
        if df.empty:
            return jsonify({"error": "no data"}), 404

        df = df.dropna(subset=["Close"])
        close = df["Close"]
        vol   = df["Volume"]

        last = float(close.iloc[-1])
        prev = float(close.iloc[-2]) if len(close) >= 2 else last
        periods = MA_PERIODS[interval]

        # MAs and bias Z-scores
        mas, bias = {}, {}
        for n in periods:
            ma_series  = close.rolling(n).mean()
            std_series = close.rolling(n).std()
            mas[n] = ma_series
            ma_val  = ma_series.iloc[-1]
            std_val = std_series.iloc[-1]
            if pd.notna(ma_val) and pd.notna(std_val) and float(std_val) != 0:
                bias[n] = round((last - float(ma_val)) / float(std_val), 2)
            else:
                bias[n] = None

        # Volume Z-score (20-period) — null-safe for pure index tickers
        vol_mean = vol.rolling(20).mean().iloc[-1]
        vol_std  = vol.rolling(20).std().iloc[-1]
        if pd.notna(vol_std) and float(vol_std) != 0:
            vol_z = round((float(vol.iloc[-1]) - float(vol_mean)) / float(vol_std), 2)
        else:
            vol_z = None

        # OBV direction — null-safe
        if vol_z is not None:
            direction = close.diff().apply(lambda x: 1 if x > 0 else (-1 if x < 0 else 0))
            obv = (vol * direction).cumsum()
            obv_dir = "up" if len(obv) >= 15 and float(obv.iloc[-1]) > float(obv.iloc[-15]) else "down"
        else:
            obv_dir = None

        tail = df.tail(15)
        candles = [
            {
                "time":   str(idx.date()),
                "open":   round(float(row["Open"]),   2),
                "high":   round(float(row["High"]),   2),
                "low":    round(float(row["Low"]),    2),
                "close":  round(float(row["Close"]),  2),
                "volume": int(row["Volume"]),
            }
            for idx, row in tail.iterrows()
        ]

        ma_out = {}
        for n in periods:
            series = mas[n].tail(15).dropna()
            ma_out[str(n)] = [
                {"time": str(i.date()), "value": round(float(v), 2)}
                for i, v in series.items()
            ]

        return jsonify({
            "ticker":   ticker,
            "interval": interval,
            "current": {
                "price":      round(last, 2),
                "change":     round(last - prev, 2),
                "change_pct": round((last - prev) / prev * 100, 2) if prev else None,
            },
            "candles": candles,
            "ma":      ma_out,
            "bias":    {str(n): v for n, v in bias.items()},
            "volume":  {"z_score": vol_z, "obv_direction": obv_dir},
        })
    except Exception as e:
        app.logger.exception(f"index_chart({ticker}) error")
        return jsonify({"error": str(e)}), 500


@app.route("/api/<market>/status")
def status(market):
    if market not in _MARKETS:
        return jsonify({"error": "unknown market"}), 404
    mod = _MARKETS[market]
    try:
        with Session(engine) as session:
            snap = session.query(Snapshot).filter_by(market=market) \
                          .order_by(Snapshot.captured_at.desc()).first()
            if not snap:
                return jsonify({"has_data": False, "captured_at": None, "stock_count": 0})
            count = session.query(StockData).filter_by(snapshot_id=snap.id).count()
            return jsonify({
                "has_data":        True,
                "captured_at":     snap.captured_at.isoformat(),
                "stock_count":     count,
                "total_stocks":    mod.EXPECTED_STOCK_COUNT,
                "benchmark_1y":    snap.benchmark_1y,
                "benchmark_5y":    snap.benchmark_5y,
                "refresh_running": _fetch_running[market],
            })
    except Exception as e:
        app.logger.exception(f"status({market}) error")
        return jsonify({"error": str(e)}), 500


@app.route("/api/<market>/data")
def data(market):
    if market not in _MARKETS:
        return jsonify({"error": "unknown market"}), 404
    try:
        with Session(engine) as session:
            snap = session.query(Snapshot).filter_by(market=market) \
                          .order_by(Snapshot.captured_at.desc()).first()
            if not snap:
                return jsonify({"benchmark": None, "stocks": [], "captured_at": None, "is_complete": True})
            rows = session.query(StockData).filter_by(snapshot_id=snap.id).all()
            is_complete = snap.status == "complete" or snap.status is None
            return jsonify({
                "benchmark": {
                    "roi_1y": snap.benchmark_1y,
                    "roi_5y": snap.benchmark_5y,
                },
                "captured_at": snap.captured_at.isoformat(),
                "is_complete":  is_complete,
                "stocks": [
                    {
                        "rank":       r.market_cap_rank,
                        "code":       r.code,
                        "name":       r.name,
                        "market_cap": r.market_cap,
                        "roi_1y":     r.roi_1y,
                        "roi_5y":     r.roi_5y,
                        "industry":   r.industry,
                    }
                    for r in rows
                ],
            })
    except Exception as e:
        app.logger.exception(f"data({market}) error")
        return jsonify({"error": str(e)}), 500


@app.route("/api/<market>/refresh", methods=["POST", "OPTIONS"])
def refresh(market):
    if market not in _MARKETS:
        return jsonify({"error": "unknown market"}), 404
    if _fetch_running[market]:
        return jsonify({"status": "already_running"})

    def run():
        try:
            fetch_and_store(market)
        except Exception:
            app.logger.exception(f"fetch_and_store({market}) failed")
        finally:
            _fetch_running[market] = False

    with _fetch_lock[market]:
        if _fetch_running[market]:
            return jsonify({"status": "already_running"})
        _fetch_running[market] = True

    t = threading.Thread(target=run, daemon=True)
    t.start()
    return jsonify({"status": "started"})


if __name__ == "__main__":
    os.makedirs("data", exist_ok=True)
    app.run(host="0.0.0.0", port=5001, debug=True)
