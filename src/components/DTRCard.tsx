import { useState, useRef, useEffect } from 'react';
import './DTRCard.css';
import html2canvas from 'html2canvas';
import { dtrService, type DTRRecordRow } from '../services/dtrService';

export interface DTRRecord {
  day: number;
  morningIn: string;
  morningOut: string;
  afternoonIn: string;
  afternoonOut: string;
  overtimeIn: string;
  overtimeOut: string;
  total: string;
  /** Whether this row has data auto-filled from Supabase */
  autoFilled?: boolean;
}

export interface DTRCardData {
  id: string;
  isFlipped: boolean;
  header: {
    no: string;
    payEnding: string;
    name: string;
    position: string;
    dept: string;
    age: string;
  };
  payroll: {
    regRate: string;
    amount1: string;
    overRate: string;
    amount2: string;
    totalEarnings: string;
    fines: string;
    withholdingTax: string;
    sss: string;
    totalDeductions: string;
    netPay: string;
  };
  frontRecords: DTRRecord[];
  backRecords: DTRRecord[];
  /** Month (1-12) this card represents */
  month?: number;
  /** Year this card represents */
  year?: number;
}

export interface DTRCardProps {
  employeeName?: string;
  department?: string;
  position?: string;
  month?: string;
  requiredHours?: number;
  /** If provided, the card will auto-fetch DTR data from Supabase */
  userId?: string;
}

export function DTRCard({ 
  employeeName = "STUDENT NAME", 
  department = "DEPARTMENT", 
  position = "STUDENT", 
  requiredHours = 0,
  userId
}: DTRCardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isPrinting, setIsPrinting] = useState(false);

  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  const createEmptyRecords = (): DTRRecord[] =>
    Array.from({ length: 31 }, (_, i) => ({
      day: i + 1, morningIn: '', morningOut: '', afternoonIn: '', afternoonOut: '',
      overtimeIn: '', overtimeOut: '', total: '', autoFilled: false
    }));

  const createNewCard = (id: string, month?: number, year?: number): DTRCardData => ({
    id,
    isFlipped: false,
    header: {
      no: '',
      payEnding: month && year
        ? `${new Date(year, (month || 1) - 1).toLocaleString('default', { month: 'long' })} ${year}`
        : '',
      name: employeeName,
      position: position,
      dept: department,
      age: '',
    },
    payroll: {
      regRate: '', amount1: '',
      overRate: '', amount2: '',
      totalEarnings: '',
      fines: '',
      withholdingTax: '',
      sss: '',
      totalDeductions: '',
      netPay: '',
    },
    frontRecords: createEmptyRecords(),
    backRecords: createEmptyRecords(),
    month: month || currentMonth,
    year: year || currentYear,
  });

  const [cards, setCards] = useState<DTRCardData[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // ── Load DTR data from Supabase ────────────────────────────────────────
  const applyDTRData = (card: DTRCardData, records: DTRRecordRow[]): DTRCardData => {
    const updatedFront = [...card.frontRecords];
    const updatedBack = [...card.backRecords];

    records.forEach(rec => {
      const dateObj = new Date(rec.record_date + 'T00:00:00');
      const day = dateObj.getDate();

      const row: DTRRecord = {
        day,
        morningIn: dtrService.formatTime(rec.morning_in),
        morningOut: dtrService.formatTime(rec.morning_out),
        afternoonIn: dtrService.formatTime(rec.afternoon_in),
        afternoonOut: dtrService.formatTime(rec.afternoon_out),
        overtimeIn: dtrService.formatTime(rec.overtime_in),
        overtimeOut: dtrService.formatTime(rec.overtime_out),
        total: dtrService.formatTotal(rec.daily_total),
        autoFilled: true,
      };

      // Front side records (days 1-31)
      const frontIdx = updatedFront.findIndex(r => r.day === day);
      if (frontIdx !== -1) {
        // Preserve manually-entered overtime if Supabase has no overtime data
        const existing = updatedFront[frontIdx];
        updatedFront[frontIdx] = {
          ...row,
          overtimeIn: rec.overtime_in ? row.overtimeIn : existing.overtimeIn,
          overtimeOut: rec.overtime_out ? row.overtimeOut : existing.overtimeOut,
        };
      }
    });

    return { ...card, frontRecords: updatedFront, backRecords: updatedBack };
  };

  const loadDTRForCard = async (card: DTRCardData): Promise<DTRCardData> => {
    if (!userId || !card.month || !card.year) return card;
    const records = await dtrService.fetchMonthDTR(card.month, card.year);
    return applyDTRData(card, records);
  };

  // ── Initialize cards ──────────────────────────────────────────────────
  useEffect(() => {
    if (cards.length > 0) return;

    const initCard = createNewCard(crypto.randomUUID(), currentMonth, currentYear);
    
    if (userId) {
      setIsLoading(true);
      loadDTRForCard(initCard).then(loaded => {
        setCards([loaded]);
        setIsLoading(false);
      });
    } else {
      setCards([initCard]);
    }
  }, [employeeName, department, position, userId]);

  // ── Real-time subscription ────────────────────────────────────────────
  useEffect(() => {
    if (!userId) return;

    const unsubscribe = dtrService.subscribeToChanges(userId, (updatedRecord) => {
      const dateObj = new Date(updatedRecord.record_date + 'T00:00:00');
      const recordMonth = dateObj.getMonth() + 1;
      const recordYear = dateObj.getFullYear();
      const day = dateObj.getDate();

      setCards(prev => prev.map(card => {
        if (card.month !== recordMonth || card.year !== recordYear) return card;

        const updatedFront = card.frontRecords.map(r => {
          if (r.day !== day) return r;
          return {
            ...r,
            morningIn: dtrService.formatTime(updatedRecord.morning_in),
            morningOut: dtrService.formatTime(updatedRecord.morning_out),
            afternoonIn: dtrService.formatTime(updatedRecord.afternoon_in),
            afternoonOut: dtrService.formatTime(updatedRecord.afternoon_out),
            overtimeIn: updatedRecord.overtime_in ? dtrService.formatTime(updatedRecord.overtime_in) : r.overtimeIn,
            overtimeOut: updatedRecord.overtime_out ? dtrService.formatTime(updatedRecord.overtime_out) : r.overtimeOut,
            total: dtrService.formatTotal(updatedRecord.daily_total),
            autoFilled: true,
          };
        });

        return { ...card, frontRecords: updatedFront };
      }));
    });

    return unsubscribe;
  }, [userId]);

  const handleGenerateRequired = () => {
    const estimatedCards = requiredHours > 0 ? Math.ceil(requiredHours / 160) : 1;
    const generatedCards: DTRCardData[] = [];
    
    for (let i = 0; i < Math.max(1, estimatedCards); i++) {
      // Generate cards for consecutive months starting from current
      let m = ((currentMonth - 1 + i) % 12) + 1;
      let y = currentYear + Math.floor((currentMonth - 1 + i) / 12);
      generatedCards.push(createNewCard(crypto.randomUUID(), m, y));
    }

    if (userId) {
      setIsLoading(true);
      Promise.all(generatedCards.map(c => loadDTRForCard(c))).then(loaded => {
        setCards(loaded);
        setIsLoading(false);
      });
    } else {
      setCards(generatedCards);
    }
  };

  const handleAddCard = () => {
    // Add card for next month after the last card
    const lastCard = cards[cards.length - 1];
    let nextMonth = lastCard ? ((lastCard.month || currentMonth) % 12) + 1 : currentMonth;
    let nextYear = lastCard 
      ? (lastCard.month === 12 ? (lastCard.year || currentYear) + 1 : (lastCard.year || currentYear))
      : currentYear;

    const newCard = createNewCard(crypto.randomUUID(), nextMonth, nextYear);
    
    if (userId) {
      loadDTRForCard(newCard).then(loaded => {
        setCards(prev => [...prev, loaded]);
      });
    } else {
      setCards(prev => [...prev, newCard]);
    }
  };

  const handleFlip = (cardId: string) => {
    setCards(prev => prev.map(c => c.id === cardId ? { ...c, isFlipped: !c.isFlipped } : c));
  };

  const updateHeader = (cardId: string, field: keyof DTRCardData['header'], val: string) => {
    setCards(prev => prev.map(c => c.id === cardId ? { ...c, header: { ...c.header, [field]: val } } : c));
  };

  const updatePayroll = (cardId: string, field: keyof DTRCardData['payroll'], val: string) => {
    setCards(prev => prev.map(c => c.id === cardId ? { ...c, payroll: { ...c.payroll, [field]: val } } : c));
  };

  const updateRecord = (cardId: string, side: 'front' | 'back', day: number, field: keyof DTRRecord, val: string) => {
    setCards(prev => prev.map(c => {
      if (c.id !== cardId) return c;
      const recordsField = side === 'front' ? 'frontRecords' : 'backRecords';
      return {
        ...c,
        [recordsField]: c[recordsField].map(r => r.day === day ? { ...r, [field]: val } : r)
      };
    }));
  };

  const handleDownloadImage = () => {
    const element = containerRef.current;
    if (!element) return;
    setIsPrinting(true);
    setTimeout(() => {
      html2canvas(element, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#f0f2f5'
      }).then(canvas => {
        const today = new Date();
        const dateStr = today.toISOString().split('T')[0];
        const filename = `DTR_Cards_${dateStr}.webp`;
        const link = document.createElement('a');
        link.download = filename;
        link.href = canvas.toDataURL('image/webp', 0.95);
        link.click();
        setIsPrinting(false);
      });
    }, 100);
  };

  const estimatedCount = requiredHours > 0 ? Math.ceil(requiredHours / 160) : 1;

  const getMonthLabel = (card: DTRCardData) => {
    if (!card.month || !card.year) return '';
    return `${new Date(card.year, card.month - 1).toLocaleString('default', { month: 'long' })} ${card.year}`;
  };

  return (
    <div className={`dtr-container ${isPrinting ? 'printing' : ''}`} ref={containerRef}>
      <div className="dtr-header-section">
        <h1 className="dtr-main-heading">Daily Time Record</h1>
      </div>
      
      <div className="ojt-info-banner">
        <span className="banner-goal">OJT Goal: <strong>{requiredHours} Hours</strong></span>
        <span className="banner-divider">|</span>
        <span className="banner-estimate">Estimated DTR cards needed: <strong>{estimatedCount}</strong></span>
      </div>

      {isLoading && (
        <div style={{
          textAlign: 'center', padding: '2rem', color: 'var(--text-muted)',
          fontSize: '0.9rem', display: 'flex', alignItems: 'center',
          justifyContent: 'center', gap: '0.5rem'
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}>
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
          Loading DTR records from database...
        </div>
      )}

      <div className={`dtr-cards-grid ${cards.length === 1 ? 'single-card' : ''}`}>
        {cards.map((card, index) => (
          <div key={card.id} className={`dtr-card-wrapper`}>
            <div className="tc-card-header-actions">
              <div className="tc-card-badge">
                <span className="badge-label">DTR CARD</span>
                <span className="badge-value">{index + 1}</span>
                {card.month && card.year && (
                  <span className="badge-month" style={{
                    marginLeft: '8px', fontSize: '9px', opacity: 0.7, fontWeight: 500
                  }}>
                    {getMonthLabel(card)}
                  </span>
                )}
              </div>
              {!isPrinting && (
                <button className="dtr-btn-flip-tab" onClick={() => handleFlip(card.id)}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
                  Flip to {card.isFlipped ? 'Front' : 'Back'}
                </button>
              )}
            </div>
            <div className={`dtr-card-container ${card.isFlipped ? 'flipped' : ''}`}>
              <div className="dtr-card-inner">
                {/* FRONT SIDE */}
                <div className="dtr-card-front">
                  <DTRFace 
                    data={card} 
                    side="front" 
                    onHeaderChange={(f, v) => updateHeader(card.id, f, v)}
                    onPayrollChange={(f, v) => updatePayroll(card.id, f, v)}
                    onRecordChange={(d, f, v) => updateRecord(card.id, 'front', d, f, v)}
                  />
                </div>

                {/* BACK SIDE */}
                <div className="dtr-card-back">
                  <DTRFace 
                    data={card} 
                    side="back" 
                    onHeaderChange={(f, v) => updateHeader(card.id, f, v)}
                    onPayrollChange={(f, v) => updatePayroll(card.id, f, v)}
                    onRecordChange={(d, f, v) => updateRecord(card.id, 'back', d, f, v)}
                  />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ===== ACTIONS ===== */}
      <div className="dtr-actions">
        {requiredHours > 0 && (
          <button className="dtr-btn dtr-btn-primary" onClick={handleGenerateRequired}>
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            Generate {estimatedCount} Required DTRs
          </button>
        )}
        <button className="dtr-btn dtr-btn-secondary" onClick={handleAddCard}>
          <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add New DTR
        </button>
        <button className="dtr-btn dtr-btn-primary" onClick={handleDownloadImage}>
          <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Download All
        </button>
        <button className="dtr-btn dtr-btn-secondary" onClick={() => window.print()}>
          <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
          </svg>
          Print
        </button>
      </div>
    </div>
  );
}

interface FaceProps {
  data: DTRCardData;
  side: 'front' | 'back';
  onHeaderChange: (field: keyof DTRCardData['header'], val: string) => void;
  onPayrollChange: (field: keyof DTRCardData['payroll'], val: string) => void;
  onRecordChange: (day: number, field: keyof DTRRecord, val: string) => void;
}

function DTRFace({ data, side, onHeaderChange, onPayrollChange, onRecordChange }: FaceProps) {
  const records = side === 'front' ? data.frontRecords : data.backRecords;

  return (
    <>
      <div className="tc-header">
        <div style={{ position: 'absolute', top: 8, right: 10, fontSize: '8px', fontWeight: 'bold', color: '#9b7d44', opacity: 0.6 }}>
          {side.toUpperCase()} SIDE
        </div>
        <div className="tc-header-row">
          <div style={{ flex: '0 0 50%', display: 'flex', alignItems: 'flex-end', gap: '4px' }}>
            <span className="tc-lbl">No.</span>
            <input className="tc-line" value={data.header.no} onChange={e => onHeaderChange('no', e.target.value)} />
          </div>
          <div style={{ flex: '1', display: 'flex', alignItems: 'flex-end', gap: '4px', paddingLeft: '8px' }}>
            <span className="tc-lbl">Pay Ending</span>
            <input className="tc-line" value={data.header.payEnding} onChange={e => onHeaderChange('payEnding', e.target.value)} />
          </div>
        </div>

        <div className="tc-header-row">
          <div style={{ flex: '0 0 65%', display: 'flex', alignItems: 'flex-end', gap: '4px' }}>
            <span className="tc-lbl">Name</span>
            <input className="tc-line" value={data.header.name} onChange={e => onHeaderChange('name', e.target.value)} />
          </div>
          <div style={{ flex: '1', display: 'flex', alignItems: 'flex-end', gap: '4px', paddingLeft: '12px' }}>
            <span className="tc-lbl">Position</span>
            <input className="tc-line" value={data.header.position} onChange={e => onHeaderChange('position', e.target.value)} />
          </div>
        </div>

        <div className="tc-header-row">
          <div style={{ flex: '0 0 80%', display: 'flex', alignItems: 'flex-end', gap: '4px' }}>
            <span className="tc-lbl">Dept.</span>
            <input className="tc-line" value={data.header.dept} onChange={e => onHeaderChange('dept', e.target.value)} />
          </div>
          <div style={{ flex: '1', display: 'flex', alignItems: 'flex-end', gap: '4px', paddingLeft: '12px' }}>
            <span className="tc-lbl">Age</span>
            <input className="tc-line" value={data.header.age} onChange={e => onHeaderChange('age', e.target.value)} />
          </div>
        </div>
      </div>

      <div className="tc-middle">
        <div className="tc-left-table">
          <table>
            <thead>
              <tr>
                <th style={{ width: '45%' }}>Hours</th>
                <th>Rate</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="label-cell">Reg.</td>
                <td><input value={data.payroll.regRate} onChange={e => onPayrollChange('regRate', e.target.value)} /></td>
                <td><input value={data.payroll.amount1} onChange={e => onPayrollChange('amount1', e.target.value)} /></td>
              </tr>
              <tr>
                <td className="label-cell">Over.</td>
                <td><input value={data.payroll.overRate} onChange={e => onPayrollChange('overRate', e.target.value)} /></td>
                <td><input value={data.payroll.amount2} onChange={e => onPayrollChange('amount2', e.target.value)} /></td>
              </tr>
              <tr>
                <td className="label-cell" colSpan={2}>Total Earnings</td>
                <td><input value={data.payroll.totalEarnings} onChange={e => onPayrollChange('totalEarnings', e.target.value)} /></td>
              </tr>
              <tr>
                <td className="label-cell" colSpan={2}>Total Deductions</td>
                <td><input value={data.payroll.totalDeductions} onChange={e => onPayrollChange('totalDeductions', e.target.value)} /></td>
              </tr>
              <tr>
                <td className="label-cell net-pay" colSpan={2}>NET PAY</td>
                <td><input value={data.payroll.netPay} onChange={e => onPayrollChange('netPay', e.target.value)} /></td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="tc-deductions-label">
          {"DEDUCTIONS".split('').map((char, i) => <span key={i}>{char}</span>)}
        </div>

        <div className="tc-right-table">
          <table>
            <thead>
              <tr><th colSpan={2}>ABSENCES</th></tr>
            </thead>
            <tbody>
              <tr>
                <td>Fines</td>
                <td><input value={data.payroll.fines} onChange={e => onPayrollChange('fines', e.target.value)} /></td>
              </tr>
              <tr>
                <td>Withholding Tax</td>
                <td><input value={data.payroll.withholdingTax} onChange={e => onPayrollChange('withholdingTax', e.target.value)} /></td>
              </tr>
              <tr>
                <td>S.S.S.</td>
                <td><input value={data.payroll.sss} onChange={e => onPayrollChange('sss', e.target.value)} /></td>
              </tr>
            </tbody>
            <tfoot>
              <tr><td colSpan={2}>TOTAL</td></tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div className="tc-grid-section">
        <table className="tc-grid">
          <colgroup>
            <col style={{ width: '7%' }} /><col style={{ width: '13%' }} /><col style={{ width: '13%' }} /><col style={{ width: '13%' }} /><col style={{ width: '13%' }} /><col style={{ width: '13%' }} /><col style={{ width: '13%' }} /><col style={{ width: '15%' }} />
          </colgroup>
          <thead>
            <tr>
              <th rowSpan={2}>Days</th>
              <th colSpan={2}>MORNING</th>
              <th colSpan={2}>AFTERNOON</th>
              <th colSpan={2}>OVERTIME</th>
              <th rowSpan={2} style={{ fontSize: '8px' }}>Daily Total</th>
            </tr>
            <tr>
              <th>IN</th><th>OUT</th><th>IN</th><th>OUT</th><th>IN</th><th>OUT</th>
            </tr>
          </thead>
          <tbody>
            {records.map((rec) => (
              <tr key={rec.day} className={rec.autoFilled ? 'dtr-auto-filled' : ''}>
                <td className="day-num">{rec.day}</td>
                <td><input className="tc-grid-input" value={rec.morningIn} onChange={e => onRecordChange(rec.day, 'morningIn', e.target.value)} /></td>
                <td><input className="tc-grid-input" value={rec.morningOut} onChange={e => onRecordChange(rec.day, 'morningOut', e.target.value)} /></td>
                <td><input className="tc-grid-input" value={rec.afternoonIn} onChange={e => onRecordChange(rec.day, 'afternoonIn', e.target.value)} /></td>
                <td><input className="tc-grid-input" value={rec.afternoonOut} onChange={e => onRecordChange(rec.day, 'afternoonOut', e.target.value)} /></td>
                <td><input className="tc-grid-input" value={rec.overtimeIn} onChange={e => onRecordChange(rec.day, 'overtimeIn', e.target.value)} /></td>
                <td><input className="tc-grid-input" value={rec.overtimeOut} onChange={e => onRecordChange(rec.day, 'overtimeOut', e.target.value)} /></td>
                <td><input className="tc-grid-input" value={rec.total} onChange={e => onRecordChange(rec.day, 'total', e.target.value)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="tc-cert">
        <span className="tc-cert-text">I hereby certify that the above records are true and correct.</span>
        <div className="tc-sig-line">Employee's Signature</div>
      </div>
    </>
  );
}
