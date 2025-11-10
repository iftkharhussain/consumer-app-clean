/**
 * Date utility functions
 */

/**
 * Format date to YYYYMMDD format required by Fortus API
 * @param {Date|string} date - Date to format
 * @returns {string} - Formatted date string
 */
const formatDateForFortus = (date) => {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
};

/**
 * Parse date string from YYYYMMDD format
 * @param {string} dateString - Date in YYYYMMDD format
 * @returns {Date} - Parsed Date object
 */
const parseFortusDate = (dateString) => {
  if (!dateString || dateString.length !== 8) {
    return null;
  }
  
  const year = dateString.substring(0, 4);
  const month = dateString.substring(4, 6);
  const day = dateString.substring(6, 8);
  
  return new Date(`${year}-${month}-${day}`);
};

/**
 * Get current date in YYYYMMDD format
 * @returns {string} - Current date formatted
 */
const getCurrentDateForFortus = () => {
  return formatDateForFortus(new Date());
};

/**
 * Calculate age from birthdate
 * @param {Date|string} birthdate - Date of birth
 * @returns {number} - Age in years
 */
const calculateAge = (birthdate) => {
  const today = new Date();
  const birth = new Date(birthdate);
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  
  return age;
};

module.exports = {
  formatDateForFortus,
  parseFortusDate,
  getCurrentDateForFortus,
  calculateAge,
};
