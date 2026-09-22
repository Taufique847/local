import { IServiceItem } from '../types/business.types';

export type TradeType =
  | 'HVAC'
  | 'Plumbing'
  | 'Electrical'
  | 'Roofing'
  | 'Pest Control'
  | 'Cleaning'
  | 'General';

/**
 * Starter service lists per trade.
 *
 * Every new business was seeded with the HVAC catalog regardless of what they
 * signed up as, so a plumber's first task was deleting "AC Repair",
 * "AC Installation", "Heating Repair", "Ductwork" and "Emergency HVAC Service"
 * before they could add anything of their own. Worse, those entries also fed the
 * voice assistant's prompt, so the AI would have offered air conditioning work to
 * a plumber's callers.
 *
 * These are suggestions the contractor edits during onboarding, not a fixed
 * taxonomy.
 */
const CATALOGS: Record<TradeType, IServiceItem[]> = {
  HVAC: [
    { id: 'ac_repair', name: 'AC Repair', description: 'Diagnose and fix air conditioning issues', enabled: true },
    { id: 'ac_install', name: 'AC Installation', description: 'Install new energy-efficient AC systems', enabled: true },
    { id: 'ac_tuneup', name: 'AC Maintenance & Tune-up', description: 'Seasonal AC tune-up and filter check', enabled: true },
    { id: 'heating_repair', name: 'Heating Repair', description: 'Fix furnace and heat pump malfunctions', enabled: true },
    { id: 'heating_install', name: 'Heating Installation', description: 'Install furnaces and heating units', enabled: true },
    { id: 'ductwork', name: 'Ductwork & Airflow', description: 'Duct cleaning, repair, and sealing', enabled: false },
    { id: 'indoor_air', name: 'Indoor Air Quality', description: 'Air purifiers, dehumidifiers, and UV lights', enabled: false },
    { id: 'emergency_hvac', name: 'Emergency HVAC Service', description: '24/7 urgent heating and cooling service', enabled: true },
  ],

  Plumbing: [
    { id: 'leak_repair', name: 'Leak Detection & Repair', description: 'Find and fix pipe and fixture leaks', enabled: true },
    { id: 'drain_clearing', name: 'Drain Cleaning', description: 'Clear slow and blocked drains', enabled: true },
    { id: 'water_heater_repair', name: 'Water Heater Repair', description: 'Diagnose and repair water heaters', enabled: true },
    { id: 'water_heater_install', name: 'Water Heater Installation', description: 'Replace tank and tankless water heaters', enabled: true },
    { id: 'fixture_install', name: 'Fixture Installation', description: 'Faucets, toilets, sinks and showers', enabled: true },
    { id: 'sewer_line', name: 'Sewer Line Service', description: 'Camera inspection and sewer repair', enabled: false },
    { id: 'repipe', name: 'Repiping', description: 'Replace failing supply lines', enabled: false },
    { id: 'emergency_plumbing', name: 'Emergency Plumbing', description: '24/7 burst pipes and major leaks', enabled: true },
  ],

  Electrical: [
    { id: 'troubleshooting', name: 'Electrical Troubleshooting', description: 'Trace faults, dead outlets and tripping breakers', enabled: true },
    { id: 'panel_upgrade', name: 'Panel Upgrade', description: 'Replace or upgrade the service panel', enabled: true },
    { id: 'wiring', name: 'Wiring & Rewiring', description: 'New circuits and replacement of unsafe wiring', enabled: true },
    { id: 'lighting', name: 'Lighting Installation', description: 'Interior, exterior and recessed lighting', enabled: true },
    { id: 'ev_charger', name: 'EV Charger Installation', description: 'Install home vehicle charging', enabled: false },
    { id: 'generator', name: 'Generator Installation', description: 'Standby and backup generators', enabled: false },
    { id: 'emergency_electrical', name: 'Emergency Electrical', description: '24/7 outages, burning smells and sparking', enabled: true },
  ],

  Roofing: [
    { id: 'roof_inspection', name: 'Roof Inspection', description: 'Assess condition and remaining life', enabled: true },
    { id: 'leak_repair_roof', name: 'Roof Leak Repair', description: 'Locate and seal active leaks', enabled: true },
    { id: 'shingle_replace', name: 'Shingle Replacement', description: 'Replace damaged or missing shingles', enabled: true },
    { id: 'roof_replace', name: 'Full Roof Replacement', description: 'Tear-off and re-roof', enabled: true },
    { id: 'gutters', name: 'Gutter Service', description: 'Cleaning, repair and replacement', enabled: false },
    { id: 'storm_damage', name: 'Storm Damage Response', description: 'Emergency tarping and insurance documentation', enabled: true },
  ],

  'Pest Control': [
    { id: 'inspection', name: 'Pest Inspection', description: 'Identify activity and entry points', enabled: true },
    { id: 'general_pest', name: 'General Pest Treatment', description: 'Ants, roaches, spiders and common pests', enabled: true },
    { id: 'rodent', name: 'Rodent Control', description: 'Exclusion, trapping and clean-up', enabled: true },
    { id: 'termite', name: 'Termite Treatment', description: 'Inspection and termite control', enabled: true },
    { id: 'mosquito', name: 'Mosquito & Outdoor Treatment', description: 'Seasonal yard treatments', enabled: false },
    { id: 'recurring', name: 'Recurring Protection Plan', description: 'Quarterly preventative service', enabled: true },
  ],

  Cleaning: [
    { id: 'standard_clean', name: 'Standard Cleaning', description: 'Routine whole-home cleaning', enabled: true },
    { id: 'deep_clean', name: 'Deep Cleaning', description: 'Detailed top-to-bottom clean', enabled: true },
    { id: 'move_clean', name: 'Move In / Move Out Cleaning', description: 'Empty-property turnover clean', enabled: true },
    { id: 'recurring_clean', name: 'Recurring Service', description: 'Weekly, fortnightly or monthly', enabled: true },
    { id: 'post_construction', name: 'Post-Construction Cleaning', description: 'Dust and debris removal after work', enabled: false },
    { id: 'carpet', name: 'Carpet & Upholstery', description: 'Deep extraction cleaning', enabled: false },
  ],

  General: [
    { id: 'diagnostic_visit', name: 'Diagnostic Visit', description: 'On-site assessment and written recommendation', enabled: true },
    { id: 'repair', name: 'General Repair', description: 'Standard repair work', enabled: true },
    { id: 'installation', name: 'Installation', description: 'New equipment or fixture installation', enabled: true },
    { id: 'maintenance', name: 'Scheduled Maintenance', description: 'Preventative service visit', enabled: true },
    { id: 'emergency', name: 'Emergency Call-out', description: '24/7 urgent response', enabled: true },
  ],
};

/**
 * Starter services for a trade. Falls back to the generic list for an
 * unrecognised value rather than to HVAC, so a new trade never inherits another
 * trade's catalogue by accident.
 */
export function defaultServicesForTrade(businessType?: string): IServiceItem[] {
  const catalog = CATALOGS[(businessType as TradeType) ?? 'General'] ?? CATALOGS.General;
  // Copied so a caller mutating the result cannot alter the shared catalogue.
  return catalog.map((service) => ({ ...service }));
}
