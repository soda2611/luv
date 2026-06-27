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
let years = today.getFullYear() - startDate.getFullYear();
let months = today.getMonth() - startDate.getMonth();
let days = today.getDate() - startDate.getDate();

if (days < 0) {
    months--;

    // số ngày của tháng trước
    const prevMonth = new Date(today.getFullYear(), today.getMonth(), 0);
    days += prevMonth.getDate();
}

if (months < 0) {
    years--;
    months += 12;
}

const weeks = Math.floor(days / 7);
const remainingDays = days % 7;

// ====== Anniversary ======
const msPerDay = 1000 * 60 * 60 * 24;
const daysUntilAnniversary = Math.ceil(
    (anniversaryDate - today) / msPerDay
);

const nextMilestoneYear = years + 1;

// số ngày của chu kỳ hiện tại (365 hoặc 366)
const currentAnniversary = new Date(
    anniversaryDate.getFullYear() - 1,
    10,
    26
);

const totalDaysInYear = Math.round(
    (anniversaryDate - currentAnniversary) / msPerDay
);

// đã đi được bao nhiêu ngày trong chu kỳ hiện tại
const elapsedThisYear = totalDaysInYear - daysUntilAnniversary;

// Milestone messages
function getMilestoneMessage() {
    // Đúng ngày kỷ niệm hàng năm
    if (
        today.getDate() === startDate.getDate() &&
        today.getMonth() === startDate.getMonth() &&
        years > 0
    ) {
        return `🎊 Ỏoooo ${years} năm gùiiii!`;
    }

    // Đúng ngày kỷ niệm hàng tháng
    if (
        today.getDate() === startDate.getDate() &&
        !(today.getMonth() === startDate.getMonth() && years > 0)
    ) {
        const totalMonths = years * 12 + months;

        if (totalMonths > 0 && totalMonths % 12 !== 0) {
            return `💖 Hí hí ${totalMonths} tháng gùi nòoo!`;
        }
    }
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
  const monthEl = document.getElementById('months');
  const weeksEl = document.getElementById('weeks');
  const remainingDaysEl = document.getElementById('remaining-days');
  const untilYearEl = document.getElementById('until-year');
  const milestoneYearEl = document.getElementById('milestone-year');
  const progressFillEl = document.getElementById('progress-fill');
  const progressTextEl = document.getElementById('progress-text');
  const milestoneEl = document.getElementById('milestone');
  
  if (yearsEl) yearsEl.textContent = years;
  if (monthEl) monthEl.textContent = months;
  if (weeksEl) weeksEl.textContent = weeks;
  if (remainingDaysEl) remainingDaysEl.textContent = remainingDays;
  if (untilYearEl) untilYearEl.textContent = Math.max(0, daysUntilAnniversary);
  if (milestoneYearEl) milestoneYearEl.textContent = nextMilestoneYear;
  
  // Update progress bar
  if (progressFillEl) {
    const progressPercent = (elapsedThisYear / totalDaysInYear) * 100;
    progressFillEl.style.width = Math.min(progressPercent, 100) + '%';
  }

  if (progressTextEl) {
    const progressPercent = Math.min((elapsedThisYear / totalDaysInYear) * 100, 100).toFixed(1);
    progressTextEl.textContent = `${progressPercent}% đến ${nextMilestoneYear} năm`;
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
