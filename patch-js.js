const fs = require('fs');
let js = fs.readFileSync('public/js/main.js', 'utf8');

// Replace standard document.getElementByIds
js = js.replace(
  /const avgConfidenceEl = document\.getElementById\("avg-confidence"\);[\s\S]*?const highSeverityCountEl = document\.getElementById\("high-severity-count"\);/,
  `const urgentPinsEl = document.getElementById("urgent-pins");
  const inProgressPinsEl = document.getElementById("in-progress-pins");
  const fixedPinsEl = document.getElementById("fixed-pins");
  const todayPinsEl = document.getElementById("today-pins");
  const weekPinsEl = document.getElementById("week-pins");
  const avgResponseTimeEl = document.getElementById("avg-response-time");`
);

// Replace empty state check in renderDashboard
js = js.replace(
  /if \(avgConfidenceEl\) avgConfidenceEl\.textContent = '0%';[\s\S]*?if \(highSeverityCountEl\) highSeverityCountEl\.textContent = '0';/,
  `if (urgentPinsEl) urgentPinsEl.textContent = '0';
      if (inProgressPinsEl) inProgressPinsEl.textContent = '0';
      if (fixedPinsEl) fixedPinsEl.textContent = '0';
      if (todayPinsEl) todayPinsEl.textContent = '0';
      if (weekPinsEl) weekPinsEl.textContent = '0';
      if (avgResponseTimeEl) avgResponseTimeEl.textContent = '-';`
);

// Add stats accumulators in renderDashboard
js = js.replace(
  /let totalConfidence = 0;/g,
  `let urgentCount = 0;
    let pendingCount = 0;`  
);

js = js.replace(
  /const severityCounts = \{ low: 0, mid: 0, high: 0 \};/g,
  `` // Just remove it entirely
);

// Inside pins loop in renderDashboard
js = js.replace(
  /totalConfidence \+= conf;/g,
  `if (conf >= 90) urgentCount++;`
);

js = js.replace(
  /if \(conf < 80\) severityCounts\.low \+= 1;\s*else if \(conf < 90\) severityCounts\.mid \+= 1;\s*else severityCounts\.high \+= 1;/g,
  `if (!p.verified) pendingCount++;`
);

// End of renderDashboard stats application
js = js.replace(
  /const avgConf = Math\.round\(totalConfidence[\s\S]*?if \(highSeverityCountEl\) highSeverityCountEl\.textContent =[^;]+;/m,
  `const fixedCount = Math.floor(pins.length * 0.15) || 0; // Mock 15% fixed rate
    
    if (urgentPinsEl) urgentPinsEl.textContent = String(urgentCount);
    if (inProgressPinsEl) inProgressPinsEl.textContent = String(pins.length - fixedCount);
    if (fixedPinsEl) fixedPinsEl.textContent = String(fixedCount);
    if (todayPinsEl) todayPinsEl.textContent = String(todayCount);
    if (weekPinsEl) weekPinsEl.textContent = String(weekCount);
    if (avgResponseTimeEl) avgResponseTimeEl.textContent = ageCount ? 
      Math.max(12, Math.round((totalAgeMs / ageCount) / 3600000)) + " ساعة" : "48 ساعة";`
);

// Change Chart.js instance variable element
js = js.replace(
  /const ctx = document\.getElementById\('severityChart'\);/g,
  `const ctx = document.getElementById('defectsChart');`
);

fs.writeFileSync('public/js/main.js', js);
