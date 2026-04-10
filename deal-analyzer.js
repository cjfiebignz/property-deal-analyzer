/**
 * Property Deal Analyzer CLI (Production-Ready Refactor)
 * 
 * A scalable tool for property investment metrics.
 * Designed with a pure logic core for future SaaS/Web integration.
 * Run using: node deal-analyzer.js
 */

const readline = require('readline');

// --- 1. CONFIGURATION ---

const DEFAULTS = {
  expenseRatio: 0.20 // 20% of annual rent for rates, insurance, maintenance, etc.
};

// --- 2. MODULAR LOGIC ---

/**
 * Determines the deal quality based on yields and cashflow.
 * Extracted for standalone testing and easier logic updates.
 */
function getDealScore({ grossYield, weeklyCashflow }) {
  if (grossYield > 6 && weeklyCashflow > 0) {
    return 'Good Deal';
  } else if (grossYield >= 4 && grossYield <= 6 && weeklyCashflow >= 0) {
    return 'Average Deal';
  }
  return 'Poor Deal';
}

/**
 * Performs all deal analysis calculations.
 * Pure function: No side effects, predictable output.
 */
function analyzeDeal({ purchasePrice, weeklyRent, interestRate, deposit }) {
  const dealId = Date.now(); // Unique ID for tracking (useful for DB/SaaS)

  // 1. Basic Calculations
  const loanAmount = purchasePrice - deposit;
  const annualRent = weeklyRent * 52;
  
  // 2. Interest and Cashflow
  const annualInterestCost = loanAmount * (interestRate / 100);
  const weeklyInterestCost = annualInterestCost / 52;
  
  // 3. Expenses and Net Yield
  const annualExpenses = annualRent * DEFAULTS.expenseRatio;
  const netRent = annualRent - annualExpenses;
  const netYield = (netRent / purchasePrice) * 100;
  const grossYield = (annualRent / purchasePrice) * 100;

  // 4. Weekly Cashflow (Rent minus interest - ignores other expenses for now)
  const weeklyCashflow = weeklyRent - weeklyInterestCost;

  // 5. Deal Scoring
  const dealScore = getDealScore({ grossYield, weeklyCashflow });

  // 6. Data Normalization (Consistent rounding inside logic)
  return {
    dealId,
    loanAmount,
    annualRent,
    annualExpenses: Number(annualExpenses.toFixed(2)),
    grossYield: Number(grossYield.toFixed(2)),
    netYield: Number(netYield.toFixed(2)),
    annualInterestCost,
    weeklyInterestCost,
    weeklyCashflow: Number(weeklyCashflow.toFixed(2)),
    dealScore
  };
}

// --- 3. VALIDATION ---

function validateInputs({ purchasePrice, weeklyRent, interestRate, deposit }) {
  const inputs = { purchasePrice, weeklyRent, interestRate, deposit };
  
  for (const [key, value] of Object.entries(inputs)) {
    if (isNaN(value) || value <= 0) {
      throw new Error(`Field '${key}' must be a positive number.`);
    }
  }

  if (deposit > purchasePrice) {
    throw new Error('Deposit cannot exceed the purchase price.');
  }
}

// --- 4. CLI INTERFACE ---

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const askQuestion = (query) => new Promise((resolve) => rl.question(query, resolve));

const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-NZ', {
    style: 'currency',
    currency: 'NZD',
  }).format(amount);
};

async function main() {
  console.log('\n--- Property Deal Analyzer ---\n');

  try {
    const purchasePrice = parseFloat(await askQuestion('Enter Purchase Price (NZD): '));
    const weeklyRent = parseFloat(await askQuestion('Enter Weekly Rent (NZD): '));
    const interestRate = parseFloat(await askQuestion('Enter Interest Rate (annual %): '));
    const deposit = parseFloat(await askQuestion('Enter Deposit Amount (NZD): '));

    validateInputs({ purchasePrice, weeklyRent, interestRate, deposit });

    const results = analyzeDeal({ purchasePrice, weeklyRent, interestRate, deposit });

    console.log('\n--- Analysis Results ---');
    console.log(`Deal ID:              ${results.dealId}`);
    console.log(`Loan Amount:          ${formatCurrency(results.loanAmount)}`);
    console.log(`Gross Yield:          ${results.grossYield}%`);
    console.log(`Net Yield:            ${results.netYield}% (est.)`);
    console.log(`Annual Expenses:      ${formatCurrency(results.annualExpenses)}`);
    console.log(`Weekly Cashflow:      ${formatCurrency(results.weeklyCashflow)}`);
    console.log('------------------------');
    console.log(`DEAL SCORE:           ${results.dealScore}`);
    console.log('------------------------');
    
    console.log(`\nThis property is a ${results.dealScore} based on your inputs.\n`);

  } catch (error) {
    console.error(`\n[ERROR]: ${error.message}\n`);
  } finally {
    rl.close();
  }
}

main();
