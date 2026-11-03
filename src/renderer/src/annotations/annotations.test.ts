import { describe, it, expect } from 'vitest'
import {
  type AnnotationItem,
  type DimensionAnnotation,
  type HighlightAnnotation,
  type LeaderAnnotation,
  type NoteAnnotation,
  type RevisionAnnotation,
  type TableAnnotation,
  type TagAnnotation,
  type TextAnnotation,
  ANNOTATION_ACTIONS,
  ANNOTATION_MODE_LABELS,
  createAnnotationId,
  editableField,
  normalizeAnnotations,
  translateAnnotation
} from './types'
import {
  arrowHead,
  dimensionLine,
  formatMeters,
  leaderLanding,
  renderAnnotations,
  renderDraft,
  revisionCloudPath,
  type AnnotationRenderContext,
  type ScreenPoint
} from './AnnotationRenderer'
import {
  parseProjectJson,
  serializeProjectState
} from '../services/ProjectPersistence'
import { SceneManager } from '../engine/SceneManager'

describe('Sistema de Anotaciones y Revisión Técnica (Menú «Notas»)', () => {
  it('1. Debe mapear exactamente las 8 acciones del menú Notas a sus modos', () => {
    expect(ANNOTATION_ACTIONS['notas.note']).toBe('note')
    expect(ANNOTATION_ACTIONS['notas.leader']).toBe('leader')
    expect(ANNOTATION_ACTIONS['notas.revision']).toBe('revision')
    expect(ANNOTATION_ACTIONS['notas.table']).toBe('table')
    expect(ANNOTATION_ACTIONS['annot.text']).toBe('text')
    expect(ANNOTATION_ACTIONS['annot.dimension']).toBe('dimension')
    expect(ANNOTATION_ACTIONS['annot.tag']).toBe('tag')
    expect(ANNOTATION_ACTIONS['annot.highlight']).toBe('highlight')

    expect(Object.keys(ANNOTATION_ACTIONS)).toHaveLength(8)
    expect(Object.keys(ANNOTATION_MODE_LABELS)).toHaveLength(8)
  })

  it('2. Nota de texto: normalización, traslación y campo editable', () => {
    const rawNote = {
      type: 'note',
      position: { x: 5, y: 0, z: 10 },
      text: 'Revisar bajante pluvial'
    }
    const [note] = normalizeAnnotations([rawNote]) as [NoteAnnotation]
    expect(note).toBeDefined()
    expect(note.type).toBe('note')
    expect(note.position).toEqual({ x: 5, y: 0, z: 10 })
    expect(note.text).toBe('Revisar bajante pluvial')
    expect(editableField(note)).toBe('text')

    translateAnnotation(note, 2, -3)
    expect(note.position).toEqual({ x: 7, y: 0, z: 7 })
  })

  it('3. Directriz (Leader): 3 puntos, geometría de flecha y asiento horizontal', () => {
    const rawLeader = {
      type: 'leader',
      points: [
        { x: 0, y: 0, z: 0 },
        { x: 2, y: 0, z: 2 },
        { x: 4, y: 0, z: 2 }
      ],
      text: 'Muro de carga e=0.20m'
    }
    const [leader] = normalizeAnnotations([rawLeader]) as [LeaderAnnotation]
    expect(leader).toBeDefined()
    expect(leader.points).toHaveLength(3)
    expect(editableField(leader)).toBe('text')

    const tipScreen: ScreenPoint = { x: 100, y: 100 }
    const elbowScreen: ScreenPoint = { x: 200, y: 200 }
    const arrowSvg = arrowHead(tipScreen, elbowScreen, 12)
    expect(arrowSvg).toContain('M100.0,100.0')

    const endScreen: ScreenPoint = { x: 300, y: 200 }
    const landing = leaderLanding(elbowScreen, endScreen, 70)
    expect(landing.x).toBe(370)
    expect(landing.y).toBe(200)

    translateAnnotation(leader, 1, 1)
    expect(leader.points[0]).toEqual({ x: 1, y: 0, z: 1 })
    expect(leader.points[1]).toEqual({ x: 3, y: 0, z: 3 })
    expect(leader.points[2]).toEqual({ x: 5, y: 0, z: 3 })
  })

  it('4. Nube de revisión: arcos convexos continuos y badge editable', () => {
    const rawRev = {
      type: 'revision',
      points: [
        { x: 0, y: 0, z: 0 },
        { x: 5, y: 0, z: 0 },
        { x: 5, y: 0, z: 4 },
        { x: 0, y: 0, z: 4 }
      ],
      badge: 'Rev. 1'
    }
    const [rev] = normalizeAnnotations([rawRev]) as [RevisionAnnotation]
    expect(rev).toBeDefined()
    expect(rev.badge).toBe('Rev. 1')
    expect(editableField(rev)).toBe('badge')

    const screenPoints: ScreenPoint[] = [
      { x: 50, y: 50 },
      { x: 250, y: 50 },
      { x: 250, y: 200 },
      { x: 50, y: 200 }
    ]
    const path = revisionCloudPath(screenPoints, 20)
    expect(path).toContain('M50.0,50.0')
    expect(path).toContain('A')
    expect(path).toContain('Z')
  })

  it('5. Tabla de planos: normalización y traslación', () => {
    const rawTable = {
      type: 'table',
      position: { x: 12, y: 0, z: 8 }
    }
    const [table] = normalizeAnnotations([rawTable]) as [TableAnnotation]
    expect(table).toBeDefined()
    expect(table.type).toBe('table')

    translateAnnotation(table, -2, 4)
    expect(table.position).toEqual({ x: 10, y: 0, z: 12 })
  })

  it('6. Texto libre: orientación en múltiplos de 90° y tamaño de fuente', () => {
    const rawText = {
      type: 'text',
      position: { x: 3, y: 0, z: 3 },
      text: 'DORMITORIO PRINCIPAL',
      fontSize: 0.45,
      rotation: 90
    }
    const [text] = normalizeAnnotations([rawText]) as [TextAnnotation]
    expect(text.rotation).toBe(90)
    expect(text.text).toBe('DORMITORIO PRINCIPAL')
    expect(editableField(text)).toBe('text')
  })

  it('7. Cota lineal: cálculo euclidiano exacto, línea de cota y formateo en metros', () => {
    const dimItem: DimensionAnnotation = {
      id: createAnnotationId(),
      levelId: 'level-0',
      createdAt: Date.now(),
      type: 'dimension',
      start: { x: 0, y: 0, z: 0 },
      end: { x: 3.45, y: 0, z: 0 },
      offset: 0.5
    }

    const { a, b, length } = dimensionLine(dimItem)
    expect(length).toBeCloseTo(3.45, 2)
    expect(formatMeters(length)).toBe('3.45 m')

    // Offset perpendicular (en Z)
    expect(a.z).toBeCloseTo(0.5, 2)
    expect(b.z).toBeCloseTo(0.5, 2)

    translateAnnotation(dimItem, 1, 2)
    expect(dimItem.start.x).toBe(1)
    expect(dimItem.start.z).toBe(2)
  })

  it('8. Etiqueta de material: conexión con línea guía al ancla detectada', () => {
    const rawTag = {
      type: 'tag',
      anchor: { x: 4, y: 1.2, z: 6 },
      targetKind: 'wall',
      targetId: 'wall-123',
      label: 'Ladrillo rojo',
      labelOffset: { dx: 60, dy: -40 }
    }
    const [tag] = normalizeAnnotations([rawTag]) as [TagAnnotation]
    expect(tag).toBeDefined()
    expect(tag.label).toBe('Ladrillo rojo')
    expect(tag.targetKind).toBe('wall')
  })

  it('9. Resaltador: modo mano alzada y rectángulo con colores fluorescentes', () => {
    const rawHighlight: HighlightAnnotation = {
      id: createAnnotationId(),
      levelId: 'level-0',
      createdAt: Date.now(),
      type: 'highlight',
      shape: 'rect',
      points: [
        { x: 0, y: 0, z: 0 },
        { x: 4, y: 0, z: 3 }
      ],
      color: 'yellow',
      width: 0.35
    }
    const [high] = normalizeAnnotations([rawHighlight]) as [HighlightAnnotation]
    expect(high).toBeDefined()
    expect(high.shape).toBe('rect')
    expect(high.color).toBe('yellow')

    translateAnnotation(high, 2, 2)
    expect(high.points[0]).toEqual({ x: 2, y: 0, z: 2 })
    expect(high.points[1]).toEqual({ x: 6, y: 0, z: 5 })
  })

  it('10. Capa de renderizado: genera marcado SVG y HTML sincronizado', () => {
    const items: AnnotationItem[] = [
      {
        id: 'note-1',
        levelId: 'level-0',
        createdAt: Date.now(),
        type: 'note',
        position: { x: 2, y: 0, z: 2 },
        text: 'Nota de obra'
      },
      {
        id: 'high-1',
        levelId: 'level-0',
        createdAt: Date.now(),
        type: 'highlight',
        shape: 'freehand',
        points: [
          { x: 0, y: 0, z: 0 },
          { x: 1, y: 0, z: 1 }
        ],
        color: 'cyan',
        width: 0.35
      }
    ]

    const fakeCtx: AnnotationRenderContext = {
      project: (p) => ({ x: p.x * 50 + 100, y: p.z * 50 + 100 }),
      pixelsPerMeter: () => 50,
      selectedId: null,
      editingId: null,
      tableData: () => ({
        projectName: 'Prueba',
        date: '26/10/2026',
        scale: '1:50',
        wallCount: 4,
        area: '48.0 m²',
        level: 'Piso 0'
      }),
      tagLabel: () => 'Ladrillo'
    }

    const layer = renderAnnotations(items, fakeCtx)
    expect(layer.svg).toContain('annot-highlight')
    expect(layer.html).toContain('annot-note')
    expect(layer.html).toContain('Nota de obra')

    // Borrador
    const draftLayer = renderDraft(
      {
        type: 'dimension',
        start: { x: 0, y: 0, z: 0 },
        current: { x: 5, y: 0, z: 0 }
      },
      fakeCtx
    )
    expect(draftLayer.svg).toContain('annot-draft')
    expect(draftLayer.html).toContain('5.00 m')
  })

  it('11. Persistencia: serialización y restauración en el estado global del proyecto', () => {
    const scene = new SceneManager()
    const testItems: AnnotationItem[] = [
      {
        id: 'annot-note-test',
        levelId: 'level-0',
        createdAt: Date.now(),
        type: 'note',
        position: { x: 1, y: 0, z: 2 },
        text: 'Persistencia verificada'
      },
      {
        id: 'annot-dim-test',
        levelId: 'level-0',
        createdAt: Date.now(),
        type: 'dimension',
        start: { x: 0, y: 0, z: 0 },
        end: { x: 4, y: 0, z: 0 },
        offset: 0.6
      }
    ]

    const serialized = serializeProjectState({
      projectId: 'proj-annot-1',
      projectName: 'Proyecto con Anotaciones',
      scene,
      annotationItems: testItems
    })

    expect(serialized.annotations.items).toHaveLength(2)

    const jsonString = JSON.stringify(serialized)
    const parsed = parseProjectJson(jsonString)

    expect(parsed.annotations.items).toHaveLength(2)
    expect(parsed.annotations.items![0].type).toBe('note')
    expect((parsed.annotations.items![0] as NoteAnnotation).text).toBe('Persistencia verificada')
    expect(parsed.annotations.items![1].type).toBe('dimension')
    expect((parsed.annotations.items![1] as DimensionAnnotation).offset).toBe(0.6)
  })
})

