import { useState, useCallback, useMemo } from 'react';
import { calcParabolicSAR } from '../utils/indicators';

/**
 * AnalysisPanel — Integrated analysis with 4 tabs:
 * 1. Sentiment: Paste news text → AI sentiment analysis
 * 2. Macro: Paste economic calendar → AI macro impact analysis
 * 3. CSV Import: Load OHLC data from CSV text
 * 4. Summary: Composite view of technical + sentiment + macro
 */

// The AI analysis features call Anthropic's API. The user can enter their key in the UI.
// If no key is provided, a helpful message is shown instead of making API calls.

export default function AnalysisPanel({ chartData, onLoadCSV, onLoadSample }) {
  const [activeTab, setActiveTab] = useState('sentiment');

  // --- Sentiment state ---
  const [newsText, setNewsText] = useState('');
  const [sentiment, setSentiment] = useState(null);
  const [sentLoading, setSentLoading] = useState(false);
  const [sentError, setSentError] = useState('');

  // --- Macro state ---
  const [macroText, setMacroText] = useState('');
  const [macroResult, setMacroResult] = useState(null);
  const [macroLoading, setMacroLoading] = useState(false);
  const [macroError, setMacroError] = useState('');

  // --- CSV state ---
  const [csvText, setCsvText] = useState('');
  const [csvError, setCsvError] = useState('');

  // --- API key ---
  const [apiKey, setApiKey] = useState('');
  const [showKeyInput, setShowKeyInput] = useState(false);

  // --- Technical trend from Parabolic SAR ---
  const techTrend = useMemo(() => {
    if (!chartData?.length || chartData.length < 2) return null;
    // Always compute SAR to determine trend for composite summary
    const { sarUp, sarDown } = calcParabolicSAR(chartData);
    const lastIdx = chartData.length - 1;
    if (sarUp[lastIdx]) return 'bullish';
    if (sarDown[lastIdx]) return 'bearish';
    return null;
  }, [chartData]);

  // --- Sentiment Analysis ---
  const analyzeSentiment = useCallback(async () => {
    if (!newsText.trim()) {
      setSentError('Tempel dulu teks berita/headline yang mau dianalisis.');
      return;
    }
    if (!apiKey.trim()) {
      setSentError('Masukkan API key Anthropic terlebih dahulu (klik ikon ⚙️ di atas).');
      return;
    }
    setSentLoading(true);
    setSentError('');
    setSentiment(null);
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          messages: [{
            role: 'user',
            content:
              'Kamu menganalisis sentimen pasar crypto dari teks berita/headline yang diberikan user. ' +
              'Balas HANYA dengan JSON valid, tanpa teks lain, tanpa markdown fences, format persis: ' +
              '{"sentiment":"bullish|bearish|neutral","confidence":"rendah|sedang|tinggi","reasoning":"1-2 kalimat alasan singkat dalam Bahasa Indonesia"}' +
              '\n\nTeks:\n' + newsText,
          }],
        }),
      });
      if (!response.ok) {
        const errBody = await response.text();
        throw new Error(`API ${response.status}: ${errBody.slice(0, 200)}`);
      }
      const json = await response.json();
      const textBlock = (json.content || []).find((c) => c.type === 'text')?.text || '';
      const clean = textBlock.replace(/```json|```/g, '').trim();
      const result = JSON.parse(clean);
      setSentiment(result);
    } catch (e) {
      setSentError(`Gagal menganalisis: ${e.message}`);
    } finally {
      setSentLoading(false);
    }
  }, [newsText, apiKey]);

  // --- Macro Analysis ---
  const analyzeMacro = useCallback(async () => {
    if (!macroText.trim()) {
      setMacroError('Tempel dulu info kalender ekonomi / rilis data (CPI, FOMC, dll).');
      return;
    }
    if (!apiKey.trim()) {
      setMacroError('Masukkan API key Anthropic terlebih dahulu (klik ikon ⚙️ di atas).');
      return;
    }
    setMacroLoading(true);
    setMacroError('');
    setMacroResult(null);
    try {
      const prompt =
        'Kamu adalah analis makroekonomi untuk trader crypto/forex profesional. ' +
        'User memberi teks kalender ekonomi dan/atau rilis data terbaru (misalnya CPI, FOMC, ' +
        'Non-Farm Payroll, keputusan suku bunga, PPI, dll). Tugasmu:\n' +
        '1. Identifikasi setiap event yang disebutkan beserta level dampaknya terhadap pasar ' +
        '(tinggi/sedang/rendah).\n' +
        '2. Tentukan bias keseluruhan (hawkish/dovish/netral) HANYA berdasarkan teks yang diberikan.\n' +
        '3. Simpulkan implikasi untuk aset berisiko termasuk crypto (positif/negatif/campuran).\n\n' +
        'Balas HANYA dengan JSON valid, tanpa teks lain, tanpa markdown fences, format persis:\n' +
        '{"bias":"hawkish|dovish|netral","impact_aset_berisiko":"positif|negatif|campuran",' +
        '"events":[{"nama":"...","dampak":"tinggi|sedang|rendah","catatan":"..."}],' +
        '"ringkasan":"2-3 kalimat kesimpulan dalam Bahasa Indonesia"}\n\n' +
        'Teks kalender/data:\n' + macroText;

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1200,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      if (!response.ok) {
        const errBody = await response.text();
        throw new Error(`API ${response.status}: ${errBody.slice(0, 200)}`);
      }
      const json = await response.json();
      const textBlock = (json.content || []).find((c) => c.type === 'text')?.text || '';
      const clean = textBlock.replace(/```json|```/g, '').trim();
      const result = JSON.parse(clean);
      setMacroResult(result);
    } catch (e) {
      setMacroError(`Gagal menganalisis: ${e.message}`);
    } finally {
      setMacroLoading(false);
    }
  }, [macroText, apiKey]);

  // --- CSV Import ---
  const handleLoadCSV = useCallback(() => {
    try {
      setCsvError('');
      onLoadCSV(csvText);
    } catch (e) {
      setCsvError(e.message || 'Gagal parsing data.');
    }
  }, [csvText, onLoadCSV]);

  // --- Composite summary ---
  const sentLabel = sentiment?.sentiment || null;
  const macroLabel = macroResult
    ? macroResult.impact_aset_berisiko === 'positif' ? 'bullish'
    : macroResult.impact_aset_berisiko === 'negatif' ? 'bearish'
    : 'netral'
    : null;
  const votes = [techTrend, sentLabel, macroLabel].filter(Boolean);
  const bullCount = votes.filter((v) => v === 'bullish').length;
  const bearCount = votes.filter((v) => v === 'bearish').length;
  let compositeLabel = 'Belum cukup data';
  let compositeClass = '';
  if (votes.length) {
    if (bullCount > bearCount) { compositeLabel = 'Condong Bullish'; compositeClass = 'bullish'; }
    else if (bearCount > bullCount) { compositeLabel = 'Condong Bearish'; compositeClass = 'bearish'; }
    else { compositeLabel = 'Campuran / Netral'; compositeClass = 'neutral'; }
  }

  const tabs = [
    { key: 'sentiment', label: 'Sentimen' },
    { key: 'macro', label: 'Makro' },
    { key: 'csv', label: 'CSV' },
    { key: 'summary', label: 'Ringkasan' },
  ];

  return (
    <div className="analysis-panel">
      {/* Tab bar */}
      <div className="analysis-tabs">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            className={`analysis-tab ${activeTab === tab.key ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
        <button
          className="analysis-settings-btn"
          onClick={() => setShowKeyInput(!showKeyInput)}
          title="API Key Settings"
        >
          ⚙️
        </button>
      </div>

      {/* API Key input (collapsible) */}
      {showKeyInput && (
        <div className="analysis-key-bar">
          <input
            type="password"
            className="analysis-input"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Anthropic API key (sk-ant-...)"
            style={{ flex: 1 }}
          />
          <span className="analysis-key-status">
            {apiKey ? '✓ Key set' : 'Belum diisi'}
          </span>
        </div>
      )}

      {/* Tab content */}
      <div className="analysis-content">
        {/* ===== SENTIMENT ===== */}
        {activeTab === 'sentiment' && (
          <div className="analysis-section">
            <div className="analysis-title">Analisis Sentimen Berita</div>
            <p className="analysis-desc">
              Tempel headline atau kutipan berita crypto (dari CoinDesk, Reuters, dll).
              AI akan menganalisis sentimen dari teks yang kamu berikan.
            </p>
            <textarea
              className="analysis-textarea"
              value={newsText}
              onChange={(e) => setNewsText(e.target.value)}
              placeholder="Contoh: 'Bank sentral AS menandakan kemungkinan penurunan suku bunga, investor institusional mulai kembali masuk ke pasar crypto...'"
              rows={5}
            />
            <button
              className="analysis-btn"
              onClick={analyzeSentiment}
              disabled={sentLoading}
            >
              {sentLoading ? (
                <><span className="analysis-spinner" /> Menganalisis...</>
              ) : (
                'Analisis Sentimen'
              )}
            </button>
            {sentError && <div className="analysis-error">{sentError}</div>}
            {sentiment && (
              <div className="analysis-result">
                <div className={`analysis-badge ${sentiment.sentiment}`}>
                  {sentiment.sentiment}
                  <span className="analysis-badge-sub">· keyakinan {sentiment.confidence}</span>
                </div>
                <div className="analysis-reasoning">{sentiment.reasoning}</div>
              </div>
            )}
          </div>
        )}

        {/* ===== MACRO ===== */}
        {activeTab === 'macro' && (
          <div className="analysis-section">
            <div className="analysis-title">Analisis Fundamental & Kalender Makro</div>
            <p className="analysis-desc">
              Tempel info rilis data atau kalender ekonomi (CPI, FOMC, Non-Farm Payroll, PPI, dll).
              AI akan menilai dampaknya terhadap aset berisiko termasuk crypto.
            </p>
            <textarea
              className="analysis-textarea"
              value={macroText}
              onChange={(e) => setMacroText(e.target.value)}
              placeholder={"Contoh:\n18 Sep: FOMC — Fed menahan suku bunga di 5.25-5.50%, nada pernyataan lebih dovish.\n24 Sep: CPI YoY aktual 3.0% vs forecast 3.2% (lebih rendah dari perkiraan)."}
              rows={5}
            />
            <button
              className="analysis-btn"
              onClick={analyzeMacro}
              disabled={macroLoading}
            >
              {macroLoading ? (
                <><span className="analysis-spinner" /> Menganalisis...</>
              ) : (
                'Analisis Dampak Makro'
              )}
            </button>
            {macroError && <div className="analysis-error">{macroError}</div>}
            {macroResult && (
              <div className="analysis-result">
                <div className={`analysis-badge ${macroResult.impact_aset_berisiko === 'positif' ? 'bullish' : macroResult.impact_aset_berisiko === 'negatif' ? 'bearish' : 'neutral'}`}>
                  {macroResult.bias}
                  <span className="analysis-badge-sub">· dampak: {macroResult.impact_aset_berisiko}</span>
                </div>
                <div className="analysis-reasoning">{macroResult.ringkasan}</div>
                {Array.isArray(macroResult.events) && macroResult.events.length > 0 && (
                  <div className="analysis-events">
                    {macroResult.events.map((ev, i) => (
                      <div key={i} className="analysis-event">
                        <span className="analysis-event-name">{ev.nama}</span>
                        <span className={`analysis-event-impact impact-${ev.dampak}`}>[{ev.dampak}]</span>
                        <span className="analysis-event-note">{ev.catatan}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ===== CSV ===== */}
        {activeTab === 'csv' && (
          <div className="analysis-section">
            <div className="analysis-title">Import Data CSV</div>
            <p className="analysis-desc">
              Tempel data OHLC dalam format CSV: <code>date,open,high,low,close</code> (satu baris per periode).
              Minimal 10 baris supaya indikator bisa dihitung.
            </p>
            <textarea
              className="analysis-textarea"
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              placeholder={"date,open,high,low,close\n2026-06-01,62000,62800,61500,62650\n2026-06-02,62650,63200,62100,63000\n..."}
              rows={6}
            />
            <button className="analysis-btn" onClick={handleLoadCSV}>
              Muat Data CSV
            </button>
            {onLoadSample && (
              <button className="analysis-btn analysis-btn-secondary" onClick={onLoadSample}>
                Tampilkan Data Contoh
              </button>
            )}
            <p className="analysis-desc" style={{ marginTop: 8, marginBottom: 0 }}>
              Data contoh berguna saat koneksi sumber live tidak tersedia; CSV dan data contoh tidak menghapus pilihan Spot/Futures.
            </p>
            {csvError && <div className="analysis-error">{csvError}</div>}
          </div>
        )}

        {/* ===== SUMMARY ===== */}
        {activeTab === 'summary' && (
          <div className="analysis-section">
            <div className="analysis-title">Ringkasan Gabungan</div>
            <div className="analysis-summary-grid">
              {[
                { label: 'Teknikal (SAR)', value: techTrend },
                { label: 'Sentimen Berita', value: sentLabel },
                { label: 'Fundamental', value: macroLabel },
              ].map((item) => (
                <div key={item.label} className="analysis-summary-card">
                  <div className="analysis-summary-label">{item.label}</div>
                  <div className={`analysis-summary-value ${item.value || ''}`}>
                    {item.value || 'belum diisi'}
                  </div>
                </div>
              ))}
            </div>
            <div className="analysis-composite">
              <div className="analysis-composite-label">KECENDERUNGAN GABUNGAN</div>
              <div className={`analysis-composite-value ${compositeClass}`}>
                {compositeLabel}
              </div>
              <div className="analysis-composite-note">
                Hitungan suara sederhana dari sudut pandang di atas.
                Bukan sinyal beli/jual otomatis — tetap perlu keputusan dan manajemen risiko sendiri.
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
