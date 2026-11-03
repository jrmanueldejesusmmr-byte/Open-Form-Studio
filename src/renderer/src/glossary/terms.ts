export interface GlossaryTerm {
  id: string;
  nombre: string;
  categoria: string;
  nivel: 'principiante' | 'profesional';
  definicionCorta: string;
  definicionLarga: string;
  relacionados: string[];
}

export const GLOSSARY_TERMS: GlossaryTerm[] = [
  {
    id: 'bim',
    nombre: 'BIM (Building Information Modeling)',
    categoria: 'BIM',
    nivel: 'principiante',
    definicionCorta: 'Metodología de trabajo colaborativa para la creación y gestión de un proyecto de construcción.',
    definicionLarga: 'Metodología basada en el uso de un modelo digital 3D centralizado que integra datos físicos, geométricos y de costos a lo largo de todo el ciclo de vida del edificio.',
    relacionados: ['lod']
  },
  {
    id: 'lod',
    nombre: 'LOD (Level of Development)',
    categoria: 'BIM',
    nivel: 'profesional',
    definicionCorta: 'Nivel de Desarrollo que define el grado de detalle geométrico e informativo de los elementos BIM.',
    definicionLarga: 'Métrica estandarizada que indica la claridad, precisión y nivel de detalle geométrico y de datos que posee un elemento del modelo en cada etapa del proyecto.',
    relacionados: ['bim']
  }
];

export function validarTerminosGlosario(terminos: GlossaryTerm[] = GLOSSARY_TERMS): boolean {
  const ids = new Set(terminos.map((t) => t.id));
  for (const t of terminos) {
    for (const rel of t.relacionados) {
      if (!ids.has(rel)) {
        console.error(`Error: El término relacionado '${rel}' no existe en el glosario.`);
        return false;
      }
    }
  }
  return true;
}