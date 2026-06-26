// Calculate days together since 26/11/2025
const startDate = new Date('2025-11-26');
const today = new Date();

// Reset time to avoid timezone issues
today.setHours(0, 0, 0, 0);
startDate.setHours(0, 0, 0, 0);

// Calculate next anniversary (26/11 every year)
let anniversaryDate = new Date(today.getFullYear(), 10, 26); // 10 = November (0-indexed)
anniversaryDate.setHours(0, 0, 0, 0);
if (anniversaryDate < today) {
  // If today is after 26/11, set anniversary to next year
  anniversaryDate = new Date(today.getFullYear() + 1, 10, 26);
  anniversaryDate.setHours(0, 0, 0, 0);
}

const daysTogether = Math.floor((today - startDate) / (1000 * 60 * 60 * 24));
const totalDaysInYear = 365;

const years = Math.floor(daysTogether / 365);
const daysAfterYears = daysTogether % 365;
const weeks = Math.floor(daysAfterYears / 7);
const remainingDays = daysAfterYears % 7;

// Days until next anniversary milestone (tròn năm)
const daysUntilAnniversary = (totalDaysInYear - daysAfterYears) || totalDaysInYear;
const nextMilestoneYear = years + 1;

// Milestone messages
const milestones = {
  100: '🎉 100 ngày rồi!',
  180: '🌙 Nửa năm yêu nhau!',
  200: '💎 200 ngày!',
  250: '✨ 250 ngày!',
  300: '🌟 300 ngày!',
  365: '🎊 1 năm yêu nhau!'
};

function getMilestoneMessage() {
  if (milestones[daysTogether]) {
    return milestones[daysTogether];
  }
  return '';
}

function animateCounter() {
  const counterEl = document.getElementById('days-counter');
  if (!counterEl) return;
  
  let current = 0;
  const target = daysTogether;
  const duration = 1500; // ms
  const steps = 60;
  const increment = target / steps;
  const stepDuration = duration / steps;
  
  const interval = setInterval(() => {
    current += increment;
    if (current >= target) {
      current = target;
      clearInterval(interval);
    }
    counterEl.textContent = Math.floor(current);
  }, stepDuration);
}

function updateCounter() {
  // Animate the main counter
  animateCounter();
  
  // Update weeks and days
  const yearsEl = document.getElementById('years');
  const weeksEl = document.getElementById('weeks');
  const remainingDaysEl = document.getElementById('remaining-days');
  const untilYearEl = document.getElementById('until-year');
  const milestoneYearEl = document.getElementById('milestone-year');
  const progressFillEl = document.getElementById('progress-fill');
  const progressTextEl = document.getElementById('progress-text');
  const milestoneEl = document.getElementById('milestone');
  
  if (yearsEl) yearsEl.textContent = years;
  if (weeksEl) weeksEl.textContent = weeks;
  if (remainingDaysEl) remainingDaysEl.textContent = remainingDays;
  if (untilYearEl) untilYearEl.textContent = Math.max(0, daysUntilAnniversary);
  if (milestoneYearEl) milestoneYearEl.textContent = nextMilestoneYear;
  
  // Update progress bar
  if (progressFillEl) {
    const progressPercent = (daysTogether / totalDaysInYear) * 100;
    progressFillEl.style.width = Math.min(progressPercent, 100) + '%';
  }
  
  if (progressTextEl) {
    const progressPercent = Math.min((daysTogether / totalDaysInYear) * 100, 100).toFixed(1);
    progressTextEl.textContent = `${progressPercent}% đến 1 năm`;
  }
  
  // Show milestone message
  if (milestoneEl) {
    milestoneEl.textContent = getMilestoneMessage();
  }
}

// Update on page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', updateCounter);
} else {
  updateCounter();
}
