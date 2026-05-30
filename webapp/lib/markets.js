export const MARKETS = [
  // ── América ──────────────────────────────────────────────────────────
  { symbol:'^GSPC',    name:'S&P 500',          country:'EE. UU.',    flag:'🇺🇸', region:'América' },
  { symbol:'^DJI',     name:'Dow Jones',         country:'EE. UU.',    flag:'🇺🇸', region:'América' },
  { symbol:'^IXIC',    name:'Nasdaq Composite',  country:'EE. UU.',    flag:'🇺🇸', region:'América' },
  { symbol:'^NDX',     name:'Nasdaq 100',         country:'EE. UU.',    flag:'🇺🇸', region:'América' },
  { symbol:'^RUT',     name:'Russell 2000',       country:'EE. UU.',    flag:'🇺🇸', region:'América' },
  { symbol:'^VIX',     name:'VIX Volatilidad',   country:'EE. UU.',    flag:'🇺🇸', region:'América' },
  { symbol:'^GSPTSE',  name:'S&P/TSX Composite', country:'Canadá',     flag:'🇨🇦', region:'América' },
  { symbol:'^BVSP',    name:'IBOVESPA',           country:'Brasil',     flag:'🇧🇷', region:'América' },
  { symbol:'^MXX',     name:'S&P/BMV IPC',        country:'México',     flag:'🇲🇽', region:'América' },
  { symbol:'^MERV',    name:'S&P Merval',         country:'Argentina',  flag:'🇦🇷', region:'América' },
  { symbol:'^IPSA',    name:'S&P CLX IPSA',       country:'Chile',      flag:'🇨🇱', region:'América' },

  // ── Europa ───────────────────────────────────────────────────────────
  { symbol:'^STOXX50E',name:'Eurostoxx 50',        country:'Europa',      flag:'🇪🇺', region:'Europa' },
  { symbol:'^FTSE',    name:'FTSE 100',           country:'Reino Unido', flag:'🇬🇧', region:'Europa' },
  { symbol:'^GDAXI',   name:'DAX',                country:'Alemania',    flag:'🇩🇪', region:'Europa' },
  { symbol:'^FCHI',    name:'CAC 40',             country:'Francia',     flag:'🇫🇷', region:'Europa' },
  { symbol:'^IBEX',    name:'IBEX 35',            country:'España',      flag:'🇪🇸', region:'Europa' },
  { symbol:'IGBM.MA',  name:'IGBM',               country:'España',      flag:'🇪🇸', region:'Europa' },
  { symbol:'^SSMI',    name:'SMI',                country:'Suiza',       flag:'🇨🇭', region:'Europa' },
  { symbol:'^AEX',     name:'AEX',                country:'Países Bajos',flag:'🇳🇱', region:'Europa' },
  { symbol:'^OMX',     name:'OMX Stockholm 30',   country:'Suecia',      flag:'🇸🇪', region:'Europa' },
  { symbol:'^BFX',     name:'BEL 20',             country:'Bélgica',     flag:'🇧🇪', region:'Europa' },
  { symbol:'PSI20.LS', name:'PSI',                country:'Portugal',    flag:'🇵🇹', region:'Europa' },
  { symbol:'^OMXH25',  name:'OMX Helsinki 25',    country:'Finlandia',   flag:'🇫🇮', region:'Europa' },
  { symbol:'^OMXC20',  name:'OMX Copenhagen 20',  country:'Dinamarca',   flag:'🇩🇰', region:'Europa' },
  { symbol:'OBX.OL',   name:'Oslo OBX',           country:'Noruega',     flag:'🇳🇴', region:'Europa' },
  { symbol:'^ATX',     name:'ATX',                country:'Austria',     flag:'🇦🇹', region:'Europa' },
  { symbol:'^ISEQ',    name:'ISEQ Overall',       country:'Irlanda',     flag:'🇮🇪', region:'Europa' },
  { symbol:'WIG20.WA', name:'WIG 20',             country:'Polonia',     flag:'🇵🇱', region:'Europa' },
  { symbol:'^PX',      name:'PX Index',           country:'Rep. Checa',  flag:'🇨🇿', region:'Europa' },
  { symbol:'^BUX',     name:'BUX',                country:'Hungría',     flag:'🇭🇺', region:'Europa' },
  { symbol:'XU100.IS', name:'BIST 100',           country:'Turquía',     flag:'🇹🇷', region:'Europa' },

  // ── Asia-Pacífico ─────────────────────────────────────────────────────
  { symbol:'^N225',    name:'Nikkei 225',         country:'Japón',        flag:'🇯🇵', region:'Asia-Pacífico' },
  { symbol:'TOPIX100.T',name:'TOPIX',             country:'Japón',        flag:'🇯🇵', region:'Asia-Pacífico' },
  { symbol:'^HSI',     name:'Hang Seng',          country:'Hong Kong',    flag:'🇭🇰', region:'Asia-Pacífico' },
  { symbol:'000001.SS',name:'SSE Composite',      country:'China',        flag:'🇨🇳', region:'Asia-Pacífico' },
  { symbol:'000300.SS',name:'CSI 300',            country:'China',        flag:'🇨🇳', region:'Asia-Pacífico' },
  { symbol:'^BSESN',   name:'S&P BSE SENSEX',     country:'India',        flag:'🇮🇳', region:'Asia-Pacífico' },
  { symbol:'^NSEI',    name:'Nifty 50',           country:'India',        flag:'🇮🇳', region:'Asia-Pacífico' },
  { symbol:'^KS11',    name:'KOSPI',              country:'Corea del Sur',flag:'🇰🇷', region:'Asia-Pacífico' },
  { symbol:'^AXJO',    name:'S&P/ASX 200',        country:'Australia',    flag:'🇦🇺', region:'Asia-Pacífico' },
  { symbol:'^STI',     name:'Straits Times',      country:'Singapur',     flag:'🇸🇬', region:'Asia-Pacífico' },

  // ── ETFs globales ────────────────────────────────────────────────────
  { symbol:'EEM',      name:'MSCI Emerging Mkts', country:'Global',       flag:'🌍', region:'ETFs globales' },
  { symbol:'URTH',     name:'MSCI World Index',   country:'Global',       flag:'🌍', region:'ETFs globales' },
]

export const REGIONS = [...new Set(MARKETS.map(m => m.region))]
