import { useState, useRef } from 'react';
import './DTRCard.css';
import html2canvas from 'html2canvas';

export interface DTRRecord {
  day: number;
  morningIn: string;
  morningOut: string;
  afternoonIn: string;
  afternoonOut: string;
  overtimeIn: string;
  overtimeOut: string;
  total: string;
}

export interface DTRCardProps {
  employeeName?: string;
  department?: string;
  position?: string;
  month?: string;
  records?: DTRRecord[];
}

export function DTRCard({
  employeeName = '',
  department = '',
  position = '',
  month = '',
  records = [],
}: DTRCardProps) {
  const componentRef = useRef<HTMLDivElement>(null);
  const [isPrinting, setIsPrinting] = useState(false);

  const [internalRecords, setInternalRecords] = useState<DTRRecord[]>(() => {
    const defaultRecords: DTRRecord[] = [];
    for (let i = 1; i <= 31; i++) {
      const existing = records.find((r) => r.day === i);
      defaultRecords.push(
        existing || {
          day: i,
          morningIn: '',
          morningOut: '',
          afternoonIn: '',
          afternoonOut: '',
          overtimeIn: '',
          overtimeOut: '',
          total: '',
        }
      );
    }
    return defaultRecords;
  });

  const [header, setHeader] = useState({
    no: '',
    payEnding: month,
    name: employeeName,
    position: position,
    dept: department,
    age: '',
  });

  const [payroll, setPayroll] = useState({
    regRate: '', regAmount: '',
    overRate: '', overAmount: '',
    totalEarnings: '',
    lessDeductions: '',
    netPay: '',
    absences: '',
    fines: '',
    withholdingTax: '',
    sss: '',
    total: '',
  });

  const handleRecord = (day: number, field: keyof DTRRecord, val: string) => {
    setInternalRecords(prev =>
      prev.map(r => r.day === day ? { ...r, [field]: val } : r)
    );
  };

  const handleDownloadImage = () => {
    const element = componentRef.current;
    if (!element) return;
    setIsPrinting(true);
    setTimeout(() => {
      html2canvas(element, {
        scale: 3,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff'
      }).then(canvas => {
        const today = new Date();
        const dateStr = today.toISOString().split('T')[0]; // e.g. 2026-04-02
        const filename = `DTR_${(header.name || 'as of').replace(/\s+/g, '_')}_${dateStr}.webp`;
        
        const link = document.createElement('a');
        link.download = filename;
        link.href = canvas.toDataURL('image/webp', 0.95);
        link.click();
        setIsPrinting(false);
      });
    }, 100);
  };

  return (
    <div className="dtr-container">
      <div ref={componentRef} className={`dtr-card ${isPrinting ? 'printing' : ''}`}>

        {/* ===== HEADER ===== */}
        <div className="tc-header">
          {/* Row 1: No. and Pay Ending split 50/50 */}
          <div className="tc-header-row">
            <div style={{ flex: '0 0 50%', display: 'flex', alignItems: 'flex-end', gap: '4px' }}>
              <span className="tc-lbl">No.</span>
              <input className="tc-line" value={header.no} onChange={e => setHeader({ ...header, no: e.target.value })} />
            </div>
            <div style={{ flex: '1', display: 'flex', alignItems: 'flex-end', gap: '4px', paddingLeft: '8px' }}>
              <span className="tc-lbl">Pay Ending</span>
              <input className="tc-line" value={header.payEnding} onChange={e => setHeader({ ...header, payEnding: e.target.value })} />
            </div>
          </div>

          {/* Row 2: Name and Position (Name gets more space) */}
          <div className="tc-header-row">
            <div style={{ flex: '0 0 65%', display: 'flex', alignItems: 'flex-end', gap: '4px' }}>
              <span className="tc-lbl">Name</span>
              <input className="tc-line" value={header.name} onChange={e => setHeader({ ...header, name: e.target.value })} />
            </div>
            <div style={{ flex: '1', display: 'flex', alignItems: 'flex-end', gap: '4px', paddingLeft: '12px' }}>
              <span className="tc-lbl">Position</span>
              <input className="tc-line" value={header.position} onChange={e => setHeader({ ...header, position: e.target.value })} />
            </div>
          </div>

          {/* Row 3: Dept. and Age (Dept gets much more space) */}
          <div className="tc-header-row">
            <div style={{ flex: '0 0 80%', display: 'flex', alignItems: 'flex-end', gap: '4px' }}>
              <span className="tc-lbl">Dept.</span>
              <input className="tc-line" value={header.dept} onChange={e => setHeader({ ...header, dept: e.target.value })} />
            </div>
            <div style={{ flex: '1', display: 'flex', alignItems: 'flex-end', gap: '4px', paddingLeft: '12px' }}>
              <span className="tc-lbl">Age</span>
              <input className="tc-line" value={header.age} onChange={e => setHeader({ ...header, age: e.target.value })} />
            </div>
          </div>
        </div>

        {/* ===== MIDDLE: PAYROLL + DEDUCTIONS ===== */}
        <div className="tc-middle">

          {/* Left: Hours / Rate / Amount */}
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
                  <td><input value={payroll.regRate} onChange={e => setPayroll({ ...payroll, regRate: e.target.value })} /></td>
                  <td><input value={payroll.regAmount} onChange={e => setPayroll({ ...payroll, regAmount: e.target.value })} /></td>
                </tr>
                <tr>
                  <td className="label-cell">Over.</td>
                  <td><input value={payroll.overRate} onChange={e => setPayroll({ ...payroll, overRate: e.target.value })} /></td>
                  <td><input value={payroll.overAmount} onChange={e => setPayroll({ ...payroll, overAmount: e.target.value })} /></td>
                </tr>
                <tr>
                  <td className="label-cell" colSpan={2}>Total Earnings</td>
                  <td><input value={payroll.totalEarnings} onChange={e => setPayroll({ ...payroll, totalEarnings: e.target.value })} /></td>
                </tr>
                <tr>
                  <td className="label-cell" colSpan={2}>Less Deductions</td>
                  <td><input value={payroll.lessDeductions} onChange={e => setPayroll({ ...payroll, lessDeductions: e.target.value })} /></td>
                </tr>
                <tr>
                  <td className="label-cell net-pay" colSpan={2}>NET PAY</td>
                  <td><input value={payroll.netPay} onChange={e => setPayroll({ ...payroll, netPay: e.target.value })} /></td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Center: DEDUCTIONS vertical text */}
          <div className="tc-deductions-label">
            {"DEDUCTIONS".split('').map((char, i) => <span key={i}>{char}</span>)}
          </div>

          {/* Right: Absences breakdown */}
          <div className="tc-right-table">
            <table>
              <thead>
                <tr>
                  <th colSpan={2}>ABSENCES</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Fines</td>
                  <td><input value={payroll.fines} onChange={e => setPayroll({ ...payroll, fines: e.target.value })} /></td>
                </tr>
                <tr>
                  <td>Withholding Tax</td>
                  <td><input value={payroll.withholdingTax} onChange={e => setPayroll({ ...payroll, withholdingTax: e.target.value })} /></td>
                </tr>
                <tr>
                  <td>S.S.S.</td>
                  <td><input value={payroll.sss} onChange={e => setPayroll({ ...payroll, sss: e.target.value })} /></td>
                </tr>
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2}>TOTAL</td>
                </tr>
              </tfoot>
            </table>
          </div>

        </div>

        {/* ===== ATTENDANCE GRID ===== */}
        <div className="tc-grid-section">
          <table className="tc-grid">
            <colgroup>
              <col style={{ width: '7%' }} />
              <col style={{ width: '13%' }} />
              <col style={{ width: '13%' }} />
              <col style={{ width: '13%' }} />
              <col style={{ width: '13%' }} />
              <col style={{ width: '13%' }} />
              <col style={{ width: '13%' }} />
              <col style={{ width: '15%' }} />
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
                <th>IN</th>
                <th>OUT</th>
                <th>IN</th>
                <th>OUT</th>
                <th>IN</th>
                <th>OUT</th>
              </tr>
            </thead>
            <tbody>
              {internalRecords.map((rec) => (
                <tr key={rec.day}>
                  <td className="day-num">{rec.day}</td>
                  <td><input className="tc-grid-input" value={rec.morningIn} onChange={e => handleRecord(rec.day, 'morningIn', e.target.value)} /></td>
                  <td><input className="tc-grid-input" value={rec.morningOut} onChange={e => handleRecord(rec.day, 'morningOut', e.target.value)} /></td>
                  <td><input className="tc-grid-input" value={rec.afternoonIn} onChange={e => handleRecord(rec.day, 'afternoonIn', e.target.value)} /></td>
                  <td><input className="tc-grid-input" value={rec.afternoonOut} onChange={e => handleRecord(rec.day, 'afternoonOut', e.target.value)} /></td>
                  <td><input className="tc-grid-input" value={rec.overtimeIn} onChange={e => handleRecord(rec.day, 'overtimeIn', e.target.value)} /></td>
                  <td><input className="tc-grid-input" value={rec.overtimeOut} onChange={e => handleRecord(rec.day, 'overtimeOut', e.target.value)} /></td>
                  <td><input className="tc-grid-input" value={rec.total} onChange={e => handleRecord(rec.day, 'total', e.target.value)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ===== CERTIFICATION ===== */}
        <div className="tc-cert">
          <span className="tc-cert-text">
            I hereby certify that the above records are true and correct.
          </span>
          <div className="tc-sig-line">Employee's Signature</div>
        </div>

      </div>

      {/* ===== BUTTONS ===== */}
      <div className="dtr-actions">
        <button className="dtr-btn dtr-btn-primary" onClick={handleDownloadImage}>
          <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Download Image
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
