import { state } from './state.js';
import { resetForm } from './rule-form.js';

export function setupNavigation() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      showTab(item.dataset.tab);
      document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
      item.classList.add('active');
    });
  });
}

export function showTab(tabName) {
  document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));

  const selectedTab = document.getElementById(`${tabName}-tab`);
  if (selectedTab) selectedTab.classList.add('active');

  document.querySelectorAll('.nav-item').forEach(nav => {
    nav.classList.remove('active');
    if (nav.dataset.tab === tabName) nav.classList.add('active');
  });

  if (tabName === 'new-rule') {
    state.currentEditingRuleId = null;
    resetForm();
  }
}
