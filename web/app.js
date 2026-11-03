const form = document.querySelector('#plan-form');
const plan = document.querySelector('#plan');
const status = document.querySelector('#status');
const storageKey = 'reading-plan-draft-v1';

try {
  plan.value = localStorage.getItem(storageKey) || '';
} catch {
  status.textContent = 'Unable to read storage on this device.';
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  try {
    localStorage.setItem(storageKey, plan.value);
    status.textContent = 'Plan saved on this device.';
  } catch {
    status.textContent = 'Unable to save. Your plan has not been stored.';
  }
});

plan.addEventListener('input', () => {
  status.textContent = '';
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {
    status.textContent = 'Offline access is unavailable. Please reconnect and reload.';
  });
}
