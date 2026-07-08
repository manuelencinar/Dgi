import LegalDoc from '@/components/LegalDoc'

const BASE = 'https://www.everdiv.com'
export const metadata = {
  title: 'Política de cookies | EverDiv',
  description: 'Qué cookies utiliza EverDiv, para qué sirven y cómo gestionarlas.',
  alternates: { canonical: `${BASE}/cookies` },
}

const sections = [
  {
    h: '¿Qué son las cookies?',
    body: [
      'Las cookies son pequeños archivos que un sitio web guarda en tu dispositivo para que funcione correctamente, recordar tu sesión o entender cómo se usa. Algunas son imprescindibles y otras son opcionales.',
    ],
  },
  {
    h: 'Cookies que utilizamos',
    body: [
      { list: [
        '<strong>Técnicas o necesarias.</strong> Permiten mantener tu sesión iniciada, recordar tu preferencia de tema (claro/oscuro) y procesar el pago de forma segura. Sin ellas la plataforma no funciona, por lo que no requieren consentimiento.',
        '<strong>Analíticas (opcionales).</strong> Nos ayudan a entender de forma agregada cómo se usa la app para mejorarla. Solo se activan si prestas tu consentimiento y no se utilizan para publicidad.',
      ] },
      'No utilizamos cookies de publicidad ni compartimos tu información con redes publicitarias.',
    ],
  },
  {
    h: 'Cómo gestionarlas',
    body: [
      'Puedes aceptar o rechazar las cookies opcionales desde el aviso que mostramos en tu primera visita. Además, puedes bloquear o eliminar las cookies desde la configuración de tu navegador en cualquier momento; ten en cuenta que desactivar las cookies técnicas puede impedir el correcto funcionamiento del servicio.',
    ],
  },
  {
    h: 'Cambios',
    body: [
      'Si modificamos las cookies que utilizamos, actualizaremos esta página con la fecha correspondiente.',
    ],
  },
]

export default function CookiesPage() {
  return (
    <LegalDoc
      title="Política de cookies"
      updated="8 de julio de 2026"
      intro="Usamos las cookies mínimas para que EverDiv funcione y, solo con tu permiso, para entender cómo mejorar la app."
      sections={sections}
    />
  )
}
