/**
 * Geo / Country Utilities
 *
 * Maps user country codes to Serper API parameters (gl, hl)
 * and local currency info for country-aware search results.
 *
 * When a user in Romania searches for "headphones", they should see
 * results from emag.ro, altex.ro, etc. — not US Walmart/Target.
 *
 * When a user in Netherlands searches for "hotels in Amsterdam",
 * they should see results in EUR, not USD.
 */

// Country code → { gl, hl, currency, currencySymbol, name }
const COUNTRY_MAP = {
  // Europe
  RO: { gl: 'ro', hl: 'ro', currency: 'RON', currencySymbol: 'lei', name: 'Romania' },
  NL: { gl: 'nl', hl: 'nl', currency: 'EUR', currencySymbol: '€', name: 'Netherlands' },
  DE: { gl: 'de', hl: 'de', currency: 'EUR', currencySymbol: '€', name: 'Germany' },
  FR: { gl: 'fr', hl: 'fr', currency: 'EUR', currencySymbol: '€', name: 'France' },
  ES: { gl: 'es', hl: 'es', currency: 'EUR', currencySymbol: '€', name: 'Spain' },
  IT: { gl: 'it', hl: 'it', currency: 'EUR', currencySymbol: '€', name: 'Italy' },
  PT: { gl: 'pt', hl: 'pt', currency: 'EUR', currencySymbol: '€', name: 'Portugal' },
  AT: { gl: 'at', hl: 'de', currency: 'EUR', currencySymbol: '€', name: 'Austria' },
  BE: { gl: 'be', hl: 'nl', currency: 'EUR', currencySymbol: '€', name: 'Belgium' },
  IE: { gl: 'ie', hl: 'en', currency: 'EUR', currencySymbol: '€', name: 'Ireland' },
  GR: { gl: 'gr', hl: 'el', currency: 'EUR', currencySymbol: '€', name: 'Greece' },
  FI: { gl: 'fi', hl: 'fi', currency: 'EUR', currencySymbol: '€', name: 'Finland' },
  SE: { gl: 'se', hl: 'sv', currency: 'SEK', currencySymbol: 'kr', name: 'Sweden' },
  NO: { gl: 'no', hl: 'no', currency: 'NOK', currencySymbol: 'kr', name: 'Norway' },
  DK: { gl: 'dk', hl: 'da', currency: 'DKK', currencySymbol: 'kr', name: 'Denmark' },
  PL: { gl: 'pl', hl: 'pl', currency: 'PLN', currencySymbol: 'zł', name: 'Poland' },
  CZ: { gl: 'cz', hl: 'cs', currency: 'CZK', currencySymbol: 'Kč', name: 'Czech Republic' },
  HU: { gl: 'hu', hl: 'hu', currency: 'HUF', currencySymbol: 'Ft', name: 'Hungary' },
  BG: { gl: 'bg', hl: 'bg', currency: 'BGN', currencySymbol: 'лв', name: 'Bulgaria' },
  HR: { gl: 'hr', hl: 'hr', currency: 'EUR', currencySymbol: '€', name: 'Croatia' },
  SK: { gl: 'sk', hl: 'sk', currency: 'EUR', currencySymbol: '€', name: 'Slovakia' },
  SI: { gl: 'si', hl: 'sl', currency: 'EUR', currencySymbol: '€', name: 'Slovenia' },
  LT: { gl: 'lt', hl: 'lt', currency: 'EUR', currencySymbol: '€', name: 'Lithuania' },
  LV: { gl: 'lv', hl: 'lv', currency: 'EUR', currencySymbol: '€', name: 'Latvia' },
  EE: { gl: 'ee', hl: 'et', currency: 'EUR', currencySymbol: '€', name: 'Estonia' },
  CH: { gl: 'ch', hl: 'de', currency: 'CHF', currencySymbol: 'CHF', name: 'Switzerland' },

  // UK
  GB: { gl: 'uk', hl: 'en', currency: 'GBP', currencySymbol: '£', name: 'United Kingdom' },
  UK: { gl: 'uk', hl: 'en', currency: 'GBP', currencySymbol: '£', name: 'United Kingdom' },

  // North America
  US: { gl: 'us', hl: 'en', currency: 'USD', currencySymbol: '$', name: 'United States' },
  CA: { gl: 'ca', hl: 'en', currency: 'CAD', currencySymbol: 'CA$', name: 'Canada' },
  MX: { gl: 'mx', hl: 'es', currency: 'MXN', currencySymbol: 'MX$', name: 'Mexico' },

  // Asia-Pacific
  AU: { gl: 'au', hl: 'en', currency: 'AUD', currencySymbol: 'A$', name: 'Australia' },
  NZ: { gl: 'nz', hl: 'en', currency: 'NZD', currencySymbol: 'NZ$', name: 'New Zealand' },
  JP: { gl: 'jp', hl: 'ja', currency: 'JPY', currencySymbol: '¥', name: 'Japan' },
  KR: { gl: 'kr', hl: 'ko', currency: 'KRW', currencySymbol: '₩', name: 'South Korea' },
  SG: { gl: 'sg', hl: 'en', currency: 'SGD', currencySymbol: 'S$', name: 'Singapore' },
  IN: { gl: 'in', hl: 'en', currency: 'INR', currencySymbol: '₹', name: 'India' },

  // Middle East
  AE: { gl: 'ae', hl: 'en', currency: 'AED', currencySymbol: 'AED', name: 'UAE' },
  IL: { gl: 'il', hl: 'he', currency: 'ILS', currencySymbol: '₪', name: 'Israel' },
  TR: { gl: 'tr', hl: 'tr', currency: 'TRY', currencySymbol: '₺', name: 'Turkey' },

  // South America
  BR: { gl: 'br', hl: 'pt', currency: 'BRL', currencySymbol: 'R$', name: 'Brazil' },
  AR: { gl: 'ar', hl: 'es', currency: 'ARS', currencySymbol: 'AR$', name: 'Argentina' },
  CL: { gl: 'cl', hl: 'es', currency: 'CLP', currencySymbol: 'CL$', name: 'Chile' },
  CO: { gl: 'co', hl: 'es', currency: 'COP', currencySymbol: 'CO$', name: 'Colombia' },

  // Africa
  ZA: { gl: 'za', hl: 'en', currency: 'ZAR', currencySymbol: 'R', name: 'South Africa' },
  NG: { gl: 'ng', hl: 'en', currency: 'NGN', currencySymbol: '₦', name: 'Nigeria' },
  KE: { gl: 'ke', hl: 'en', currency: 'KES', currencySymbol: 'KSh', name: 'Kenya' },
};

// Default (fallback)
const DEFAULT_GEO = { gl: 'us', hl: 'en', currency: 'USD', currencySymbol: '$', name: 'United States' };

/**
 * Get geo parameters for a country code
 * @param {string} countryCode - ISO 3166-1 alpha-2 code (e.g. 'RO', 'NL', 'US')
 * @returns {{ gl: string, hl: string, currency: string, currencySymbol: string, name: string }}
 */
function getGeoForCountry(countryCode) {
  if (!countryCode) return DEFAULT_GEO;
  const code = countryCode.toUpperCase().trim();
  return COUNTRY_MAP[code] || DEFAULT_GEO;
}

/**
 * Extract the user's country from their shipping addresses
 * Priority: default address → first address → fallback 'US'
 *
 * @param {Array} shippingAddresses - User's shipping addresses from the User model
 * @returns {string} ISO country code
 */
function getUserCountry(shippingAddresses) {
  if (!shippingAddresses || shippingAddresses.length === 0) return 'US';

  // Prefer the default address
  const defaultAddr = shippingAddresses.find((a) => a.isDefault);
  if (defaultAddr && defaultAddr.country) return defaultAddr.country.toUpperCase();

  // Fall back to first address
  if (shippingAddresses[0] && shippingAddresses[0].country) {
    return shippingAddresses[0].country.toUpperCase();
  }

  return 'US';
}

module.exports = {
  getGeoForCountry,
  getUserCountry,
  COUNTRY_MAP,
  DEFAULT_GEO,
};

