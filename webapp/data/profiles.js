// Perfiles de negocio redactados a mano (en español). Clave: ticker real del DICT.
// Texto breve (1-3 frases) que explica a qué se dedica la empresa, su modelo de
// negocio y, cuando aporta, el origen de su ventaja competitiva.
//
// COBERTURA HÍBRIDA: las empresas que falten aquí caen al resumen de negocio de
// Yahoo (company_fundamentals.business_summary, pendiente de cablear). Estos
// textos curados SIEMPRE tienen prioridad sobre el respaldo automático.
//
// Lote inicial de muestra (~31 empresas conocidas) para validar tono y formato.

export const PROFILES = {
  // ── EE. UU. ────────────────────────────────────────────────────────────────
  'AAPL': 'Diseña y vende iPhone, Mac, iPad y wearables (Apple Watch, AirPods), pero su motor de crecimiento son ya los servicios (App Store, iCloud, Apple Music). Su foso nace del ecosistema y la fuerza de la marca.',
  'MSFT': 'Gigante del software: Windows, la suite Office 365 y, sobre todo, la nube Azure, hoy su mayor palanca de crecimiento. También posee LinkedIn y Xbox, y lidera la apuesta empresarial por la IA.',
  'KO': 'Mayor empresa de bebidas no alcohólicas del mundo. Vende concentrados y jarabes a una red global de embotelladores; su cartera incluye Coca-Cola, Fanta, Sprite, Minute Maid y aguas. Negocio de marca con márgenes muy altos.',
  'PEP': 'Bebidas (Pepsi, Gatorade, Tropicana) y, sobre todo, aperitivos salados con Frito-Lay y Quaker —su división más rentable y su gran diferencia frente a Coca-Cola.',
  'PG': 'Líder mundial en productos de consumo doméstico y cuidado personal, con marcas como Ariel, Gillette, Pampers, Oral-B y Fairy. Demanda muy estable y fuerte poder de fijación de precios.',
  'JNJ': 'Multinacional sanitaria centrada en farmacéutica (oncología, inmunología) y dispositivos médicos, tras escindir su negocio de consumo (Kenvue) en 2023.',
  'MCD': 'Mayor cadena de restauración rápida del mundo. Su negocio real es inmobiliario y de franquicia: cobra rentas y royalties a los franquiciados que operan casi todos sus locales.',
  'NKE': 'Líder mundial en ropa y calzado deportivo. Vende marca y diseño (la fabricación está subcontratada) y empuja la venta directa al consumidor a través de sus apps y tiendas.',
  'HD': 'Mayor cadena de bricolaje y mejoras del hogar de EE. UU., orientada tanto al particular como al profesional de la construcción y la reforma.',
  'MMM': 'Conglomerado industrial diversificado: fabrica desde abrasivos y adhesivos (Post-it, Scotch) hasta material sanitario, de seguridad y electrónica.',
  'CAT': 'Mayor fabricante mundial de maquinaria pesada de construcción y minería, además de motores y turbinas. Negocio muy cíclico, ligado a la inversión en infraestructura y materias primas.',
  'JPM': 'El mayor banco de EE. UU. por activos. Combina banca minorista, banca de inversión, gestión de activos y patrimonios; es la referencia de solidez del sector.',
  'V': 'Opera la mayor red de pagos del mundo. No presta dinero ni asume riesgo de crédito: cobra una comisión por cada transacción procesada, un modelo de "peaje" con márgenes enormes.',
  'MA': 'Segunda red global de pagos por tarjeta. Como Visa, gana una comisión por transacción sin asumir riesgo de crédito, beneficiándose del avance del pago electrónico frente al efectivo.',

  // ── Europa continental ──────────────────────────────────────────────────────
  'MC.PA': 'Mayor grupo de lujo del mundo. Agrupa más de 75 marcas (Louis Vuitton, Dior, Moët, Hennessy, Tiffany) en moda, relojería, vinos y licores, perfumes y distribución selectiva (Sephora).',
  'OR.PA': 'Líder mundial en cosmética y cuidado de la piel, con marcas en todos los segmentos de precio (L’Oréal Paris, Lancôme, La Roche-Posay, Maybelline). Muy fuerte en I+D y comercio electrónico.',
  'AIR.PA': 'Mayor fabricante de aviones comerciales del mundo, en duopolio con Boeing. También produce helicópteros y sistemas de defensa y espacio. Negocio de pedidos a muy largo plazo.',
  'NESN.SW': 'La mayor empresa de alimentación del mundo. Cartera enorme —Nescafé, KitKat, Purina, Maggi, agua, nutrición— con foco creciente en café, salud y alimentación para mascotas.',
  'ASML.AS': 'Fabricante neerlandés de las máquinas de litografía que producen los chips. Tiene el monopolio mundial de la litografía ultravioleta extrema (EUV), imprescindible para los semiconductores más avanzados.',
  'SAP.DE': 'Mayor empresa europea de software. Líder en sistemas de gestión empresarial (ERP) para grandes compañías, en plena transición hacia el modelo de nube por suscripción.',
  'SIE.DE': 'Conglomerado industrial alemán centrado en la automatización y digitalización de fábricas, la infraestructura inteligente de edificios y los trenes (movilidad).',
  'ALV.DE': 'Una de las mayores aseguradoras y gestoras de activos del mundo. Combina seguros de vida, daños y salud con la gestión de inversiones a través de PIMCO y Allianz GI.',
  'ITX.MC': 'Mayor grupo textil del mundo, dueño de Zara, Pull&Bear, Massimo Dutti y Bershka. Su ventaja es un modelo de moda rápida con producción flexible y logística integrada.',
  'SAN.MC': 'Mayor banco español y uno de los grandes de la eurozona, con fuerte presencia en Brasil, México, Reino Unido y EE. UU. Banca minorista muy diversificada geográficamente.',
  'IBE.MC': 'Una de las mayores eléctricas del mundo y líder en renovables. Gana sobre todo por redes reguladas de distribución y por generación eólica e hidráulica en España, Reino Unido, EE. UU. y Brasil.',
  'ENG.MC': 'Operadora del sistema gasista español: transporta y almacena gas natural con ingresos regulados, y apuesta por el hidrógeno verde como relevo de crecimiento a largo plazo.',
  'TEF.MC': 'Operadora de telecomunicaciones española con base en España, Alemania, Reino Unido y Brasil (Vivo). Negocio intensivo en capital (redes de fibra y móvil) y tradicionalmente muy endeudado.',

  // ── Reino Unido ───────────────────────────────────────────────────────────
  'ULVR.L': 'Multinacional de consumo con marcas de alimentación, higiene y limpieza (Dove, Hellmann’s, Knorr, Rexona). Gran exposición a mercados emergentes.',
  'BATS.L': 'Una de las mayores tabacaleras del mundo (Lucky Strike, Dunhill). En transición hacia productos "sin humo" (vapeo, bolsas de nicotina) ante el declive del cigarrillo tradicional.',
  'SHEL.L': 'Una de las mayores petroleras integradas del mundo: explora, refina y comercializa petróleo y gas, con un negocio creciente de gas natural licuado (GNL).',
  'DGE.L': 'Líder mundial en bebidas espirituosas premium, dueño de Johnnie Walker, Guinness, Tanqueray, Smirnoff y Baileys. Marcas con poder de precio y demanda resistente.',
}

// Devuelve el perfil curado del ticker, o null si aún no está redactado.
export function getProfile(ticker) {
  return (ticker && PROFILES[ticker]) || null
}
