// geo.js — India-wide pin code geography. No network needed: every 6-digit pin
// resolves to a state (from its first 2–3 digits) and an approximate point.
// Live refinement (OpenStreetMap Nominatim) is opt-in and cached; see refinePins().

// ---- Cities the brand already knows well (test data uses the Karnataka ones) ----
export const CITIES = {
  'bengaluru':        { name: 'Bengaluru', state: 'Karnataka', prefix: ['560', '562'], tier: 1, lat: 12.9716, lng: 77.5946, spreadKm: 11 },
  'mysuru':           { name: 'Mysuru', state: 'Karnataka', prefix: ['570', '571'], tier: 2, lat: 12.2958, lng: 76.6394, spreadKm: 5 },
  'mangaluru':        { name: 'Mangaluru', state: 'Karnataka', prefix: ['575', '574'], tier: 2, lat: 12.9141, lng: 74.8560, spreadKm: 5 },
  'hubballi-dharwad': { name: 'Hubballi-Dharwad', state: 'Karnataka', prefix: ['580'], tier: 2, lat: 15.3647, lng: 75.1240, spreadKm: 6 },
  'belagavi':         { name: 'Belagavi', state: 'Karnataka', prefix: ['590'], tier: 2, lat: 15.8497, lng: 74.4977, spreadKm: 5 },
  'tumakuru':         { name: 'Tumakuru', state: 'Karnataka', prefix: ['572'], tier: 3, lat: 13.3409, lng: 77.1010, spreadKm: 4 },
  'davanagere':       { name: 'Davanagere', state: 'Karnataka', prefix: ['577'], tier: 3, lat: 14.4644, lng: 75.9218, spreadKm: 4 },
  // Beyond Karnataka — so any territory in India can be planned
  'delhi':            { name: 'Delhi', state: 'Delhi', prefix: ['110'], tier: 1, lat: 28.6139, lng: 77.2090, spreadKm: 14 },
  'mumbai':           { name: 'Mumbai', state: 'Maharashtra', prefix: ['400'], tier: 1, lat: 19.0760, lng: 72.8777, spreadKm: 13 },
  'chennai':          { name: 'Chennai', state: 'Tamil Nadu', prefix: ['600'], tier: 1, lat: 13.0827, lng: 80.2707, spreadKm: 11 },
  'kolkata':          { name: 'Kolkata', state: 'West Bengal', prefix: ['700'], tier: 1, lat: 22.5726, lng: 88.3639, spreadKm: 10 },
  'hyderabad':        { name: 'Hyderabad', state: 'Telangana', prefix: ['500'], tier: 1, lat: 17.3850, lng: 78.4867, spreadKm: 12 },
  'pune':             { name: 'Pune', state: 'Maharashtra', prefix: ['411', '412'], tier: 1, lat: 18.5204, lng: 73.8567, spreadKm: 10 },
  'ahmedabad':        { name: 'Ahmedabad', state: 'Gujarat', prefix: ['380', '382'], tier: 1, lat: 23.0225, lng: 72.5714, spreadKm: 10 },
  'gurugram':         { name: 'Gurugram', state: 'Haryana', prefix: ['122'], tier: 1, lat: 28.4595, lng: 77.0266, spreadKm: 8 },
  'noida':            { name: 'Noida', state: 'Uttar Pradesh', prefix: ['2013'], tier: 1, lat: 28.5355, lng: 77.3910, spreadKm: 8 },
  'jaipur':           { name: 'Jaipur', state: 'Rajasthan', prefix: ['302', '303'], tier: 2, lat: 26.9124, lng: 75.7873, spreadKm: 8 },
  'lucknow':          { name: 'Lucknow', state: 'Uttar Pradesh', prefix: ['226', '227'], tier: 2, lat: 26.8467, lng: 80.9462, spreadKm: 8 },
  'kochi':            { name: 'Kochi', state: 'Kerala', prefix: ['682', '683'], tier: 2, lat: 9.9312, lng: 76.2673, spreadKm: 7 },
  'thiruvananthapuram': { name: 'Thiruvananthapuram', state: 'Kerala', prefix: ['695'], tier: 2, lat: 8.5241, lng: 76.9366, spreadKm: 6 },
  'coimbatore':       { name: 'Coimbatore', state: 'Tamil Nadu', prefix: ['641'], tier: 2, lat: 11.0168, lng: 76.9558, spreadKm: 7 },
  'madurai':          { name: 'Madurai', state: 'Tamil Nadu', prefix: ['625'], tier: 2, lat: 9.9252, lng: 78.1198, spreadKm: 6 },
  'chandigarh':       { name: 'Chandigarh', state: 'Chandigarh', prefix: ['160'], tier: 2, lat: 30.7333, lng: 76.7794, spreadKm: 6 },
  'indore':           { name: 'Indore', state: 'Madhya Pradesh', prefix: ['452'], tier: 2, lat: 22.7196, lng: 75.8577, spreadKm: 7 },
  'bhopal':           { name: 'Bhopal', state: 'Madhya Pradesh', prefix: ['462'], tier: 2, lat: 23.2599, lng: 77.4126, spreadKm: 7 },
  'nagpur':           { name: 'Nagpur', state: 'Maharashtra', prefix: ['440'], tier: 2, lat: 21.1458, lng: 79.0882, spreadKm: 7 },
  'surat':            { name: 'Surat', state: 'Gujarat', prefix: ['394', '395'], tier: 2, lat: 21.1702, lng: 72.8311, spreadKm: 7 },
  'vadodara':         { name: 'Vadodara', state: 'Gujarat', prefix: ['390', '391'], tier: 2, lat: 22.3072, lng: 73.1812, spreadKm: 6 },
  'visakhapatnam':    { name: 'Visakhapatnam', state: 'Andhra Pradesh', prefix: ['530'], tier: 2, lat: 17.6868, lng: 83.2185, spreadKm: 7 },
  'vijayawada':       { name: 'Vijayawada', state: 'Andhra Pradesh', prefix: ['520', '521'], tier: 2, lat: 16.5062, lng: 80.6480, spreadKm: 6 },
  'bhubaneswar':      { name: 'Bhubaneswar', state: 'Odisha', prefix: ['751'], tier: 2, lat: 20.2961, lng: 85.8245, spreadKm: 6 },
  'patna':            { name: 'Patna', state: 'Bihar', prefix: ['800'], tier: 2, lat: 25.5941, lng: 85.1376, spreadKm: 6 },
  'guwahati':         { name: 'Guwahati', state: 'Assam', prefix: ['781'], tier: 2, lat: 26.1445, lng: 91.7362, spreadKm: 6 },
  'ranchi':           { name: 'Ranchi', state: 'Jharkhand', prefix: ['834'], tier: 2, lat: 23.3441, lng: 85.3096, spreadKm: 6 },
  'dehradun':         { name: 'Dehradun', state: 'Uttarakhand', prefix: ['248'], tier: 2, lat: 30.3165, lng: 78.0322, spreadKm: 5 },
  'ludhiana':         { name: 'Ludhiana', state: 'Punjab', prefix: ['141'], tier: 2, lat: 30.9010, lng: 75.8573, spreadKm: 6 },
  'raipur':           { name: 'Raipur', state: 'Chhattisgarh', prefix: ['492'], tier: 2, lat: 21.2514, lng: 81.6296, spreadKm: 6 },
  'kanpur':           { name: 'Kanpur', state: 'Uttar Pradesh', prefix: ['208'], tier: 2, lat: 26.4499, lng: 80.3319, spreadKm: 7 },
  'varanasi':         { name: 'Varanasi', state: 'Uttar Pradesh', prefix: ['221'], tier: 3, lat: 25.3176, lng: 82.9739, spreadKm: 5 },
  'agra':             { name: 'Agra', state: 'Uttar Pradesh', prefix: ['282'], tier: 3, lat: 27.1767, lng: 78.0081, spreadKm: 5 },
  'goa':              { name: 'Goa', state: 'Goa', prefix: ['403'], tier: 3, lat: 15.4909, lng: 73.8278, spreadKm: 12 },
  // More of India: state capitals and large cities (prefixes avoid the case's Karnataka list)
  'ghaziabad':        { name: 'Ghaziabad', state: 'Uttar Pradesh', prefix: ['2010', '2012'], tier: 2, lat: 28.6692, lng: 77.4538, spreadKm: 7 },
  'faridabad':        { name: 'Faridabad', state: 'Haryana', prefix: ['121'], tier: 2, lat: 28.4089, lng: 77.3178, spreadKm: 7 },
  'jodhpur':          { name: 'Jodhpur', state: 'Rajasthan', prefix: ['342'], tier: 3, lat: 26.2389, lng: 73.0243, spreadKm: 6 },
  'udaipur':          { name: 'Udaipur', state: 'Rajasthan', prefix: ['313'], tier: 3, lat: 24.5854, lng: 73.7125, spreadKm: 5 },
  'kota':             { name: 'Kota', state: 'Rajasthan', prefix: ['324'], tier: 3, lat: 25.2138, lng: 75.8648, spreadKm: 5 },
  'ajmer':            { name: 'Ajmer', state: 'Rajasthan', prefix: ['305'], tier: 3, lat: 26.4499, lng: 74.6399, spreadKm: 4 },
  'bikaner':          { name: 'Bikaner', state: 'Rajasthan', prefix: ['334'], tier: 3, lat: 28.0229, lng: 73.3119, spreadKm: 4 },
  'prayagraj':        { name: 'Prayagraj', state: 'Uttar Pradesh', prefix: ['211'], tier: 2, lat: 25.4358, lng: 81.8463, spreadKm: 6 },
  'meerut':           { name: 'Meerut', state: 'Uttar Pradesh', prefix: ['250'], tier: 2, lat: 28.9845, lng: 77.7064, spreadKm: 5 },
  'bareilly':         { name: 'Bareilly', state: 'Uttar Pradesh', prefix: ['243'], tier: 3, lat: 28.3670, lng: 79.4304, spreadKm: 5 },
  'aligarh':          { name: 'Aligarh', state: 'Uttar Pradesh', prefix: ['202'], tier: 3, lat: 27.8974, lng: 78.0880, spreadKm: 4 },
  'gorakhpur':        { name: 'Gorakhpur', state: 'Uttar Pradesh', prefix: ['273'], tier: 3, lat: 26.7606, lng: 83.3732, spreadKm: 5 },
  'moradabad':        { name: 'Moradabad', state: 'Uttar Pradesh', prefix: ['244'], tier: 3, lat: 28.8386, lng: 78.7733, spreadKm: 4 },
  'haridwar':         { name: 'Haridwar', state: 'Uttarakhand', prefix: ['249'], tier: 3, lat: 29.9457, lng: 78.1642, spreadKm: 4 },
  'amritsar':         { name: 'Amritsar', state: 'Punjab', prefix: ['143'], tier: 2, lat: 31.6340, lng: 74.8723, spreadKm: 5 },
  'jalandhar':        { name: 'Jalandhar', state: 'Punjab', prefix: ['144'], tier: 2, lat: 31.3260, lng: 75.5762, spreadKm: 5 },
  'patiala':          { name: 'Patiala', state: 'Punjab', prefix: ['147'], tier: 3, lat: 30.3398, lng: 76.3869, spreadKm: 4 },
  'shimla':           { name: 'Shimla', state: 'Himachal Pradesh', prefix: ['171'], tier: 3, lat: 31.1048, lng: 77.1734, spreadKm: 4 },
  'jammu':            { name: 'Jammu', state: 'Jammu & Kashmir', prefix: ['180'], tier: 2, lat: 32.7266, lng: 74.8570, spreadKm: 5 },
  'srinagar':         { name: 'Srinagar', state: 'Jammu & Kashmir', prefix: ['190'], tier: 2, lat: 34.0837, lng: 74.7973, spreadKm: 5 },
  'rajkot':           { name: 'Rajkot', state: 'Gujarat', prefix: ['360'], tier: 2, lat: 22.3039, lng: 70.8022, spreadKm: 6 },
  'bhavnagar':        { name: 'Bhavnagar', state: 'Gujarat', prefix: ['364'], tier: 3, lat: 21.7645, lng: 72.1519, spreadKm: 4 },
  'jamnagar':         { name: 'Jamnagar', state: 'Gujarat', prefix: ['361'], tier: 3, lat: 22.4707, lng: 70.0577, spreadKm: 4 },
  'nashik':           { name: 'Nashik', state: 'Maharashtra', prefix: ['422'], tier: 2, lat: 19.9975, lng: 73.7898, spreadKm: 6 },
  'aurangabad':       { name: 'Chhatrapati Sambhajinagar', state: 'Maharashtra', prefix: ['431'], tier: 2, lat: 19.8762, lng: 75.3433, spreadKm: 6 },
  'solapur':          { name: 'Solapur', state: 'Maharashtra', prefix: ['413'], tier: 3, lat: 17.6599, lng: 75.9064, spreadKm: 5 },
  'kolhapur':         { name: 'Kolhapur', state: 'Maharashtra', prefix: ['416'], tier: 3, lat: 16.7050, lng: 74.2433, spreadKm: 5 },
  'amravati':         { name: 'Amravati', state: 'Maharashtra', prefix: ['444'], tier: 3, lat: 20.9374, lng: 77.7796, spreadKm: 5 },
  'jabalpur':         { name: 'Jabalpur', state: 'Madhya Pradesh', prefix: ['482'], tier: 2, lat: 23.1815, lng: 79.9864, spreadKm: 6 },
  'gwalior':          { name: 'Gwalior', state: 'Madhya Pradesh', prefix: ['474'], tier: 2, lat: 26.2183, lng: 78.1828, spreadKm: 6 },
  'ujjain':           { name: 'Ujjain', state: 'Madhya Pradesh', prefix: ['456'], tier: 3, lat: 23.1765, lng: 75.7885, spreadKm: 4 },
  'bilaspur':         { name: 'Bilaspur', state: 'Chhattisgarh', prefix: ['495'], tier: 3, lat: 22.0797, lng: 82.1409, spreadKm: 4 },
  'warangal':         { name: 'Warangal', state: 'Telangana', prefix: ['506'], tier: 3, lat: 17.9689, lng: 79.5941, spreadKm: 5 },
  'guntur':           { name: 'Guntur', state: 'Andhra Pradesh', prefix: ['522'], tier: 3, lat: 16.3067, lng: 80.4365, spreadKm: 5 },
  'tirupati':         { name: 'Tirupati', state: 'Andhra Pradesh', prefix: ['517'], tier: 3, lat: 13.6288, lng: 79.4192, spreadKm: 4 },
  'nellore':          { name: 'Nellore', state: 'Andhra Pradesh', prefix: ['524'], tier: 3, lat: 14.4426, lng: 79.9865, spreadKm: 4 },
  'kalaburagi':       { name: 'Kalaburagi', state: 'Karnataka', prefix: ['585'], tier: 3, lat: 17.3297, lng: 76.8343, spreadKm: 4 },
  'ballari':          { name: 'Ballari', state: 'Karnataka', prefix: ['583'], tier: 3, lat: 15.1394, lng: 76.9214, spreadKm: 4 },
  'hassan':           { name: 'Hassan', state: 'Karnataka', prefix: ['573'], tier: 3, lat: 13.0072, lng: 76.0962, spreadKm: 4 },
  'udupi':            { name: 'Udupi', state: 'Karnataka', prefix: ['576'], tier: 3, lat: 13.3409, lng: 74.7421, spreadKm: 4 },
  'vijayapura':       { name: 'Vijayapura', state: 'Karnataka', prefix: ['586'], tier: 3, lat: 16.8302, lng: 75.7100, spreadKm: 4 },
  'kozhikode':        { name: 'Kozhikode', state: 'Kerala', prefix: ['673'], tier: 2, lat: 11.2588, lng: 75.7804, spreadKm: 5 },
  'thrissur':         { name: 'Thrissur', state: 'Kerala', prefix: ['680'], tier: 3, lat: 10.5276, lng: 76.2144, spreadKm: 4 },
  'kollam':           { name: 'Kollam', state: 'Kerala', prefix: ['691'], tier: 3, lat: 8.8932, lng: 76.6141, spreadKm: 4 },
  'tiruchirappalli':  { name: 'Tiruchirappalli', state: 'Tamil Nadu', prefix: ['620'], tier: 2, lat: 10.7905, lng: 78.7047, spreadKm: 5 },
  'salem':            { name: 'Salem', state: 'Tamil Nadu', prefix: ['636'], tier: 2, lat: 11.6643, lng: 78.1460, spreadKm: 5 },
  'tirunelveli':      { name: 'Tirunelveli', state: 'Tamil Nadu', prefix: ['627'], tier: 3, lat: 8.7139, lng: 77.7567, spreadKm: 4 },
  'vellore':          { name: 'Vellore', state: 'Tamil Nadu', prefix: ['632'], tier: 3, lat: 12.9165, lng: 79.1325, spreadKm: 4 },
  'erode':            { name: 'Erode', state: 'Tamil Nadu', prefix: ['638'], tier: 3, lat: 11.3410, lng: 77.7172, spreadKm: 4 },
  'puducherry':       { name: 'Puducherry', state: 'Puducherry', prefix: ['605'], tier: 3, lat: 11.9416, lng: 79.8083, spreadKm: 4 },
  'howrah':           { name: 'Howrah', state: 'West Bengal', prefix: ['711'], tier: 2, lat: 22.5958, lng: 88.2636, spreadKm: 5 },
  'durgapur':         { name: 'Durgapur', state: 'West Bengal', prefix: ['713'], tier: 3, lat: 23.5204, lng: 87.3119, spreadKm: 5 },
  'siliguri':         { name: 'Siliguri', state: 'West Bengal', prefix: ['734'], tier: 3, lat: 26.7271, lng: 88.3953, spreadKm: 5 },
  'cuttack':          { name: 'Cuttack', state: 'Odisha', prefix: ['753'], tier: 3, lat: 20.4625, lng: 85.8830, spreadKm: 4 },
  'gaya':             { name: 'Gaya', state: 'Bihar', prefix: ['823'], tier: 3, lat: 24.7914, lng: 85.0002, spreadKm: 4 },
  'jamshedpur':       { name: 'Jamshedpur', state: 'Jharkhand', prefix: ['831'], tier: 2, lat: 22.8046, lng: 86.2029, spreadKm: 5 },
  'dhanbad':          { name: 'Dhanbad', state: 'Jharkhand', prefix: ['826'], tier: 3, lat: 23.7957, lng: 86.4304, spreadKm: 4 },
  'shillong':         { name: 'Shillong', state: 'Meghalaya', prefix: ['793'], tier: 3, lat: 25.5788, lng: 91.8933, spreadKm: 4 },
  'imphal':           { name: 'Imphal', state: 'Manipur', prefix: ['795'], tier: 3, lat: 24.8170, lng: 93.9368, spreadKm: 4 },
  'agartala':         { name: 'Agartala', state: 'Tripura', prefix: ['799'], tier: 3, lat: 23.8315, lng: 91.2868, spreadKm: 4 },
  'aizawl':           { name: 'Aizawl', state: 'Mizoram', prefix: ['796'], tier: 3, lat: 23.7271, lng: 92.7176, spreadKm: 4 },
  'kohima':           { name: 'Kohima', state: 'Nagaland', prefix: ['797'], tier: 3, lat: 25.6751, lng: 94.1086, spreadKm: 4 },
  'itanagar':         { name: 'Itanagar', state: 'Arunachal Pradesh', prefix: ['791'], tier: 3, lat: 27.0844, lng: 93.6053, spreadKm: 4 },
  'gangtok':          { name: 'Gangtok', state: 'Sikkim', prefix: ['737'], tier: 3, lat: 27.3314, lng: 88.6138, spreadKm: 4 },
};


// Approximate points for pins we know well (existing stores, central areas).
// Everything else is placed deterministically around its city centre.
const KNOWN_PINS = {
  '560001': [12.9756, 77.6050], '560002': [12.9640, 77.5770], '560003': [13.0040, 77.5700],
  '560004': [12.9420, 77.5730], '560008': [12.9880, 77.6230], '560010': [12.9900, 77.5530],
  '560011': [12.9300, 77.5830], '560017': [12.9580, 77.6600], '560025': [12.9680, 77.6000],
  '560034': [12.9352, 77.6245], '560037': [12.9560, 77.7010], '560038': [12.9784, 77.6408],
  '560041': [12.9250, 77.5940], '560043': [13.0270, 77.6400], '560047': [12.9520, 77.6100],
  '560066': [12.9698, 77.7500], '560068': [12.9010, 77.6240], '560070': [12.9250, 77.5560],
  '560076': [12.8890, 77.5970], '560078': [12.9080, 77.5850], '560085': [12.9260, 77.5470],
  '560095': [12.9370, 77.6250], '560100': [12.8450, 77.6600], '560102': [12.9110, 77.6450],
  '560103': [12.9260, 77.6810],
  '570001': [12.3080, 76.6520], '570009': [12.2860, 76.6220], '570017': [12.3260, 76.6180],
  '575001': [12.8700, 74.8430], '580020': [15.3500, 75.1380], '590001': [15.8600, 74.5100],
  '572101': [13.3400, 77.1000], '577001': [14.4660, 75.9230],
};

// First two digits of a pin → postal state. Three-digit overrides first.
const PIN3_STATE = {
  '781': 'Assam', '782': 'Assam', '783': 'Assam', '784': 'Assam', '785': 'Assam', '786': 'Assam', '787': 'Assam', '788': 'Assam',
  '403': 'Goa', '605': 'Puducherry', '737': 'Sikkim', '744': 'Andaman & Nicobar', '682': 'Kerala',
  '160': 'Chandigarh', '194': 'Ladakh', '790': 'Arunachal Pradesh', '791': 'Arunachal Pradesh', '792': 'Arunachal Pradesh',
  '793': 'Meghalaya', '794': 'Meghalaya', '795': 'Manipur', '796': 'Mizoram', '797': 'Nagaland', '798': 'Nagaland', '799': 'Tripura',
  '246': 'Uttarakhand', '247': 'Uttarakhand', '248': 'Uttarakhand', '249': 'Uttarakhand', '262': 'Uttarakhand', '263': 'Uttarakhand',
  '396': 'Gujarat', '362': 'Gujarat',
};
const PIN2_STATE = {
  '11': 'Delhi', '12': 'Haryana', '13': 'Haryana', '14': 'Punjab', '15': 'Punjab', '16': 'Punjab', '17': 'Himachal Pradesh',
  '18': 'Jammu & Kashmir', '19': 'Jammu & Kashmir', '20': 'Uttar Pradesh', '21': 'Uttar Pradesh', '22': 'Uttar Pradesh',
  '23': 'Uttar Pradesh', '24': 'Uttar Pradesh', '25': 'Uttar Pradesh', '26': 'Uttar Pradesh', '27': 'Uttar Pradesh', '28': 'Uttar Pradesh',
  '30': 'Rajasthan', '31': 'Rajasthan', '32': 'Rajasthan', '33': 'Rajasthan', '34': 'Rajasthan',
  '36': 'Gujarat', '37': 'Gujarat', '38': 'Gujarat', '39': 'Gujarat',
  '40': 'Maharashtra', '41': 'Maharashtra', '42': 'Maharashtra', '43': 'Maharashtra', '44': 'Maharashtra',
  '45': 'Madhya Pradesh', '46': 'Madhya Pradesh', '47': 'Madhya Pradesh', '48': 'Madhya Pradesh', '49': 'Chhattisgarh',
  '50': 'Telangana', '51': 'Andhra Pradesh', '52': 'Andhra Pradesh', '53': 'Andhra Pradesh',
  '56': 'Karnataka', '57': 'Karnataka', '58': 'Karnataka', '59': 'Karnataka',
  '60': 'Tamil Nadu', '61': 'Tamil Nadu', '62': 'Tamil Nadu', '63': 'Tamil Nadu', '64': 'Tamil Nadu',
  '67': 'Kerala', '68': 'Kerala', '69': 'Kerala',
  '70': 'West Bengal', '71': 'West Bengal', '72': 'West Bengal', '73': 'West Bengal', '74': 'West Bengal',
  '75': 'Odisha', '76': 'Odisha', '77': 'Odisha', '78': 'Assam', '79': 'North East',
  '80': 'Bihar', '81': 'Jharkhand', '82': 'Jharkhand', '83': 'Jharkhand', '84': 'Bihar', '85': 'Bihar',
};
const STATE_CENTRE = {
  'Delhi': [28.61, 77.21], 'Haryana': [29.06, 76.08], 'Punjab': [31.15, 75.34], 'Himachal Pradesh': [31.10, 77.17],
  'Jammu & Kashmir': [33.78, 76.58], 'Ladakh': [34.15, 77.58], 'Uttar Pradesh': [26.85, 80.95], 'Uttarakhand': [30.07, 79.02],
  'Rajasthan': [26.91, 75.79], 'Gujarat': [22.26, 71.19], 'Maharashtra': [19.75, 75.71], 'Goa': [15.30, 74.12],
  'Madhya Pradesh': [22.97, 78.66], 'Chhattisgarh': [21.28, 81.87], 'Telangana': [17.39, 78.49], 'Andhra Pradesh': [15.91, 79.74],
  'Karnataka': [15.32, 75.71], 'Tamil Nadu': [11.13, 78.66], 'Puducherry': [11.94, 79.81], 'Kerala': [10.85, 76.27],
  'West Bengal': [22.99, 87.85], 'Sikkim': [27.53, 88.51], 'Andaman & Nicobar': [11.62, 92.73], 'Odisha': [20.95, 85.10],
  'Assam': [26.20, 92.94], 'North East': [25.47, 93.0], 'Arunachal Pradesh': [28.22, 94.73], 'Meghalaya': [25.47, 91.37],
  'Manipur': [24.66, 93.91], 'Mizoram': [23.16, 92.94], 'Nagaland': [26.16, 94.56], 'Tripura': [23.94, 91.99],
  'Bihar': [25.10, 85.31], 'Jharkhand': [23.61, 85.28], 'Chandigarh': [30.73, 76.78],
};

const METROS = ['delhi', 'mumbai', 'chennai', 'kolkata', 'hyderabad', 'bengaluru', 'pune', 'ahmedabad', 'gurugram', 'noida'];

export function cityKey(name) {
  const k = String(name || '').trim().toLowerCase().replace(/\s+/g, ' ')
    .replace('bangalore', 'bengaluru').replace('mysore', 'mysuru').replace('mangalore', 'mangaluru')
    .replace('hubli-dharwad', 'hubballi-dharwad').replace('hubballi dharwad', 'hubballi-dharwad').replace(/^hubli$|^hubballi$|^dharwad$/, 'hubballi-dharwad')
    .replace('belgaum', 'belagavi').replace('tumkur', 'tumakuru').replace('davangere', 'davanagere')
    .replace('new delhi', 'delhi').replace('gurgaon', 'gurugram').replace('bombay', 'mumbai').replace('madras', 'chennai')
    .replace('calcutta', 'kolkata').replace('trivandrum', 'thiruvananthapuram').replace('cochin', 'kochi').replace('vizag', 'visakhapatnam')
    .replace('allahabad', 'prayagraj').replace('calicut', 'kozhikode').replace('trichy', 'tiruchirappalli').replace('pondicherry', 'puducherry')
    .replace('gulbarga', 'kalaburagi').replace('bellary', 'ballari').replace('bijapur', 'vijayapura').replace('sambhajinagar', 'aurangabad').replace('chhatrapati aurangabad', 'aurangabad')
    .replace(/^(ncr|delhi ncr|new delhi ncr)$/, 'delhi');
  return k;
}

export function cityInfo(name) { return CITIES[cityKey(name)] || null; }

export function cityForPin(pin) {
  const p = String(pin);
  let best = null, len = 0;
  for (const c of Object.values(CITIES)) for (const x of c.prefix) if (p.startsWith(x) && x.length > len) { best = c; len = x.length; }
  return best;
}
export const STATES = ['Andaman & Nicobar', 'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chandigarh', 'Chhattisgarh', 'Delhi', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jammu & Kashmir', 'Jharkhand', 'Karnataka', 'Kerala', 'Ladakh', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Puducherry', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal', 'Dadra & Nagar Haveli', 'Daman & Diu', 'Lakshadweep'];
const STATE_ALIAS = { 'new delhi': 'Delhi', 'nct of delhi': 'Delhi', 'orissa': 'Odisha', 'pondicherry': 'Puducherry', 'jammu and kashmir': 'Jammu & Kashmir', 'j&k': 'Jammu & Kashmir', 'andaman and nicobar': 'Andaman & Nicobar', 'uttaranchal': 'Uttarakhand', 'tamilnadu': 'Tamil Nadu', 'tn': 'Tamil Nadu', 'ka': 'Karnataka', 'mh': 'Maharashtra', 'up': 'Uttar Pradesh', 'ap': 'Andhra Pradesh', 'wb': 'West Bengal', 'mp': 'Madhya Pradesh' };
export function stateName(s) {
  const k = String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!k) return '';
  if (STATE_ALIAS[k]) return STATE_ALIAS[k];
  return STATES.find(x => x.toLowerCase() === k || x.toLowerCase().replace('&', 'and') === k) || '';
}

export function stateForPin(pin) {
  const p = String(pin);
  if (!/^\d{6}$/.test(p)) return null;
  return PIN3_STATE[p.slice(0, 3)] || PIN2_STATE[p.slice(0, 2)] || null;
}

// Fallback tier when the territory sheet does not give one
export function guessTier(cityName) {
  const k = cityKey(cityName);
  if (CITIES[k]) return CITIES[k].tier;
  return METROS.includes(k) ? 1 : 3;
}

// Small, stable hash so every pin gets the same jitter / proxy values on every run.
export function hash01(str, seed = 0) {
  let h = 2166136261 ^ seed;
  for (const ch of String(str)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15;
  return (h >>> 0) / 4294967295;
}

const liveCache = loadLiveCache();
function loadLiveCache() {
  try { return JSON.parse(globalThis.localStorage?.getItem('storesense.pins') || '{}'); } catch { return {}; }
}

// Approximate location for any Indian pin code.
export function pinPoint(pin, cityName) {
  const p = String(pin);
  if (liveCache[p]) return { lat: liveCache[p][0], lng: liveCache[p][1], source: 'live' };
  if (KNOWN_PINS[p]) return { lat: KNOWN_PINS[p][0], lng: KNOWN_PINS[p][1], source: 'known' };
  const city = cityInfo(cityName) || cityForPin(p);
  let lat, lng, spread;
  if (city) { lat = city.lat; lng = city.lng; spread = city.spreadKm; }
  else {
    const st = stateForPin(p);
    const c = STATE_CENTRE[st] || [21.0, 78.0];
    lat = c[0]; lng = c[1]; spread = 40;
  }
  const ang = hash01(p, 7) * Math.PI * 2;
  const r = Math.sqrt(hash01(p, 11)) * spread;
  return {
    lat: lat + (r * Math.sin(ang)) / 111,
    lng: lng + (r * Math.cos(ang)) / (111 * Math.cos(lat * Math.PI / 180)),
    source: 'estimated',
  };
}

export function km(a, b) {
  const R = 6371, toR = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toR, dLng = (b.lng - a.lng) * toR;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toR) * Math.cos(b.lat * toR) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// Opt-in live geocoding of pins via OpenStreetMap Nominatim (1 request/second, cached in this browser).
export async function refinePins(pins, onProgress) {
  const todo = [...new Set(pins.map(String))].filter(p => /^\d{6}$/.test(p) && !liveCache[p] && !KNOWN_PINS[p]);
  let done = 0;
  for (const p of todo) {
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/search?postalcode=${p}&country=India&format=json&limit=1`);
      const j = await r.json();
      if (j[0]) liveCache[p] = [+j[0].lat, +j[0].lon];
    } catch { /* keep the estimate */ }
    done++;
    onProgress?.(done, todo.length);
    await new Promise(res => setTimeout(res, 1100));
  }
  try { localStorage.setItem('storesense.pins', JSON.stringify(liveCache)); } catch { /* storage blocked */ }
  return todo.length;
}
