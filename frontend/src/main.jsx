import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const initialMessages = [{
  role: 'assistant',
  text: 'Hi! I can help find a hotel with the lowest available supplier rate. Tell me what you are looking for, then choose your meal and cancellation preferences below.',
  kind: 'intro'
}];

function App() {
  const [messages, setMessages] = useState(initialMessages);
  const [userRequest, setUserRequest] = useState('Find the best available hotel in Dubai');
  const [mealPlan, setMealPlan] = useState('RO');
  const [cancellationPolicy, setCancellationPolicy] = useState('Non-Refundable');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, loading]);

  async function sendMessage(event) {
    event.preventDefault();
    const submittedRequest = userRequest.trim();
    if (!submittedRequest || loading) return;

    setMessages(current => [...current, {
      role: 'user',
      text: submittedRequest
    }]);
    setLoading(true);

    try {
      const query = new URLSearchParams({
        mealPlan,
        cancellationPolicy
      });
      const searchResponse = await fetch(`/api/v1/hotels/search?${query}`);
      const searchData = await searchResponse.json();
      if (!searchResponse.ok) throw new Error(searchData.error || 'Could not search hotels.');

      const resultId = Date.now();
      setMessages(current => [...current, {
        id: resultId,
        role: 'assistant',
        kind: 'results',
        text: 'Generating an AI summary…',
        data: searchData
      }]);

      let explanation = '';
      try {
        const llmResponse = await fetch('/api/v1/llm/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ recommendation: searchData, userRequest: submittedRequest })
        });
        const llmData = await llmResponse.json();
        if (llmResponse.ok) explanation = llmData.text;
        else explanation = 'AI explanation is currently unavailable. The hotel ranking below is based on the supplier rates.';
      } catch {
        explanation = 'AI explanation is currently unavailable. The hotel ranking below is based on the supplier rates.';
      }

      setMessages(current => current.map(message =>
        message.id === resultId ? { ...message, text: explanation } : message
      ));
    } catch (error) {
      setMessages(current => [...current, {
        role: 'assistant',
        kind: 'error',
        text: error.message
      }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">s</span><span>staywise</span></div>
        <div className="sidebar-label">YOUR TRIP</div>
        <div className="trip-card">
          <span className="trip-icon">⌖</span>
          <div><strong>Dubai hotel search</strong><small>Compare supplier offers</small></div>
        </div>
        <div className="sidebar-note">
          <span className="live-dot" /> Live price comparison
        </div>
        <div className="sidebar-foot">Rates and availability are based on the supplied search data.</div>
      </aside>

      <section className="chat-panel">
        <header className="topbar">
          <div>
            <div className="top-eyebrow">HOTEL DISCOVERY</div>
            <h1>Find your best stay</h1>
          </div>
          <div className="secure-tag"><span /> Supplier rates</div>
        </header>

        <div className="conversation" aria-live="polite">
          <div className="date-divider"><span>YOUR HOTEL ASSISTANT</span></div>
          {messages.map((message, index) => (
            <div className={`message-row ${message.role}`} key={`${index}-${message.kind || 'text'}`}>
              {message.role === 'assistant' && <div className="avatar">s</div>}
              <div className={`bubble ${message.kind || ''}`}>
                {message.kind === 'results'
                  ? <HotelResults result={message.data} explanation={message.text} />
                  : message.text}
              </div>
            </div>
          ))}
          {loading && (
            <div className="message-row assistant">
              <div className="avatar">s</div>
              <div className="bubble typing"><span /><span /><span /></div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="composer-wrap">
          <form className="filters" onSubmit={sendMessage}>
            <label>
              <span>YOUR REQUEST</span>
              <input value={userRequest} onChange={event => setUserRequest(event.target.value)} placeholder="Ask for a hotel..." maxLength="500" required />
            </label>
            <label>
              <span>MEAL PLAN</span>
              <select value={mealPlan} onChange={event => setMealPlan(event.target.value)}>
                <option value="RO">Room only</option>
                <option value="BB">Breakfast included</option>
              </select>
            </label>
            <label>
              <span>CANCELLATION</span>
              <select value={cancellationPolicy} onChange={event => setCancellationPolicy(event.target.value)}>
                <option value="Non-Refundable">Non-refundable</option>
                <option value="Refundable">Refundable</option>
              </select>
            </label>
            <button type="submit" disabled={loading || !userRequest.trim()} aria-label="Find best hotel">
              {loading ? 'Searching…' : 'Find hotels'} <span aria-hidden="true">→</span>
            </button>
          </form>
          <p className="disclaimer">Rates compare different search records and may not share the same travel dates. Amenities and guest reviews are not included.</p>
        </div>
      </section>
    </main>
  );
}

function HotelResults({ result, explanation }) {
  const hotels = result.hotels || [];
  return (
    <div className="results-content">
      <div className="result-heading">
        <div>
          <span className="result-kicker">BEST AVAILABLE MATCH</span>
          <h2>{hotels.length ? 'Here are your best hotel offers' : 'No eligible hotel offers found'}</h2>
        </div>
        <span className="result-count">{result.totalHotels || 0} found</span>
      </div>

      {hotels.slice(0, 5).map((hotel, index) => (
        <article className={`hotel-card ${index === 0 ? 'top-hotel' : ''}`} key={hotel.hotelId}>
          <div className="hotel-number">{String(index + 1).padStart(2, '0')}</div>
          <div className="hotel-info">
            <div className="hotel-name-line">
              <h3>{hotel.hotelName || hotel.hotelId}</h3>
              {index === 0 && <span className="best-pill">BEST PRICE</span>}
            </div>
            <p>{[hotel.city, hotel.hotelId].filter(Boolean).join(' · ')}</p>
            <span className="supplier-caption">Lowest rate via {hotel.cheapestSupplier}</span>
          </div>
          <div className="hotel-price">
            <strong>{formatMoney(hotel.cheapestRateAED)}</strong>
            <span>best recorded rate</span>
          </div>
        </article>
      ))}

      {explanation && <div className="ai-note"><span className="sparkle">✳</span><p>{explanation}</p></div>}
      <div className="dataset-note">Prices shown in AED · Lowest recorded eligible supplier rate</div>
    </div>
  );
}

function formatMoney(value) {
  return value == null ? 'Rate unavailable' : `${Number(value).toFixed(2)} AED`;
}

createRoot(document.getElementById('root')).render(<App />);
