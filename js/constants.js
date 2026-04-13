export const YDS_TO_M = 0.9144;
export const SKILL_LEVELS = ['Beginner', 'Average', 'Good', 'Advanced', 'PGA Tour'];
export const CLUB_REFERENCE_YDS = {
  'Driver': [180, 220, 250, 280, 296],
  '3-wood': [170, 210, 225, 235, 262],
  '5-wood': [150, 195, 205, 220, 248],
  'Hybrid': [145, 180, 190, 210, 242],
  '2-iron': [100, 180, 190, 215, 236],
  '3-iron': [100, 170, 180, 205, 228],
  '4-iron': [100, 160, 170, 195, 219],
  '5-iron': [125, 155, 165, 185, 209],
  '6-iron': [120, 145, 160, 175, 197],
  '7-iron': [110, 140, 150, 165, 185],
  '8-iron': [100, 130, 140, 155, 172],
  '9-iron': [90, 115, 125, 145, 159],
  'Pitching Wedge / 46°': [80, 100, 110, 135, 146],
  'Gap Wedge / 52°': [60, 90, 100, 125, 135],
  'Sand Wedge / 56°': [55, 80, 95, 115, 124],
  'Lob Wedge / 60°': [40, 60, 80, 105, 113],
};
export const CLUB_SHORTHAND = {
  'Driver': 'Dr',
  '3-wood': '3W',
  '5-wood': '5W',
  'Hybrid': 'Hyb',
  '2-iron': '2i',
  '3-iron': '3i',
  '4-iron': '4i',
  '5-iron': '5i',
  '6-iron': '6i',
  '7-iron': '7i',
  '8-iron': '8i',
  '9-iron': '9i',
  'Pitching Wedge / 46°': 'PW',
  'Gap Wedge / 52°': 'GW',
  'Sand Wedge / 56°': 'SW',
  'Lob Wedge / 60°': 'LW',
};

export const LM_BENCHMARK_LOOKUP = {
  driver: {
    smash: { gLo: 1.44, gHi: 1.52, oLo: 1.34, oHi: 1.53 },
    spin: { gLo: 1900, gHi: 3300, oLo: 1400, oHi: 4000 },
    launchAng: { gLo: 9, gHi: 17, oLo: 6.5, oHi: 20 },
    landingAng: { gLo: 33, gHi: 45, oLo: 27, oHi: 52 },
    height: { gLo: 16, gHi: 45, oLo: 10, oHi: 58 },
  },
  iron: {
    smash: { gLo: 1.26, gHi: 1.44, oLo: 1.1, oHi: 1.5 },
    spin: { gLo: 5000, gHi: 8800, oLo: 3500, oHi: 10500 },
    launchAng: { gLo: 13, gHi: 24, oLo: 9, oHi: 30 },
    landingAng: { gLo: 42, gHi: 56, oLo: 36, oHi: 62 },
    height: { gLo: 8, gHi: 40, oLo: 4, oHi: 52 },
  },
}

