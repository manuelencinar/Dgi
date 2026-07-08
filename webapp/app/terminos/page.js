import LegalDoc from '@/components/LegalDoc'

const BASE = 'https://www.everdiv.com'
export const metadata = {
  title: 'Términos de uso | EverDiv',
  description: 'Condiciones de uso de EverDiv: descripción del servicio, planes y pagos, descargo de responsabilidad financiera y propiedad intelectual.',
  alternates: { canonical: `${BASE}/terminos` },
}

const sections = [
  {
    h: 'Objeto y aceptación',
    body: [
      'Estas condiciones regulan el acceso y uso de <strong>EverDiv</strong> (everdiv.com), una plataforma web de análisis para inversores en dividendos crecientes (DGI). Al registrarte o utilizar el servicio aceptas estos términos en su totalidad. Si no estás de acuerdo, no uses la plataforma.',
    ],
  },
  {
    h: 'Descripción del servicio',
    body: [
      'EverDiv ofrece herramientas de análisis, cribado y seguimiento de empresas e índices de dividendo, así como un módulo de cartera personal. Existe una versión gratuita con funciones básicas y una versión Premium de pago con funciones avanzadas.',
      'Nos esforzamos por mantener el servicio disponible y actualizado, pero no garantizamos su disponibilidad ininterrumpida ni la ausencia de errores.',
    ],
  },
  {
    h: 'Aviso importante: no es asesoramiento financiero',
    body: [
      '<strong>Toda la información, puntuaciones (incluido el Score DGI), valoraciones, proyecciones y análisis de EverDiv tienen carácter exclusivamente informativo y educativo. No constituyen asesoramiento financiero, fiscal ni de inversión, ni una recomendación de compra o venta de ningún valor.</strong>',
      'EverDiv no es una empresa de servicios de inversión ni está registrada como asesor financiero. Los datos se ofrecen «tal cual», pueden contener errores, retrasos o imprecisiones, y no están garantizados. Las rentabilidades pasadas no garantizan rentabilidades futuras y toda inversión conlleva riesgo de pérdida.',
      '<strong>Cualquier decisión de inversión es de tu exclusiva responsabilidad.</strong> Te recomendamos contrastar la información y, si lo necesitas, consultar con un asesor financiero o fiscal profesional antes de invertir.',
    ],
  },
  {
    h: 'Registro y cuenta',
    body: [
      'Para usar la mayoría de funciones debes crear una cuenta con datos veraces. Eres responsable de mantener la confidencialidad de tus credenciales y de toda la actividad realizada desde tu cuenta. Debes ser mayor de edad.',
    ],
  },
  {
    h: 'Planes, pagos y cancelación',
    body: [
      'Los pagos de la suscripción Premium se procesan a través de <strong>Paddle</strong>, que actúa como <em>merchant of record</em> y emite la factura correspondiente (IVA incluido). El precio y la periodicidad se muestran antes de contratar.',
      'La suscripción se <strong>renueva automáticamente</strong> al final de cada periodo salvo que la canceles antes de la renovación. Puedes cancelar cuando quieras; conservarás el acceso Premium hasta el final del periodo ya pagado.',
      'Al tratarse de un servicio digital de acceso inmediato, si solicitas su uso durante el periodo de desistimiento reconoces que <strong>renuncias a tu derecho de desistimiento</strong> una vez comenzada la prestación, conforme a la normativa de consumidores. Las gestiones de reembolso se atienden a través de Paddle.',
      'La oferta de fundador (precio bloqueado de por vida para los primeros suscriptores) mantiene su precio mientras la suscripción permanezca activa y sin interrupciones.',
    ],
  },
  {
    h: 'Propiedad intelectual',
    body: [
      'El software, el diseño, los textos, las guías y especialmente las <strong>metodologías y algoritmos de puntuación de EverDiv (Score DGI, seguridad del dividendo, modelos de valoración y demás cálculos propios)</strong> son propiedad de EverDiv y están protegidos. Queda prohibida su reproducción, extracción sistemática (scraping), ingeniería inversa o explotación comercial sin autorización expresa.',
      'Puedes usar los datos y análisis para tus decisiones personales, pero no redistribuirlos ni comercializarlos.',
    ],
  },
  {
    h: 'Uso aceptable',
    body: [
      'Te comprometes a no usar la plataforma de forma que perjudique su funcionamiento o seguridad, incluyendo el acceso automatizado masivo, la sobrecarga de los sistemas o la vulneración de las medidas de control de acceso a las funciones Premium.',
    ],
  },
  {
    h: 'Limitación de responsabilidad',
    body: [
      'En la máxima medida permitida por la ley, EverDiv no será responsable de las pérdidas, directas o indirectas, derivadas de decisiones de inversión tomadas a partir de la información de la plataforma, ni de errores, retrasos o interrupciones del servicio o de las fuentes de datos.',
    ],
  },
  {
    h: 'Modificaciones, ley aplicable y jurisdicción',
    body: [
      'Podemos modificar estos términos y el servicio; publicaremos la versión vigente en esta página. El uso continuado tras un cambio implica su aceptación.',
      'Estas condiciones se rigen por la legislación española. Para cualquier controversia, y salvo que la normativa de consumidores disponga otro fuero, las partes se someten a los juzgados y tribunales que correspondan conforme a derecho.',
    ],
  },
]

export default function TerminosPage() {
  return (
    <LegalDoc
      title="Términos de uso"
      updated="8 de julio de 2026"
      intro="Estas son las condiciones que regulan el uso de EverDiv. Léelas con atención; el punto 3 es especialmente importante."
      sections={sections}
    />
  )
}
