/**
 * Módulo de importación topográfica CAD / GIS (estilo AutoCAD Civil).
 * Soporta lectura de elevaciones 3D desde:
 * - `.DXF`: `POLYLINE` + `VERTEX` 3D (códigos 10, 20, 30), `LWPOLYLINE` con
 *   elevación (código 38), `LINE` 3D (10,20,30 - 11,21,31), `POINT` (10,20,30),
 *   `3DFACE` (10..13, 20..23, 30..33) y `SPLINE`.
 * - `.CSV` y `.TXT`: nubes de puntos topográficos `X,Y,Z` o `ID,X,Y,Z`.
 * - `.GeoJSON` (`.geojson` / `.json`): `Point`, `MultiPoint`, `LineString`,
 *   `MultiLineString`, `Polygon`, `MultiPolygon` con coordenada Z o propiedad
 *   de cota (`elevation`, `ele`, `z`, `cota`, `height`, `nivel`).
 */

export interface TopographyPoint3D {
  /** Coordenada Este / X en planta CAD (metros). */
  x: number
  /** Coordenada Norte / Y en planta CAD (metros). */
  y: number
  /** Elevación / Cota Z (metros). */
  z: number
}

export interface ParsedTopography {
  format: 'DXF' | 'CSV' | 'TXT' | 'GeoJSON'
  points: TopographyPoint3D[]
  contourLinesCount: number
  datumShiftZ: number
  bounds: {
    minX: number
    maxX: number
    minY: number
    maxY: number
    minZ: number
    maxZ: number
    width: number
    depth: number
    relief: number
  }
}

interface DxfPair {
  code: number
  value: string
}

function tokenizeDxf(text: string): DxfPair[] {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  const pairs: DxfPair[] = []
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = Number.parseInt(lines[i].trim(), 10)
    if (Number.isNaN(code)) continue
    pairs.push({ code, value: lines[i + 1].trim() })
  }
  return pairs
}

function readInsUnitsScaleToMeters(pairs: DxfPair[]): number {
  for (let i = 0; i < pairs.length - 2; i++) {
    if (pairs[i].code === 9 && pairs[i].value === '$INSUNITS') {
      for (let j = i + 1; j < Math.min(i + 6, pairs.length); j++) {
        if (pairs[j].code === 70) {
          const u = Number.parseInt(pairs[j].value, 10)
          switch (u) {
            case 1:
              return 0.0254 // pulgadas
            case 2:
              return 0.3048 // pies
            case 4:
              return 0.001 // milímetros
            case 5:
              return 0.01 // centímetros
            case 6:
              return 1 // metros
            case 7:
              return 1000 // kilómetros
            default:
              return 1
          }
        }
      }
    }
  }
  return 1
}

function sampleSegment3D(
  a: TopographyPoint3D,
  b: TopographyPoint3D,
  out: TopographyPoint3D[],
  maxStep = 2.5
): void {
  const dist = Math.hypot(b.x - a.x, b.y - a.y)
  const steps = Math.max(1, Math.min(24, Math.ceil(dist / Math.max(0.5, maxStep))))
  for (let s = 0; s <= steps; s++) {
    const t = s / steps
    out.push({
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
      z: a.z + (b.z - a.z) * t
    })
  }
}

function finalizeParsedTopography(
  rawPoints: TopographyPoint3D[],
  format: ParsedTopography['format'],
  contourLinesCount: number
): ParsedTopography {
  const valid = rawPoints.filter(
    (p) => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z)
  )
  if (valid.length === 0) {
    throw new Error(`No se encontraron puntos con coordenadas 3D válidas en el archivo ${format}.`)
  }

  let rawMinZ = Infinity
  let rawMaxZ = -Infinity
  for (const p of valid) {
    if (p.z < rawMinZ) rawMinZ = p.z
    if (p.z > rawMaxZ) rawMaxZ = p.z
  }

  // Si las cotas provienen de altitud absoluta sobre el nivel del mar (> 200 m),
  // se traslada el datum base a 0 m para mantener el terreno visible en el espacio de trabajo.
  const datumShiftZ = Math.abs(rawMinZ) > 200 ? Math.floor(rawMinZ) : 0

  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity

  const normalized: TopographyPoint3D[] = valid.map((p) => {
    const z = p.z - datumShiftZ
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.y < minY) minY = p.y
    if (p.y > maxY) maxY = p.y
    if (z < minZ) minZ = z
    if (z > maxZ) maxZ = z
    return { x: p.x, y: p.y, z }
  })

  return {
    format,
    points: normalized,
    contourLinesCount,
    datumShiftZ,
    bounds: {
      minX,
      maxX,
      minY,
      maxY,
      minZ,
      maxZ,
      width: Math.max(0, maxX - minX),
      depth: Math.max(0, maxY - minY),
      relief: Math.max(0, maxZ - minZ)
    }
  }
}

/**
 * Extrae puntos 3D y curvas de nivel desde un archivo `.DXF` topográfico.
 */
export function parseDxfTopography(text: string): ParsedTopography {
  const pairs = tokenizeDxf(text)
  const unitScale = readInsUnitsScaleToMeters(pairs)

  // Localizar sección ENTITIES (si existe; si no, recorrer todo el archivo)
  let startIdx = 0
  let endIdx = pairs.length
  for (let i = 0; i < pairs.length - 1; i++) {
    if (pairs[i].code === 0 && pairs[i].value.toUpperCase() === 'SECTION') {
      if (pairs[i + 1].code === 2 && pairs[i + 1].value.toUpperCase() === 'ENTITIES') {
        startIdx = i + 2
        for (let j = startIdx; j < pairs.length; j++) {
          if (pairs[j].code === 0 && pairs[j].value.toUpperCase() === 'ENDSEC') {
            endIdx = j
            break
          }
        }
        break
      }
    }
  }

  const points: TopographyPoint3D[] = []
  let contourLinesCount = 0

  let i = startIdx
  while (i < endIdx) {
    if (pairs[i].code !== 0) {
      i++
      continue
    }
    const entity = pairs[i].value.toUpperCase()
    i++

    if (entity === 'POINT') {
      let x = 0
      let y = 0
      let z = 0
      let hasXY = false
      while (i < endIdx && pairs[i].code !== 0) {
        const { code, value } = pairs[i]
        if (code === 10) {
          x = Number.parseFloat(value) * unitScale
          hasXY = true
        } else if (code === 20) {
          y = Number.parseFloat(value) * unitScale
        } else if (code === 30) {
          z = Number.parseFloat(value) * unitScale
        }
        i++
      }
      if (hasXY) points.push({ x, y, z })
    } else if (entity === 'LINE') {
      let x1 = 0, y1 = 0, z1 = 0
      let x2 = 0, y2 = 0, z2 = 0
      let has1 = false, has2 = false
      while (i < endIdx && pairs[i].code !== 0) {
        const { code, value } = pairs[i]
        if (code === 10) { x1 = Number.parseFloat(value) * unitScale; has1 = true }
        else if (code === 20) y1 = Number.parseFloat(value) * unitScale
        else if (code === 30) z1 = Number.parseFloat(value) * unitScale
        else if (code === 11) { x2 = Number.parseFloat(value) * unitScale; has2 = true }
        else if (code === 21) y2 = Number.parseFloat(value) * unitScale
        else if (code === 31) z2 = Number.parseFloat(value) * unitScale
        i++
      }
      if (has1 && has2) {
        contourLinesCount++
        sampleSegment3D({ x: x1, y: y1, z: z1 }, { x: x2, y: y2, z: z2 }, points)
      }
    } else if (entity === 'LWPOLYLINE') {
      let elevation = 0
      let closed = false
      const verts: Array<{ x: number; y: number }> = []
      let curX: number | null = null
      while (i < endIdx && pairs[i].code !== 0) {
        const { code, value } = pairs[i]
        if (code === 38) elevation = Number.parseFloat(value) * unitScale
        else if (code === 70) closed = (Number.parseInt(value, 10) & 1) === 1
        else if (code === 10) {
          curX = Number.parseFloat(value) * unitScale
        } else if (code === 20 && curX !== null) {
          verts.push({ x: curX, y: Number.parseFloat(value) * unitScale })
          curX = null
        }
        i++
      }
      if (verts.length > 0) {
        contourLinesCount++
        for (let k = 0; k < verts.length - 1; k++) {
          sampleSegment3D(
            { x: verts[k].x, y: verts[k].y, z: elevation },
            { x: verts[k + 1].x, y: verts[k + 1].y, z: elevation },
            points
          )
        }
        if (closed && verts.length >= 3) {
          sampleSegment3D(
            { x: verts[verts.length - 1].x, y: verts[verts.length - 1].y, z: elevation },
            { x: verts[0].x, y: verts[0].y, z: elevation },
            points
          )
        } else if (verts.length === 1) {
          points.push({ x: verts[0].x, y: verts[0].y, z: elevation })
        }
      }
    } else if (entity === 'POLYLINE') {
      let defaultZ = 0
      let closed = false
      while (i < endIdx && pairs[i].code !== 0) {
        const { code, value } = pairs[i]
        if (code === 30) defaultZ = Number.parseFloat(value) * unitScale
        else if (code === 70) closed = (Number.parseInt(value, 10) & 1) === 1
        i++
      }
      const verts: TopographyPoint3D[] = []
      while (i < endIdx) {
        if (pairs[i].code === 0) {
          const sub = pairs[i].value.toUpperCase()
          if (sub === 'SEQEND') {
            i++
            while (i < endIdx && pairs[i].code !== 0) i++
            break
          }
          if (sub === 'VERTEX') {
            i++
            let vx = 0, vy = 0, vz = defaultZ
            let hasV = false
            while (i < endIdx && pairs[i].code !== 0) {
              const { code, value } = pairs[i]
              if (code === 10) { vx = Number.parseFloat(value) * unitScale; hasV = true }
              else if (code === 20) vy = Number.parseFloat(value) * unitScale
              else if (code === 30) vz = Number.parseFloat(value) * unitScale
              i++
            }
            if (hasV) verts.push({ x: vx, y: vy, z: vz })
            continue
          }
          break
        }
        i++
      }
      if (verts.length > 0) {
        contourLinesCount++
        for (let k = 0; k < verts.length - 1; k++) {
          sampleSegment3D(verts[k], verts[k + 1], points)
        }
        if (closed && verts.length >= 3) {
          sampleSegment3D(verts[verts.length - 1], verts[0], points)
        } else if (verts.length === 1) {
          points.push(verts[0])
        }
      }
    } else if (entity === '3DFACE') {
      const xs: number[] = [0, 0, 0, 0]
      const ys: number[] = [0, 0, 0, 0]
      const zs: number[] = [0, 0, 0, 0]
      const seen: boolean[] = [false, false, false, false]
      while (i < endIdx && pairs[i].code !== 0) {
        const { code, value } = pairs[i]
        if (code >= 10 && code <= 13) {
          xs[code - 10] = Number.parseFloat(value) * unitScale
          seen[code - 10] = true
        } else if (code >= 20 && code <= 23) {
          ys[code - 20] = Number.parseFloat(value) * unitScale
        } else if (code >= 30 && code <= 33) {
          zs[code - 30] = Number.parseFloat(value) * unitScale
        }
        i++
      }
      for (let c = 0; c < 4; c++) {
        if (seen[c]) points.push({ x: xs[c], y: ys[c], z: zs[c] })
      }
    } else if (entity === 'SPLINE') {
      const verts: TopographyPoint3D[] = []
      let curX: number | null = null
      let curY: number | null = null
      while (i < endIdx && pairs[i].code !== 0) {
        const { code, value } = pairs[i]
        if (code === 10 || code === 11) {
          if (curX !== null && curY !== null) verts.push({ x: curX, y: curY, z: 0 })
          curX = Number.parseFloat(value) * unitScale
          curY = null
        } else if ((code === 20 || code === 21) && curX !== null) {
          curY = Number.parseFloat(value) * unitScale
        } else if ((code === 30 || code === 31) && curX !== null && curY !== null) {
          verts.push({ x: curX, y: curY, z: Number.parseFloat(value) * unitScale })
          curX = null
          curY = null
        }
        i++
      }
      if (curX !== null && curY !== null) verts.push({ x: curX, y: curY, z: 0 })
      if (verts.length > 0) {
        contourLinesCount++
        for (let k = 0; k < verts.length - 1; k++) {
          sampleSegment3D(verts[k], verts[k + 1], points)
        }
      }
    } else {
      while (i < endIdx && pairs[i].code !== 0) i++
    }
  }

  return finalizeParsedTopography(points, 'DXF', contourLinesCount)
}

/**
 * Parsea archivos de puntos topográficos `.CSV` o `.TXT` en formato `X,Y,Z`
 * o `ID,X,Y,Z` (delimitados por coma, punto y coma, tabulador o espacios).
 */
export function parseCsvTxtTopography(text: string, format: 'CSV' | 'TXT' = 'CSV'): ParsedTopography {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  const points: TopographyPoint3D[] = []

  // Detectar índices de columnas X, Y, Z si hay cabecera explícita
  let colX = 0
  let colY = 1
  let colZ = 2
  let headerChecked = false

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#') || line.startsWith('//')) continue

    const separator = line.includes(';')
      ? ';'
      : line.includes(',')
        ? ','
        : /\s+/
    const tokens = line.split(separator).map((t) => t.trim()).filter(Boolean)
    if (tokens.length < 3) continue

    const nums = tokens.map((t) => Number(t))
    const allNumeric = nums.every((n) => Number.isFinite(n))

    if (!headerChecked) {
      headerChecked = true
      if (!allNumeric) {
        const lower = tokens.map((t) => t.toLowerCase())
        const ix = lower.findIndex((h) => h === 'x' || h === 'este' || h === 'easting' || h === 'lon' || h === 'lng')
        const iy = lower.findIndex((h) => h === 'y' || h === 'norte' || h === 'northing' || h === 'lat')
        const iz = lower.findIndex((h) => h === 'z' || h === 'cota' || h === 'elev' || h === 'elevation' || h === 'altura' || h === 'nivel')
        if (ix >= 0 && iy >= 0 && iz >= 0) {
          colX = ix
          colY = iy
          colZ = iz
        } else if (tokens.length >= 4) {
          colX = 1
          colY = 2
          colZ = 3
        }
        continue
      }
    }

    if (nums.length >= 3) {
      // Soportar formato PENZD / ID,X,Y,Z cuando la primera columna es un ID alfanumérico o entero secuencial con 4+ columnas
      if (tokens.length >= 4 && (!Number.isFinite(nums[0]) || (colX === 0 && colY === 1 && colZ === 2 && !Number.isFinite(nums[0])))) {
        const x = Number(tokens[1])
        const y = Number(tokens[2])
        const z = Number(tokens[3])
        if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
          points.push({ x, y, z })
        }
        continue
      }
      const x = nums[colX]
      const y = nums[colY]
      const z = nums[colZ]
      if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
        points.push({ x, y, z })
      }
    }
  }

  return finalizeParsedTopography(points, format, 0)
}

function readFeatureElevation(props: Record<string, unknown> | null | undefined): number | null {
  if (!props || typeof props !== 'object') return null
  const keys = ['elevation', 'ele', 'z', 'cota', 'height', 'nivel', 'alt', 'altitude', 'Z', 'ELEV', 'COTA']
  for (const key of keys) {
    if (key in props) {
      const val = Number(props[key])
      if (Number.isFinite(val)) return val
    }
  }
  return null
}

/**
 * Parsea un archivo `.GeoJSON` extrayendo geometrías puntuales, curvas de nivel
 * (`LineString` / `MultiLineString`) y polígonos con elevación 3D o atributo de cota.
 */
export function parseGeoJsonTopography(text: string): ParsedTopography {
  let doc: unknown
  try {
    doc = JSON.parse(text)
  } catch (err) {
    throw new Error(`El archivo GeoJSON no es un JSON válido: ${err instanceof Error ? err.message : String(err)}`)
  }
  if (!doc || typeof doc !== 'object') {
    throw new Error('El archivo GeoJSON no contiene un objeto geográfico válido.')
  }

  const rawCoords: TopographyPoint3D[] = []
  let contourLinesCount = 0

  const pushCoord = (coord: unknown, propZ: number | null): TopographyPoint3D | null => {
    if (!Array.isArray(coord) || coord.length < 2) return null
    const x = Number(coord[0])
    const y = Number(coord[1])
    const zCandidate = coord.length >= 3 ? Number(coord[2]) : NaN
    const z = Number.isFinite(zCandidate) ? zCandidate : propZ ?? 0
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null
    return { x, y, z }
  }

  const visitGeometry = (geom: Record<string, unknown> | null | undefined, propZ: number | null): void => {
    if (!geom || typeof geom !== 'object') return
    const type = String(geom.type ?? '')
    const coords = geom.coordinates

    if (type === 'Point') {
      const pt = pushCoord(coords, propZ)
      if (pt) rawCoords.push(pt)
    } else if (type === 'MultiPoint' && Array.isArray(coords)) {
      for (const c of coords) {
        const pt = pushCoord(c, propZ)
        if (pt) rawCoords.push(pt)
      }
    } else if (type === 'LineString' && Array.isArray(coords)) {
      contourLinesCount++
      const linePts = coords.map((c) => pushCoord(c, propZ)).filter((p): p is TopographyPoint3D => p !== null)
      for (const p of linePts) rawCoords.push(p)
    } else if (type === 'MultiLineString' && Array.isArray(coords)) {
      for (const line of coords) {
        if (!Array.isArray(line)) continue
        contourLinesCount++
        for (const c of line) {
          const pt = pushCoord(c, propZ)
          if (pt) rawCoords.push(pt)
        }
      }
    } else if (type === 'Polygon' && Array.isArray(coords)) {
      for (const ring of coords) {
        if (!Array.isArray(ring)) continue
        contourLinesCount++
        for (const c of ring) {
          const pt = pushCoord(c, propZ)
          if (pt) rawCoords.push(pt)
        }
      }
    } else if (type === 'MultiPolygon' && Array.isArray(coords)) {
      for (const poly of coords) {
        if (!Array.isArray(poly)) continue
        for (const ring of poly) {
          if (!Array.isArray(ring)) continue
          contourLinesCount++
          for (const c of ring) {
            const pt = pushCoord(c, propZ)
            if (pt) rawCoords.push(pt)
          }
        }
      }
    } else if (type === 'GeometryCollection' && Array.isArray(geom.geometries)) {
      for (const sub of geom.geometries) {
        visitGeometry(sub as Record<string, unknown>, propZ)
      }
    }
  }

  const root = doc as Record<string, unknown>
  if (root.type === 'FeatureCollection' && Array.isArray(root.features)) {
    for (const f of root.features) {
      if (!f || typeof f !== 'object') continue
      const feat = f as Record<string, unknown>
      const propZ = readFeatureElevation(feat.properties as Record<string, unknown> | undefined)
      visitGeometry(feat.geometry as Record<string, unknown> | undefined, propZ)
    }
  } else if (root.type === 'Feature') {
    const propZ = readFeatureElevation(root.properties as Record<string, unknown> | undefined)
    visitGeometry(root.geometry as Record<string, unknown> | undefined, propZ)
  } else {
    visitGeometry(root, null)
  }

  if (rawCoords.length === 0) {
    throw new Error('El archivo GeoJSON no contiene puntos ni curvas de nivel con coordenadas válidas.')
  }

  // Detectar si las coordenadas están en grados geográficos WGS84 (lon/lat) y proyectarlas a metros locales
  let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity
  for (const p of rawCoords) {
    if (p.x < minLon) minLon = p.x
    if (p.x > maxLon) maxLon = p.x
    if (p.y < minLat) minLat = p.y
    if (p.y > maxLat) maxLat = p.y
  }
  const looksGeographic =
    minLon >= -180 &&
    maxLon <= 180 &&
    minLat >= -90 &&
    maxLat <= 90 &&
    maxLon - minLon < 2 &&
    maxLat - minLat < 2 &&
    maxLon - minLon > 0 &&
    maxLon - minLon < 1.5 &&
    (Math.abs(minLon) > 0.001 || Math.abs(minLat) > 0.001) &&
    maxLon - minLon < 0.5

  let metricPoints = rawCoords
  if (looksGeographic) {
    const centerLon = (minLon + maxLon) / 2
    const centerLat = (minLat + maxLat) / 2
    const metersPerDegLat = 111_132.92
    const metersPerDegLon = 111_412.84 * Math.cos((centerLat * Math.PI) / 180)
    metricPoints = rawCoords.map((p) => ({
      x: (p.x - centerLon) * metersPerDegLon,
      y: (p.y - centerLat) * metersPerDegLat,
      z: p.z
    }))
  }

  return finalizeParsedTopography(metricPoints, 'GeoJSON', contourLinesCount)
}

/**
 * Punto de entrada unificado por extensión (`.dxf`, `.csv`, `.txt`, `.geojson`, `.json`).
 */
export function parseTopographyFile(text: string, extensionOrFileName: string): ParsedTopography {
  const trimmed = extensionOrFileName.trim()
  const ext = (trimmed.includes('.') ? trimmed.split('.').pop() ?? '' : trimmed).toLowerCase()
  if (ext === 'dxf') return parseDxfTopography(text)
  if (ext === 'csv') return parseCsvTxtTopography(text, 'CSV')
  if (ext === 'txt' || ext === 'xyz' || ext === 'pts') return parseCsvTxtTopography(text, 'TXT')
  if (ext === 'geojson' || ext === 'json') return parseGeoJsonTopography(text)
  throw new Error(`Formato topográfico «.${ext}» no soportado. Usa DXF, CSV, TXT o GeoJSON.`)
}
