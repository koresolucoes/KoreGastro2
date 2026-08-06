const fs = require('fs');

function removeH1(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  // We want to remove the <h1> tag that comes right after the img src="/logo.svg"
  content = content.replace(/<img src="\/logo\.svg"[^>]*>\s*<h1[^>]*>.*?<\/h1>/gs, (match) => {
    return match.replace(/\s*<h1[^>]*>.*?<\/h1>/s, '');
  });
  // Also remove the wrapper div if it's just an image now?
  // Actually, keep the wrapper.
  fs.writeFileSync(filePath, content);
}

removeH1('src/components/auth/login.component.html');
removeH1('src/components/auth/register.component.html');
removeH1('src/components/auth/reset-password.component.html');
removeH1('src/components/auth/employee-selection.component.html');
removeH1('src/components/onboarding/onboarding.component.html');
