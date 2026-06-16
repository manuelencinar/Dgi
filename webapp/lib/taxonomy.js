// Taxonomía de 3 niveles (Morningstar): Supersector → Sector (11) → Industria.
// - Supersector y mapeo sector→supersector: lib/supersectors.js (reutilizado).
// - Aquí vive el nivel más concreto (industria), que se ASIGNA por empresa pero
//   NO entra en el gráfico de la cartera (solo supersector y sector).
// Los nombres en inglés coinciden con los que da Yahoo (company_fundamentals).
import { SUPERSECTOR_ORDER, SUPERSECTORS, sectorLabelEs } from '@/lib/supersectors'

// Sectores (en inglés) que pertenecen a cada supersector.
export const SECTORS_BY_SUPER = {
  ciclico:   ['Basic Materials', 'Consumer Cyclical', 'Financial Services', 'Real Estate'],
  sensible:  ['Communication Services', 'Energy', 'Industrials', 'Technology'],
  defensivo: ['Consumer Defensive', 'Healthcare', 'Utilities'],
}

// Industrias por sector (inglés Yahoo → español).
export const INDUSTRIES_BY_SECTOR = {
  'Basic Materials': [
    ['Agricultural Inputs', 'Insumos Agrícolas y Fertilizantes'],
    ['Aluminum', 'Aluminio'],
    ['Building Materials', 'Materiales de Construcción'],
    ['Chemicals', 'Química General'],
    ['Coking Coal', 'Carbón Coquificable'],
    ['Copper', 'Cobre'],
    ['Gold', 'Oro'],
    ['Lumber & Wood Production', 'Producción de Madera y Productos Forestales'],
    ['Other Industrial Metals & Mining', 'Otros Metales Industriales y Minería'],
    ['Other Precious Metals & Mining', 'Otros Metales Preciosos y Minería'],
    ['Paper & Paper Products', 'Papel y Productos de Papel'],
    ['Silver', 'Plata'],
    ['Specialty Chemicals', 'Química Especializada'],
    ['Steel', 'Acero y Siderurgia'],
  ],
  'Consumer Cyclical': [
    ['Apparel Manufacturing', 'Fabricación de Ropa y Textil'],
    ['Apparel Retail', 'Venta Minorista de Ropa'],
    ['Auto & Truck Dealerships', 'Concesionarios de Autos y Camiones'],
    ['Auto Manufacturers', 'Fabricantes de Automóviles'],
    ['Auto Parts', 'Componentes de Automoción'],
    ['Department Stores', 'Grandes Almacenes'],
    ['Footwear & Accessories', 'Calzado y Accesorios'],
    ['Gambling', 'Juegos de Azar y Apuestas'],
    ['Home Improvement Retail', 'Bricolaje y Mejoras del Hogar'],
    ['Internet Retail', 'Comercio Electrónico / Venta Minorista por Internet'],
    ['Leisure', 'Ocio y Entretenimiento'],
    ['Lodging', 'Hostelería y Alojamiento'],
    ['Luxury Goods', 'Artículos de Lujo'],
    ['Packaging & Containers', 'Embalajes y Contenedores'],
    ['Personal Services', 'Servicios Personales'],
    ['Residential Construction', 'Construcción Residencial'],
    ['Resorts & Casinos', 'Centros Vacacionales y Casinos'],
    ['Restaurants', 'Restaurantes'],
    ['Specialty Retail', 'Comercio Minorista Especializado'],
    ['Textile Manufacturing', 'Fabricación Textil'],
    ['Travel Services', 'Servicios de Viajes y Turismo'],
  ],
  'Financial Services': [
    ['Asset Management', 'Gestión de Activos y Fondos'],
    ['Banks—Diversified', 'Banca Diversificada'],
    ['Banks—Regional', 'Banca Regional'],
    ['Capital Markets', 'Mercados de Capitales y Corretaje'],
    ['Credit Services', 'Servicios de Crédito y Tarjetas'],
    ['Financial Data & Stock Exchanges', 'Datos Financieros y Bolsas de Valores'],
    ['Insurance—Diversified', 'Seguros Diversificados'],
    ['Insurance—Life', 'Seguros de Vida'],
    ['Insurance—Property & Casualty', 'Seguros de No Vida / Generales'],
    ['Insurance—Reinsurance', 'Reaseguros'],
    ['Insurance Brokers', 'Corredurías de Seguros'],
    ['Mortgage Finance', 'Financiación Hipotecaria'],
    ['Shell Companies', 'Sociedades Instrumentales / SPACs'],
  ],
  'Real Estate': [
    ['Real Estate—Development', 'Desarrollo Inmobiliario'],
    ['Real Estate—Diversified', 'Servicios Inmobiliarios Diversificados'],
    ['Real Estate Services', 'Servicios y Consultoría Inmobiliaria'],
    ['REIT—Diversified', 'REITs / SOCIMIs Diversificadas'],
    ['REIT—Healthcare Facilities', 'REITs / SOCIMIs de Centros Sanitarios'],
    ['REIT—Hotel & Motel', 'REITs / SOCIMIs de Hoteles y Moteles'],
    ['REIT—Industrial', 'REITs / SOCIMIs Industriales y Logísticas'],
    ['REIT—Mortgage', 'REITs / SOCIMIs Hipotecarios'],
    ['REIT—Office', 'REITs / SOCIMIs de Oficinas'],
    ['REIT—Residential', 'REITs / SOCIMIs Residenciales'],
    ['REIT—Retail', 'REITs / SOCIMIs de Centros Comerciales'],
    ['REIT—Specialty', 'REITs / SOCIMIs Especializados'],
  ],
  'Consumer Defensive': [
    ['Beverages—Brewers', 'Bebidas: Cerveceras'],
    ['Beverages—Non-Alcoholic', 'Bebidas Analcohólicas / Refrescos'],
    ['Beverages—Wineries & Distilleries', 'Bebidas: Bodegas y Destilerías'],
    ['Confectioners', 'Confitería y Dulces'],
    ['Discount Stores', 'Tiendas de Descuento y Grandes Superficies'],
    ['Education & Training Services', 'Servicios de Educación y Formación'],
    ['Food Distribution', 'Distribución Alimentaria'],
    ['Grocery Stores', 'Supermercados y Tiendas de Comestibles'],
    ['Household & Personal Products', 'Productos Personales y del Hogar'],
    ['Packaged Foods', 'Alimentos Procesados y Envasados'],
    ['Tobacco', 'Tabaco'],
  ],
  'Healthcare': [
    ['Biotechnology', 'Biotecnología'],
    ['Diagnostics & Research', 'Diagnóstico e Investigación'],
    ['Drug Manufacturers—General', 'Fabricantes de Medicamentos: Grandes Farmacéuticas'],
    ['Drug Manufacturers—Specialty & Generic', 'Fabricantes de Medicamentos: Farmacéuticas Especializadas'],
    ['Healthcare Plans', 'Planes de Salud y Aseguradoras Médicas'],
    ['Health Information Services', 'Servicios de Información Sanitaria / Software Médico'],
    ['Long-Term Care Facilities', 'Centros de Cuidados a Largo Plazo y Residencias'],
    ['Medical Care Facilities', 'Instalaciones y Hospitales Privados'],
    ['Medical Devices', 'Dispositivos Médicos'],
    ['Medical Distribution', 'Distribución Médica y Farmacéutica'],
    ['Medical Instruments & Supplies', 'Instrumentos y Suministros Médicos'],
    ['Pharmaceutical Retailers', 'Minoristas Farmacéuticos / Farmacias'],
  ],
  'Utilities': [
    ['Utilities—Diversified', 'Servicios Públicos Diversificados'],
    ['Utilities—Independent Power Producers', 'Productores de Energía Independientes'],
    ['Utilities—Regulated Electric', 'Electricidad Regulada'],
    ['Utilities—Regulated Gas', 'Gas Regulado'],
    ['Utilities—Regulated Water', 'Agua Regulada'],
    ['Utilities—Renewable', 'Energías Renovables'],
  ],
  'Communication Services': [
    ['Advertising Agencies', 'Agencias de Publicidad'],
    ['Broadcasting', 'Radiodifusión y Televisión'],
    ['Electronic Gaming & Multimedia', 'Videojuegos y Multimedia'],
    ['Entertainment', 'Entretenimiento y Producción de Contenido'],
    ['Internet Content & Information', 'Contenido e Información de Internet'],
    ['Publishing', 'Edición y Publicaciones'],
    ['Telecom Services', 'Servicios de Telecomunicaciones'],
  ],
  'Energy': [
    ['Oil & Gas Drilling', 'Perforación de Petróleo y Gas'],
    ['Oil & Gas E&P', 'Exploración y Producción de Petróleo y Gas'],
    ['Oil & Gas Equipment & Services', 'Equipos y Servicios para Petróleo y Gas'],
    ['Oil & Gas Integrated', 'Petroleras Integradas'],
    ['Oil & Gas Midstream', 'Infraestructura y Transporte de Petróleo y Gas (Midstream)'],
    ['Oil & Gas Refining & Marketing', 'Refino y Comercialización de Petróleo y Gas'],
    ['Thermal Coal', 'Carbón Térmico'],
    ['Uranium', 'Uranio y Energía Nuclear'],
  ],
  'Industrials': [
    ['Aerospace & Defense', 'Aeroespacial y Defensa'],
    ['Airlines', 'Aerolíneas'],
    ['Airports & Air Services', 'Aeropuertos y Servicios Aeroportuarios'],
    ['Building Products & Equipment', 'Productos y Equipos de Construcción'],
    ['Business Equipment & Supplies', 'Servicios para Empresas'],
    ['Consulting Services', 'Servicios de Consultoría Empresarial'],
    ['Electrical Equipment & Parts', 'Equipos y Componentes Eléctricos'],
    ['Engineering & Construction', 'Ingeniería y Construcción Pesada'],
    ['Farm & Heavy Construction Machinery', 'Maquinaria Agrícola y de Construcción Pesada'],
    ['Industrial Distribution', 'Distribución Industrial'],
    ['Infrastructure Operations', 'Operaciones de Infraestructura'],
    ['Integrated Freight & Logistics', 'Logística y Transporte Integrado de Carga'],
    ['Marine Shipping', 'Transporte Marítimo'],
    ['Metal Fabrication', 'Fabricación de Estructuras Metálicas'],
    ['Pollution & Treatment Controls', 'Controles de Contaminación y Tratamiento'],
    ['Railroads', 'Ferrocarriles'],
    ['Rental & Leasing Services', 'Servicios de Alquiler y Leasing'],
    ['Security & Protection Services', 'Servicios de Seguridad y Protección'],
    ['Staffing & Employment Services', 'Servicios de Empleo y ETTs'],
    ['Tools & Accessories', 'Herramientas y Accesorios'],
    ['Trucking', 'Transporte por Carretera / Camiones'],
    ['Waste Management', 'Gestión de Residuos y Reciclaje'],
  ],
  'Technology': [
    ['Communication Equipment', 'Equipos de Comunicación'],
    ['Computer Hardware', 'Hardware Informático'],
    ['Consumer Electronics', 'Electrónica de Consumo'],
    ['Electronic Components', 'Componentes Electrónicos'],
    ['Electronics & Computer Distribution', 'Distribución de Electrónica e Informática'],
    ['Information Technology Services', 'Servicios de TI / Consultoría IT'],
    ['Scientific & Technical Instruments', 'Instrumentos Científicos y Técnicos'],
    ['Semiconductor Equipment & Materials', 'Equipos y Materiales para Semiconductores'],
    ['Semiconductors', 'Semiconductores'],
    ['Software—Application', 'Software de Aplicación'],
    ['Software—Infrastructure', 'Software de Infraestructura'],
    ['Solar', 'Energía Solar'],
  ],
}

// Todos los sectores (inglés) que tienen taxonomía definida.
export const ALL_SECTORS = SUPERSECTOR_ORDER
  .filter(k => SECTORS_BY_SUPER[k])
  .flatMap(k => SECTORS_BY_SUPER[k])

// Helpers para los desplegables en cascada del dashboard.
export function sectorsOfSuper(superKey) { return SECTORS_BY_SUPER[superKey] || [] }
export function industriesOf(sector) { return INDUSTRIES_BY_SECTOR[sector] || [] }
export function superSectorLabel(superKey) { return SUPERSECTORS[superKey]?.label || superKey }
export { sectorLabelEs }

// Etiqueta española de una industria (inglés → español).
export function industryEs(sector, industryEn) {
  const row = (INDUSTRIES_BY_SECTOR[sector] || []).find(([en]) => en === industryEn)
  return row ? row[1] : (industryEn || '')
}
