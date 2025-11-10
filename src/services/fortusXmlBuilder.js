/**
 * XML Builder utility for Fortus API requests
 * Builds SOAP envelope and Fortus XML according to documentation
 */

const config = require('../config');

/**
 * Build SOAP envelope with headers and body for Fortus Quote request
 * @param {string} quoteGuid - Unique quote identifier
 * @param {string} quoteIterationGuid - Unique quote iteration identifier
 * @param {string} fortusXML - Fortus transaction XML
 * @param {object} caller - Caller information (province, lineOfBusiness, etc)
 * @returns {string} - Complete SOAP envelope XML
 */
const buildQuoteSoapEnvelope = (quoteGuid, quoteIterationGuid, fortusXML, caller = {}) => {
  const { province = 'ON', lineOfBusiness = 'AUTO', language = 'EN' } = caller;
  
  return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope 
  xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" 
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:xsd="http://www.w3.org/2001/XMLSchema">
  <soap:Header>
    <Caller xmlns="http://www.compu-quote.com/RatingWebService/Version1">
      <Name>${config.fortus.callerName}</Name>
      <Version>${config.fortus.callerVersion}</Version>
      <Product>ThirdParty_Web</Product>
      <LineOfBusiness>${lineOfBusiness}</LineOfBusiness>
      <Province>${province}</Province>
      <Language>${language}</Language>
      <FortusVersion>
        <MajorVersion>${config.fortus.majorVersion}</MajorVersion>
        <MinorVersion>${config.fortus.minorVersion}</MinorVersion>
        <Build>${config.fortus.build}</Build>
        <Deviation></Deviation>
      </FortusVersion>
    </Caller>
    <CQCredentials xmlns="http://www.compu-quote.com/RatingWebService/Version1">
      <UserName>${config.fortus.username}</UserName>
      <Password>${config.fortus.password}</Password>
    </CQCredentials>
  </soap:Header>
  <soap:Body>
    <Quote xmlns="http://www.compu-quote.com/RatingWebService/Version1">
      <QuoteGUID>${quoteGuid}</QuoteGUID>
      <QuoteIterationGUID>${quoteIterationGuid}</QuoteIterationGUID>
      <xmlparam_FortusTransaction>${escapeXml(fortusXML)}</xmlparam_FortusTransaction>
    </Quote>
  </soap:Body>
</soap:Envelope>`;
};

/**
 * Build Fortus Transaction XML for Auto quote
 * @param {object} quoteData - Quote data including drivers, vehicles, coverages
 * @returns {string} - Fortus transaction XML
 */
const buildAutoFortusTransaction = (quoteData) => {
  const {
    province,
    effectiveDate,
    carriers = [],
    renewal = 'NO',
    drivers = [],
    vehicles = [],
  } = quoteData;

  const carriersXml = carriers.map(c => `    <Carrier>${c}</Carrier>`).join('\n');
  const driversXml = drivers.map(buildDriverProfile).join('\n');
  const vehiclesXml = vehicles.map(buildVehicle).join('\n');

  return `<FortusTransaction Type="Automobile" xmlns="">
  <Province>${province}</Province>
  <Renewal>${renewal}</Renewal>
  <Carriers>
${carriersXml}
  </Carriers>
  <EffDate>${effectiveDate}</EffDate>
  <CodeNames>
    <Auto>
      <QuoteInfo>
        <ID>Quote1</ID>
        <Language>English</Language>
        <CoverageOverride>None</CoverageOverride>
        <NoMVD>N</NoMVD>
${vehiclesXml}
${driversXml}
      </QuoteInfo>
    </Auto>
  </CodeNames>
</FortusTransaction>`;
};

/**
 * Build driver profile XML
 * @param {object} driver - Driver information
 * @returns {string} - Driver profile XML
 */
const buildDriverProfile = (driver) => {
  const {
    id,
    birthdate,
    gender,
    maritalStatus = 'S',
    licenseDate,
    licenseClass = 'G',
    dateContinuousInsurance,
    relationshipToApplicant = 'Applicant',
    claims = [],
    convictions = [],
  } = driver;

  const claimsXml = claims.map(buildClaim).join('\n');
  const convictionsXml = convictions.map(buildConviction).join('\n');

  return `        <DriverProfile>
          <ID>${id}</ID>
          <Birthdate>${birthdate}</Birthdate>
          <Gender>${gender}</Gender>
          <MaritalStatus>${maritalStatus}</MaritalStatus>
          <RelationshipToApplicant>${relationshipToApplicant}</RelationshipToApplicant>
          <DriverLicense>
            <ID>${id}License</ID>
            <LicenseClass>${licenseClass}</LicenseClass>
            <LicenseDate>${licenseDate}</LicenseDate>
          </DriverLicense>
          ${dateContinuousInsurance ? `<DateContinuousInsurance>${dateContinuousInsurance}</DateContinuousInsurance>` : ''}
${claimsXml}
${convictionsXml}
        </DriverProfile>`;
};

/**
 * Build vehicle XML
 * @param {object} vehicle - Vehicle information
 * @returns {string} - Vehicle XML
 */
const buildVehicle = (vehicle) => {
  const {
    id,
    year,
    viccCode,
    vehicleType = 'Private Passenger',
    vehicleUse = 'Pleasure',
    distanceYearly = 20000,
    postalCode,
    location,
    coverages = [],
  } = vehicle;

  const coveragesXml = coverages.map(buildCoverage).join('\n');

  return `        <Vehicle>
          <ID>${id}</ID>
          <Year>${year}</Year>
          <VICCCode>${viccCode}</VICCCode>
          <VehType>${vehicleType}</VehType>
          <VehUse>${vehicleUse}</VehUse>
          <DistanceYearly>${distanceYearly}</DistanceYearly>
          ${postalCode ? `<PostalCode>${postalCode}</PostalCode>` : ''}
          ${location ? `<Location>${location}</Location>` : ''}
          <MVDOverride>N</MVDOverride>
${coveragesXml}
        </Vehicle>`;
};

/**
 * Build coverage XML
 * @param {object} coverage - Coverage information
 * @returns {string} - Coverage XML
 */
const buildCoverage = (coverage) => {
  const { id, csioCode, limit1, limit2, deductible } = coverage;

  return `          <Coverage>
            <ID>${id}</ID>
            <CSIOCode>${csioCode}</CSIOCode>
            ${limit1 ? `<Limit1>${limit1}</Limit1>` : ''}
            ${limit2 ? `<Limit2>${limit2}</Limit2>` : ''}
            ${deductible !== undefined ? `<Deductible>${deductible}</Deductible>` : ''}
          </Coverage>`;
};

/**
 * Build claim XML
 * @param {object} claim - Claim information
 * @returns {string} - Claim XML
 */
const buildClaim = (claim) => {
  const { id, date, type, amount } = claim;

  return `          <Claim>
            <ID>${id}</ID>
            <ClaimDate>${date}</ClaimDate>
            <ClaimType>${type}</ClaimType>
            ${amount ? `<Amount>${amount}</Amount>` : ''}
          </Claim>`;
};

/**
 * Build conviction XML
 * @param {object} conviction - Conviction information
 * @returns {string} - Conviction XML
 */
const buildConviction = (conviction) => {
  const { id, date, type } = conviction;

  return `          <Conviction>
            <ID>${id}</ID>
            <ConvictionDate>${date}</ConvictionDate>
            <ConvictionType>${type}</ConvictionType>
          </Conviction>`;
};

/**
 * Escape XML special characters
 * @param {string} str - String to escape
 * @returns {string} - Escaped string
 */
const escapeXml = (str) => {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
};

module.exports = {
  buildQuoteSoapEnvelope,
  buildAutoFortusTransaction,
  buildDriverProfile,
  buildVehicle,
  buildCoverage,
  buildClaim,
  buildConviction,
  escapeXml,
};
