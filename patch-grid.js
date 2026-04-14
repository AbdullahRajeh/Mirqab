const fs = require('fs');
let css = fs.readFileSync('public/css/main.css', 'utf8');

const searchIndex = css.indexOf('/* DASHBOARD REDESIGN */');
if (searchIndex > -1) {
  css = css.substring(0, searchIndex);
}

// Append new css pattern
css += `
/* DASHBOARD REDESIGN V2 */
.dashboard-panel {
  position: fixed;
  left: 0;
  top: 0;
  width: 100vw;
  height: 100dvh;
  z-index: 20;
  background: rgba(10, 10, 12, 0.96);
  backdrop-filter: blur(28px);
  -webkit-backdrop-filter: blur(28px);
  padding: 3rem 4vw;
  display: grid !important;
  grid-template-columns: minmax(320px, 1.2fr) minmax(280px, 1fr) minmax(400px, 1.8fr);
  grid-template-rows: auto auto 1fr;
  grid-template-areas:
    'head head head'
    'stats stats stats'
    'chart mini table';
  gap: 2rem 2.5rem;
  opacity: 0;
  pointer-events: none;
  transition: opacity 350ms ease, transform 450ms cubic-bezier(0.16, 1, 0.3, 1);
  transform: translateY(100vh);
  overflow-y: auto;
  align-items: stretch;
}

.dashboard-panel.open {
  opacity: 1;
  pointer-events: auto;
  transform: translateY(0);
}

.dashboard-head {
  grid-area: head;
  width: 100%;
  max-width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  padding-bottom: 1.5rem;
  border-bottom: 2px solid rgba(255, 255, 255, 0.08);
  margin-top: 0;
}

.dashboard-head .eyebrow {
  color: var(--muted);
  letter-spacing: 0.15em;
  font-size: 0.95rem;
  margin-bottom: 0.8rem;
  text-transform: uppercase;
}

.dashboard-head h2 {
  font-size: 2.8rem;
  line-height: 1.2;
  font-weight: 800;
  color: #fff;
  margin: 0;
  letter-spacing: -0.02em;
}

.close-btn {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.03);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease;
  font-size: 1.5rem;
  padding: 0;
}
.close-btn:hover {
  background: #fb7185;
  color: #fff;
  border-color: #fb7185;
  transform: scale(1.05);
}

/* Stats */
.stats {
  grid-area: stats;
  width: 100%;
  max-width: 100%;
  display: grid;
  grid-template-columns: repeat(9, 1fr);
  gap: 1.2rem;
}

.card {
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: var(--radius-md);
  background: rgba(25, 25, 25, 0.5);
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.2);
  transition: transform 0.2s ease, border-color 0.2s ease;
  padding: 1.6rem 1.4rem;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  min-height: 130px;
}
.card:hover {
  border-color: rgba(255, 255, 255, 0.25);
  transform: translateY(-3px);
  background: rgba(255, 255, 255, 0.05);
}

.card h3 {
  color: var(--muted);
  font-size: 0.85rem;
  line-height: 1.4;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-weight: 600;
}

.value {
  margin-top: 1rem;
  font-size: 2.2rem;
  line-height: 1;
  font-weight: 800;
  font-family: inherit;
  color: #fff;
}

.value.small {
  font-size: 1.4rem;
}

.value-danger {
  color: #fb7185;
}

.value-accent {
  color: #fff;
}

/* Chart */
.dashboard-panel > section:nth-of-type(2) {
  grid-area: chart;
  width: 100%;
  min-height: 380px;
  background: rgba(25, 25, 25, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: var(--radius-md);
  padding: 1.5rem;
  display: flex !important;
  flex-direction: column;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.2);
}
#severityChart {
  width: 100% !important;
  height: 100% !important;
  flex: 1;
}

/* Mini Metrics */
.mini-metrics {
  grid-area: mini;
  width: 100%;
  max-width: 100%;
  display: grid;
  grid-template-rows: repeat(3, 1fr);
  gap: 1.5rem;
  align-items: stretch;
}

.mini-card {
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: var(--radius-md);
  background: rgba(25, 25, 25, 0.4);
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.2);
  transition: transform 0.2s ease, border-color 0.2s ease;
  padding: 0 2rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 100%;
  min-height: 100px;
}
.mini-card:hover {
  border-color: rgba(255, 255, 255, 0.25);
  transform: translateY(-2px);
  background: rgba(255, 255, 255, 0.05);
}

.mini-card span {
  color: var(--muted);
  font-size: 1.05rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.mini-card strong {
  font-size: 2.4rem;
  font-weight: 800;
  color: #fff;
}

/* Table Area */
.table-wrap {
  grid-area: table;
  width: 100%;
  max-width: 100%;
  display: flex;
  flex-direction: column;
  gap: 1.2rem;
  margin: 0;
  height: 100%;
}

.table-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 0.5rem;
  margin-bottom: 0.5rem;
}

.table-head h3 {
  font-size: 1.6rem;
  font-weight: 800;
  color: #fff;
  margin: 0;
}

.danger-btn {
  padding: 0.7rem 1.6rem;
  color: #fb7185;
  border: 1px solid rgba(239, 68, 68, 0.4);
  background: rgba(239, 68, 68, 0.15);
  border-radius: var(--radius-sm);
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s ease;
  font-size: 0.95rem;
}
.danger-btn:hover {
  background: rgba(239, 68, 68, 0.25);
  color: #fff;
  border-color: rgba(239, 68, 68, 0.8);
  box-shadow: 0 4px 14px rgba(239, 68, 68, 0.2);
}

.table-scroll {
  width: 100%;
  flex: 1;
  min-height: 0; /* Important for flex child to be scrollable */
  background: rgba(25, 25, 25, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: var(--radius-md);
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.2);
  overflow: auto;
}

table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
}

th,
td {
  text-align: right;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  padding: 1.4rem 1.5rem;
  font-size: 1.05rem;
}

th {
  position: sticky;
  top: 0;
  z-index: 5;
  font-weight: 800;
  color: var(--muted);
  background: rgba(18, 18, 18, 0.98);
  backdrop-filter: blur(8px);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-size: 0.9rem;
}

tbody tr {
  transition: background 0.2s;
}
tbody tr:hover {
  background: rgba(255, 255, 255, 0.06);
}

.pin-row__img {
  width: 64px;
  height: 64px;
  border-radius: var(--radius-sm);
  object-fit: cover;
  border: 1px solid rgba(255, 255, 255, 0.15);
}

.pin-row__hood {
  font-weight: 700;
  color: #fff;
  font-size: 1.1rem;
}

.pin-row__confidence {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.pin-row__bar {
  height: 8px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.1);
  overflow: hidden;
  width: 140px;
}

.pin-row__bar-fill {
  height: 100%;
  background: #fff;
}

.pin-row__value {
  color: var(--muted);
  font-size: 0.9rem;
  font-weight: 700;
}

.pin-row__view-btn {
  padding: 0.6rem 1.2rem;
  font-size: 0.9rem;
  font-weight: 700;
  cursor: pointer;
  background: rgba(255, 255, 255, 0.12);
  border: 1px solid rgba(255, 255, 255, 0.25);
  color: #fff;
  border-radius: var(--radius-sm);
  transition: all 0.2s;
}
.pin-row__view-btn:hover {
  background: rgba(255, 255, 255, 0.3);
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(0,0,0,0.25);
}

/* Responsiveness */
@media (max-width: 1800px) {
  .dashboard-panel {
    padding: 3rem 3vw;
    grid-template-columns: minmax(320px, 1fr) minmax(280px, 1fr) minmax(380px, 1.4fr);
  }
  .stats {
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  }
}

@media (max-width: 1400px) {
  .dashboard-panel {
    grid-template-columns: 1fr 1fr;
    grid-template-areas:
      'head head'
      'stats stats'
      'chart mini'
      'table table';
  }
  .mini-metrics {
    grid-template-rows: auto;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  }
  .table-wrap {
    min-height: 480px;
  }
}

@media (max-width: 1100px) {
  .dashboard-panel {
    padding: 2rem 4vw;
    grid-template-columns: 1fr;
    grid-template-areas:
      'head'
      'stats'
      'mini'
      'chart'
      'table';
    overflow-y: auto;
  }
  
  .stats {
    grid-template-columns: repeat(3, 1fr);
  }
  
  .card, .mini-card, .table-wrap {
    min-height: auto;
  }
  
  .table-scroll {
    min-height: 480px;
  }
}

@media (max-width: 600px) {
  .stats {
    grid-template-columns: repeat(2, 1fr);
  }
  .dashboard-panel {
    padding: 1.5rem 1rem;
  }
}

`;
fs.writeFileSync('public/css/main.css', css);
