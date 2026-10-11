/**
 * SecureByte — Complete Campus Incident Category Architecture
 *
 * Designed in compliance with:
 * - Indian National Anti-Ragging Guidelines (UGC / AICTE / Supreme Court Directives)
 * - University Campus Safety, Anti-Sexual Harassment (POSH Cell) Regulations
 * - Emergency Triage & First-Aid Response Procedures
 */

export const MASTER_CATEGORIES = [
  {
    id: 'RAGGING_BULLYING',
    label: 'Ragging & Student Bullying',
    icon: '🛑',
    color: '#DC2626',
    backendCategory: 'HARASSMENT',
    suggestedPriority: 'HIGH',
    isConfidentialRecommended: true,
    description: 'Zero-tolerance anti-ragging protection, physical abuse, psychological coercion & extortion.',
    subcategories: [
      'Boys ki ragging / Male student ragging',
      'Girls ki ragging / Female student ragging',
      'Senior-junior harassment / Fresher intimidation',
      'Physical ragging / Beating or assault',
      'Verbal abuse & humiliating language',
      'Mental harassment / Psychological intimidation',
      'Forced activities or degrading tasks',
      'Money demand / Financial extortion',
      'Hostel room confinement / Lock-in',
      'Threats & intimidation',
      'Group bullying & mob intimidation',
      'Online bullying / Cyber harassment',
      'Social exclusion & public shaming',
      'Ragging-related injury',
      'Witness reporting of ragging',
    ],
  },
  {
    id: 'SEXUAL_HARASSMENT',
    label: 'Sexual Harassment & Discrimination',
    icon: '🛡️',
    color: '#E11D48',
    backendCategory: 'HARASSMENT',
    suggestedPriority: 'HIGH',
    isConfidentialRecommended: true,
    description: 'Strictly confidential reporting: Women Grievance Cell, stalking, harassment & discrimination.',
    subcategories: [
      'Sexual harassment (Physical or Verbal)',
      'Unwanted touching or inappropriate contact',
      'Stalking / Repeatedly following on campus',
      'Voyeurism / Privacy violation',
      'Inappropriate messages, calls or online media',
      'Blackmail, extortion or coercion',
      'Gender-based discrimination',
      'Caste-based harassment or discrimination',
      'Religion, language or regional identity harassment',
      'Disability-related harassment',
      'Threats or assault related to discrimination',
    ],
  },
  {
    id: 'PHYSICAL_VIOLENCE',
    label: 'Physical Violence & Security Threats',
    icon: '🚨',
    color: '#B91C1C',
    backendCategory: 'SECURITY_THREAT',
    suggestedPriority: 'HIGH',
    isConfidentialRecommended: false,
    description: 'Immediate security response: physical clashes, weapons, trespassers & active unrest.',
    subcategories: [
      'Student fight / Group clash',
      'Physical assault',
      'Active threat of violence',
      'Weapon-related threat / Sharp object',
      'Attempted physical assault',
      'Unauthorized intruder on campus',
      'Suspicious person or threatening behaviour',
      'Wrongful restraint / Forced confinement',
      'Attempted abduction / Kidnapping',
      'Crowd violence / Campus unrest',
      'Threatening phone call or message',
      'Suspicious package or bomb threat',
      'Forced entry into hostel or classroom',
    ],
  },
  {
    id: 'MEDICAL_EMERGENCY',
    label: 'Medical Emergencies & First Aid',
    icon: '🏥',
    color: '#059669',
    backendCategory: 'MEDICAL_EMERGENCY',
    suggestedPriority: 'HIGH',
    isConfidentialRecommended: false,
    description: 'Direct link to BIT Sindri Dispensary & 24×7 campus ambulance dispatch.',
    subcategories: [
      'Road accident or vehicle collision',
      'Fall from stairs or height',
      'Head injury or concussion',
      'Severe bleeding / Deep wound',
      'Fracture or bone dislocation',
      'Unconsciousness / Fainting',
      'Seizure / Convulsion',
      'Breathing difficulty / Asthma attack',
      'Chest pain / Cardiac symptom',
      'Severe allergic reaction (Anaphylaxis)',
      'Burns or scalding',
      'Food poisoning / Chemical ingestion',
      'Heat exhaustion / Heatstroke',
      'Dehydration / Acute weakness',
      'Diabetic emergency',
      'Sudden severe illness',
      'Mental health crisis / Self-harm risk',
    ],
  },
  {
    id: 'FIRE_INFRASTRUCTURE',
    label: 'Fire, Electrical & Infrastructure',
    icon: '🔥',
    color: '#EA580C',
    backendCategory: 'FIRE_HAZARD',
    suggestedPriority: 'HIGH',
    isConfidentialRecommended: false,
    description: 'Fire outbreaks, gas leaks, structural collapse, electrical sparks & elevator traps.',
    subcategories: [
      'Building fire',
      'Hostel room fire',
      'Electrical short circuit / Sparking',
      'Electric shock hazard',
      'LPG / Gas cylinder leak',
      'Smoke detected in corridor or room',
      'Chemical spill or laboratory accident',
      'Lift / Elevator entrapment',
      'Ceiling collapse / Falling debris',
      'Building structural damage',
      'Severe waterlogging or flooding',
      'Blocked emergency fire exit',
    ],
  },
  {
    id: 'HOSTEL_SAFETY',
    label: 'Hostel & Residential Safety',
    icon: '🏠',
    color: '#D97706',
    backendCategory: 'FACILITY_CONCERN',
    suggestedPriority: 'MEDIUM',
    isConfidentialRecommended: false,
    description: 'Hostel warden alert: trespassers, room disputes, lock failures & common area safety.',
    subcategories: [
      'Unauthorized hostel entry / Trespasser',
      'Hostel room theft / Missing items',
      'Roommate threatening or volatile behavior',
      'Hostel floor / Mess brawl',
      'Harassment in common bathrooms or corridors',
      'Student missing from hostel room past curfew',
      'Suspicious activity around hostel perimeter',
      'Fire or gas alarm in hostel',
      'Lift or stairwell trap in hostel',
      'Damaged doors, locks or broken windows',
      'Unsafe building conditions in hostel',
    ],
  },
  {
    id: 'THEFT_PROPERTY',
    label: 'Theft, Property & Financial Fraud',
    icon: '💳',
    color: '#4B5563',
    backendCategory: 'SECURITY_THREAT',
    suggestedPriority: 'LOW',
    isConfidentialRecommended: false,
    description: 'Theft of electronics, bikes, wallets, UPI/payment scams & property damage.',
    subcategories: [
      'Mobile phone theft',
      'Laptop or electronic device theft',
      'Wallet, cash or ID card theft',
      'Bicycle or motorcycle theft',
      'Vehicle damage or tampering',
      'Campus property vandalism',
      'Lost property (Non-criminal recovery)',
      'UPI / QR code payment scam',
      'Online financial fraud or phishing',
      'Extortion or forced payment',
    ],
  },
  {
    id: 'TRANSPORT_ROAD',
    label: 'Transport, Traffic & Road Safety',
    icon: '🚦',
    color: '#2563EB',
    backendCategory: 'FACILITY_CONCERN',
    suggestedPriority: 'MEDIUM',
    isConfidentialRecommended: false,
    description: 'Campus road accidents, reckless driving, dark unlit pathways & night escort.',
    subcategories: [
      'Two-wheeler accident on campus road',
      'Pedestrian hit by vehicle',
      'Bicycle collision or fall',
      'Campus bus or van incident',
      'Reckless driving / Speeding inside campus',
      'Dangerous road pothole or broken pavement',
      'Unlit / Dark pedestrian pathway',
      'Student stranded late at night',
      'Vehicle breakdown needing assistance',
      'Emergency night security escort request',
    ],
  },
  {
    id: 'MISSING_WELFARE',
    label: 'Missing Person & Welfare Checks',
    icon: '🔎',
    color: '#7C3AED',
    backendCategory: 'SECURITY_THREAT',
    suggestedPriority: 'HIGH',
    isConfidentialRecommended: true,
    description: 'Welfare checks, students missing past curfew, or distressed students needing help.',
    subcategories: [
      'Missing student report',
      'Student not returning to hostel past curfew',
      'Welfare check requested by family',
      'Student appearing disoriented or distressed',
      'Student lost or unreachable on campus',
      'Vulnerable student needing assistance',
      'Emergency contact cannot reach student',
    ],
  },
  {
    id: 'ENVIRONMENTAL',
    label: 'Environmental & Natural Hazards',
    icon: '⛈️',
    color: '#0891B2',
    backendCategory: 'FACILITY_CONCERN',
    suggestedPriority: 'MEDIUM',
    isConfidentialRecommended: false,
    description: 'Flooding, lightning storms, extreme heat, fallen trees & environmental hazards.',
    subcategories: [
      'Severe rainfall & pathway flooding',
      'Lightning storm hazard',
      'Extreme heatwave / Sunstroke advisory',
      'Earthquake tremor',
      'Fallen large tree or branch blocking road',
      'Dangerous air quality or toxic smoke',
      'Crowd crush or stampede hazard',
    ],
  },
  {
    id: 'ACADEMIC_LAB',
    label: 'Academic, Lab & Event Safety',
    icon: '🔬',
    color: '#4F46E5',
    backendCategory: 'FACILITY_CONCERN',
    suggestedPriority: 'MEDIUM',
    isConfidentialRecommended: false,
    description: 'Chemical exposure, workshop machinery hazards, sports injuries & event crowding.',
    subcategories: [
      'Laboratory chemical exposure or reagent splash',
      'Workshop machinery malfunction',
      'High voltage / Electrical equipment hazard',
      'Sports ground injury / Gym accident',
      'Auditorium / Festival overcrowding',
      'Stage or tent collapse hazard',
      'Laboratory injury needing evacuation',
    ],
  },
  {
    id: 'CYBER_SAFETY',
    label: 'Digital Safety & Cyber Incidents',
    icon: '💻',
    color: '#6366F1',
    backendCategory: 'SECURITY_THREAT',
    suggestedPriority: 'MEDIUM',
    isConfidentialRecommended: true,
    description: 'Cyberbullying, account compromise, impersonation, non-consensual media & doxxing.',
    subcategories: [
      'Online cyberbullying or smear campaign',
      'Threatening social media messages',
      'Student account hacking / Credential theft',
      'Impersonation / Fake student profile',
      'Non-consensual image sharing',
      'Online blackmail / Cyber extortion',
      'Doxxing / Private data leak',
      'Phishing or fraudulent payment links',
    ],
  },
  {
    id: 'SAFETY_HAZARD',
    label: 'Suspicious Activity & Hazards',
    icon: '⚠️',
    color: '#F59E0B',
    backendCategory: 'FACILITY_CONCERN',
    suggestedPriority: 'LOW',
    isConfidentialRecommended: false,
    description: 'Preventive hazard reporting: broken locks, dark zones, unattended bags & missing gear.',
    subcategories: [
      'Suspicious unattended bag or package',
      'Unknown person in restricted or faculty area',
      'Broken gate, lock or boundary wall breach',
      'Dark unlit area or broken streetlights',
      'Malfunctioning or damaged CCTV camera',
      'Missing or discharged fire extinguisher',
      'Blocked ambulance or emergency access',
      'Open construction pit or sharp debris',
    ],
  },
  {
    id: 'OTHER_ASSISTANCE',
    label: 'Other & Emergency Assistance',
    icon: '📌',
    color: '#64748B',
    backendCategory: 'OTHER',
    suggestedPriority: 'MEDIUM',
    isConfidentialRecommended: false,
    description: 'Immediate security escort, first-aid support or non-emergency campus grievances.',
    subcategories: [
      'Student feels unsafe and requests escort',
      'Urgent on-duty security guard needed',
      'First-aid kit assistance needed',
      'Ambulance transport request',
      'General campus grievance',
      'Other emergency not listed',
    ],
  },
];

/**
 * Intelligent risk-based urgency engine.
 * Automatically recommends priority (HIGH / MEDIUM / LOW) based on subcategory keywords
 * while leaving final control to the reporter.
 */
export function getRecommendedPriority(masterCategory, subcategory) {
  const highRiskKeywords = [
    'beating',
    'assault',
    'weapon',
    'head injury',
    'unconsciousness',
    'fainting',
    'bleeding',
    'breathing',
    'cardiac',
    'chest pain',
    'fire',
    'short circuit',
    'electric shock',
    'gas leak',
    'entrapment',
    'abduction',
    'kidnapping',
    'confinement',
    'anaphylaxis',
    'self-harm',
    'bomb',
  ];

  const sub = (subcategory || '').toLowerCase();
  for (const kw of highRiskKeywords) {
    if (sub.includes(kw)) {
      return 'HIGH';
    }
  }

  if (masterCategory?.suggestedPriority) {
    return masterCategory.suggestedPriority;
  }

  return 'MEDIUM';
}

/**
 * Search categories and subcategories by keyword
 */
export function searchIncidentCategories(query) {
  if (!query || !query.trim()) return MASTER_CATEGORIES;
  const q = query.trim().toLowerCase();

  return MASTER_CATEGORIES.map((cat) => {
    const matchCategory = cat.label.toLowerCase().includes(q) || cat.description.toLowerCase().includes(q);
    const matchingSubs = cat.subcategories.filter((sub) => sub.toLowerCase().includes(q));

    if (matchCategory || matchingSubs.length > 0) {
      return {
        ...cat,
        subcategories: matchingSubs.length > 0 ? matchingSubs : cat.subcategories,
        matched: true,
      };
    }
    return null;
  }).filter(Boolean);
}
