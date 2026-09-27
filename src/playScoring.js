// playScoring.js — result of a played-out board: contract score for the user's
// side, IMPs against the other room / traveller, or MP%. Same rules as the IPS
// player's completion summary, so saved play_progress rows stay comparable.

const IMP_TABLE = [
  [0,10,0],[20,40,1],[50,80,2],[90,120,3],[130,160,4],[170,210,5],
  [220,260,6],[270,310,7],[320,360,8],[370,420,9],[430,490,10],
  [500,590,11],[600,740,12],[750,890,13],[900,1090,14],[1100,1290,15],
  [1300,1490,16],[1500,1740,17],[1750,1990,18],[2000,2240,19],
  [2250,2490,20],[2500,2990,21],[3000,3490,22],[3500,3990,23],[4000,Infinity,24],
];

function impsForSwing(swing) {
  const amount = Math.abs(swing);
  const sign = swing < 0 ? -1 : 1;
  const row = IMP_TABLE.find(([, hi]) => amount <= hi);
  return sign * (row?.[2] ?? 24);
}

const sideOf = seat => (seat === 'N' || seat === 'S' ? 'NS' : 'EW');

function normalizedVul(value) {
  const v = String(value || '').trim().toLowerCase().replace(/[^a-z]/g, '');
  if (v === 'n' || v === 'ns' || v === 'northsouth') return 'ns';
  if (v === 'e' || v === 'ew' || v === 'eastwest') return 'ew';
  if (v === 'b' || v === 'both' || v === 'all') return 'both';
  return 'none';
}

// Declarer's score. contract: { level, denom: 'S'|'H'|'D'|'C'|'N', doubled: ''|'X'|'XX' }
export function contractScore(contract, declarerTricks, vulnerable) {
  const level = Number(contract.level);
  const denom = contract.denom === 'N' ? 'NT' : contract.denom;
  const target = level + 6;
  const multiplier = contract.doubled === 'XX' ? 4 : contract.doubled === 'X' ? 2 : 1;

  if (declarerTricks < target) {
    const down = target - declarerTricks;
    if (multiplier === 1) return -(vulnerable ? 100 : 50) * down;
    let penalty = 0;
    if (vulnerable) penalty = 200 + Math.max(0, down - 1) * 300;
    else penalty = down === 1 ? 100 : down === 2 ? 300 : down === 3 ? 500 : 500 + (down - 3) * 300;
    return -penalty * (multiplier === 4 ? 2 : 1);
  }

  const basePerLevel = denom === 'C' || denom === 'D' ? 20 : 30;
  const undoubledTrickPoints = denom === 'NT' ? 40 + (level - 1) * 30 : level * basePerLevel;
  const contractPoints = undoubledTrickPoints * multiplier;
  const over = declarerTricks - target;
  const overPoints = multiplier === 1
    ? over * (denom === 'C' || denom === 'D' ? 20 : 30)
    : over * (vulnerable ? 200 : 100) * (multiplier === 4 ? 2 : 1);
  const gameBonus = contractPoints >= 100 ? (vulnerable ? 500 : 300) : 50;
  const slamBonus = level === 7 ? (vulnerable ? 1500 : 1000) : level === 6 ? (vulnerable ? 750 : 500) : 0;
  const insult = multiplier === 4 ? 100 : multiplier === 2 ? 50 : 0;
  return contractPoints + overPoints + gameBonus + slamBonus + insult;
}

// Completion record stored in play_progress and shown in My Results:
// { contract, level, denomCode, doubled, declarer, resultText, score, imps, mpPercent, declarerTricks }
// userSide: 'NS'|'EW'; scoring: 'IMP'|'MP'; otherScore: other room's score for the
// user's team (teams); travellerScores: scores for the user's side (pairs).
export function completionSummary({ contract, declarer, declarerTricks, vulnerability, userSide, scoring, otherScore, travellerScores }) {
  if (!contract?.level || !declarer || !Number.isFinite(declarerTricks)) return null;
  const vul = normalizedVul(vulnerability);
  const declSide = sideOf(declarer);
  const declarerScore = contractScore(contract, declarerTricks, vul === 'both' || vul === declSide.toLowerCase());
  const side = String(userSide || declSide).toUpperCase();
  const score = side === declSide ? declarerScore : -declarerScore;
  const diff = declarerTricks - (Number(contract.level) + 6);
  const resultText = diff === 0 ? '=' : diff > 0 ? `+${diff}` : String(diff);
  const denomText = contract.denom === 'N' ? 'NT' : ({ S: '♠', H: '♥', D: '♦', C: '♣' }[contract.denom] || contract.denom);

  const mode = String(scoring || '').toUpperCase();
  const hasOther = otherScore != null && Number.isFinite(Number(otherScore));
  const refs = Array.isArray(travellerScores) ? travellerScores.map(Number).filter(Number.isFinite) : [];
  let imps = null;
  let mpPercent = null;
  if (mode === 'IMP' && hasOther) {
    imps = impsForSwing(score + Number(otherScore));
  } else if (mode === 'IMP' && refs.length) {
    const total = refs.reduce((sum, ref) => sum + impsForSwing(score - ref), 0);
    imps = Math.round((total / refs.length) * 10) / 10;
  } else if (mode === 'MP' && refs.length) {
    const matchpoints = refs.reduce((sum, ref) => sum + (score > ref ? 1 : score === ref ? 0.5 : 0), 0);
    mpPercent = Math.round((1000 * matchpoints) / refs.length) / 10;
  }
  return {
    contract: `${contract.level}${denomText}${contract.doubled || ''}`,
    level: Number(contract.level),
    denomCode: contract.denom,
    doubled: contract.doubled || '',
    declarer,
    resultText,
    score,
    imps,
    mpPercent,
    declarerTricks,
  };
}
