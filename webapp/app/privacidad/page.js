import LegalDoc from '@/components/LegalDoc'

const BASE = 'https://www.everdiv.com'
export const metadata = {
  title: 'Política de privacidad | EverDiv',
  description: 'Cómo trata EverDiv tus datos personales: finalidades, base jurídica, terceros encargados y tus derechos conforme al RGPD.',
  alternates: { canonical: `${BASE}/privacidad` },
}

const sections = [
  {
    h: 'Responsable del tratamiento',
    body: [
      'El responsable del tratamiento de los datos recogidos a través de <strong>EverDiv</strong> (everdiv.com) es <strong>[NOMBRE DEL TITULAR / RAZÓN SOCIAL]</strong>, con NIF <strong>[NIF/DNI]</strong> y domicilio en <strong>[DOMICILIO]</strong>.',
      'Correo de contacto en materia de protección de datos: <a href="mailto:soporte@everdiv.com">soporte@everdiv.com</a>.',
    ],
  },
  {
    h: 'Qué datos tratamos',
    body: [
      'Tratamos únicamente los datos necesarios para prestarte el servicio:',
      { list: [
        '<strong>Datos de registro:</strong> dirección de correo electrónico y, si accedes con Google, el identificador y el nombre asociados a esa cuenta.',
        '<strong>Datos que tú introduces:</strong> las posiciones, operaciones, dividendos, movimientos de liquidez y preferencias de tu cartera. Son datos que aportas voluntariamente para usar las funciones de la plataforma.',
        '<strong>Datos de uso:</strong> información técnica de navegación (páginas visitadas, dispositivo) con fines estadísticos y de mejora del servicio.',
        '<strong>Datos de pago:</strong> los gestiona íntegramente nuestro proveedor de pagos (Paddle) como <em>merchant of record</em>. <strong>EverDiv no almacena los datos de tu tarjeta.</strong>',
      ] },
    ],
  },
  {
    h: 'Finalidades y base jurídica',
    body: [
      { list: [
        '<strong>Prestar el servicio y gestionar tu cuenta</strong> (registro, cartera, análisis) — base: ejecución del contrato.',
        '<strong>Gestionar tu suscripción y los pagos</strong> — base: ejecución del contrato y cumplimiento de obligaciones legales (facturación).',
        '<strong>Enviarte avisos del servicio</strong> que has configurado (alertas de precio, cambios de dividendo, resumen mensual) — base: ejecución del contrato y consentimiento.',
        '<strong>Analítica y mejora del producto</strong> — base: interés legítimo y, cuando implique cookies no esenciales, tu consentimiento.',
      ] },
    ],
  },
  {
    h: 'Terceros que nos prestan servicios',
    body: [
      'Para funcionar, EverDiv se apoya en proveedores que pueden tratar datos por cuenta nuestra, siempre bajo contrato de encargo de tratamiento:',
      { list: [
        '<strong>Proveedor de infraestructura y base de datos</strong> (alojamiento seguro de la cuenta y la cartera).',
        '<strong>Proveedor de alojamiento y despliegue web.</strong>',
        '<strong>Proveedor de pagos (Paddle):</strong> procesa el cobro y emite la factura como merchant of record.',
        '<strong>Proveedor de envío de correo</strong> para los avisos que solicitas.',
        '<strong>Proveedor de analítica de producto</strong> para entender el uso agregado y mejorar la app.',
      ] },
      'Algunos de estos proveedores pueden estar ubicados fuera del Espacio Económico Europeo. En ese caso, las transferencias internacionales se amparan en las Cláusulas Contractuales Tipo aprobadas por la Comisión Europea u otras garantías adecuadas.',
    ],
  },
  {
    h: 'Conservación',
    body: [
      'Conservamos tus datos mientras mantengas tu cuenta activa. Si la cancelas, los eliminaremos o anonimizaremos, salvo los que debamos conservar por obligaciones legales (por ejemplo, los datos de facturación durante los plazos fiscales aplicables).',
    ],
  },
  {
    h: 'Tus derechos',
    body: [
      'Puedes ejercer en cualquier momento tus derechos de acceso, rectificación, supresión, oposición, limitación del tratamiento y portabilidad, escribiéndonos a <a href="mailto:soporte@everdiv.com">soporte@everdiv.com</a>. Desde la propia app puedes editar o borrar los datos de tu cartera y eliminar tu cuenta.',
      'Si consideras que no hemos atendido correctamente tu solicitud, tienes derecho a reclamar ante la Agencia Española de Protección de Datos (<a href="https://www.aepd.es" target="_blank" rel="noopener">www.aepd.es</a>).',
    ],
  },
  {
    h: 'Seguridad',
    body: [
      'Aplicamos medidas técnicas y organizativas para proteger tus datos (cifrado en tránsito, control de acceso por usuario y aislamiento de los datos de cada cuenta). Ningún sistema es infalible, pero trabajamos para minimizar los riesgos.',
    ],
  },
  {
    h: 'Cambios en esta política',
    body: [
      'Podemos actualizar esta política para reflejar cambios legales o del servicio. Publicaremos la versión vigente en esta misma página con su fecha de actualización.',
    ],
  },
]

export default function PrivacidadPage() {
  return (
    <LegalDoc
      title="Política de privacidad"
      updated="8 de julio de 2026"
      intro="En EverDiv nos tomamos en serio tu privacidad. Aquí te explicamos con transparencia qué datos tratamos, para qué y qué derechos tienes."
      sections={sections}
    />
  )
}
