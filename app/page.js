'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { analyzeDeal, DEFAULTS } from '../lib/analyzeDeal';

export default function PropertyAnalyzer() {
  // 1. CORE STATE
  const [inputs, setInputs] = useState({
    name: '',
    notes: '',
    purchasePrice: '',
    weeklyRent: '',
    interestRate: '6.5',
    deposit: '200000'
  });
  const [results, setResults] = useState(null);
  const [error, setError] = useState('');

  // 2. PERSISTENCE STATE
  const [savedDeals, setSavedDeals] = useState([]);
  const [alerts, setAlerts] = useState([]);

  // 3. INTERACTIVITY STATE
  const [selectedDeals, setSelectedDeals] = useState([]);
  const [showComparison, setShowComparison] = useState(false);
  const [alertInputs, setAlertInputs] = useState({ minYield: '', minCashflow: '', maxPrice: '' });
  const [alertCheckResult, setAlertCheckResult] = useState(null);

  // 4. PARSER STATE
  const [listingUrl, setListingUrl] = useState('');
  const [listingText, setListingText] = useState('');
  const [isFetching, setIsFetching] = useState(false);
  const [parsingMessage, setParsingMessage] = useState({ text: '', type: '' });
  const [batchResults, setBatchResults] = useState([]);
  const [batchSummary, setBatchSummary] = useState(null);
  const [csvResults, setCsvResults] = useState([]);
  const [csvSummary, setCsvSummary] = useState(null);
  
  const fileInputRef = useRef(null);

  // 5. STORAGE SYNC
  useEffect(() => {
    const dealsData = localStorage.getItem('savedDeals');
    const alertsData = localStorage.getItem('dealAlerts');
    if (dealsData) { try { setSavedDeals(JSON.parse(dealsData)); } catch (err) { console.error('Load Error:', err); } }
    if (alertsData) { try { setAlerts(JSON.parse(alertsData)); } catch (err) { console.error('Load Error:', err); } }
  }, []);

  const updateSavedDeals = (newDeals) => {
    setSavedDeals(newDeals);
    localStorage.setItem('savedDeals', JSON.stringify(newDeals));
  };

  const updateAlerts = (newAlerts) => {
    setAlerts(newAlerts);
    localStorage.setItem('dealAlerts', JSON.stringify(newAlerts));
  };

  // 6. UI HELPERS
  const clearMessages = () => {
    setParsingMessage({ text: '', type: '' });
    setError('');
    setAlertCheckResult(null);
  };

  const handleChange = (e) => {
    clearMessages();
    const { name, value } = e.target;
    setInputs(prev => ({ ...prev, [name]: value }));
  };

  const handleListingTextType = (e) => {
    setParsingMessage({ text: '', type: '' });
    setListingText(e.target.value);
  };

  const handleAlertChange = (e) => {
    const { name, value } = e.target;
    setAlertInputs(prev => ({ ...prev, [name]: value }));
  };

  // 7. PARSING ENGINE
  const extractFromText = (text) => {
    const priceRegex = /\$?\b(\d{1,3}(?:,\d{3})*(?:\.\d+)?)\b\s*(k|million|m)?/i;
    const rentRegex = /\$?\s?(\d{2,4})\s?(?:per week|\/week|pw|per wk|wk)/i;

    const priceMatch = text.match(priceRegex);
    const rentMatch = text.match(rentRegex);

    let price = '';
    let rent = '';

    if (priceMatch) {
      let val = parseFloat(priceMatch[1].replace(/,/g, ''));
      const multiplier = priceMatch[2]?.toLowerCase();
      if (multiplier === 'k') val *= 1000;
      if (multiplier === 'million' || multiplier === 'm') val *= 1000000;
      
      // Part 3: Prevent unrealistic price values
      if (val >= 50000) {
        price = val.toString();
      }
    }

    if (rentMatch) {
      const val = parseFloat(rentMatch[1]);
      // Part 3: Ensure rent sanity
      if (val >= 50 && val <= 5000) {
        rent = val.toString();
      }
    }

    return { price, rent };
  };

  const handleFetchListing = async () => {
    if (!listingUrl.trim()) return;
    clearMessages();
    setIsFetching(true);
    setParsingMessage({ text: 'Fetching listing data...', type: 'info' });

    try {
      const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(listingUrl)}`;
      const response = await fetch(proxyUrl);
      if (!response.ok) throw new Error('Fetch failed.');
      const html = await response.text();
      
      const { price, rent } = extractFromText(html);

      if (price || rent) {
        setInputs(prev => ({
          ...prev,
          purchasePrice: price || prev.purchasePrice,
          weeklyRent: rent || prev.weeklyRent
        }));
        setParsingMessage({ text: 'Listing data extracted successfully!', type: 'success' });
      } else {
        setParsingMessage({ text: 'Connected, but no price/rent patterns found. Try manual paste.', type: 'error' });
      }
    } catch (err) {
      setParsingMessage({ text: 'Fetch blocked or failed. Try manual paste.', type: 'error' });
    } finally {
      setIsFetching(false);
    }
  };

  const handleBatchAnalyze = () => {
    clearMessages();
    if (!listingText.trim()) return;

    // Part 8: Performance Safety
    setTimeout(() => {
      const listings = listingText.split(/\n\s*\n|----/);
      const results = [];
      let success = 0;

      listings.forEach((text, i) => {
        const { price, rent } = extractFromText(text);
        if (price && rent) {
          try {
            const deal = analyzeDeal({
              name: text.split('\n')[0].substring(0, 50).trim() || `Batch Listing ${i + 1}`,
              notes: 'Batch parsed',
              purchasePrice: parseFloat(price),
              weeklyRent: parseFloat(rent),
              interestRate: parseFloat(inputs.interestRate),
              deposit: parseFloat(inputs.deposit)
            });
            results.push(deal);
            success++;
          } catch (e) {}
        }
      });

      setBatchResults(results);
      setBatchSummary({ total: listings.length, success, failed: listings.length - success });
    }, 0);
  };

  const handleCsvUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    clearMessages();

    const reader = new FileReader();
    reader.onload = (event) => {
      // Part 8: Performance Safety
      setTimeout(() => {
        const lines = event.target.result.split(/\r?\n/);
        if (lines.length < 2) return;

        const headers = lines[0].toLowerCase().split(',').map(h => h.trim());
        const pIdx = headers.indexOf('purchaseprice');
        const rIdx = headers.indexOf('weeklyrent');
        const nIdx = headers.indexOf('name');
        const ntIdx = headers.indexOf('notes');

        if (pIdx === -1 || rIdx === -1) {
          alert('CSV error: missing "purchasePrice" or "weeklyRent" columns.');
          return;
        }

        const results = [];
        let success = 0;
        let failed = 0;

        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;

          // Part 4: Safer CSV Regex
          const rowMatch = line.match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g);
          if (!rowMatch) { failed++; continue; }
          const row = rowMatch.map(v => v.replace(/^"|"$/g, '').trim());

          const price = parseFloat(row[pIdx]);
          const rent = parseFloat(row[rIdx]);

          // Part 4: Skip invalid/NaN rows
          if (isNaN(price) || isNaN(rent) || price < 50000) {
            failed++;
            continue;
          }

          try {
            const deal = analyzeDeal({
              name: nIdx !== -1 && row[nIdx] ? row[nIdx] : `CSV Row ${i}`,
              notes: ntIdx !== -1 && row[ntIdx] ? row[ntIdx] : 'CSV import',
              purchasePrice: price,
              weeklyRent: rent,
              interestRate: parseFloat(inputs.interestRate),
              deposit: parseFloat(inputs.deposit)
            });
            results.push(deal);
            success++;
          } catch (e) {
            failed++;
          }
        }
        setCsvResults(results);
        setCsvSummary({ total: lines.length - 1, success, failed });
      }, 0);
    };
    reader.readAsText(file);
  };

  // 8. ACTIONS
  const handleAnalyze = (e) => {
    e.preventDefault();
    clearMessages();
    try {
      const data = analyzeDeal({
        ...inputs,
        purchasePrice: parseFloat(inputs.purchasePrice),
        weeklyRent: parseFloat(inputs.weeklyRent),
        interestRate: parseFloat(inputs.interestRate),
        deposit: parseFloat(inputs.deposit)
      });
      setResults(data);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleSaveDeal = () => {
    if (!results) return;
    // Part 5: Prevent duplicate saves
    if (savedDeals.some(d => d.dealId === results.dealId)) {
      alert('Deal already saved');
      return;
    }
    updateSavedDeals([...savedDeals, results]);
  };

  const handleSaveBatch = () => {
    const newDeals = [...savedDeals];
    batchResults.forEach(d => {
      if (!newDeals.some(sd => sd.dealId === d.dealId)) newDeals.push(d);
    });
    updateSavedDeals(newDeals);
    setBatchResults([]);
    setBatchSummary(null);
  };

  const handleSaveCsv = () => {
    const newDeals = [...savedDeals];
    csvResults.forEach(d => {
      if (!newDeals.some(sd => sd.dealId === d.dealId)) newDeals.push(d);
    });
    updateSavedDeals(newDeals);
    setCsvResults([]);
    setCsvSummary(null);
  };

  const handleDeleteDeal = (id) => {
    updateSavedDeals(savedDeals.filter(d => d.dealId !== id));
    setSelectedDeals(selectedDeals.filter(sid => sid !== id));
  };

  // 9. ALERT MANAGEMENT
  const handleSaveAlert = (e) => {
    e.preventDefault();
    // Part 1: Fix Alert Validation with safe defaults
    const alertObj = {
      id: Date.now(),
      minYield: parseFloat(alertInputs.minYield) || 0,
      minCashflow: parseFloat(alertInputs.minCashflow) || 0,
      maxPrice: parseFloat(alertInputs.maxPrice) || Infinity
    };

    // Duplicate check for alert criteria
    const isDup = alerts.some(a => 
      a.minYield === alertObj.minYield && 
      a.minCashflow === alertObj.minCashflow && 
      a.maxPrice === alertObj.maxPrice
    );

    if (!isDup) {
      updateAlerts([...alerts, alertObj]);
      setAlertInputs({ minYield: '', minCashflow: '', maxPrice: '' });
    }
  };

  const getMatchingAlerts = (deal) => {
    // Part 6: Improve Matching Safety
    return alerts.filter(a => 
      (deal.netYield ?? 0) >= (a.minYield ?? 0) &&
      (deal.weeklyCashflow ?? 0) >= (a.minCashflow ?? 0) &&
      (deal.purchasePrice ?? Infinity) <= (a.maxPrice ?? Infinity)
    );
  };

  const handleCheckAlerts = () => {
    if (!results) return;
    const matches = getMatchingAlerts(results);
    setAlertCheckResult(matches.length > 0 ? { status: 'match', matches } : { status: 'no_match' });
  };

  const handleToggleSelect = (id) => {
    if (selectedDeals.includes(id)) {
      setSelectedDeals(selectedDeals.filter(sid => sid !== id));
    } else if (selectedDeals.length < 2) {
      setSelectedDeals([...selectedDeals, id]);
    } else {
      alert('Select exactly 2 deals to compare.');
    }
  };

  // 10. VISUAL HELPERS
  const formatCurrency = (val) => new Intl.NumberFormat('en-NZ', { style: 'currency', currency: 'NZD' }).format(val);
  const getScoreStyle = (score) => ({ color: score === 'Good Deal' ? '#2e7d32' : score === 'Average Deal' ? '#ed6c02' : '#d32f2f', fontWeight: 'bold' });
  
  const sortedSaved = useMemo(() => [...savedDeals].sort((a, b) => b.netYield - a.netYield), [savedDeals]);
  const bestSavedId = sortedSaved.length > 0 ? sortedSaved[0].dealId : null;
  const compareList = savedDeals.filter(d => selectedDeals.includes(d.dealId));

  return (
    <main style={styles.container}>
      <h1 style={styles.title}>Property Deal Analyzer</h1>

      {/* Import Layer */}
      <section style={styles.toolSection}>
        <h2 style={{ margin: '0 0 15px 0' }}>Import & Extract</h2>
        <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
          <input 
            type="url" 
            style={{ ...styles.input, flex: 1 }} 
            placeholder="Listing URL (e.g. Trademe)..."
            value={listingUrl}
            onChange={(e) => { setListingUrl(e.target.value); clearMessages(); }}
          />
          <button onClick={handleFetchListing} disabled={isFetching} style={styles.parserButton}>
            {isFetching ? 'Fetching...' : 'Fetch URL'}
          </button>
        </div>
        
        <textarea 
          style={styles.textarea} 
          rows="4" 
          placeholder="Paste listing text. (Split multiple with blank lines for batch mode)"
          value={listingText}
          onChange={handleListingTextType}
        />
        
        <div style={{ display: 'flex', gap: '10px', marginTop: '10px', flexWrap: 'wrap' }}>
          <button onClick={() => { clearMessages(); const { price, rent } = extractFromText(listingText); if (price || rent) setInputs(p => ({ ...p, purchasePrice: price || p.purchasePrice, weeklyRent: rent || p.weeklyRent })); }} style={styles.parserButton}>Extract to Form</button>
          <button onClick={handleBatchAnalyze} style={styles.batchButton}>Analyze Batch</button>
          <div style={{ flex: 1 }}></div>
          <input type="file" accept=".csv" ref={fileInputRef} onChange={handleCsvUpload} style={{ display: 'none' }} />
          <button onClick={() => fileInputRef.current.click()} style={styles.csvButton}>Import CSV</button>
        </div>

        {parsingMessage.text && (
          <p style={{ ...styles.msg, color: parsingMessage.type === 'success' ? '#2e7d32' : parsingMessage.type === 'error' ? '#d32f2f' : '#0070f3' }}>
            {parsingMessage.text}
          </p>
        )}
      </section>

      {/* Async Results (Batch/CSV) */}
      {(batchResults.length > 0 || csvResults.length > 0) && (
        <section style={styles.resultsSection}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2>Import Results</h2>
            <button onClick={batchResults.length > 0 ? handleSaveBatch : handleSaveCsv} style={styles.saveButton}>Save All Successful</button>
          </div>
          {batchSummary && <p style={styles.subtext}>Batch: {batchSummary.success} OK, {batchSummary.failed} Failed</p>}
          {csvSummary && <p style={styles.subtext}>CSV: {csvSummary.success} OK, {csvSummary.failed} Failed</p>}
          <div style={styles.list}>
            {(batchResults.length > 0 ? batchResults : csvResults).map(deal => (
              <div key={deal.dealId} style={styles.listItem}>
                <strong>{deal.name}</strong>: {deal.netYield}% Yield | {formatCurrency(deal.weeklyCashflow)}/wk | <span style={getScoreStyle(deal.dealScore)}>{deal.dealScore}</span>
                {getMatchingAlerts(deal).length > 0 && <span style={styles.alertBadge}>MATCH</span>}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Manual Entry */}
      <section style={styles.formSection}>
        <h2 style={{ margin: '0 0 15px 0' }}>Manual Analysis</h2>
        <form onSubmit={handleAnalyze} style={styles.form}>
          <div style={styles.inputGroup}><label>Name / Address</label><input type="text" name="name" value={inputs.name} onChange={handleChange} required /></div>
          <div style={styles.grid}>
            <div style={styles.inputGroup}><label>Price (NZD)</label><input type="number" name="purchasePrice" value={inputs.purchasePrice} onChange={handleChange} required /></div>
            <div style={styles.inputGroup}><label>Weekly Rent</label><input type="number" name="weeklyRent" value={inputs.weeklyRent} onChange={handleChange} required /></div>
            <div style={styles.inputGroup}><label>Interest Rate %</label><input type="number" name="interestRate" value={inputs.interestRate} onChange={handleChange} required step="0.01" /></div>
            <div style={styles.inputGroup}><label>Deposit</label><input type="number" name="deposit" value={inputs.deposit} onChange={handleChange} required /></div>
          </div>
          <button type="submit" style={styles.button}>Analyze Deal</button>
        </form>
        {error && <p style={styles.error}>{error}</p>}
      </section>

      {/* Current Analysis View */}
      {results && (
        <section style={styles.currentCard}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h2 style={{ margin: 0 }}>{results.name}</h2>
              <p style={{ margin: '5px 0 0 0', ...getScoreStyle(results.dealScore) }}>{results.dealScore}</p>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={handleCheckAlerts} style={styles.outlineButton}>Check Alerts</button>
              <button onClick={handleSaveDeal} style={styles.saveButton}>Save Deal</button>
            </div>
          </div>
          <div style={styles.grid}>
            <p><strong>Net Yield:</strong> {results.netYield}%</p>
            <p><strong>Weekly Cashflow:</strong> {formatCurrency(results.weeklyCashflow)}</p>
          </div>
          {alertCheckResult && (
            <div style={{ ...styles.alertCheck, backgroundColor: alertCheckResult.status === 'match' ? '#e8f5e9' : '#fff5f5', color: alertCheckResult.status === 'match' ? '#2e7d32' : '#d32f2f' }}>
              {alertCheckResult.status === 'match' ? `✅ Matches ${alertCheckResult.matches.length} Alert(s)` : '❌ No Alert Criteria Met'}
            </div>
          )}
        </section>
      )}

      {/* Comparison View */}
      {showComparison && compareList.length === 2 && (
        <section style={styles.compareCard}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <h2>Deal Comparison</h2>
            <button onClick={() => { setShowComparison(false); setSelectedDeals([]); }} style={styles.delBtn}>Close</button>
          </div>
          <div style={styles.compareGrid}>
            <div>Metric</div><div style={{ fontWeight: 'bold' }}>{compareList[0].name}</div><div style={{ fontWeight: 'bold' }}>{compareList[1].name}</div>
            <div>Net Yield</div>
            <div style={{ color: compareList[0].netYield >= compareList[1].netYield ? '#28a745' : 'inherit', fontWeight: 'bold' }}>{compareList[0].netYield}%</div>
            <div style={{ color: compareList[1].netYield >= compareList[0].netYield ? '#28a745' : 'inherit', fontWeight: 'bold' }}>{compareList[1].netYield}%</div>
            <div>Cashflow</div>
            <div style={{ color: compareList[0].weeklyCashflow >= compareList[1].weeklyCashflow ? '#28a745' : 'inherit', fontWeight: 'bold' }}>{formatCurrency(compareList[0].weeklyCashflow)}</div>
            <div style={{ color: compareList[1].weeklyCashflow >= compareList[0].weeklyCashflow ? '#28a745' : 'inherit', fontWeight: 'bold' }}>{formatCurrency(compareList[1].weeklyCashflow)}</div>
          </div>
        </section>
      )}

      {/* Alerts Manager */}
      <section style={styles.alertSection}>
        <h2 style={{ margin: '0 0 15px 0' }}>My Alerts</h2>
        <form onSubmit={handleSaveAlert} style={styles.alertForm}>
          <input type="number" name="minYield" placeholder="Min Yield %" value={alertInputs.minYield} onChange={handleAlertChange} step="0.1" />
          <input type="number" name="minCashflow" placeholder="Min Cashflow" value={alertInputs.minCashflow} onChange={handleAlertChange} />
          <input type="number" name="maxPrice" placeholder="Max Price" value={alertInputs.maxPrice} onChange={handleAlertChange} />
          <button type="submit" style={styles.alertButton}>Add Alert</button>
        </form>
        <div style={{ marginTop: '15px' }}>
          {alerts.map(a => (
            <div key={a.id} style={styles.alertItem}>
              <span>Yield: {a.minYield}%+ | Cash: {formatCurrency(a.minCashflow)}+ | Price: &le; {a.maxPrice === Infinity ? 'Any' : formatCurrency(a.maxPrice)}</span>
              <button onClick={() => updateAlerts(alerts.filter(al => al.id !== a.id))} style={styles.delBtn}>Remove</button>
            </div>
          ))}
        </div>
      </section>

      {/* Saved Dashboard */}
      <section style={styles.savedSection}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2>Saved Dashboard</h2>
          {selectedDeals.length === 2 && <button onClick={() => setShowComparison(true)} style={styles.compareBtn}>Compare Selected</button>}
        </div>
        <div style={styles.list}>
          {sortedSaved.map(deal => (
            <div key={deal.dealId} style={{ ...styles.listItem, borderLeft: deal.dealId === bestSavedId ? '5px solid #28a745' : '1px solid #eee' }}>
              <input type="checkbox" checked={selectedDeals.includes(deal.dealId)} onChange={() => handleToggleSelect(deal.dealId)} />
              <div style={{ flex: 1, marginLeft: '15px' }}>
                <strong>{deal.name}</strong> - {deal.netYield}% Net | {formatCurrency(deal.weeklyCashflow)}/wk
                {getMatchingAlerts(deal).length > 0 && <span style={styles.alertBadge}>MATCH</span>}
                {deal.dealId === bestSavedId && <span style={styles.bestBadge}>TOP YIELD</span>}
              </div>
              <button onClick={() => handleDeleteDeal(deal.dealId)} style={styles.delBtn}>Delete</button>
            </div>
          ))}
          {savedDeals.length === 0 && <p style={styles.subtext}>No deals saved yet. Use the tools above to start analyzing.</p>}
        </div>
      </section>
    </main>
  );
}

const styles = {
  container: { maxWidth: '1000px', margin: '30px auto', padding: '20px', fontFamily: 'system-ui, sans-serif', color: '#333', lineHeight: '1.5' },
  title: { textAlign: 'center', marginBottom: '40px', fontWeight: '800' },
  toolSection: { backgroundColor: '#fff', border: '1px solid #ddd', padding: '25px', borderRadius: '12px', marginBottom: '25px', boxShadow: '0 4px 6px rgba(0,0,0,0.02)' },
  input: { padding: '12px', borderRadius: '6px', border: '1px solid #ccc', fontSize: '0.95rem' },
  textarea: { width: '100%', padding: '12px', borderRadius: '6px', border: '1px solid #ccc', boxSizing: 'border-box', fontSize: '0.95rem', fontFamily: 'inherit' },
  parserButton: { padding: '10px 20px', backgroundColor: '#222', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600' },
  batchButton: { padding: '10px 20px', backgroundColor: '#6200ee', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600' },
  csvButton: { padding: '10px 20px', backgroundColor: '#018786', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600' },
  msg: { marginTop: '12px', fontSize: '0.9rem', fontWeight: '600' },
  formSection: { backgroundColor: '#f8f9fa', padding: '25px', borderRadius: '12px', marginBottom: '25px', border: '1px solid #e9ecef' },
  form: { display: 'flex', flexDirection: 'column', gap: '20px' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px' },
  inputGroup: { display: 'flex', flexDirection: 'column', gap: '6px' },
  button: { padding: '16px', backgroundColor: '#0070f3', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '1.1rem', fontWeight: 'bold' },
  currentCard: { padding: '25px', border: '2px solid #0070f3', borderRadius: '12px', backgroundColor: '#fff', marginBottom: '25px', boxShadow: '0 4px 12px rgba(0,112,243,0.1)' },
  outlineButton: { padding: '10px 15px', border: '1px solid #0070f3', backgroundColor: 'transparent', color: '#0070f3', borderRadius: '6px', cursor: 'pointer', fontWeight: '600' },
  saveButton: { padding: '10px 15px', backgroundColor: '#28a745', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600' },
  alertCheck: { marginTop: '15px', padding: '12px', borderRadius: '6px', fontWeight: 'bold', border: '1px solid transparent' },
  alertSection: { backgroundColor: '#f0f4ff', padding: '25px', borderRadius: '12px', marginBottom: '25px', border: '1px solid #d0dfff' },
  alertForm: { display: 'flex', gap: '12px', flexWrap: 'wrap' },
  alertButton: { padding: '10px 20px', backgroundColor: '#6200ee', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600' },
  alertItem: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #d0dfff' },
  compareCard: { padding: '25px', border: '2px solid #6200ee', borderRadius: '12px', backgroundColor: '#fff', marginBottom: '25px', boxShadow: '0 4px 12px rgba(98,0,238,0.1)' },
  compareGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '15px', marginTop: '20px' },
  compareBtn: { padding: '10px 20px', backgroundColor: '#6200ee', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' },
  savedSection: { marginTop: '40px' },
  list: { display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '20px' },
  listItem: { display: 'flex', alignItems: 'center', padding: '18px', border: '1px solid #eee', borderRadius: '10px', backgroundColor: '#fff', transition: 'transform 0.1s ease' },
  alertBadge: { marginLeft: '12px', backgroundColor: '#6200ee', color: '#fff', fontSize: '0.7rem', padding: '3px 8px', borderRadius: '12px', fontWeight: 'bold' },
  bestBadge: { marginLeft: '12px', backgroundColor: '#28a745', color: '#fff', fontSize: '0.7rem', padding: '3px 8px', borderRadius: '12px', fontWeight: 'bold' },
  delBtn: { backgroundColor: 'transparent', color: '#d32f2f', border: '1px solid #d32f2f', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem' },
  resultsSection: { backgroundColor: '#e8f5e9', padding: '25px', borderRadius: '12px', marginBottom: '25px', border: '1px solid #c8e6c9' },
  subtext: { fontSize: '0.85rem', color: '#666', marginTop: '5px' },
  error: { color: '#d32f2f', fontWeight: '600', marginTop: '10px' }
};
