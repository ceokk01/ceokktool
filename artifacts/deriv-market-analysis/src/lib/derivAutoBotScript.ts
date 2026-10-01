export const DERIV_AUTO_BOT_PYTHON_SCRIPT = `#!/usr/bin/env python3
"""
Deriv automated trading bot (runs on your own computer / VPS, no Bot Builder needed).

Strategy (digits, 1-tick contracts):
  NORMAL mode   : wait for >= STREAK digits <= BARRIER in a row, then a digit > BARRIER
                  -> buy DIGITOVER <BARRIER>. After that first entry the bot keeps buying
                  Over <BARRIER> on every cycle without waiting for the setup again.
  RECOVERY mode : entered after a LOSS in normal mode. Trades Even/Odd only, on a fresh pattern:
                    >= STREAK even digits then an odd digit  -> buy DIGITODD
                    >= STREAK odd  digits then an even digit -> buy DIGITEVEN
                  After a WIN in recovery it switches back to Over <BARRIER>.

Because this talks to the API directly, it can switch between Over/Under and Even/Odd
freely, which Deriv Bot Builder cannot do in one bot.

Setup (new Deriv API, https://developers.deriv.com):
  1. Register a PAT-type app on developers.deriv.com  -> App ID
  2. Create a Personal Access Token with the \`trade\` scope
  3. pip install websockets requests
  4. export DERIV_PAT="your_token"   DERIV_APP_ID="your_app_id"
  5. python deriv_auto_bot.py --stake 1 --tp 5 --sl 10        (DEMO by default)

Never share your token. Test on demo first. No strategy is guaranteed to profit.
"""
import argparse
import asyncio
import csv
import itertools
import json
import os
import sys
import time
from collections import deque

import requests

try:
    import websockets
except ImportError:  # friendly message in main()
    websockets = None

API_BASE = "https://api.derivws.com"


def log(msg):
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


# --------------------------------------------------------------------------- #
# Pure strategy logic (no network) - easy to test
# --------------------------------------------------------------------------- #
class Strategy:
    NORMAL, RECOVERY = "NORMAL", "RECOVERY"

    def __init__(self, barrier=2, streak=2):
        self.barrier = barrier
        self.streak = streak
        self.mode = self.NORMAL
        self.entered = False          # True once the first setup-triggered entry was made
        self.digits = deque(maxlen=100)

    def on_digit(self, d):
        self.digits.append(d)

    @staticmethod
    def _run_length(items, pred):
        """How many of the most recent items in a row satisfy pred."""
        n = 0
        for x in reversed(items):
            if pred(x):
                n += 1
            else:
                break
        return n

    def decide(self):
        """Call right after a new digit is appended. Returns (contract_type, barrier) or None."""
        if not self.digits:
            return None
        last = self.digits[-1]
        prev = list(self.digits)[:-1]          # digits before the current one
        b = self.barrier

        if self.mode == self.NORMAL:
            if self.entered:
                return ("DIGITOVER", str(b))
            if last > b and self._run_length(prev, lambda x: x <= b) >= self.streak:
                return ("DIGITOVER", str(b))
            return None

        # RECOVERY
        if last % 2 == 1 and self._run_length(prev, lambda x: x % 2 == 0) >= self.streak:
            return ("DIGITODD", None)
        if last % 2 == 0 and self._run_length(prev, lambda x: x % 2 == 1) >= self.streak:
            return ("DIGITEVEN", None)
        return None

    def on_trade_placed(self, contract_type):
        if contract_type == "DIGITOVER":
            self.entered = True

    def on_result(self, won):
        if self.mode == self.NORMAL and not won:
            self.mode = self.RECOVERY
        elif self.mode == self.RECOVERY and won:
            self.mode = self.NORMAL


# --------------------------------------------------------------------------- #
# Bot
# --------------------------------------------------------------------------- #
class ApiError(Exception):
    pass


class Bot:
    def __init__(self, args):
        self.a = args
        self.strategy = Strategy(args.barrier, args.streak)
        self.ws = None
        self.ids = itertools.count(1)
        self.pending = {}
        self.busy = False
        self.stopped = False
        self.stop_event = asyncio.Event()
        self.currency = args.currency
        self.open_contract = None
        self.open_stake = 0.0
        self.result_fut = None
        self.last_epoch = None
        self.pnl = 0.0
        self.trades = 0
        self.wins = 0
        self.loss_run = 0
        self.account_id = None

    # ---- REST: account + OTP ------------------------------------------------
    def _headers(self):
        return {"Authorization": f"Bearer {self.a.token}", "Deriv-App-ID": str(self.a.app_id)}

    def _pick_account(self):
        if self.a.account_id:
            return self.a.account_id
        r = requests.get(f"{API_BASE}/trading/v1/options/accounts", headers=self._headers(), timeout=20)
        r.raise_for_status()
        body = r.json()
        data = body.get("data", body)
        if isinstance(data, dict):
            data = data.get("accounts", [])
        want = "real" if self.a.real else "demo"
        for acc in data:
            acc_id = acc.get("account_id") or acc.get("id") or acc.get("loginid")
            if acc_id and str(acc.get("account_type", "")).lower() == want:
                return acc_id
        log("Could not pick an account automatically. Accounts returned:")
        print(json.dumps(body, indent=2))
        sys.exit("Set --account-id (or DERIV_ACCOUNT_ID) to the account you want to trade on.")

    def _get_ws_url(self):
        if not self.account_id:
            self.account_id = self._pick_account()
        r = requests.post(
            f"{API_BASE}/trading/v1/options/accounts/{self.account_id}/otp",
            headers=self._headers(), timeout=20,
        )
        r.raise_for_status()
        url = r.json()["data"]["url"]
        is_real = "/ws/real" in url
        if is_real != bool(self.a.real):
            sys.exit(f"Safety stop: account {self.account_id} is a {'REAL' if is_real else 'DEMO'} "
                     f"account but you started the bot in {'REAL' if self.a.real else 'DEMO'} mode.")
        return url

    # ---- WebSocket plumbing -------------------------------------------------
    async def request(self, payload, timeout=15):
        rid = next(self.ids)
        fut = asyncio.get_running_loop().create_future()
        self.pending[rid] = fut
        await self.ws.send(json.dumps({**payload, "req_id": rid}))
        try:
            msg = await asyncio.wait_for(fut, timeout)
        finally:
            self.pending.pop(rid, None)
        if "error" in msg:
            raise ApiError(f"{msg['error'].get('code')}: {msg['error'].get('message')}")
        return msg

    async def reader(self, ws):
        async for raw in ws:
            m = json.loads(raw)
            fut = self.pending.get(m.get("req_id"))
            if fut and not fut.done():
                fut.set_result(m)
                continue
            t = m.get("msg_type")
            if t == "tick":
                self.on_tick(m)
            elif t == "proposal_open_contract":
                self.on_poc(m)
            elif "error" in m:
                log(f"API error: {m['error'].get('message')}")

    # ---- Market data --------------------------------------------------------
    def on_tick(self, m):
        tick = m.get("tick")
        if not tick or tick.get("symbol") != self.a.symbol:
            return
        if tick.get("epoch") == self.last_epoch:
            return
        self.last_epoch = tick.get("epoch")
        pip = int(tick.get("pip_size", 2))
        digit = int(f"{float(tick['quote']):.{pip}f}"[-1])
        self.strategy.on_digit(digit)
        if self.busy or self.stopped:
            return
        choice = self.strategy.decide()
        if choice:
            self.busy = True
            asyncio.create_task(self.trade(*choice))

    # ---- Trading ------------------------------------------------------------
    def current_stake(self):
        stake = self.a.stake * (self.a.martingale ** self.loss_run)
        return round(min(stake, self.a.max_stake), 2)

    async def trade(self, ctype, barrier):
        try:
            stake = self.current_stake()
            req = {"proposal": 1, "amount": stake, "basis": "stake", "contract_type": ctype,
                   "currency": self.currency, "duration": 1, "duration_unit": "t",
                   "underlying_symbol": self.a.symbol}
            if barrier is not None:
                req["barrier"] = barrier
            prop = (await self.request(req))["proposal"]
            bought = (await self.request({"buy": prop["id"], "price": prop["ask_price"]}))["buy"]
            self.open_contract, self.open_stake = bought["contract_id"], stake
            self.strategy.on_trade_placed(ctype)
            log(f"BUY {ctype}{' ' + barrier if barrier else ''} | stake {stake} | mode {self.strategy.mode}"
                f" | last digits {list(self.strategy.digits)[-6:]}")
            await self.settle()
        except (ApiError, asyncio.TimeoutError) as e:
            log(f"Trade not placed / not confirmed: {e}")
            if self.open_contract is None:
                self.busy = False
        except Exception as e:  # connection dropped etc. - session() will resume an open contract
            log(f"Trade interrupted: {e!r}")
            if self.open_contract is None:
                self.busy = False

    async def settle(self):
        self.result_fut = asyncio.get_running_loop().create_future()
        await self.ws.send(json.dumps({"proposal_open_contract": 1, "contract_id": self.open_contract,
                                       "subscribe": 1, "req_id": next(self.ids)}))
        try:
            poc = await asyncio.wait_for(self.result_fut, 90)
        except asyncio.TimeoutError:
            log(f"No result for contract {self.open_contract} after 90s - check Reports on Deriv.")
            self.open_contract, self.busy = None, False
            return
        profit = float(poc.get("profit", 0))
        won = poc.get("status") == "won" or profit > 0
        self.pnl += profit
        self.trades += 1
        self.wins += int(won)
        self.loss_run = 0 if won else self.loss_run + 1
        self.strategy.on_result(won)
        log(f"{'WIN ' if won else 'LOSS'} {profit:+.2f} | P/L {self.pnl:+.2f} | trades {self.trades} "
            f"(W {self.wins}) | next mode {self.strategy.mode}")
        self._write_csv(poc, profit, won)
        self.open_contract, self.busy = None, False
        if self.pnl >= self.a.tp:
            self.stop(f"Take profit reached ({self.pnl:+.2f})")
        elif self.pnl <= -self.a.sl:
            self.stop(f"Stop loss reached ({self.pnl:+.2f})")
        elif self.a.max_trades and self.trades >= self.a.max_trades:
            self.stop("Max trades reached")

    def on_poc(self, m):
        poc = m.get("proposal_open_contract") or {}
        if (poc.get("contract_id") == self.open_contract and poc.get("is_sold")
                and self.result_fut and not self.result_fut.done()):
            self.result_fut.set_result(poc)

    def _write_csv(self, poc, profit, won):
        new = not os.path.exists(self.a.log_file)
        with open(self.a.log_file, "a", newline="") as f:
            w = csv.writer(f)
            if new:
                w.writerow(["time", "contract_id", "type", "stake", "profit", "won", "mode_after", "pnl"])
            w.writerow([time.strftime("%Y-%m-%d %H:%M:%S"), poc.get("contract_id"), poc.get("contract_type"),
                        self.open_stake, profit, won, self.strategy.mode, round(self.pnl, 2)])

    def stop(self, reason):
        if not self.stopped:
            log(f"STOPPING: {reason}")
            self.stopped = True
            self.stop_event.set()

    # ---- Session / reconnect loop ------------------------------------------
    async def session(self):
        url = await asyncio.to_thread(self._get_ws_url)
        async with websockets.connect(url, ping_interval=20) as ws:
            self.ws = ws
            reader = asyncio.create_task(self.reader(ws))
            log(f"Connected ({'REAL' if self.a.real else 'DEMO'} account {self.account_id})")
            bal = await self.request({"balance": 1})
            self.currency = self.currency or bal["balance"]["currency"]
            log(f"Balance {bal['balance']['balance']} {self.currency} | symbol {self.a.symbol} | "
                f"stake {self.a.stake} | TP {self.a.tp} | SL {self.a.sl}")
            first = await self.request({"ticks": self.a.symbol, "subscribe": 1})
            self.on_tick(first)
            if self.open_contract:                      # resume after a dropped connection
                self.busy = True
                asyncio.create_task(self.settle())
            waiter = asyncio.create_task(self.stop_event.wait())
            done, _ = await asyncio.wait({reader, waiter}, return_when=asyncio.FIRST_COMPLETED)
            for t in (reader, waiter):
                t.cancel()
            if reader in done and not self.stopped:
                reader.result()                          # raises ConnectionClosed -> reconnect

    async def run(self):
        retries = 0
        while not self.stopped:
            try:
                await self.session()
                retries = 0
            except (ApiError, asyncio.TimeoutError, OSError, requests.RequestException) as e:
                log(f"Connection problem: {e!r}")
            except Exception as e:
                if websockets and isinstance(e, websockets.ConnectionClosed):
                    log("Connection closed by server")
                else:
                    raise
            if self.stopped:
                break
            retries += 1
            if retries > 10:
                sys.exit("Too many reconnect failures, giving up.")
            wait = min(5 * retries, 30)
            log(f"Reconnecting in {wait}s (attempt {retries})")
            await asyncio.sleep(wait)
        log(f"Done. Trades {self.trades}, wins {self.wins}, P/L {self.pnl:+.2f}")


def parse_args():
    p = argparse.ArgumentParser(description="Deriv automated digits bot (Over 2 + Even/Odd recovery)")
    p.add_argument("--token", default=os.getenv("DERIV_PAT"), help="Personal Access Token (or env DERIV_PAT)")
    p.add_argument("--app-id", default=os.getenv("DERIV_APP_ID"), help="App ID (or env DERIV_APP_ID)")
    p.add_argument("--account-id", default=os.getenv("DERIV_ACCOUNT_ID"), help="Optional account id")
    p.add_argument("--real", action="store_true", help="Trade on REAL account (default is demo)")
    p.add_argument("--symbol", default="R_100", help="e.g. R_100, 1HZ100V, R_10")
    p.add_argument("--currency", default=None, help="Defaults to the account currency")
    p.add_argument("--stake", type=float, default=1.0)
    p.add_argument("--martingale", type=float, default=1.0, help="Stake multiplier after each loss (1 = off)")
    p.add_argument("--max-stake", type=float, default=100.0)
    p.add_argument("--tp", type=float, default=5.0, help="Stop when profit reaches this")
    p.add_argument("--sl", type=float, default=10.0, help="Stop when loss reaches this")
    p.add_argument("--max-trades", type=int, default=0, help="0 = unlimited")
    p.add_argument("--barrier", type=int, default=2, help="Over/under digit")
    p.add_argument("--streak", type=int, default=2, help="Consecutive digits needed before the entry digit")
    p.add_argument("--log-file", default="deriv_trades.csv")
    return p.parse_args()


def main():
    a = parse_args()
    if websockets is None:
        sys.exit("Missing dependency. Run: pip install websockets requests")
    if not a.token or not a.app_id:
        sys.exit("Set DERIV_PAT and DERIV_APP_ID (or pass --token / --app-id).")
    if a.real and input("REAL MONEY mode. Type REAL to continue: ").strip() != "REAL":
        sys.exit("Cancelled.")
    bot = Bot(a)
    try:
        asyncio.run(bot.run())
    except KeyboardInterrupt:
        log(f"Stopped by user. Trades {bot.trades}, wins {bot.wins}, P/L {bot.pnl:+.2f}")


if __name__ == "__main__":
    main()
`;
