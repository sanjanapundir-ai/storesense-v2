// sample.js — a 200-application sample in exactly the judges' template layout,
// including messy, incomplete and contradictory rows. Deterministic (seeded).

const APP_HEADER = ['Application ID', 'Applicant name', 'City', 'State', 'Pin code', 'Investment capacity (₹ lakh)',
  'Retail experience (years)', 'Current / past business', 'Space available', 'Space size (sq ft)', 'Floor',
  'Target launch (months)', 'Preferred language', 'Notes from applicant'];
const TER_HEADER = ['Territory ID', 'City', 'State', 'Pin codes covered', 'City tier', 'Open slots', 'Priority'];
const STORE_HEADER = ['Store ID', 'City', 'Pin code', 'Opened (year)'];

export const SAMPLE_TERRITORIES = [
  ['TER-01', 'Bengaluru', 'Karnataka', '560034, 560095, 560102, 560068, 560047, 560030', 'Tier 1', 4, 'High'],
  ['TER-02', 'Bengaluru', 'Karnataka', '560038, 560008, 560017, 560075, 560093', 'Tier 1', 3, 'High'],
  ['TER-03', 'Bengaluru', 'Karnataka', '560066, 560037, 560048, 560103, 560087', 'Tier 1', 2, 'Medium'],
  ['TER-04', 'Bengaluru', 'Karnataka', '560076, 560078, 560070, 560085, 560041', 'Tier 1', 2, 'Medium'],
  ['TER-05', 'Bengaluru', 'Karnataka', '560010, 560003, 560055, 560086', 'Tier 1', 1, 'Low'],
  ['TER-06', 'Bengaluru', 'Karnataka', '560064, 560092, 560097, 560024', 'Tier 1', 2, 'High'],
  ['TER-07', 'Mysuru', 'Karnataka', '570001, 570002, 570008, 570009, 570010', 'Tier 2', 3, 'High'],
  ['TER-08', 'Mysuru', 'Karnataka', '570017, 570020, 570023, 570011', 'Tier 2', 1, 'Medium'],
  ['TER-09', 'Mangaluru', 'Karnataka', '575001, 575002, 575003, 575006', 'Tier 2', 2, 'Medium'],
  ['TER-10', 'Hubballi-Dharwad', 'Karnataka', '580020, 580021, 580029, 580001', 'Tier 2', 2, 'Medium'],
  ['TER-11', 'Belagavi', 'Karnataka', '590001, 590006, 590010', 'Tier 2', 1, 'Low'],
  ['TER-12', 'Tumakuru', 'Karnataka', '572101, 572102, 572103', 'Tier 3', 1, 'Medium'],
  ['TER-13', 'Davanagere', 'Karnataka', '577001, 577002, 577004', 'Tier 3', 1, 'Low'],
  ['TER-14', 'Mangaluru', 'Karnataka', '575004, 575008, 575013', 'Tier 2', 2, 'High'],
  ['TER-15', 'Belagavi', 'Karnataka', '590016, 590019', 'Tier 2', 0, 'Low'],
];

const STORES = [
  ['ST-01', 'Bengaluru', 560001, 2019], ['ST-02', 'Bengaluru', 560034, 2020], ['ST-03', 'Bengaluru', 560038, 2021],
  ['ST-04', 'Bengaluru', 560066, 2022], ['ST-05', 'Bengaluru', 560076, 2023], ['ST-06', 'Mysuru', 570009, 2021],
  ['ST-07', 'Mysuru', 570017, 2024], ['ST-08', 'Mangaluru', 575001, 2022], ['ST-09', 'Hubballi-Dharwad', 580020, 2023],
  ['ST-10', 'Belagavi', 590001, 2024],
];

// Hand-written rows that exercise every rule (the rest are generated)
const FIXED = [
  ['Ravi Kumar', 'Mysuru', 'Karnataka', 570002, 32, 4, 'Runs a footwear store', 'Rented', 450, 'Ground', 3, 'Kannada', 'Wants to open before Diwali'],
  ['Meera Shetty', 'Bengaluru', 'Karnataka', 560034, 55, 9, 'Store manager at a Bata franchise for 9 years', 'Owned', 700, 'Ground', 2, 'English', 'Ready to start immediately'],
  ['Arjun Rao', 'Bengaluru', 'Karnataka', 560095, 48, 6, 'Owns two mobile phone shops', 'Owned', 600, 'Ground', 1, 'Kannada', 'Shop is vacant, can open next month'],
  ['Fatima Begum', 'Mysuru', 'Karnataka', 570008, 28, 0, 'Homemaker', 'Not yet identified', '', 'Not known', 6, 'Hindi', 'Husband will help'],
  ['Suresh Gowda', 'Bengaluru', 'Karnataka', 570001, 40, 5, 'Apparel showroom owner', 'Rented', 500, 'Ground', 3, 'Kannada', ''],
  ['Lakshmi Narayan', 'Tumakuru', 'Karnataka', 572101, 18, 3, 'Runs a kirana store', 'Owned', 400, 'Ground', 2, 'Kannada', 'Family property on main road'],
  ['Deepak Jain', 'Bengaluru', 'Karnataka', 560102, '', 7, 'Electronics retail chain franchisee', 'Rented', 650, 'Ground', 3, 'Hindi', 'Waiting for loan sanction'],
  ['Kavya Hegde', 'Mangaluru', 'Karnataka', 575004, 30, 5, 'Managed an optical store for 5 years', 'Rented', 480, 'Ground', 2, 'English', ''],
  ['Imran Khan', 'Hubballi-Dharwad', 'Karnataka', 580021, 26, 2, 'Runs a garment shop', 'Not yet identified', '', 'Not known', 4, 'Hindi', 'Looking for space near the bus stand'],
  ['Priya Menon', 'Bengaluru', 'Karnataka', 560066, 60, 8, 'Franchise owner of a cosmetics brand', 'Owned', 900, 'Mall unit', 2, 'English', ''],
  ['Naveen Patil', 'Belagavi', 'Karnataka', 590006, 22, 1, 'Worked as cashier in a supermarket', 'Rented', 350, 'Upper', 5, 'Kannada', ''],
  ['Sanjay Reddy', 'Bengaluru', 'Karnataka', 560008, 40, 3, 'Ran an apparel shop for 3 years', 'Not yet identified', '', 'Not known', 4, 'English', 'Strong network in Indiranagar'],
  ['Anitha Kumari', 'Davanagere', 'Karnataka', 577002, 9, 0, 'Teacher', 'Not yet identified', '', 'Not known', 12, 'Kannada', ''],
  ['Vikram Singh', 'Bengaluru', 'Karnataka', 560043, 45, 6, 'Runs a shoe store in Hennur', 'Owned', 550, 'Ground', 2, 'Hindi', 'Can open quickly'],
  ['Rekha Pai', 'Mangaluru', 'Karnataka', 575005, 35, 7, 'Owns a jewellery store', 'Owned', 600, 'Ground', 3, 'English', ''],
  ['Mohan Das', 'Mysuru', 'Karnataka', 570010, 19, 2, 'Software engineer', 'Rented', 300, 'Upper', 6, 'English', ''],
  ['Shalini Iyer', 'Bengaluru', 'Karnataka', 560017, 41, 4, 'Managed a Titan watch showroom', 'Rented', 520, 'Ground', 3, 'English', ''],
  ['Ganesh Bhat', 'Bengaluru', 'Kerala', 560093, 38, 5, 'Runs a stationery shop', 'Owned', '', 'Ground', 2, 'Kannada', ''],
  ['Ramesh Naik', 'Hubballi-Dharwad', 'Karnataka', 580029, '30-40 lakh', '5 yrs', 'Mobile accessories shop', 'own shop', 500, 'GF', 3, 'Kannada', 'Wants to open before Dasara'],
  ['Ayesha Siddiqui', 'Bengaluru', 'Karnataka', 560075, 33, 3, 'Boutique owner', 'Owned', 450, 'Ground', 2, 'Hindi', 'Still looking for a bigger shop'],
  ['Kiran Kulkarni', 'Belagavi', 'Karnataka', 590016, 27, 6, 'Runs a footwear shop', 'Owned', 500, 'Ground', 2, 'Kannada', ''],
  ['Harish Shenoy', 'Mangaluru', 'Karnataka', 575008, 16, 3, 'Bakery owner', 'Rented', 300, 'Ground', 4, 'Kannada', ''],
];

const FIRST = ['Aarav', 'Abhishek', 'Aditi', 'Ajay', 'Akash', 'Amit', 'Ananya', 'Anil', 'Anjali', 'Ashok', 'Bhavana', 'Chandan', 'Chetan', 'Darshan', 'Divya', 'Ganesh', 'Gayathri', 'Girish', 'Harsha', 'Jagadish', 'Jyothi', 'Karthik', 'Keerthi', 'Kishore', 'Mahesh', 'Manjunath', 'Manoj', 'Nagaraj', 'Nandini', 'Nikhil', 'Pavan', 'Pooja', 'Prakash', 'Praveen', 'Raghu', 'Rahul', 'Rajesh', 'Ramya', 'Ranjitha', 'Rohit', 'Sahana', 'Santosh', 'Shilpa', 'Shivakumar', 'Shruti', 'Sneha', 'Srinivas', 'Sudha', 'Sunil', 'Swathi', 'Tejas', 'Uday', 'Varun', 'Vidya', 'Vinay', 'Yashoda', 'Zoya', 'Farhan', 'Joseph', 'Priscilla', 'Arshad', 'Nisha', 'Gopal'];
const LAST = ['Gowda', 'Rao', 'Shetty', 'Hegde', 'Patil', 'Kulkarni', 'Naik', 'Bhat', 'Reddy', 'Kumar', 'Murthy', 'Shenoy', 'Pai', 'Desai', 'Joshi', 'Iyer', 'Nair', 'Khan', 'Fernandes', 'Pinto', "D'Souza", 'Sharma', 'Jain', 'Prasad', 'Swamy'];
const BIZ = [
  'Runs a footwear store', 'Owns an apparel shop', 'Managed a supermarket for a retail chain', 'Runs a mobile phone shop',
  'Kirana store owner', 'Franchisee of a pharmacy chain', 'Runs a garment wholesale business', 'Restaurant owner',
  'Software engineer', 'Bank employee', 'Runs a travel agency', 'Owns an optical shop', 'Store manager at a fashion brand outlet',
  'Family runs a jewellery store', 'Teacher', 'Runs a beauty salon', 'Electronics showroom owner', 'Distributor for FMCG brands',
  'Homemaker', 'Retired government officer', 'Runs a gift and toy shop', 'Worked as floor supervisor at Reliance Trends',
  'Stationery and book store owner', 'Cafe owner', 'Civil contractor', 'Farmer', '', 'Runs a bakery and sweet shop',
  'Medical store owner', 'Owns a watch and accessories store',
];
const NOTES = ['', '', '', '', 'Wants to open before Diwali', 'Loan sanction in progress', 'Son will manage the store', 'Has a trusted shop manager',
  'Prefers a main-road location', 'Ready to invest more if needed', 'Can open within a month', 'Looking for a partner to co-invest',
  'Wants to open before Diwali', 'Space is on a busy market street', 'Will quit job to run the store', 'Interested in a second store later'];

function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

export function sampleSheets(count = 200, seed = 2026) {
  const r = rng(seed);
  const pick = a => a[Math.floor(r() * a.length)];
  const gauss = () => { let s = 0; for (let i = 0; i < 6; i++) s += r(); return s / 6 - 0.5; };
  const terPins = SAMPLE_TERRITORIES.map(t => ({ city: t[1], tier: +t[4].slice(-1), pins: t[3].split(', ') }));
  const extraPins = { Bengaluru: ['560011', '560043', '560025', '560004', '560100'], Mysuru: ['570004', '570015'], Mangaluru: ['575005', '575011'], 'Hubballi-Dharwad': ['580030', '580023'], Belagavi: ['590003', '590008'], Tumakuru: ['572104'], Davanagere: ['577005'] };
  const rows = [];
  FIXED.forEach((f, i) => rows.push([`APP-${String(i + 1).padStart(3, '0')}`, ...f]));
  while (rows.length < count) {
    const i = rows.length + 1;
    const ter = r() < 0.86 ? pick(r() < 0.55 ? terPins.slice(0, 5) : terPins.slice(6)) : null; // TER-06 left for fixed rows only (a lead gap)
    const city = ter ? ter.city : pick(Object.keys(extraPins));
    const tier = ter ? ter.tier : city === 'Bengaluru' ? 1 : ['Tumakuru', 'Davanagere'].includes(city) ? 3 : 2;
    let pin = ter ? pick(ter.pins) : pick(extraPins[city]);
    const base = { 1: 38, 2: 26, 3: 17 }[tier], sd = { 1: 30, 2: 20, 3: 14 }[tier];
    let invest = Math.max(4, Math.round(base + gauss() * sd));
    const exp = Math.max(0, Math.round((r() < 0.15 ? 0 : 1 + r() * 9) * (r() < 0.2 ? 1.4 : 1)));
    const space = pick(['Owned', 'Rented', 'Rented', 'Not yet identified', 'Not yet identified', 'Owned']);
    let size = space === 'Not yet identified' ? '' : 250 + Math.round(r() * 13) * 50;
    let floor = space === 'Not yet identified' ? 'Not known' : pick(['Ground', 'Ground', 'Ground', 'Upper', 'Mall unit']);
    const launch = pick([1, 2, 3, 3, 4, 6, 6, 9, 12]);
    const lang = pick(['Kannada', 'Kannada', 'English', 'English', 'Hindi']);
    let name = `${pick(FIRST)} ${pick(LAST)}`;
    let row = [`APP-${String(i).padStart(3, '0')}`, name, city, 'Karnataka', +pin, invest, exp, pick(BIZ), space, size, floor, launch, lang, pick(NOTES)];
    // Inject the kinds of mess judges will use
    const m = r();
    if (m < 0.03) row[5] = '';                                            // missing investment
    else if (m < 0.05) row[6] = '';                                       // missing experience
    else if (m < 0.08) row[5] = pick([`${invest} lakhs`, `₹ ${invest}L`, `${invest}-${invest + 10}`, invest * 100000]);
    else if (m < 0.11) row[8] = pick(['own shop', 'on rent', 'Looking', 'leased', 'not yet']);
    else if (m < 0.15 && space !== 'Not yet identified') row[9] = '';     // owned/rented without size
    else if (m < 0.17 && space === 'Not yet identified') { row[9] = 400; row[10] = 'Ground'; }
    else if (m < 0.19) { const other = pick(terPins.filter(t => t.city !== city)); row[4] = +pick(other.pins); } // pin in another city
    else if (m < 0.20) row[4] = String(pin).slice(0, 5);                  // 5-digit pin
    rows.push(row);
  }
  // A duplicate application (same person re-applied)
  const dupOf = rows[30];
  rows[count - 1] = [`APP-${String(count).padStart(3, '0')}`, ...dupOf.slice(1)];
  return {
    Applications: [APP_HEADER, ...rows],
    Territories: [TER_HEADER, ...SAMPLE_TERRITORIES],
    'Existing stores': [STORE_HEADER, ...STORES],
    Glossary: [['Sheet', 'Column', 'What it means'], ['Applications', 'Investment capacity (₹ lakh)', 'Total money the applicant can put into setting up the store. 1 lakh = ₹1,00,000.']],
  };
}
