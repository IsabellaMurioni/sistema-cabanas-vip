export const CABANAS = [
  'Bahama', 'Bahia', 'Maui', 'Itaparica', 'Acapulco',
  'Cozumel', 'Ibiza', 'Ipanema', 'Maceio', 'Hawai',
  'Vallarta', 'Aruba', 'Cancún', 'Buzios', 'Jamaica',
]

export const CABANA_COLORS = {
  Bahama:    '#1e3a5f',
  Bahia:     '#065f46',
  Maui:      '#0ea5e9',
  Itaparica: '#4d7c0f',
  Acapulco:  '#ea580c',
  Cozumel:   '#db2777',
  Ibiza:     '#7c3aed',
  Ipanema:   '#d97706',
  Maceio:    '#dc2626',
  Hawai:     '#0d9488',
  Vallarta:  '#9333ea',
  Aruba:     '#16a34a',
  'Cancún':  '#2563eb',
  Buzios:    '#e11d48',
  Jamaica:   '#92400e',
}

export function getCabanaColor(cabana) {
  return CABANA_COLORS[cabana] || '#64748b'
}
