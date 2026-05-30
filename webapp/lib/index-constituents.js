import { DICT } from '@/data/dict'

// ── Explicit membership per index ──────────────────────────────────────────
// Only tickers that (a) are in the DICT and (b) actually belong to that index.
// Indices with unambiguous suffix (one market → one index) are handled via
// SUFFIX_MAP below.

const IGBM = [
  'ACS.MC','EBRO.MC','A3M.MC','ELE.MC','ACX.MC','AMS.MC',
  'BBVA.MC','DIA.MC','BKT.MC','SQM.MC','ANA.MC','ROVI.MC',
  'CABK.MC','GALQ.MC','ENG.MC','SLR.MC','FCC.MC','AI.MC',
  'NTGY.MC','ALNT.MC','GRF.MC','PRS.MC','FER.MC','MEL.MC',
  'RED.MC','GSJ.MC','ITX.MC','NEX.MC','REP.MC','ADX.MC',
  'IBE.MC','MCM.MC','IDR.MC','ENC.MC','MAP.MC','CAF.MC',
  'TEF.MC','UBS.MC','SCYR.MC','INS.MC','SAB.MC','LEI.MC',
  'SAN.MC','IBG.MC','COL.MC','BRI.MC','TRE.MC','ADZ.MC',
  'OHLA.MC','RLIA.MC','IAG.MC','NYE.MC','CEV.MC','NEA.MC',
  'CIE.MC','R4.MC','RJF.MC','EZE.MC','MDF.MC','MTB.MC',
  'MVC.MC','FAE.MC','TRG.MC','PVA.MC','GRF-P.MC','VIS.MC',
  'PSG.MC','ALM.MC','VOC.MC','VID.MC','TUB.MC','REN.MC',
  'FDR.MC','ENO.MC','AZK.MC','APAM.MC','ECR.MC','AMP.MC',
  'AIR.MC','PRI.MC','OLE.MC','MTS.MC','EDR.MC','MRL.MC',
  'LOG.MC','AENA.MC','NTH.MC','CLNX.MC','TLGO.MC','GRE.MC',
  'PHM.MC','ORY.MC','DOM.MC','CCEP.MC','ATRY.MC','CASH.MC',
  'HOME.MC','GEST.MC','UNI.MC','AED.MC','BKY.MC','SOL.MC',
  'LDA.MC','ENER.MC','ANE.MC','PUIG.MC',
]

const IBEX35 = [
  'AENA.MC','ACS.MC','ACX.MC','AMS.MC','ANA.MC','ANE.MC',
  'BBVA.MC','BKT.MC','CABK.MC','CLNX.MC','COL.MC',
  'ELE.MC','ENG.MC','FDR.MC','FER.MC','GRF.MC',
  'IBE.MC','IDR.MC','ITX.MC','LOG.MC','MAP.MC',
  'MEL.MC','MRL.MC','NTGY.MC','PUIG.MC','RED.MC',
  'REP.MC','SAB.MC','SAN.MC','SCYR.MC','SLR.MC',
  'TEF.MC','UNI.MC','VIS.MC',
]

const DAX40 = [
  'ADS.DE','ALV.DE','BAS.DE','BAYN.DE','BEI.DE','BMW.DE',
  'BNR.DE','CBK.DE','CON.DE','DB1.DE','DBK.DE','DHL.DE',
  'DTG.DE','DTE.DE','EOAN.DE','ENR.DE','FME.DE','FRE.DE',
  'HEI.DE','HEN3.DE','IFX.DE','LHA.DE','MBG.DE','MRK.DE',
  'MTX.DE','MUV2.DE','NEM.DE','P911.DE','PAH3.DE','QIA.DE',
  'RHM.DE','RWE.DE','SAP.DE','SHL.DE','SIE.DE','SY1.DE',
  'VNA.DE','VOW3.DE','ZAL.DE',
]

const CAC40 = [
  'AC.PA','AI.PA','AIR.PA','CS.PA','ACA.PA','BN.PA',
  'BNP.PA','BVI.PA','CAP.PA','CA.PA','DSY.PA','EDEN.PA',
  'EL.PA','EN.PA','ENGI.PA','ERF.PA','FGR.PA','GLE.PA',
  'HO.PA','KER.PA','LR.PA','MC.PA','ML.PA','ORA.PA',
  'PUB.PA','RI.PA','RMS.PA','RNO.PA','SAF.PA','SAN.PA',
  'SGO.PA','SU.PA','SW.PA','TTE.PA','VIE.PA','DG.PA',
  'VIV.PA','WLN.PA','ALO.PA','MT.PA','TEP.PA',
]

const FTSE100 = [
  'AZN.L','SHEL.L','HSBA.L','BP.L','GSK.L','RIO.L',
  'ULVR.L','AV.L','BA.L','REL.L','VOD.L','LLOY.L',
  'BARC.L','RKT.L','NG.L','DGE.L','BATS.L','PRU.L',
  'GLEN.L','IMB.L','LGEN.L','IAG.L','CPG.L','NXT.L',
  'AAL.L','AHT.L','ABF.L','BNZL.L','BRBY.L','BT-A.L',
  'CNA.L','CRDA.L','EXPN.L','FLTR.L','HLMA.L','HLN.L',
  'IHG.L','INF.L','ITRK.L','KGF.L','LSEG.L','MKS.L',
  'MNG.L','NWG.L','PHNX.L','RR.L','RMV.L','RTO.L',
  'SGE.L','SN.L','SPX.L','SSE.L','STAN.L','TSCO.L',
  'TW.L','UU.L','WPP.L','FERG.L','III.L','LAND.L',
  'BHP.L','BLND.L','BDEV.L','BKG.L','SKG.L','JD.L',
  'SVT.L','ENT.L','EMG.L','DPLM.L','MRO.L','SBRY.L',
  'SMIN.L','AUTO.L','MNDI.L','HL.L','WISE.L','WEIR.L',
]

const SMI20 = [
  'ABBN.SW','ALC.SW','CFR.SW','GEBN.SW','GIVN.SW',
  'HOLN.SW','KNIN.SW','LONN.SW','NESN.SW','NOVN.SW',
  'PGHN.SW','RO.SW','SDZ.SW','SCHP.SW','SIKA.SW',
  'SLHN.SW','SREN.SW','SCMN.SW','UBSG.SW','VACN.SW',
]

const AEX25 = [
  'ADYEN.AS','AGN.AS','AD.AS','AKZA.AS','ASM.AS','ASML.AS',
  'HEIA.AS','KPN.AS','PHIA.AS','WKL.AS','ABN.AS','ASRNL.AS',
  'DSM.AS','EXOR.AS','IMCD.AS','ING.AS','NN.AS','RAND.AS',
  'URW.AS','LIGHT.AS','UMG.AS','VPK.AS',
]

const OMX30 = [
  'ALFA.ST','ASSAB.ST','ATCOA.ST','ATCOB.ST','BOL.ST',
  'EPIA.ST','ESSITYB.ST','HEXAb.ST','HMb.ST','NIBEb.ST',
  'SEBA.ST','SECUB.ST','SKAb.ST','SKFb.ST','SCAb.ST',
  'SHBA.ST','SWEDA.ST','TELIA.ST','TEL2b.ST','TRELb.ST',
  'VOLVB.ST','SAND.ST','EVO.ST','ERICb.ST','INVEb.ST',
  'INDUc.ST','ALIVsdb.ST','GETIb.ST',
]

const DOW30 = [
  'AAPL','AMGN','AMZN','AXP','BA','CAT','CRM','CSCO',
  'CVX','DIS','DOW','GS','HD','HON','IBM','JNJ','JPM',
  'KO','MCD','MMM','MRK','MSFT','NKE','NVDA','PG',
  'SHW','TRV','UNH','V','VZ','WMT',
]

const NASDAQ100 = [
  'AAPL','MSFT','NVDA','AMZN','META','GOOGL','GOOG',
  'AVGO','TSLA','COST','NFLX','AMD','QCOM','CSCO','ADBE',
  'PEP','TXN','ADI','ISRG','REGN','MU','KLAC','PANW',
  'SNPS','CDNS','GILD','LRCX','INTC','MDLZ','CTAS',
  'FAST','ORLY','ABNB','FTNT','DXCM','CRWD','WDAY',
  'IDXX','MNST','ROST','MELI','KDP','EXC','XEL','CSX',
  'PCAR','AMAT','NXPI','MRVL','LULU','TEAM',
]

// ── Unambiguous single-index markets (suffix → index symbol) ────────────────
// These countries/regions only have one index we track, so suffix = index.
const SUFFIX_MAP = {
  '^OMXC20':    ['.CO'],
  '^OMXH25':    ['.HE'],
  'OBX.OL':     ['.OL'],
  '^BFX':       ['.BR'],
  'PSI20.LS':   ['.LS'],
  '^ATX':       ['.VI'],
  '^ISEQ':      ['.IR'],
  'WIG20.WA':   ['.WA'],
  '^PX':        ['.PR'],
  '^BUX':       ['.BD'],
  '^GSPTSE':    ['.TO'],
  '^N225':      ['.T'],
  'TOPIX100.T': ['.T'],
  '^HSI':       ['.HK'],
  '000001.SS':  ['.SS', '.SZ'],
  '000300.SS':  ['.SS', '.SZ'],
  '^BSESN':     ['.NS'],
  '^NSEI':      ['.NS'],
  '^KS11':      ['.KS'],
  '^AXJO':      ['.AX'],
  '^STI':       ['.SI'],
  '^BVSP':      ['.SA'],
  '^MXX':       ['.MX'],
  '^MERV':      ['.BA'],
  '^IPSA':      ['.SN'],
  'XU100.IS':   ['.IS'],
  // US broad indices: all US-country companies in DICT (subset of S&P 500)
  '^GSPC':      ['__US__'],
  '^IXIC':      ['__US__'],
}

// Explicit whitelists take priority
const EXPLICIT_MAP = {
  'IGBM.MA':    IGBM,
  '^IBEX':      IBEX35,
  '^GDAXI':     DAX40,
  '^FCHI':      CAC40,
  '^FTSE':      FTSE100,
  '^SSMI':      SMI20,
  '^AEX':       AEX25,
  '^OMX':       OMX30,
  '^DJI':       DOW30,
  '^NDX':       NASDAQ100,
}

function dedup(list) {
  const seen = new Set()
  return list.filter(c => { if (seen.has(c.ticker)) return false; seen.add(c.ticker); return true })
}

// Returns [{ ticker, name, cur, sector }] for a given index symbol
export function getIndexConstituents(indexSymbol) {
  // 1. Explicit whitelist — preserve the defined order
  if (EXPLICIT_MAP[indexSymbol]) {
    const whitelist = new Set(EXPLICIT_MAP[indexSymbol])
    return dedup(
      DICT
        .filter(d => whitelist.has(d[1]))
        .map(([name, ticker,, cur, superSector]) => ({ ticker, name, cur, sector: superSector }))
    )
  }

  // 2. Suffix-based for unambiguous markets
  const suffixes = SUFFIX_MAP[indexSymbol]
  if (!suffixes) return []

  if (suffixes[0] === '__US__') {
    return dedup(
      DICT
        .filter(d => d[2] === 'US')
        .map(([name, ticker,, cur, superSector]) => ({ ticker, name, cur, sector: superSector }))
    )
  }

  return dedup(
    DICT
      .filter(d => suffixes.some(s => d[1].endsWith(s)))
      .map(([name, ticker,, cur, superSector]) => ({ ticker, name, cur, sector: superSector }))
  )
}
