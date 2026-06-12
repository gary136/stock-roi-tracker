import re
import time
from datetime import timedelta

import pandas as pd
import requests
import yfinance as yf

BENCHMARK_TICKER = "^TWII"
CONCURRENCY = 3
EXPECTED_STOCK_COUNT = 300


def _goodinfo_cookie():
    tz_offset = -480  # UTC+8
    day_val = time.time() / 86400 - tz_offset / 1440
    return f"2.3|43102.1607891414|46435.4941224747|{tz_offset}|{day_val}|{day_val}"


def _strip_tags(s):
    return re.sub(r'<[^>]+>', '', s).replace('\xa0', '').strip()


def _compute_roi(prices, divs_sum):
    if prices is None or len(prices) < 2:
        return None
    return (float(prices.iloc[-1]) - float(prices.iloc[0]) + float(divs_sum)) / float(prices.iloc[0]) * 100


def _fetch_top300():
    sess = requests.Session()
    sess.headers.update({
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "Accept-Language": "zh-TW,zh;q=0.9",
        "Referer": "https://goodinfo.tw/tw/StockList.asp",
    })
    sess.cookies.set("CLIENT_KEY", _goodinfo_cookie(), domain="goodinfo.tw")

    r = sess.get(
        "https://goodinfo.tw/tw/StockList.asp"
        "?STEP=DATA"
        "&MARKET_CAT=%E7%86%B1%E9%96%80%E6%8E%92%E8%A1%8C"
        "&INDUSTRY_CAT=%E5%85%AC%E5%8F%B8%E7%B8%BD%E5%B8%82%E5%80%BC%E6%9C%80%E9%AB%98"
        "%40%40%E5%85%AC%E5%8F%B8%E7%B8%BD%E5%B8%82%E5%80%BC"
        "%40%40%E5%85%AC%E5%8F%B8%E7%B8%BD%E5%B8%82%E5%80%BC%E6%9C%80%E9%AB%98"
        "&SHEET=%E5%85%AC%E5%8F%B8%E5%9F%BA%E6%9C%AC%E8%B3%87%E6%96%99"
        "&RPT_TIME=%E6%9C%80%E6%96%B0%E8%B3%87%E6%96%99"
        "&RANK_RANGE=300",
        timeout=30,
    )
    r.encoding = "utf-8"

    stocks = []
    for row in re.findall(r'<tr[^>]*>(.*?)</tr>', r.text, re.DOTALL):
        cells = [_strip_tags(c) for c in re.findall(r'<t[dh][^>]*>(.*?)</t[dh]>', row, re.DOTALL)]
        if len(cells) >= 12 and cells[0].isdigit() and re.match(r'^\d{4,6}[A-Z]?$', cells[1]):
            try:
                market_cap = float(cells[11].replace(',', ''))
            except ValueError:
                market_cap = None
            stocks.append({
                "rank":       int(cells[0]),
                "code":       cells[1],
                "name":       cells[2],
                "market":     cells[3],
                "market_cap": market_cap,
                "industry":   cells[20] if len(cells) > 20 else "",
            })
    return stocks


def scrape():
    return _fetch_top300()


def _empty(sector):
    return {
        "roi_1y": None, "roi_5y": None, "sector": sector,
        "roi_1m": None, "roi_3m": None, "roi_6m": None,
        "bias_5ma_z": None, "bias_20ma_z": None,
        "vol_z": None, "ticker_yf": "",
    }


def fetch_stock(stock, now_utc):
    """Return dict with roi/bias metrics for a Taiwan stock."""
    suffix = ".TWO" if stock.get("market") == "櫃" else ".TW"
    ticker_str = stock["code"] + suffix
    sector = stock.get("industry", "")
    try:
        obj = yf.Ticker(ticker_str)
        hist = obj.history(period="5y", auto_adjust=True)
        if hist.empty:
            return _empty(sector)
        prices = hist["Close"].dropna()
        if len(prices) < 2:
            return _empty(sector)

        p_tz = prices.index.tz
        cutoff_1y = pd.Timestamp(now_utc - timedelta(days=365)).tz_convert(p_tz)
        cutoff_5y = pd.Timestamp(now_utc - timedelta(days=365 * 5)).tz_convert(p_tz)
        cutoff_1m = pd.Timestamp(now_utc - timedelta(days=30)).tz_convert(p_tz)
        cutoff_3m = pd.Timestamp(now_utc - timedelta(days=91)).tz_convert(p_tz)
        cutoff_6m = pd.Timestamp(now_utc - timedelta(days=182)).tz_convert(p_tz)

        last = float(prices.iloc[-1])
        result = {
            "roi_1y":     _compute_roi(prices[prices.index >= cutoff_1y], 0),
            "roi_5y":     _compute_roi(prices[prices.index >= cutoff_5y], 0),
            "roi_1m":     _compute_roi(prices[prices.index >= cutoff_1m], 0),
            "roi_3m":     _compute_roi(prices[prices.index >= cutoff_3m], 0),
            "roi_6m":     _compute_roi(prices[prices.index >= cutoff_6m], 0),
            "sector":     sector,
            "ticker_yf":  ticker_str,
            "bias_5ma_z": None, "bias_20ma_z": None,
            "vol_z":      None,
        }
        for n, key in [(5, "bias_5ma_z"), (20, "bias_20ma_z")]:
            ma  = prices.rolling(n).mean().iloc[-1]
            std = prices.rolling(n).std().iloc[-1]
            if pd.notna(std) and float(std) != 0:
                result[key] = round((last - float(ma)) / float(std), 2)
        vol = hist["Volume"].dropna()
        if len(vol) >= 20:
            vol_mean = vol.rolling(20).mean().iloc[-1]
            vol_std  = vol.rolling(20).std().iloc[-1]
            if pd.notna(vol_std) and float(vol_std) != 0:
                result["vol_z"] = round((float(vol.iloc[-1]) - float(vol_mean)) / float(vol_std), 2)
        return result
    except Exception:
        return _empty(sector)
