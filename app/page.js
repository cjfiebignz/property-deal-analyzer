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
  
  // Workflow Refs
  const importRef = useRef(null);
  const analyzeRef = useRef(null);
  const reviewRef = useRef(null);

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

  const scrollTo = (ref) => {
    setTimeout(() => {
      ref.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
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
      
      if (val >= 50000) {
        price = val.toString();
      }
    }

    if (rentMatch) {
      const val = parseFloat(rentMatch[1]);
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
        scrollTo(analyzeRef);
      } else {
        setParsingMessage({ text: 'Connected, but no price/rent patterns found. Please paste listing text instead.', type: 'error' });
      }
    } catch (err) {
      setParsingMessage({ text: 'Most property sites block automatic fetching. Please paste listing text instead.', type: 'error' });
    } finally {
      setIsFetching(false);
    }
  };

  const handleExtractToForm = () => {
    clearMessages();
    const { price, rent } = extractFromText(listingText);
    if (price || rent) {
      setInputs(prev => ({ ...prev, purchasePrice: price || prev.purchasePrice, weeklyRent: rent || prev.weeklyRent }));
      setParsingMessage({ text: 'Details extracted to Step 2 form.', type: 'success' });
      scrollTo(analyzeRef);
    } else {
      setParsingMessage({ text: 'Could not find price or rent in the text.', type: 'error' });
    }
  };

  const handleBatchAnalyze = () => {
    clearMessages();
    if (!listingText.trim()) return;

    setTimeout(() => {
      const listings = listingText.split(/\n\s*\n|----/).map(l => l.trim()).filter(l => l.length > 0);
      let batchResultsArr = [];
      let success = 0;

      listings.forEach((text, i) => {
        const { price, rent } = extractFromText(text);
        if (price && rent) {
          try {
            const deal = analyzeDeal({
              name: text.split('\n')[0].substring(0, 50).trim() || `Listing ${i + 1}`,
              notes: 'Batch parsed',
              purchasePrice: parseFloat(price),
              weeklyRent: parseFloat(rent),
              interestRate: parseFloat(inputs.interestRate),
              deposit: parseFloat(inputs.deposit)
            });
            batchResultsArr.push(deal);
            success++;
          } catch (e) {}
        }
      });

      if (success === 0) {
        setParsingMessage({ text: 'No valid deals found. Make sure listings include price and rent.', type: 'error' });
        setBatchResults([]);
      } else {
        // Sort by Net Yield descending
        batchResultsArr.sort((a, b) => b.netYield - a.netYield);
        setBatchResults(batchResultsArr);
        setBatchSummary({ total: listings.length, success, failed: listings.length - success });
        // ISSUE 2: Stronger feedback
        setParsingMessage({ text: `Analyzed ${success} listings. Showing top-performing deals.`, type: 'success' });
        scrollTo(reviewRef);
      }
    }, 0);
  };

  const handleCsvUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    clearMessages();

    const reader = new FileReader();
    reader.onload = (event) => {
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

        const resultsArr = [];
        let success = 0;
        let failed = 0;

        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;

          const rowMatch = line.match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g);
          if (!rowMatch) { failed++; continue; }
          const row = rowMatch.map(v => v.replace(/^"|"$/g, '').trim());

          const price = parseFloat(row[pIdx]);
          const rent = parseFloat(row[rIdx]);

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
            resultsArr.push(deal);
            success++;
          } catch (e) {
            failed++;
          }
        }
        resultsArr.sort((a, b) => b.netYield - a.netYield);
        setCsvResults(resultsArr);
        setCsvSummary({ total: lines.length - 1, success, failed });
        if (success > 0) scrollTo(reviewRef);
      }, 0);
    };
    reader.readAsText(file);
  };

  const getMatchingAlerts = (deal) => {
    return alerts.filter(a => 
      (deal.netYield ?? 0) >= (a.minYield ?? 0) &&
      (deal.weeklyCashflow ?? 0) >= (a.minCashflow ?? 0) &&
      (deal.purchasePrice ?? Infinity) <= (a.maxPrice ?? Infinity)
    );
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
      
      const matches = getMatchingAlerts(data);
      if (matches.length > 0) {
        setAlertCheckResult({ status: 'match', matches });
      } else {
        setAlertCheckResult({ status: 'no_match' });
      }
      scrollTo(reviewRef);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleSaveDeal = () => {
    if (!results) return;
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
    const alertObj = {
      id: Date.now(),
      minYield: parseFloat(alertInputs.minYield) || 0,
      minCashflow: parseFloat(alertInputs.minCashflow) || 0,
      maxPrice: parseFloat(alertInputs.maxPrice) || Infinity
    };

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

  // Determine best in batch/csv
  const bestBatchId = batchResults.length > 0 ? batchResults[0].dealId : null;
  const bestCsvId = csvResults.length > 0 ? csvResults[0].dealId : null;

  return (
    <main style={styles.container}>
      <h1 style={styles.title}>Property Deal Analyzer</h1>
      {/* ISSUE 5: Guidance under main title */}
      <p style={{ textAlign: 'center', color: '#666', marginTop: '-30px', marginBottom: '50px' }}>
        Analyze property deals in seconds. Paste a listing below to get started.
      </p>

      {/* STEP 1: IMPORT DEAL */}
      <section ref={importRef} style={{ ...styles.section, backgroundColor: '#ffffff' }}>
        <div style={styles.sectionHeader}>
          <h2 style={styles.sectionTitle}>Step 1: Import Deal</h2>
          <p style={styles.sectionSubtitle}>Paste a listing, upload a CSV, or enter details manually.</p>
        </div>

        <div style={styles.importGrid}>
          {/* Tool Area */}
          <div style={styles.importTools}>
            {/* ISSUE 4: Guide user in Step 1 */}
            <p style={{ fontWeight: 'bold', fontSize: '1.1rem', marginBottom: '15px' }}>👉 Start by pasting a property listing below (fastest way)</p>
            
            <div style={{ marginBottom: '30px' }}>
              <h3 style={{ margin: '0 0 5px 0' }}>Find the Best Deals Instantly</h3>
              <p style={{ margin: '0 0 15px 0', color: '#666', fontSize: '0.95rem' }}>Paste multiple property listings below and we’ll analyze and rank them by performance.</p>
              
              <textarea 
                style={styles.textarea} 
                rows="8" 
                placeholder="Copy and paste property listings from TradeMe here..."
                value={listingText}
                onChange={handleListingTextType}
              />
              <p style={styles.tip}>Tip: Separate listings with a blank line. Each listing needs a price and rent to be analyzed.</p>
              <div style={{ display: 'flex', gap: '10px', marginTop: '15px' }}>
                <button onClick={handleExtractToForm} style={styles.primaryBtn}>Extract to Form</button>
                <button onClick={handleBatchAnalyze} style={styles.finderBtn}>Find Best Deals</button>
              </div>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={styles.label}>Import from URL</label>
              <div style={{ display: 'flex', gap: '10px' }}>
                <input 
                  type="url" 
                  style={{ ...styles.input, flex: 1 }} 
                  placeholder="https://www.trademe.co.nz/..."
                  value={listingUrl}
                  onChange={(e) => { setListingUrl(e.target.value); clearMessages(); }}
                />
                <button onClick={handleFetchListing} disabled={isFetching} style={styles.primaryBtn}>
                  {isFetching ? 'Fetching...' : 'Fetch URL'}
                </button>
              </div>
            </div>

            <div>
              <label style={styles.label}>Import from CSV</label>
              <input type="file" accept=".csv" ref={fileInputRef} onChange={handleCsvUpload} style={styles.fileInput} />
            </div>

            {parsingMessage.text && (
              <p style={{ ...styles.msg, color: parsingMessage.type === 'success' ? '#2e7d32' : parsingMessage.type === 'error' ? '#d32f2f' : '#0070f3' }}>
                {parsingMessage.text}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* STEP 2: ANALYZE DEAL */}
      <section ref={analyzeRef} style={{ ...styles.section, backgroundColor: '#f8f9fa' }}>
        <div style={styles.sectionHeader}>
          <h2 style={styles.sectionTitle}>Step 2: Analyze Deal</h2>
          <p style={styles.sectionSubtitle}>Review or edit details, then calculate deal performance.</p>
        </div>

        <form onSubmit={handleAnalyze} style={styles.manualForm}>
          <div style={styles.inputGroup}>
            <label style={styles.label}>Property Name / Address</label>
            <input type="text" name="name" value={inputs.name} onChange={handleChange} required placeholder="e.g. 123 Main St, Auckland" style={styles.input} />
          </div>
          <div style={styles.grid}>
            <div style={styles.inputGroup}><label style={styles.label}>Price (NZD)</label><input type="number" name="purchasePrice" value={inputs.purchasePrice} onChange={handleChange} required style={styles.input} /></div>
            <div style={styles.inputGroup}><label style={styles.label}>Weekly Rent</label><input type="number" name="weeklyRent" value={inputs.weeklyRent} onChange={handleChange} required style={styles.input} /></div>
            <div style={styles.inputGroup}><label style={styles.label}>Interest Rate %</label><input type="number" name="interestRate" value={inputs.interestRate} onChange={handleChange} required step="0.01" style={styles.input} /></div>
            <div style={styles.inputGroup}><label style={styles.label}>Deposit</label><input type="number" name="deposit" value={inputs.deposit} onChange={handleChange} required style={styles.input} /></div>
          </div>
          <div style={styles.inputGroup}>
            <label style={styles.label}>Notes (Optional)</label>
            <textarea name="notes" value={inputs.notes} onChange={handleChange} placeholder="Add condition, strategy, etc..." rows="2" style={styles.textarea} />
          </div>
          <button type="submit" style={styles.analyzeBtn}>Calculate Deal Performance</button>
        </form>
        {error && <p style={styles.error}>{error}</p>}
      </section>

      {/* STEP 3: REVIEW & DECIDE */}
      <section ref={reviewRef} style={{ ...styles.section, backgroundColor: '#ffffff' }}>
        <div style={styles.sectionHeader}>
          <h2 style={styles.sectionTitle}>Step 3: Review & Decide</h2>
          <p style={styles.sectionSubtitle}>Save, compare, and track deals.</p>
        </div>

        {/* Current Result Card */}
        {results && (
          <div style={styles.resultCard}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.5rem' }}>{results.name}</h3>
                <p style={{ margin: '5px 0 0 0', fontSize: '1.1rem', ...getScoreStyle(results.dealScore) }}>{results.dealScore}</p>
              </div>
              <button onClick={handleSaveDeal} style={styles.saveBtn}>Save to Dashboard</button>
            </div>
            <div style={styles.grid}>
              <div style={styles.metric}><strong>Net Yield:</strong> <span style={{ fontSize: '1.2rem' }}>{results.netYield}%</span></div>
              <div style={styles.metric}><strong>Weekly Cashflow:</strong> <span style={{ fontSize: '1.2rem' }}>{formatCurrency(results.weeklyCashflow)}</span></div>
            </div>
            {/* ISSUE 3: Prominent alert matching */}
            {alertCheckResult && (
              <div style={{ ...styles.alertCheck, backgroundColor: alertCheckResult.status === 'match' ? '#e8f5e9' : '#fff5f5', color: alertCheckResult.status === 'match' ? '#2e7d32' : '#d32f2f' }}>
                <div style={{ fontSize: '1.2rem', marginBottom: '5px' }}>
                  {alertCheckResult.status === 'match' ? '🔥 This deal meets your criteria' : '⚠️ This deal does not meet your criteria'}
                </div>
                {alertCheckResult.status === 'match' && <p style={{ margin: 0, fontWeight: 'normal' }}>Matches {alertCheckResult.matches.length} criteria.</p>}
              </div>
            )}
          </div>
        )}

        {/* Batch / CSV Import Results List (Deal Finder Mode) */}
        {(batchResults.length > 0 || csvResults.length > 0) && (
          <div style={styles.batchContainer}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
              <h3 style={{ margin: 0 }}>Deal Finder Results (Ranked by Yield)</h3>
              <button onClick={batchResults.length > 0 ? handleSaveBatch : handleSaveCsv} style={styles.saveBtn}>Save All Unique Deals</button>
            </div>
            
            {/* ISSUE 1: Batch / CSV summaries */}
            {batchSummary && <p style={{ fontSize: '0.85rem', color: '#666', marginBottom: '15px' }}>Batch: {batchSummary.success} successful, {batchSummary.failed} failed</p>}
            {csvSummary && <p style={{ fontSize: '0.85rem', color: '#666', marginBottom: '15px' }}>CSV: {csvSummary.success} successful, {csvSummary.failed} failed</p>}

            <div style={styles.list}>
              {(batchResults.length > 0 ? batchResults : csvResults).map((deal, idx) => {
                const isBest = (batchResults.length > 0 ? deal.dealId === bestBatchId : deal.dealId === bestCsvId);
                return (
                  <div key={deal.dealId} style={{ 
                    ...styles.listItem, 
                    border: isBest ? '2px solid #28a745' : '1px solid #eee',
                    transform: isBest ? 'scale(1.01)' : 'none',
                    backgroundColor: isBest ? '#f0fff4' : '#fff'
                  }}>
                    <div style={{ flex: 1 }}>
                      {isBest && <span style={styles.bestBadge}>🏆 BEST DEAL</span>}
                      <div style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>{deal.name}</div>
                      <div style={{ fontSize: '0.9rem', color: '#666' }}>{deal.netYield}% Net Yield | {formatCurrency(deal.weeklyCashflow)}/wk</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={getScoreStyle(deal.dealScore)}>{deal.dealScore}</div>
                      {getMatchingAlerts(deal).length > 0 && <span style={styles.alertBadge}>MATCHES ALERT</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Comparison View */}
        {showComparison && compareList.length === 2 && (
          <div style={styles.compareContainer}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px' }}>
              <h3 style={{ margin: 0 }}>Comparison</h3>
              <button onClick={() => { setShowComparison(false); setSelectedDeals([]); }} style={styles.delBtn}>Clear Comparison</button>
            </div>
            <div style={styles.compareGrid}>
              <div style={styles.compareHeader}>Metric</div>
              <div style={styles.compareHeader}>{compareList[0].name}</div>
              <div style={styles.compareHeader}>{compareList[1].name}</div>
              
              <div style={styles.compareLabel}>Net Yield</div>
              <div style={{ ...styles.compareValue, color: compareList[0].netYield >= compareList[1].netYield ? '#28a745' : 'inherit' }}>{compareList[0].netYield}%</div>
              <div style={{ ...styles.compareValue, color: compareList[1].netYield >= compareList[0].netYield ? '#28a745' : 'inherit' }}>{compareList[1].netYield}%</div>
              
              <div style={styles.compareLabel}>Weekly Cashflow</div>
              <div style={{ ...styles.compareValue, color: compareList[0].weeklyCashflow >= compareList[1].weeklyCashflow ? '#28a745' : 'inherit' }}>{formatCurrency(compareList[0].weeklyCashflow)}</div>
              <div style={{ ...styles.compareValue, color: compareList[1].weeklyCashflow >= compareList[0].weeklyCashflow ? '#28a745' : 'inherit' }}>{formatCurrency(compareList[1].weeklyCashflow)}</div>
            </div>
          </div>
        )}

        {/* Alerts & Dashboard Row */}
        <div style={styles.dashboardRow}>
          {/* Alerts Manager */}
          <div style={styles.alertsBlock}>
            <h3 style={{ margin: '0 0 15px 0' }}>Deal Alerts</h3>
            <form onSubmit={handleSaveAlert} style={styles.alertForm}>
              <input type="number" name="minYield" placeholder="Min Yield %" value={alertInputs.minYield} onChange={handleAlertChange} style={styles.miniInput} step="0.1" />
              <input type="number" name="minCashflow" placeholder="Min Cashflow" value={alertInputs.minCashflow} onChange={handleAlertChange} style={styles.miniInput} />
              <button type="submit" style={styles.addAlertBtn}>Add</button>
            </form>
            <div style={{ marginTop: '10px' }}>
              {alerts.map(a => (
                <div key={a.id} style={styles.alertItem}>
                  <span>{a.minYield}% | {formatCurrency(a.minCashflow)}</span>
                  <button onClick={() => updateAlerts(alerts.filter(al => al.id !== a.id))} style={styles.delLink}>Del</button>
                </div>
              ))}
            </div>
          </div>

          {/* Saved Deals List */}
          <div style={styles.savedBlock}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
              <h3 style={{ margin: 0 }}>Saved Dashboard</h3>
              {selectedDeals.length === 2 && <button onClick={() => setShowComparison(true)} style={styles.compareBtn}>Compare Selected (2)</button>}
            </div>
            <div style={styles.list}>
              {sortedSaved.map(deal => (
                <div key={deal.dealId} style={{ ...styles.listItem, borderLeft: deal.dealId === bestSavedId ? '5px solid #28a745' : '1px solid #eee' }}>
                  <input type="checkbox" checked={selectedDeals.includes(deal.dealId)} onChange={() => handleToggleSelect(deal.dealId)} />
                  <div style={{ flex: 1, marginLeft: '12px' }}>
                    <div style={{ fontWeight: 'bold' }}>{deal.name}</div>
                    <div style={{ fontSize: '0.85rem', color: '#666' }}>{deal.netYield}% Net | {formatCurrency(deal.weeklyCashflow)}/wk</div>
                  </div>
                  {getMatchingAlerts(deal).length > 0 && <span style={styles.alertBadge}>MATCH</span>}
                  {deal.dealId === bestSavedId && <span style={styles.bestBadge}>TOP</span>}
                  <button onClick={() => handleDeleteDeal(deal.dealId)} style={styles.delBtn}>Delete</button>
                </div>
              ))}
              {savedDeals.length === 0 && <p style={styles.emptyMsg}>No deals saved yet.</p>}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

const styles = {
  container: { maxWidth: '1100px', margin: '0 auto', padding: '40px 20px', fontFamily: 'system-ui, -apple-system, sans-serif', color: '#1a1a1a' },
  title: { textAlign: 'center', marginBottom: '50px', fontSize: '2.5rem', fontWeight: '900', letterSpacing: '-0.02em' },
  
  // Section Scaffolding
  section: { padding: '40px', borderRadius: '20px', marginBottom: '40px', boxShadow: '0 4px 20px rgba(0,0,0,0.05)', border: '1px solid #eee' },
  sectionHeader: { marginBottom: '30px', textAlign: 'center' },
  sectionTitle: { margin: '0 0 8px 0', fontSize: '1.8rem', fontWeight: '800', color: '#000' },
  sectionSubtitle: { margin: 0, color: '#666', fontSize: '1.1rem' },

  // Step 1: Import
  importGrid: { display: 'grid', gap: '30px' },
  importTools: { display: 'flex', flexDirection: 'column', gap: '10px' },
  label: { display: 'block', marginBottom: '8px', fontWeight: '700', fontSize: '0.95rem' },
  textarea: { width: '100%', padding: '15px', borderRadius: '10px', border: '1px solid #ddd', boxSizing: 'border-box', fontSize: '1rem', fontFamily: 'inherit', resize: 'vertical' },
  input: { padding: '12px 15px', borderRadius: '10px', border: '1px solid #ddd', fontSize: '1rem', outline: 'none' },
  fileInput: { fontSize: '0.9rem', color: '#666' },
  tip: { fontSize: '0.85rem', color: '#888', marginTop: '5px' },
  primaryBtn: { padding: '12px 24px', backgroundColor: '#000', color: '#fff', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: '700', transition: 'opacity 0.2s' },
  finderBtn: { padding: '12px 24px', backgroundColor: '#28a745', color: '#fff', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: '700' },
  analyzeBtn: { width: '100%', padding: '18px', backgroundColor: '#0070f3', color: '#fff', border: 'none', borderRadius: '12px', cursor: 'pointer', fontSize: '1.2rem', fontWeight: '800', marginTop: '10px' },
  
  // Step 2: Analyze
  manualForm: { display: 'flex', flexDirection: 'column', gap: '20px' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '20px' },
  inputGroup: { display: 'flex', flexDirection: 'column', gap: '5px' },

  // Step 3: Review
  resultCard: { padding: '30px', border: '3px solid #0070f3', borderRadius: '15px', backgroundColor: '#fff', marginBottom: '30px', boxShadow: '0 10px 30px rgba(0,112,243,0.1)' },
  metric: { backgroundColor: '#f0f7ff', padding: '15px', borderRadius: '10px' },
  saveBtn: { padding: '10px 20px', backgroundColor: '#28a745', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '700' },
  alertCheck: { marginTop: '20px', padding: '15px', borderRadius: '10px', fontWeight: '800', textAlign: 'center' },
  
  batchContainer: { backgroundColor: '#fcfcfc', padding: '25px', borderRadius: '15px', marginBottom: '30px', border: '1px solid #eee' },
  compareContainer: { padding: '30px', border: '3px solid #6200ee', borderRadius: '15px', backgroundColor: '#fff', marginBottom: '30px' },
  compareGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '15px', marginTop: '20px', borderTop: '1px solid #eee', paddingTop: '20px' },
  compareHeader: { fontWeight: '900', fontSize: '1.1rem', color: '#6200ee' },
  compareLabel: { fontWeight: '700', color: '#666' },
  compareValue: { fontWeight: '800', fontSize: '1.1rem' },

  dashboardRow: { display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '30px', marginTop: '40px' },
  alertsBlock: { backgroundColor: '#f0f4ff', padding: '25px', borderRadius: '15px', border: '1px solid #d0dfff' },
  savedBlock: { flex: 1 },
  alertForm: { display: 'flex', gap: '8px' },
  miniInput: { width: '80px', padding: '8px', borderRadius: '6px', border: '1px solid #ccc' },
  addAlertBtn: { padding: '8px 12px', backgroundColor: '#6200ee', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '700' },
  alertItem: { display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #d0dfff', fontSize: '0.9rem' },
  delLink: { background: 'none', border: 'none', color: '#d32f2f', cursor: 'pointer', textDecoration: 'underline', fontSize: '0.8rem' },

  list: { display: 'flex', flexDirection: 'column', gap: '12px' },
  listItem: { display: 'flex', alignItems: 'center', padding: '15px', border: '1px solid #eee', borderRadius: '12px', backgroundColor: '#fff', transition: 'transform 0.2s ease' },
  alertBadge: { marginLeft: '8px', backgroundColor: '#6200ee', color: '#fff', fontSize: '0.65rem', padding: '3px 8px', borderRadius: '20px', fontWeight: '900' },
  bestBadge: { marginBottom: '5px', display: 'inline-block', backgroundColor: '#28a745', color: '#fff', fontSize: '0.7rem', padding: '3px 8px', borderRadius: '20px', fontWeight: '900' },
  delBtn: { padding: '6px 12px', backgroundColor: 'transparent', color: '#d32f2f', border: '1px solid #d32f2f', borderRadius: '8px', cursor: 'pointer' },
  compareBtn: { padding: '8px 16px', backgroundColor: '#6200ee', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '700' },
  
  msg: { marginTop: '15px', fontWeight: '700' },
  subtext: { fontSize: '0.9rem', color: '#666', marginBottom: '10px' },
  emptyMsg: { color: '#999', fontStyle: 'italic', textAlign: 'center', marginTop: '20px' },
  error: { color: '#d32f2f', fontWeight: '700', marginTop: '15px', textAlign: 'center' }
};
