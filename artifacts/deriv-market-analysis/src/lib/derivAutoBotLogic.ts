/**
 * TypeScript implementation of the Python Deriv Auto Bot
 * (Over 2 + Even/Odd Recovery Strategy)
 */

export interface AutoBotTradeDecision {
  contractType: 'Over' | 'Under' | 'Even' | 'Odd';
  barrier?: number;
  reason: string;
}

export function runLength(items: number[], predicate: (val: number) => boolean): number {
  let count = 0;
  for (let i = items.length - 1; i >= 0; i--) {
    if (predicate(items[i])) {
      count++;
    } else {
      break;
    }
  }
  return count;
}

export function decideAutoBotTrade(
  digits: number[],
  mode: 'NORMAL' | 'RECOVERY',
  entered: boolean,
  barrier: number = 2,
  streak: number = 2
): AutoBotTradeDecision | null {
  if (digits.length === 0) return null;

  const last = digits[digits.length - 1];
  const prev = digits.slice(0, digits.length - 1);

  if (mode === 'NORMAL') {
    if (entered) {
      return {
        contractType: 'Over',
        barrier,
        reason: `Continuous Normal Cycle: Buy DIGITOVER ${barrier}`,
      };
    }
    const underRun = runLength(prev, (x) => x <= barrier);
    if (last > barrier && underRun >= streak) {
      return {
        contractType: 'Over',
        barrier,
        reason: `Setup Triggered: ${underRun} digits <= ${barrier} followed by digit ${last} > ${barrier}`,
      };
    }
    return null;
  }

  // RECOVERY mode: Trades Even/Odd only on fresh pattern
  const evenRun = runLength(prev, (x) => x % 2 === 0);
  const oddRun = runLength(prev, (x) => x % 2 !== 0);

  if (last % 2 === 1 && evenRun >= streak) {
    return {
      contractType: 'Odd',
      reason: `Recovery Triggered: ${evenRun} even digits in a row followed by odd digit ${last} -> Buy DIGITODD`,
    };
  }

  if (last % 2 === 0 && oddRun >= streak) {
    return {
      contractType: 'Even',
      reason: `Recovery Triggered: ${oddRun} odd digits in a row followed by even digit ${last} -> Buy DIGITEVEN`,
    };
  }

  return null;
}

export function computeMartingaleStake(
  baseStake: number,
  martingaleFactor: number,
  lossRun: number,
  maxStake: number = 100
): number {
  const calculated = baseStake * Math.pow(martingaleFactor, lossRun);
  return Number(Math.min(calculated, maxStake).toFixed(2));
}
