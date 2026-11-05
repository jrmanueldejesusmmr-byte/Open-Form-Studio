/**
 * Catálogo completo de Bloques Arquitectónicos Esenciales (2D CAD + 3D)
 * Inspirado en los paquetes profesionales de AutoCAD (Catamuebles, Sanitarios, Cocina, Vehículos y Entorno).
 */

export type CadBlockCategory =
  | 'living'
  | 'dining'
  | 'bedrooms'
  | 'bathrooms'
  | 'kitchen'
  | 'office'
  | 'exterior'

export interface CadBlockDefinition {
  id: string
  label: string
  category: CadBlockCategory
  categoryLabel: string
  dimensions: { width: number; height: number; depth: number }
  defaultPrice: number // USD
  defaultMaterialId: string
  hint: string
  shortLabel: string
  /** Clave para la simbología 2D y geometría 3D */
  blockType: string
}

export const CAD_BLOCK_CATEGORIES: ReadonlyArray<{ id: CadBlockCategory; label: string; icon: string }> = [
  { id: 'living', label: '1. 🛋️ Sala y Estar (Living Room)', icon: 'sofa' },
  { id: 'dining', label: '2. 🍽️ Comedor y Desayunador (Dining)', icon: 'table' },
  { id: 'bedrooms', label: '3. 🛏️ Dormitorios (Bedrooms)', icon: 'bed' },
  { id: 'bathrooms', label: '4. 🚿 Baños y Accesorios Sanitarios (Plumbing)', icon: 'layers' },
  { id: 'kitchen', label: '5. 🍳 Cocina y Lavandería (Kitchen & Laundry)', icon: 'table' },
  { id: 'office', label: '6. 💻 Oficina y Estudio (Office)', icon: 'desk' },
  { id: 'exterior', label: '7. 🚗 Vehículos, Vegetación y Escala Humana', icon: 'plant' }
]

export const CAD_BLOCKS: readonly CadBlockDefinition[] = [
  /* -------------------------------------------------------------
   * 1. 🛋️ Sala y Estar (Living Room)
   * ------------------------------------------------------------- */
  {
    id: 'furn.living.sofa3',
    label: 'Sofá de 3 plazas',
    category: 'living',
    categoryLabel: 'Sala y Estar',
    dimensions: { width: 2.1, height: 0.85, depth: 0.9 },
    defaultPrice: 650,
    defaultMaterialId: 'mat.wood',
    hint: 'Sofá familiar 3 plazas - 2.10 × 0.90m',
    shortLabel: 'Sofá 3P',
    blockType: 'sofa3'
  },
  {
    id: 'furn.living.sofa2',
    label: 'Sofá de 2 plazas (Loveseat)',
    category: 'living',
    categoryLabel: 'Sala y Estar',
    dimensions: { width: 1.5, height: 0.85, depth: 0.85 },
    defaultPrice: 480,
    defaultMaterialId: 'mat.wood',
    hint: 'Sofá 2 plazas Loveseat - 1.50 × 0.85m',
    shortLabel: 'Loveseat 2P',
    blockType: 'sofa2'
  },
  {
    id: 'furn.living.armchair',
    label: 'Sillón individual (Butaca)',
    category: 'living',
    categoryLabel: 'Sala y Estar',
    dimensions: { width: 0.9, height: 0.85, depth: 0.85 },
    defaultPrice: 280,
    defaultMaterialId: 'mat.wood',
    hint: 'Sillón individual / Poltrona - 0.90 × 0.85m',
    shortLabel: 'Sillón 1P',
    blockType: 'armchair'
  },
  {
    id: 'furn.living.sofaL',
    label: 'Sofá en L (Seccional)',
    category: 'living',
    categoryLabel: 'Sala y Estar',
    dimensions: { width: 2.6, height: 0.85, depth: 1.8 },
    defaultPrice: 1150,
    defaultMaterialId: 'mat.wood',
    hint: 'Sofá esquinero seccional en L - 2.60 × 1.80m',
    shortLabel: 'Sofá en L',
    blockType: 'sofaL'
  },
  {
    id: 'furn.living.coffeeRect',
    label: 'Mesa de centro rectangular',
    category: 'living',
    categoryLabel: 'Sala y Estar',
    dimensions: { width: 1.2, height: 0.45, depth: 0.6 },
    defaultPrice: 190,
    defaultMaterialId: 'mat.walnut',
    hint: 'Mesa ratona centro rectangular - 1.20 × 0.60m',
    shortLabel: 'Mesa C. Rect',
    blockType: 'coffeeRect'
  },
  {
    id: 'furn.living.coffeeRound',
    label: 'Mesa de centro redonda',
    category: 'living',
    categoryLabel: 'Sala y Estar',
    dimensions: { width: 0.9, height: 0.45, depth: 0.9 },
    defaultPrice: 160,
    defaultMaterialId: 'mat.oak',
    hint: 'Mesa ratona centro circular - Ø 0.90m',
    shortLabel: 'Mesa C. Red',
    blockType: 'coffeeRound'
  },
  {
    id: 'furn.living.tvUnit',
    label: 'Mueble de TV con pantalla plana',
    category: 'living',
    categoryLabel: 'Sala y Estar',
    dimensions: { width: 1.8, height: 1.4, depth: 0.4 },
    defaultPrice: 420,
    defaultMaterialId: 'mat.walnut',
    hint: 'Centro de entretenimiento y Smart TV - 1.80 × 0.40m',
    shortLabel: 'Mueble TV',
    blockType: 'tvUnit'
  },
  {
    id: 'furn.living.piano',
    label: 'Piano de cola / vertical',
    category: 'living',
    categoryLabel: 'Sala y Estar',
    dimensions: { width: 1.5, height: 1.25, depth: 1.6 },
    defaultPrice: 3200,
    defaultMaterialId: 'mat.steel',
    hint: 'Piano acústico de sala - 1.50 × 1.60m',
    shortLabel: 'Piano',
    blockType: 'piano'
  },
  {
    id: 'furn.living.carpet',
    label: 'Alfombra decorativa',
    category: 'living',
    categoryLabel: 'Sala y Estar',
    dimensions: { width: 2.5, height: 0.02, depth: 1.8 },
    defaultPrice: 140,
    defaultMaterialId: 'mat.stucco',
    hint: 'Alfombra de área sala - 2.50 × 1.80m',
    shortLabel: 'Alfombra',
    blockType: 'carpet'
  },
  {
    id: 'furn.living.floorLamp',
    label: 'Lámpara de pie',
    category: 'living',
    categoryLabel: 'Sala y Estar',
    dimensions: { width: 0.4, height: 1.65, depth: 0.4 },
    defaultPrice: 95,
    defaultMaterialId: 'mat.metal-pot',
    hint: 'Lámpara de pie moderna - H 1.65m',
    shortLabel: 'Lámpara Pie',
    blockType: 'floorLamp'
  },

  /* -------------------------------------------------------------
   * 2. 🍽️ Comedor y Desayunador (Dining)
   * ------------------------------------------------------------- */
  {
    id: 'furn.dining.rect4',
    label: 'Comedor rectangular (4 personas)',
    category: 'dining',
    categoryLabel: 'Comedor y Desayunador',
    dimensions: { width: 1.3, height: 0.78, depth: 0.85 },
    defaultPrice: 420,
    defaultMaterialId: 'mat.wood',
    hint: 'Mesa rectangular con 4 sillas - 1.30 × 0.85m',
    shortLabel: 'Comedor 4P',
    blockType: 'diningRect4'
  },
  {
    id: 'furn.dining.rect6',
    label: 'Comedor rectangular (6 personas)',
    category: 'dining',
    categoryLabel: 'Comedor y Desayunador',
    dimensions: { width: 1.8, height: 0.78, depth: 0.95 },
    defaultPrice: 680,
    defaultMaterialId: 'mat.wood',
    hint: 'Mesa rectangular con 6 sillas - 1.80 × 0.95m',
    shortLabel: 'Comedor 6P',
    blockType: 'diningRect6'
  },
  {
    id: 'furn.dining.rect8',
    label: 'Comedor rectangular (8 personas)',
    category: 'dining',
    categoryLabel: 'Comedor y Desayunador',
    dimensions: { width: 2.4, height: 0.78, depth: 1.0 },
    defaultPrice: 950,
    defaultMaterialId: 'mat.walnut',
    hint: 'Mesa rectangular con 8 sillas - 2.40 × 1.00m',
    shortLabel: 'Comedor 8P',
    blockType: 'diningRect8'
  },
  {
    id: 'furn.dining.rect10',
    label: 'Comedor rectangular (10 personas)',
    category: 'dining',
    categoryLabel: 'Comedor y Desayunador',
    dimensions: { width: 3.0, height: 0.78, depth: 1.1 },
    defaultPrice: 1350,
    defaultMaterialId: 'mat.walnut',
    hint: 'Mesa de banquete con 10 sillas - 3.00 × 1.10m',
    shortLabel: 'Comedor 10P',
    blockType: 'diningRect10'
  },
  {
    id: 'furn.dining.round4',
    label: 'Comedor circular (4 personas)',
    category: 'dining',
    categoryLabel: 'Comedor y Desayunador',
    dimensions: { width: 1.2, height: 0.78, depth: 1.2 },
    defaultPrice: 460,
    defaultMaterialId: 'mat.oak',
    hint: 'Mesa redonda con 4 sillas - Ø 1.20m',
    shortLabel: 'Comedor R. 4P',
    blockType: 'diningRound4'
  },
  {
    id: 'furn.dining.round6',
    label: 'Comedor circular (6 personas)',
    category: 'dining',
    categoryLabel: 'Comedor y Desayunador',
    dimensions: { width: 1.6, height: 0.78, depth: 1.6 },
    defaultPrice: 720,
    defaultMaterialId: 'mat.oak',
    hint: 'Mesa redonda con 6 sillas - Ø 1.60m',
    shortLabel: 'Comedor R. 6P',
    blockType: 'diningRound6'
  },
  {
    id: 'furn.dining.bar',
    label: 'Barra desayunadora con bancos',
    category: 'dining',
    categoryLabel: 'Comedor y Desayunador',
    dimensions: { width: 1.8, height: 1.05, depth: 0.6 },
    defaultPrice: 520,
    defaultMaterialId: 'mat.wood',
    hint: 'Barra desayunador + 3 bancos altos - 1.80 × 0.60m',
    shortLabel: 'Barra Desayuno',
    blockType: 'breakfastBar'
  },

  /* -------------------------------------------------------------
   * 3. 🛏️ Dormitorios (Bedrooms)
   * ------------------------------------------------------------- */
  {
    id: 'furn.bed.single',
    label: 'Cama Individual (1 plaza)',
    category: 'bedrooms',
    categoryLabel: 'Dormitorios',
    dimensions: { width: 1.1, height: 0.9, depth: 2.0 },
    defaultPrice: 310,
    defaultMaterialId: 'mat.wood',
    hint: 'Cama 1 plaza con almohada y mesita de noche - 1.10 × 2.00m',
    shortLabel: 'Cama 1P',
    blockType: 'bedSingle'
  },
  {
    id: 'furn.bed.queen',
    label: 'Cama Matrimonial / Queen (2 plazas)',
    category: 'bedrooms',
    categoryLabel: 'Dormitorios',
    dimensions: { width: 2.2, height: 1.0, depth: 2.1 },
    defaultPrice: 640,
    defaultMaterialId: 'mat.wood',
    hint: 'Cama Queen con 2 almohadas y 2 burós laterales - 2.20 × 2.10m',
    shortLabel: 'Cama Queen',
    blockType: 'bedQueen'
  },
  {
    id: 'furn.bed.king',
    label: 'Cama King Size (Master)',
    category: 'bedrooms',
    categoryLabel: 'Dormitorios',
    dimensions: { width: 2.4, height: 1.1, depth: 2.15 },
    defaultPrice: 890,
    defaultMaterialId: 'mat.wood',
    hint: 'Cama King Size con cabecero y mesas de noche - 2.40 × 2.15m',
    shortLabel: 'Cama King',
    blockType: 'bedKing'
  },
  {
    id: 'furn.bed.bunk',
    label: 'Litera / Camarote de dos pisos',
    category: 'bedrooms',
    categoryLabel: 'Dormitorios',
    dimensions: { width: 1.1, height: 1.7, depth: 2.05 },
    defaultPrice: 480,
    defaultMaterialId: 'mat.wood',
    hint: 'Litera / camarote de 2 niveles con escalera - 1.10 × 2.05m',
    shortLabel: 'Litera / Camarote',
    blockType: 'bedBunk'
  },
  {
    id: 'furn.bed.closet',
    label: 'Clóset / Armario ropero empotrado',
    category: 'bedrooms',
    categoryLabel: 'Dormitorios',
    dimensions: { width: 2.0, height: 2.3, depth: 0.65 },
    defaultPrice: 750,
    defaultMaterialId: 'mat.walnut',
    hint: 'Armario ropero 3 puertas corredizas - 2.00 × 0.65m',
    shortLabel: 'Clóset Ropero',
    blockType: 'closet'
  },
  {
    id: 'furn.bed.vanity',
    label: 'Tocador con espejo',
    category: 'bedrooms',
    categoryLabel: 'Dormitorios',
    dimensions: { width: 1.2, height: 1.6, depth: 0.5 },
    defaultPrice: 340,
    defaultMaterialId: 'mat.oak',
    hint: 'Mesa tocador con espejo y banqueta - 1.20 × 0.50m',
    shortLabel: 'Tocador Espejo',
    blockType: 'vanityDresser'
  },

  /* -------------------------------------------------------------
   * 4. 🚿 Baños y Accesorios Sanitarios (Plumbing / Bathrooms)
   * ------------------------------------------------------------- */
  {
    id: 'furn.bath.toilet',
    label: 'Inodoro / WC (taza con tanque)',
    category: 'bathrooms',
    categoryLabel: 'Baños y Sanitarios',
    dimensions: { width: 0.5, height: 0.8, depth: 0.7 },
    defaultPrice: 185,
    defaultMaterialId: 'mat.ceramic',
    hint: 'Inodoro cerámico blanco con tanque - 0.50 × 0.70m',
    shortLabel: 'Inodoro / WC',
    blockType: 'toilet'
  },
  {
    id: 'furn.bath.sinkPedestal',
    label: 'Lavamanos de pedestal',
    category: 'bathrooms',
    categoryLabel: 'Baños y Sanitarios',
    dimensions: { width: 0.55, height: 0.85, depth: 0.48 },
    defaultPrice: 120,
    defaultMaterialId: 'mat.ceramic',
    hint: 'Lavabo con pie cerámico y grifería - 0.55 × 0.48m',
    shortLabel: 'Lavabo Pedestal',
    blockType: 'sinkPedestal'
  },
  {
    id: 'furn.bath.vanitySingle',
    label: 'Lavamanos sobre mueble (Vanity simple)',
    category: 'bathrooms',
    categoryLabel: 'Baños y Sanitarios',
    dimensions: { width: 0.9, height: 0.85, depth: 0.55 },
    defaultPrice: 290,
    defaultMaterialId: 'mat.wood',
    hint: 'Mueble de baño 1 lavabo con gavetas - 0.90 × 0.55m',
    shortLabel: 'Vanity Simple',
    blockType: 'vanitySingle'
  },
  {
    id: 'furn.bath.vanityDouble',
    label: 'Lavamanos sobre mueble (Vanity doble)',
    category: 'bathrooms',
    categoryLabel: 'Baños y Sanitarios',
    dimensions: { width: 1.6, height: 0.85, depth: 0.55 },
    defaultPrice: 520,
    defaultMaterialId: 'mat.wood',
    hint: 'Mueble de baño con doble poza y encimera - 1.60 × 0.55m',
    shortLabel: 'Vanity Doble',
    blockType: 'vanityDouble'
  },
  {
    id: 'furn.bath.urinal',
    label: 'Mingitorio mural',
    category: 'bathrooms',
    categoryLabel: 'Baños y Sanitarios',
    dimensions: { width: 0.4, height: 0.75, depth: 0.35 },
    defaultPrice: 140,
    defaultMaterialId: 'mat.ceramic',
    hint: 'Urinario de pared para baño público/comercial - 0.40 × 0.35m',
    shortLabel: 'Mingitorio',
    blockType: 'urinal'
  },
  {
    id: 'furn.bath.shower',
    label: 'Ducha cuadrada con mampara (0.90x0.90m)',
    category: 'bathrooms',
    categoryLabel: 'Baños y Sanitarios',
    dimensions: { width: 0.9, height: 2.1, depth: 0.9 },
    defaultPrice: 380,
    defaultMaterialId: 'mat.glass',
    hint: 'Plato de ducha 0.90×0.90m con mampara de cristal templado',
    shortLabel: 'Ducha Mampara',
    blockType: 'shower'
  },
  {
    id: 'furn.bath.bathtub',
    label: 'Tina / Bañera rectangular',
    category: 'bathrooms',
    categoryLabel: 'Baños y Sanitarios',
    dimensions: { width: 1.7, height: 0.55, depth: 0.8 },
    defaultPrice: 560,
    defaultMaterialId: 'mat.ceramic',
    hint: 'Bañera acrílica rectangular estándar - 1.70 × 0.80m',
    shortLabel: 'Bañera / Tina',
    blockType: 'bathtub'
  },
  {
    id: 'furn.bath.jacuzzi',
    label: 'Tina esquinera (Jacuzzi hidromasaje)',
    category: 'bathrooms',
    categoryLabel: 'Baños y Sanitarios',
    dimensions: { width: 1.5, height: 0.65, depth: 1.5 },
    defaultPrice: 1100,
    defaultMaterialId: 'mat.ceramic',
    hint: 'Bañera de hidromasaje esquinera - 1.50 × 1.50m',
    shortLabel: 'Jacuzzi Esquina',
    blockType: 'jacuzzi'
  },
  {
    id: 'furn.bath.accessories',
    label: 'Set de accesorios de baño (Toallero/Portarrollo)',
    category: 'bathrooms',
    categoryLabel: 'Baños y Sanitarios',
    dimensions: { width: 0.6, height: 0.2, depth: 0.15 },
    defaultPrice: 45,
    defaultMaterialId: 'mat.steel',
    hint: 'Barra toallero cromada + portarrollo de papel',
    shortLabel: 'Accesorios Baño',
    blockType: 'bathAccessories'
  },

  /* -------------------------------------------------------------
   * 5. 🍳 Cocina y Lavandería (Kitchen & Laundry)
   * ------------------------------------------------------------- */
  {
    id: 'furn.kitchen.sink1',
    label: 'Fregadero / Lavaplatos 1 poza',
    category: 'kitchen',
    categoryLabel: 'Cocina y Lavandería',
    dimensions: { width: 0.6, height: 0.88, depth: 0.6 },
    defaultPrice: 175,
    defaultMaterialId: 'mat.steel',
    hint: 'Fregadero bajo encimera 1 poceta con grifo - 0.60 × 0.60m',
    shortLabel: 'Fregadero 1P',
    blockType: 'kitchenSink1'
  },
  {
    id: 'furn.kitchen.sink2',
    label: 'Fregadero 2 pozas con escurridor',
    category: 'kitchen',
    categoryLabel: 'Cocina y Lavandería',
    dimensions: { width: 1.2, height: 0.88, depth: 0.6 },
    defaultPrice: 260,
    defaultMaterialId: 'mat.steel',
    hint: 'Fregadero acero inox 2 cubetas + escurridor - 1.20 × 0.60m',
    shortLabel: 'Fregadero 2P+Esc',
    blockType: 'kitchenSink2'
  },
  {
    id: 'furn.kitchen.stove4',
    label: 'Estufa / Cocina 4 quemadores con horno',
    category: 'kitchen',
    categoryLabel: 'Cocina y Lavandería',
    dimensions: { width: 0.6, height: 0.9, depth: 0.65 },
    defaultPrice: 380,
    defaultMaterialId: 'mat.steel',
    hint: 'Cocina 4 fuegos a gas/eléctrica con horno - 0.60 × 0.65m',
    shortLabel: 'Cocina 4Q',
    blockType: 'stove4'
  },
  {
    id: 'furn.kitchen.stove6',
    label: 'Estufa / Cocina 6 quemadores con horno',
    category: 'kitchen',
    categoryLabel: 'Cocina y Lavandería',
    dimensions: { width: 0.9, height: 0.9, depth: 0.65 },
    defaultPrice: 540,
    defaultMaterialId: 'mat.steel',
    hint: 'Cocina semi-industrial 6 quemadores - 0.90 × 0.65m',
    shortLabel: 'Cocina 6Q',
    blockType: 'stove6'
  },
  {
    id: 'furn.kitchen.fridge1',
    label: 'Refrigeradora de 1 puerta',
    category: 'kitchen',
    categoryLabel: 'Cocina y Lavandería',
    dimensions: { width: 0.7, height: 1.75, depth: 0.7 },
    defaultPrice: 620,
    defaultMaterialId: 'mat.steel',
    hint: 'Nevera congelador superior 1 puerta - 0.70 × 0.70m',
    shortLabel: 'Nevera 1P',
    blockType: 'fridge1'
  },
  {
    id: 'furn.kitchen.fridge2',
    label: 'Refrigeradora 2 puertas (Side-by-Side)',
    category: 'kitchen',
    categoryLabel: 'Cocina y Lavandería',
    dimensions: { width: 0.95, height: 1.85, depth: 0.75 },
    defaultPrice: 1150,
    defaultMaterialId: 'mat.steel',
    hint: 'Frigorífico americano dos puertas - 0.95 × 0.75m',
    shortLabel: 'Nevera 2P (SxS)',
    blockType: 'fridge2'
  },
  {
    id: 'furn.kitchen.island',
    label: 'Isla de cocina con desayunador',
    category: 'kitchen',
    categoryLabel: 'Cocina y Lavandería',
    dimensions: { width: 2.0, height: 0.92, depth: 1.0 },
    defaultPrice: 850,
    defaultMaterialId: 'mat.marble',
    hint: 'Mueble isla central con barra y almacenaje - 2.00 × 1.00m',
    shortLabel: 'Isla Cocina',
    blockType: 'kitchenIsland'
  },
  {
    id: 'furn.kitchen.microwave',
    label: 'Horno microondas sobre encimera',
    category: 'kitchen',
    categoryLabel: 'Cocina y Lavandería',
    dimensions: { width: 0.55, height: 0.35, depth: 0.4 },
    defaultPrice: 110,
    defaultMaterialId: 'mat.steel',
    hint: 'Microondas digital compacto - 0.55 × 0.40m',
    shortLabel: 'Microondas',
    blockType: 'microwave'
  },
  {
    id: 'furn.kitchen.washer',
    label: 'Lavadora automática frontal',
    category: 'kitchen',
    categoryLabel: 'Cocina y Lavandería',
    dimensions: { width: 0.65, height: 0.95, depth: 0.65 },
    defaultPrice: 460,
    defaultMaterialId: 'mat.steel',
    hint: 'Lavadora de carga frontal - 0.65 × 0.65m',
    shortLabel: 'Lavadora',
    blockType: 'washer'
  },
  {
    id: 'furn.kitchen.dryer',
    label: 'Secadora de ropa',
    category: 'kitchen',
    categoryLabel: 'Cocina y Lavandería',
    dimensions: { width: 0.65, height: 0.95, depth: 0.65 },
    defaultPrice: 440,
    defaultMaterialId: 'mat.steel',
    hint: 'Secadora automática - 0.65 × 0.65m',
    shortLabel: 'Secadora',
    blockType: 'dryer'
  },
  {
    id: 'furn.kitchen.washTub',
    label: 'Pila de lavar tradicional (Lavadero)',
    category: 'kitchen',
    categoryLabel: 'Cocina y Lavandería',
    dimensions: { width: 0.8, height: 0.85, depth: 0.65 },
    defaultPrice: 135,
    defaultMaterialId: 'mat.concrete',
    hint: 'Pila de lavar de hormigón/granito con fregadero - 0.80 × 0.65m',
    shortLabel: 'Pila Lavar',
    blockType: 'washTub'
  },

  /* -------------------------------------------------------------
   * 6. 💻 Oficina y Estudio (Office)
   * ------------------------------------------------------------- */
  {
    id: 'furn.office.deskPc',
    label: 'Escritorio con silla ergonómica y PC',
    category: 'office',
    categoryLabel: 'Oficina y Estudio',
    dimensions: { width: 1.4, height: 1.2, depth: 0.75 },
    defaultPrice: 360,
    defaultMaterialId: 'mat.oak',
    hint: 'Puesto de trabajo completo con monitor, teclado y silla giratoria',
    shortLabel: 'Escritorio PC',
    blockType: 'deskPc'
  },
  {
    id: 'furn.office.deskL',
    label: 'Escritorio ejecutivo en L',
    category: 'office',
    categoryLabel: 'Oficina y Estudio',
    dimensions: { width: 1.9, height: 1.2, depth: 1.6 },
    defaultPrice: 580,
    defaultMaterialId: 'mat.walnut',
    hint: 'Mesa ejecutiva con ala lateral en L y sillón - 1.90 × 1.60m',
    shortLabel: 'Escritorio L',
    blockType: 'deskL'
  },
  {
    id: 'furn.office.meeting',
    label: 'Mesa de juntas / conferencias (8 personas)',
    category: 'office',
    categoryLabel: 'Oficina y Estudio',
    dimensions: { width: 2.8, height: 0.78, depth: 1.2 },
    defaultPrice: 890,
    defaultMaterialId: 'mat.walnut',
    hint: 'Mesa de reuniones ovalada/rectangular con 8 sillas ejecutivas',
    shortLabel: 'Mesa Juntas 8P',
    blockType: 'meetingTable'
  },
  {
    id: 'furn.office.bookcase',
    label: 'Librero / Estantería modular',
    category: 'office',
    categoryLabel: 'Oficina y Estudio',
    dimensions: { width: 1.0, height: 2.0, depth: 0.35 },
    defaultPrice: 220,
    defaultMaterialId: 'mat.wood',
    hint: 'Estantería vertical 5 baldas para libros/archivos - 1.00 × 0.35m',
    shortLabel: 'Librero / Estante',
    blockType: 'bookcase'
  },
  {
    id: 'furn.office.fileCabinet',
    label: 'Archivador metálico (4 cajones)',
    category: 'office',
    categoryLabel: 'Oficina y Estudio',
    dimensions: { width: 0.48, height: 1.35, depth: 0.6 },
    defaultPrice: 160,
    defaultMaterialId: 'mat.steel',
    hint: 'Archivador vertical de carpetas colgantes - 0.48 × 0.60m',
    shortLabel: 'Archivador',
    blockType: 'fileCabinet'
  },

  /* -------------------------------------------------------------
   * 7. 🚗 Vehículos, Vegetación y Escala Humana (Exterior & Entorno)
   * ------------------------------------------------------------- */
  {
    id: 'furn.ext.sedan',
    label: 'Automóvil Sedán',
    category: 'exterior',
    categoryLabel: 'Vehículos y Entorno',
    dimensions: { width: 1.85, height: 1.5, depth: 4.6 },
    defaultPrice: 18000,
    defaultMaterialId: 'mat.steel',
    hint: 'Auto sedán para cochera y estacionamiento - 1.85 × 4.60m',
    shortLabel: 'Auto Sedán',
    blockType: 'carSedan'
  },
  {
    id: 'furn.ext.suv',
    label: 'Camioneta SUV / Pickup 4x4',
    category: 'exterior',
    categoryLabel: 'Vehículos y Entorno',
    dimensions: { width: 2.0, height: 1.8, depth: 5.1 },
    defaultPrice: 29000,
    defaultMaterialId: 'mat.steel',
    hint: 'Camioneta SUV familiar / todoterreno - 2.00 × 5.10m',
    shortLabel: 'Camioneta SUV',
    blockType: 'carSuv'
  },
  {
    id: 'furn.ext.motorcycle',
    label: 'Motocicleta urbana',
    category: 'exterior',
    categoryLabel: 'Vehículos y Entorno',
    dimensions: { width: 0.85, height: 1.2, depth: 2.1 },
    defaultPrice: 3200,
    defaultMaterialId: 'mat.steel',
    hint: 'Moto estándar para parqueo - 0.85 × 2.10m',
    shortLabel: 'Motocicleta',
    blockType: 'motorcycle'
  },
  {
    id: 'furn.ext.bicycle',
    label: 'Bicicleta de paseo',
    category: 'exterior',
    categoryLabel: 'Vehículos y Entorno',
    dimensions: { width: 0.6, height: 1.05, depth: 1.75 },
    defaultPrice: 280,
    defaultMaterialId: 'mat.steel',
    hint: 'Bicicleta en aparcabicis o patio - 0.60 × 1.75m',
    shortLabel: 'Bicicleta',
    blockType: 'bicycle'
  },
  {
    id: 'furn.ext.truck',
    label: 'Camión ligero de carga',
    category: 'exterior',
    categoryLabel: 'Vehículos y Entorno',
    dimensions: { width: 2.2, height: 2.4, depth: 6.2 },
    defaultPrice: 34000,
    defaultMaterialId: 'mat.steel',
    hint: 'Camión furgón 3.5 toneladas - 2.20 × 6.20m',
    shortLabel: 'Camión Ligero',
    blockType: 'truck'
  },
  {
    id: 'furn.ext.bus',
    label: 'Autobús de pasajeros',
    category: 'exterior',
    categoryLabel: 'Vehículos y Entorno',
    dimensions: { width: 2.55, height: 3.2, depth: 11.5 },
    defaultPrice: 65000,
    defaultMaterialId: 'mat.steel',
    hint: 'Autobús urbano / transporte - 2.55 × 11.50m',
    shortLabel: 'Autobús',
    blockType: 'bus'
  },
  {
    id: 'furn.ext.tree',
    label: 'Árbol de copa frondosa',
    category: 'exterior',
    categoryLabel: 'Vehículos y Entorno',
    dimensions: { width: 3.5, height: 4.8, depth: 3.5 },
    defaultPrice: 85,
    defaultMaterialId: 'mat.grass',
    hint: 'Árbol ornamental con copa verde - Ø 3.50m × H 4.80m',
    shortLabel: 'Árbol Frondoso',
    blockType: 'tree'
  },
  {
    id: 'furn.ext.palm',
    label: 'Palmera tropical',
    category: 'exterior',
    categoryLabel: 'Vehículos y Entorno',
    dimensions: { width: 2.8, height: 5.5, depth: 2.8 },
    defaultPrice: 120,
    defaultMaterialId: 'mat.grass',
    hint: 'Palmera de jardín / acera - Ø 2.80m × H 5.50m',
    shortLabel: 'Palmera',
    blockType: 'palm'
  },
  {
    id: 'furn.ext.shrub',
    label: 'Arbusto / Seto perimetral',
    category: 'exterior',
    categoryLabel: 'Vehículos y Entorno',
    dimensions: { width: 1.2, height: 1.1, depth: 0.8 },
    defaultPrice: 35,
    defaultMaterialId: 'mat.grass',
    hint: 'Seto verde recortado para jardinería - 1.20 × 0.80m',
    shortLabel: 'Arbusto / Seto',
    blockType: 'shrub'
  },
  {
    id: 'furn.ext.potPlant',
    label: 'Macetera decorativa interior',
    category: 'exterior',
    categoryLabel: 'Vehículos y Entorno',
    dimensions: { width: 0.5, height: 1.2, depth: 0.5 },
    defaultPrice: 45,
    defaultMaterialId: 'mat.grass',
    hint: 'Planta en maceta para interiores - Ø 0.50m × H 1.20m',
    shortLabel: 'Macetera',
    blockType: 'potPlant'
  },
  {
    id: 'furn.ext.human',
    label: 'Escala Humana (Figura 1.70m)',
    category: 'exterior',
    categoryLabel: 'Vehículos y Entorno',
    dimensions: { width: 0.5, height: 1.7, depth: 0.3 },
    defaultPrice: 0,
    defaultMaterialId: 'mat.stone',
    hint: 'Silueta humana para proporción espacial en 2D y 3D (1.70m)',
    shortLabel: 'Escala Humana',
    blockType: 'human'
  }
]

/** Mapa de resolución por id o alias legacy */
const BLOCKS_MAP = new Map<string, CadBlockDefinition>()
for (const b of CAD_BLOCKS) {
  BLOCKS_MAP.set(b.id, b)
}

// Aliases para compatibilidad con código anterior:
BLOCKS_MAP.set('furn.sofa', BLOCKS_MAP.get('furn.living.sofa3')!)
BLOCKS_MAP.set('furn.armchair', BLOCKS_MAP.get('furn.living.armchair')!)
BLOCKS_MAP.set('furn.table', BLOCKS_MAP.get('furn.dining.rect6')!)
BLOCKS_MAP.set('furn.chair', BLOCKS_MAP.get('furn.office.deskPc')!)
BLOCKS_MAP.set('furn.desk', BLOCKS_MAP.get('furn.office.deskPc')!)
BLOCKS_MAP.set('furn.bed', BLOCKS_MAP.get('furn.bed.queen')!)
BLOCKS_MAP.set('furn.lamp', BLOCKS_MAP.get('furn.living.floorLamp')!)
BLOCKS_MAP.set('furn.plant', BLOCKS_MAP.get('furn.ext.potPlant')!)

export function getCadBlock(id: string): CadBlockDefinition | undefined {
  return BLOCKS_MAP.get(id)
}

export function isCadBlock(id: string): boolean {
  return BLOCKS_MAP.has(id) || id.startsWith('furn.')
}

