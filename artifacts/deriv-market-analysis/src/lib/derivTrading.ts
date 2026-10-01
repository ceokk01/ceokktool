/**
 * Deriv Live Trading Engine
 * Manages WebSocket request/response dispatch, proposal generation, contract purchases,
 * and live contract settlement via proposal_open_contract for automated bots and manual trades.
 */

export type TradeContractType =
  | 'Over'
  | 'Under'
  | 'Even'
  | 'Odd'
  | 'Rise'
  | 'Fall'
  | 'Match'
  | 'Diff'
  | 'Matches'
  | 'Differs'
  | 'Higher'
  | 'Lower'
  | 'DIGITOVER'
  | 'DIGITUNDER'
  | 'DIGITEVEN'
  | 'DIGITODD'
  | 'CALL'
  | 'PUT'
  | 'DIGITMATCH'
  | 'DIGITDIFF';

export interface TradeParams {
  contractType: TradeContractType | string;
  symbol: string;
  stake: number;
  currency?: string;
  barrier?: number | string;
  duration?: number;
  durationUnit?: 't' | 's' | 'm' | 'h' | 'd';
  basis?: 'stake' | 'payout';
  onPurchased?: (info: { contractId: number | string; buyPrice: number; longcode?: string }) => void;
  onUpdate?: (poc: any) => void;
}

export interface TradeResult {
  contractId: number | string;
  status: 'won' | 'lost';
  profit: number;
  payout: number;
  buyPrice: number;
  barrier?: string | number;
  exitTick?: string | number;
  entryTick?: string | number;
  balanceAfter?: number;
  longcode?: string;
  settledAt: number;
}

export interface DerivProposalResponse {
  id: string;
  ask_price: number;
  payout: number;
  spot?: number;
  longcode?: string;
  display_value?: string;
}

export interface DerivBuyResponse {
  contract_id: number;
  buy_price: number;
  balance_after?: number;
  longcode?: string;
  payout?: number;
  shortcode?: string;
  start_time?: number;
  transaction_id?: number;
}

export class DerivApiError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.name = 'DerivApiError';
    this.code = code;
  }
}

/**
 * Normalizes user-friendly contract types to official Deriv WebSocket API contract types
 */
export function mapContractTypeToDeriv(
  contractType: TradeContractType | string,
  barrier?: number | string
): { derivType: string; barrier?: string } {
  const norm = String(contractType).trim().toUpperCase();

  switch (norm) {
    case 'OVER':
    case 'DIGITOVER':
      return { derivType: 'DIGITOVER', barrier: barrier !== undefined ? String(barrier) : '2' };
    case 'UNDER':
    case 'DIGITUNDER':
      return { derivType: 'DIGITUNDER', barrier: barrier !== undefined ? String(barrier) : '7' };
    case 'EVEN':
    case 'DIGITEVEN':
      return { derivType: 'DIGITEVEN' };
    case 'ODD':
    case 'DIGITODD':
      return { derivType: 'DIGITODD' };
    case 'MATCH':
    case 'MATCHES':
    case 'DIGITMATCH':
      return { derivType: 'DIGITMATCH', barrier: barrier !== undefined ? String(barrier) : '0' };
    case 'DIFF':
    case 'DIFFERS':
    case 'DIGITDIFF':
      return { derivType: 'DIGITDIFF', barrier: barrier !== undefined ? String(barrier) : '0' };
    case 'RISE':
    case 'HIGHER':
    case 'CALL':
      return { derivType: 'CALL' };
    case 'FALL':
    case 'LOWER':
    case 'PUT':
      return { derivType: 'PUT' };
    default:
      return { derivType: norm, barrier: barrier !== undefined ? String(barrier) : undefined };
  }
}

interface PendingRequest {
  resolve: (value: any) => void;
  reject: (reason?: any) => void;
  timer: number;
}

interface ContractSettlement {
  resolve: (res: TradeResult) => void;
  reject: (err: any) => void;
  timer: number;
  stake: number;
  onUpdate?: (poc: any) => void;
}

export class DerivTradingEngine {
  private ws: WebSocket | null = null;
  private reqIdCounter = 1;
  private pendingRequests = new Map<number, PendingRequest>();
  private contractSettlers = new Map<number | string, ContractSettlement>();
  private isAuthorized = false;
  private activeCurrency = 'USD';
  private onBalanceUpdateListener: ((balance: number, currency: string) => void) | null = null;

  public setSocket(
    ws: WebSocket | null,
    isAuthorized = false,
    currency = 'USD'
  ) {
    this.ws = ws;
    this.isAuthorized = isAuthorized;
    this.activeCurrency = currency || 'USD';
  }

  public setAuthorized(authorized: boolean, currency = 'USD') {
    this.isAuthorized = authorized;
    if (currency) this.activeCurrency = currency;
  }

  public onBalanceUpdate(callback: (balance: number, currency: string) => void) {
    this.onBalanceUpdateListener = callback;
  }

  public isReady(): boolean {
    return Boolean(this.ws && this.ws.readyState === WebSocket.OPEN && this.isAuthorized);
  }

  /**
   * Process all incoming messages from the Deriv WebSocket
   */
  public handleMessage(data: any): boolean {
    if (!data) return false;

    // 1. Resolve pending request matching req_id
    if (data.req_id && this.pendingRequests.has(data.req_id)) {
      const pending = this.pendingRequests.get(data.req_id)!;
      this.pendingRequests.delete(data.req_id);
      window.clearTimeout(pending.timer);

      if (data.error) {
        pending.reject(
          new DerivApiError(
            data.error.message || data.error.code || 'Deriv API error',
            data.error.code
          )
        );
      } else {
        pending.resolve(data);
      }
      return true;
    }

    // 2. Handle proposal_open_contract events
    if (data.msg_type === 'proposal_open_contract' || data.proposal_open_contract) {
      const poc = data.proposal_open_contract;
      if (poc && poc.contract_id) {
        const contractId = poc.contract_id;
        const settler = this.contractSettlers.get(contractId) || this.contractSettlers.get(String(contractId));

        if (settler) {
          if (settler.onUpdate) {
            settler.onUpdate(poc);
          }

          const isClosed = Boolean(poc.is_sold || poc.is_expired || poc.status === 'won' || poc.status === 'lost');

          if (isClosed) {
            this.contractSettlers.delete(contractId);
            this.contractSettlers.delete(String(contractId));
            window.clearTimeout(settler.timer);

            // Unsubscribe from open contract updates
            if (this.ws && this.ws.readyState === WebSocket.OPEN && poc.id) {
              this.ws.send(JSON.stringify({ forget: poc.id }));
            }

            const rawProfit = Number(poc.profit ?? 0);
            const status: 'won' | 'lost' = poc.status === 'won' || rawProfit > 0 ? 'won' : 'lost';

            const result: TradeResult = {
              contractId: poc.contract_id,
              status,
              profit: Number(rawProfit.toFixed(2)),
              payout: Number(poc.payout ?? 0),
              buyPrice: Number(poc.buy_price ?? settler.stake),
              barrier: poc.barrier,
              exitTick: poc.exit_tick_display_value ?? poc.exit_tick,
              entryTick: poc.entry_tick_display_value ?? poc.entry_tick,
              balanceAfter: poc.balance_after ? Number(poc.balance_after) : undefined,
              longcode: poc.longcode,
              settledAt: Date.now(),
            };

            settler.resolve(result);
            return true;
          }
        }
      }
    }

    // 3. Handle live balance updates
    if (data.msg_type === 'balance' || data.balance) {
      const bal = data.balance;
      if (bal && this.onBalanceUpdateListener) {
        this.onBalanceUpdateListener(Number(bal.balance ?? 0), bal.currency || this.activeCurrency);
      }
    }

    return false;
  }

  /**
   * Send a JSON request over the authorized WebSocket with promise resolution
   */
  public sendRequest<T = any>(payload: Record<string, any>, timeoutMs = 15000): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        return reject(new DerivApiError('Deriv WebSocket is not connected. Check your internet or login status.'));
      }

      const reqId = this.reqIdCounter++;
      const timer = window.setTimeout(() => {
        this.pendingRequests.delete(reqId);
        reject(new DerivApiError(`Deriv API request timed out after ${timeoutMs / 1000}s.`, 'Timeout'));
      }, timeoutMs);

      this.pendingRequests.set(reqId, { resolve, reject, timer });

      try {
        this.ws.send(JSON.stringify({ ...payload, req_id: reqId }));
      } catch (err: any) {
        this.pendingRequests.delete(reqId);
        window.clearTimeout(timer);
        reject(new DerivApiError(err?.message || 'Failed to send request over WebSocket'));
      }
    });
  }

  /**
   * Executes a real trade on Deriv (Proposal -> Buy -> Settle)
   */
  public async executeTrade(params: TradeParams): Promise<TradeResult> {
    if (!this.isReady()) {
      throw new DerivApiError(
        'Cannot place real trade: Deriv WebSocket is not authorized. Please connect your Deriv API token or log in.',
        'NotAuthorized'
      );
    }

    const { derivType, barrier } = mapContractTypeToDeriv(params.contractType, params.barrier);
    const stake = Math.max(0.35, Number(params.stake.toFixed(2)));
    const currency = params.currency || this.activeCurrency || 'USD';
    const duration = params.duration || 1;
    const durationUnit = params.durationUnit || 't';

    // Step 1: Request Proposal from Deriv
    const proposalReq: Record<string, any> = {
      proposal: 1,
      amount: stake,
      basis: params.basis || 'stake',
      contract_type: derivType,
      currency,
      duration,
      duration_unit: durationUnit,
      symbol: params.symbol,
    };

    if (barrier !== undefined) {
      proposalReq.barrier = barrier;
    }

    const propData = await this.sendRequest(proposalReq, 12000);
    const proposal: DerivProposalResponse = propData.proposal;
    if (!proposal || !proposal.id) {
      throw new DerivApiError('Deriv proposal failed to return contract details.');
    }

    // Step 2: Buy the contract using proposal ID
    const buyReq = {
      buy: proposal.id,
      price: proposal.ask_price,
    };

    const buyData = await this.sendRequest(buyReq, 12000);
    const bought: DerivBuyResponse = buyData.buy;
    if (!bought || !bought.contract_id) {
      throw new DerivApiError('Contract purchase failed on Deriv.');
    }

    // Notify caller that trade is placed
    if (params.onPurchased) {
      params.onPurchased({
        contractId: bought.contract_id,
        buyPrice: bought.buy_price,
        longcode: bought.longcode || proposal.longcode,
      });
    }

    // Step 3: Settle the contract via proposal_open_contract subscription
    return new Promise<TradeResult>((resolve, reject) => {
      const contractId = bought.contract_id;
      const timeoutMs = 90000; // 90s safety timeout (1-tick contracts settle in 2-3s)

      const timer = window.setTimeout(() => {
        this.contractSettlers.delete(contractId);
        this.contractSettlers.delete(String(contractId));
        reject(new DerivApiError(`Contract #${contractId} settlement timed out after 90s. Check Reports on Deriv.`));
      }, timeoutMs);

      this.contractSettlers.set(contractId, {
        resolve,
        reject,
        timer,
        stake,
        onUpdate: params.onUpdate,
      });

      // Send proposal_open_contract subscription
      this.sendRequest({
        proposal_open_contract: 1,
        contract_id: contractId,
        subscribe: 1,
      }).catch((err) => {
        console.warn('Failed to subscribe to proposal_open_contract:', err);
      });
    });
  }

  /**
   * Fallback realistic simulation runner when user is testing in Simulation Mode (without token)
   */
  public simulateTrade(
    params: TradeParams,
    lastDigit: number,
    quoteDelta = 0
  ): TradeResult {
    const { derivType, barrier } = mapContractTypeToDeriv(params.contractType, params.barrier);
    const bNum = barrier !== undefined ? Number(barrier) : 2;
    const stake = Math.max(0.35, Number(params.stake.toFixed(2)));

    let won = false;
    let payoutRate = 0.95;

    switch (derivType) {
      case 'DIGITOVER':
        won = lastDigit > bNum;
        payoutRate = bNum === 1 ? 0.22 : bNum === 2 ? 0.38 : bNum === 3 ? 0.58 : bNum === 4 ? 0.95 : 1.45;
        break;
      case 'DIGITUNDER':
        won = lastDigit < bNum;
        payoutRate = bNum === 8 ? 0.22 : bNum === 7 ? 0.38 : bNum === 6 ? 0.58 : bNum === 5 ? 0.95 : 1.45;
        break;
      case 'DIGITEVEN':
        won = lastDigit % 2 === 0;
        payoutRate = 0.95;
        break;
      case 'DIGITODD':
        won = lastDigit % 2 !== 0;
        payoutRate = 0.95;
        break;
      case 'DIGITMATCH':
        won = lastDigit === bNum;
        payoutRate = 8.5;
        break;
      case 'DIGITDIFF':
        won = lastDigit !== bNum;
        payoutRate = 0.09;
        break;
      case 'CALL':
        won = quoteDelta >= 0;
        payoutRate = 0.95;
        break;
      case 'PUT':
        won = quoteDelta <= 0;
        payoutRate = 0.95;
        break;
      default:
        won = Math.random() > 0.48;
        payoutRate = 0.95;
    }

    const profit = won ? Number((stake * payoutRate).toFixed(2)) : -stake;
    const contractId = Math.floor(10000000000 + Math.random() * 90000000000);

    return {
      contractId,
      status: won ? 'won' : 'lost',
      profit,
      payout: won ? Number((stake + profit).toFixed(2)) : 0,
      buyPrice: stake,
      barrier: bNum,
      exitTick: lastDigit,
      settledAt: Date.now(),
      longcode: `[Simulated] ${derivType} ${barrier || ''} on ${params.symbol}`,
    };
  }
}

// Global trading engine singleton
export const derivTradingEngine = new DerivTradingEngine();
