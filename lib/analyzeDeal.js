/**
 * Property Deal Analysis Core Logic (Reusable)
 * 
 * Extracted from the CLI tool for use in web and API environments.
 */

export const DEFAULTS = {
  expenseRatio: 0.20 // 20% of annual rent for rates, insurance, maintenance, etc.
};

/**
 * Determines the deal quality based on Net Yield and Cashflow.
 * Thresholds updated for real-world investor expectations.
 */
function getDealScore({ netYield, weeklyCashflow }) {
  if (netYield > 5 && weeklyCashflow > 0) {
    return 'Good Deal';
  }
  if (netYield >= 3 && weeklyCashflow >= 0) {
    return 'Average Deal';
  }
  return 'Low Return';
}

/**
 * Performs all deal analysis calculations.
 * Returns a normalized object of results.
 */
export function analyzeDeal({ name, notes, purchasePrice, weeklyRent, interestRate, deposit }) {
  const dealId = Date.now();

  // 1. Basic Calculations
  const loanAmount = purchasePrice - deposit;
  const annualRent = weeklyRent * 52;
  
  // 2. Interest and Cashflow
  const annualInterestCost = Number((loanAmount * (interestRate / 100)).toFixed(2));
  const weeklyInterestCost = Number((annualInterestCost / 52).toFixed(2));
  
  // 3. Expenses and Net Yield
  const annualExpenses = Number((annualRent * DEFAULTS.expenseRatio).toFixed(2));
  const netRent = annualRent - annualExpenses;
  const netYield = Number(((netRent / purchasePrice) * 100).toFixed(2));
  const grossYield = Number(((annualRent / purchasePrice) * 100).toFixed(2));

  // 4. Weekly Cashflow
  // NOTE: Cashflow includes estimated expenses for realism
  const weeklyExpenses = annualExpenses / 52;
  const weeklyCashflow = Number((weeklyRent - weeklyInterestCost - weeklyExpenses).toFixed(2));

  // 5. Deal Scoring (Now using netYield instead of grossYield)
  const dealScore = getDealScore({ netYield, weeklyCashflow });

  // 6. Data Normalization
  return {
    dealId,
    name,
    notes,
    purchasePrice,
    deposit,
    loanAmount,
    annualRent,
    annualExpenses,
    grossYield,
    netYield,
    annualInterestCost,
    weeklyInterestCost,
    weeklyCashflow,
    dealScore
  };
}
