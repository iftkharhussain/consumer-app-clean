/**
 * Office Hours Helper
 * Utilities for checking if office is currently open
 */

/**
 * Check if office is currently open based on office hours
 * @param {Object} officeHours - Office hours object with day keys (monday, tuesday, etc.)
 * @param {string} timezone - Timezone string (e.g., 'America/Toronto')
 * @returns {Object} { isOpen: boolean, message: string, currentDay: string, currentTime: string }
 */
const isOfficeOpen = (officeHours, timezone = 'America/Toronto') => {
  try {
    if (!officeHours) {
      return {
        isOpen: false,
        message: 'Office hours not configured',
        currentDay: null,
        currentTime: null
      };
    }

    // Get current time in the office's timezone
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      weekday: 'long',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });

    const parts = formatter.formatToParts(now);
    const currentDay = parts.find(p => p.type === 'weekday').value.toLowerCase();
    const currentHour = parseInt(parts.find(p => p.type === 'hour').value);
    const currentMinute = parseInt(parts.find(p => p.type === 'minute').value);
    const currentTime = `${currentHour.toString().padStart(2, '0')}:${currentMinute.toString().padStart(2, '0')}`;

    // Get today's office hours
    const todayHours = officeHours[currentDay];

    if (!todayHours || !todayHours.open || !todayHours.close) {
      return {
        isOpen: false,
        message: 'Fermé',
        currentDay,
        currentTime
      };
    }

    // Parse open and close times
    const [openHour, openMinute] = todayHours.open.split(':').map(Number);
    const [closeHour, closeMinute] = todayHours.close.split(':').map(Number);

    // Convert to minutes since midnight for easy comparison
    const currentMinutes = currentHour * 60 + currentMinute;
    const openMinutes = openHour * 60 + openMinute;
    const closeMinutes = closeHour * 60 + closeMinute;

    const isOpen = currentMinutes >= openMinutes && currentMinutes < closeMinutes;

    return {
      isOpen,
      message: isOpen ? 'Ouvert' : 'Fermé',
      currentDay,
      currentTime,
      todayHours: {
        open: todayHours.open,
        close: todayHours.close
      }
    };

  } catch (error) {
    console.error('Error checking office hours:', error);
    return {
      isOpen: false,
      message: 'Unable to determine status',
      currentDay: null,
      currentTime: null,
      error: error.message
    };
  }
};

/**
 * Format office hours for display
 * @param {Object} officeHours - Office hours object
 * @returns {string} Formatted string (e.g., "Ouvert de 8:30 à 16:30 du lundi au vendredi")
 */
const formatOfficeHours = (officeHours) => {
  if (!officeHours) return '';

  // Check if weekdays have same hours
  const weekdays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
  const weekdayHours = weekdays.map(day => officeHours[day]).filter(Boolean);

  if (weekdayHours.length === 5) {
    const firstHours = weekdayHours[0];
    const allSame = weekdayHours.every(h => h.open === firstHours.open && h.close === firstHours.close);

    if (allSame) {
      return `Ouvert de ${firstHours.open} à ${firstHours.close} du lundi au vendredi`;
    }
  }

  // Otherwise, list each day
  const daysInFrench = {
    monday: 'lundi',
    tuesday: 'mardi',
    wednesday: 'mercredi',
    thursday: 'jeudi',
    friday: 'vendredi',
    saturday: 'samedi',
    sunday: 'dimanche'
  };

  const schedule = [];
  for (const [day, hours] of Object.entries(officeHours)) {
    if (hours && hours.open && hours.close) {
      schedule.push(`${daysInFrench[day]}: ${hours.open} - ${hours.close}`);
    }
  }

  return schedule.join(', ');
};

module.exports = {
  isOfficeOpen,
  formatOfficeHours
};
