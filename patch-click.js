const fs = require('fs');
let js = fs.readFileSync('public/js/main.js', 'utf8');

js = js.replace(
  /window\.stopAndDismiss\(null, true\);\n\s*map\.stop\(\);/,
  `window.stopAndDismiss(null, true);
      map.stop();
      const dash = document.getElementById("dashboard-panel");
      if (dash) dash.classList.remove("open");`
);

fs.writeFileSync('public/js/main.js', js);
