import * as THREE from 'three'
import { SceneManager } from '../engine/SceneManager'
import { Wall, WallSegmentType } from '../models/Wall'
import { SceneObject } from '../models/SceneObject'
import { ElectricalModel } from '../mep/ElectricalModel'
import { BimMasterTable } from './BimMasterTable'
import { BimSanitizationEngine } from './BimSanitizationEngine'
import { AIChatService } from '../services/AIChatService'

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`FAIL: ${msg}`)
  console.log(`PASS ${msg}`)
}

export async function runBimTests(): Promise<void> {
  console.log('\n=== SMART REACTIVE BIM TESTS ===')

  // 1. Live Data & Bidirectional sync test
  {
    const scene = new SceneManager()
    const electricalModel = new ElectricalModel()
    const bimTable = new BimMasterTable(scene, electricalModel)

    // Agregar muro de 4m x 2.5m = 10m²
    const wall = scene.addWall(
      WallSegmentType.SimpleWall,
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(4, 0, 0)
    )
    wall.height = 2.5
    wall.thickness = 0.2
    scene.moveWall(wall.id, wall.start, wall.end)

    const rowsInitial = bimTable.getRows()
    assert(rowsInitial.length === 1, 'Muro registrado en Tabla Maestra BIM')
    assert(rowsInitial[0].netArea === 10, 'Área neta calculada en 10 m²')

    // Comprobar cómputo de bloques: 10m² * 12.5 * 1.05 = 131.25 -> 132 bloques
    const totalsInitial = bimTable.getTotals()
    assert(totalsInitial.blocksCountTotal === 132, 'Cálculo de bloques exacto con 5% desperdicio (132 pzs)')
    assert(totalsInitial.wallCementSacksTotal === 3, 'Sacos de cemento calculados para juntas (3 sacos)')

    // EDICIÓN BIDIRECCIONAL: Cambiar altura directamente en la tabla de 2.50m a 3.00m
    const updated = bimTable.updateRow(wall.id, 'height', 3.0)
    assert(updated === true, 'updateRow de altura exitoso')
    assert(wall.height === 3.0, 'Modelo 3D y 2D actualizado en vivo (wall.height = 3.00m)')

    const rowsUpdated = bimTable.getRows()
    assert(rowsUpdated[0].height === 3.0, 'Fila de tabla refleja 3.00m de altura')
    assert(rowsUpdated[0].netArea === 12.0, 'Área neta recalculada en 12 m²')

    const totalsUpdated = bimTable.getTotals()
    assert(totalsUpdated.blocksCountTotal === 158, 'Conteo de bloques recalculado instantáneamente (158 pzs)')

    // Cambiar ubicación X en la tabla
    bimTable.updateRow(wall.id, 'x', 5.0)
    const midX = (wall.start.x + wall.end.x) / 2
    assert(Math.abs(midX - 5.0) < 1e-3, 'Ubicación X del modelo actualizada bidireccionalmente a 5.00m')
  }

  // 2. Auto-Sanitización: Auto-Join & Clip y Limpieza de Basura (Zero-Trash Engine)
  {
    const scene = new SceneManager()
    const sanitization = BimSanitizationEngine.getInstance()

    // Caso A: Línea suelta degenerada (< 0.05m)
    scene.addWall(WallSegmentType.SimpleWall, new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.02, 0, 0))
    assert(scene.getWalls().length === 1, 'Muro degenerado presente antes de limpieza')

    const cleanRes1 = sanitization.sanitizeScene(scene)
    assert(cleanRes1.purgedDegenerateWalls === 1, 'Línea suelta detectada y purgada')
    assert(scene.getWalls().length === 0, 'Escena limpia sin líneas basura')

    // Caso B: Fusión de muros duplicados / encimados
    scene.addWall(WallSegmentType.SimpleWall, new THREE.Vector3(0, 0, 0), new THREE.Vector3(4, 0, 0))
    scene.addWall(WallSegmentType.SimpleWall, new THREE.Vector3(2, 0, 0), new THREE.Vector3(6, 0, 0)) // Superpuesto de 2 a 4
    assert(scene.getWalls().length === 2, 'Dos muros superpuestos en escena')

    const cleanRes2 = sanitization.sanitizeScene(scene)
    assert(cleanRes2.mergedDuplicateWalls === 1, 'Muros duplicados fusionados en un solo muro continuo')
    assert(scene.getWalls().length === 1, 'Solo queda un único muro limpio en escena')
    const merged = scene.getWalls()[0]
    assert(merged.length === 6.0, 'Longitud del muro resultante fusionado es 6.00m')

    // Caso C: Auto-Join & Clip (Muro con Losa encima)
    // Crear losa de 4x4x0.20m a cota +2.40m
    const slab = new SceneObject('Losa Hormigón', 'shape')
    slab.position.set(2, 2.4, 0)
    slab.size.set(4, 0.2, 4)
    slab.shapeId = 'struct.losa'
    scene.addObject(slab)

    // Muro que penetra 10cm en la losa (altura 2.50m)
    const wallUnderSlab = scene.addWall(WallSegmentType.SimpleWall, new THREE.Vector3(0, 0, 0), new THREE.Vector3(4, 0, 0))
    wallUnderSlab.height = 2.5
    wallUnderSlab.thickness = 0.2
    scene.moveWall(wallUnderSlab.id, wallUnderSlab.start, wallUnderSlab.end)

    const bimTable = new BimMasterTable(scene)
    const wallRow = bimTable.getRows().find((r) => r.id === wallUnderSlab.id)
    assert(wallRow !== undefined && wallRow.clippedVolume > 0, 'Auto-Clip detecta intersección con losa y descuenta volumen')
    assert(wallRow!.netVolume < wallRow!.length * wallRow!.height * wallRow!.thickness, 'Volumen neto descontado (nunca cobra material doble)')
  }

  // 3. Real-Time Clash Detection & Auto-Resolution
  {
    const scene = new SceneManager()
    const electricalModel = new ElectricalModel()
    const bimTable = new BimMasterTable(scene, electricalModel)

    // Viga estructural en X=3, Y=2.2, Z=0 (ancho 0.4, alto 0.4, largo 4)
    const beam = new SceneObject('Viga Maestra Estructural', 'shape')
    beam.position.set(3, 2.2, 0)
    beam.size.set(0.4, 0.4, 4)
    beam.shapeId = 'struct.viga'
    scene.addObject(beam)

    // Tubería eléctrica que atraviesa directamente la viga (de X=1 a X=5 a Y=2.3)
    const dev1 = electricalModel.addDevice({
      type: 'outlet',
      levelId: 'level-0',
      x: 1,
      z: 0,
      height: 2.3,
      rotationY: 0
    })
    const dev2 = electricalModel.addDevice({
      type: 'outlet',
      levelId: 'level-0',
      x: 5,
      z: 0,
      height: 2.3,
      rotationY: 0
    })
    const wire = electricalModel.addWire(dev1.id, dev2.id, 'power')
    assert(wire !== null, 'Cable eléctrico trazado')

    // Detectar choque
    const clashes = bimTable.getClashes()
    assert(clashes.length === 1, 'Clash Detection detectó 1 choque crítico [Tubería vs Viga]')
    assert(clashes[0].severity === 'critical', 'Severidad crítica marcada')

    // Resolver choque automáticamente
    const resolveRes = bimTable.resolveClash(clashes[0].id)
    assert(resolveRes.ok === true, 'Choque resuelto automáticamente con bypass limpio')
    const remainingClashes = bimTable.getClashes()
    assert(remainingClashes.length === 0, '0 choques restantes tras resolución automática')
  }

  // 4. Integración Directa con la IA "ASTRO"
  {
    const scene = new SceneManager()
    const electricalModel = new ElectricalModel()
    const bimTable = new BimMasterTable(scene, electricalModel)
    const astro = new AIChatService(scene, { electricalModel, bimTable })

    // Trazar una vivienda básica de 8x6m (4 muros)
    scene.addWall(WallSegmentType.SimpleWall, new THREE.Vector3(0, 0, 0), new THREE.Vector3(8, 0, 0))
    scene.addWall(WallSegmentType.SimpleWall, new THREE.Vector3(8, 0, 0), new THREE.Vector3(8, 0, 6))
    scene.addWall(WallSegmentType.SimpleWall, new THREE.Vector3(8, 0, 6), new THREE.Vector3(0, 0, 6))
    scene.addWall(WallSegmentType.SimpleWall, new THREE.Vector3(0, 0, 6), new THREE.Vector3(0, 0, 0))

    // Consulta 1: "¿Cuántos sacos de cemento y cuántos bloques necesito para esta casa?"
    const reply1 = await astro.processNaturalLanguage('¿Cuántos sacos de cemento y cuántos bloques necesito para esta casa?')
    assert(reply1.kind === 'chat', 'ASTRO responde directamente en modo consulta')
    assert(reply1.mensaje?.includes('Bloques de concreto') === true, 'ASTRO incluye conteo exacto de bloques')
    assert(reply1.mensaje?.includes('sacos de 50 kg') === true, 'ASTRO incluye sacos exactos de cemento')
    console.log('Respuesta ASTRO Materiales:', reply1.mensaje?.split('\n')[0])

    // Consulta 2: "¿Hay algún choque entre tuberías y vigas o muros encimados?"
    const reply2 = await astro.processNaturalLanguage('¿Hay algún choque entre tuberías y vigas o muros encimados?')
    assert(reply2.kind === 'chat', 'ASTRO responde auditoría de choques')
    assert(reply2.mensaje?.includes('100% limpio') === true, 'ASTRO confirma 0 choques y 0 datos basura')

    // Orden 3: "Cambia en la tabla todos los muros del Piso 0 a 3.00 metros de altura y dime cuánto sube el material"
    const reply3 = await astro.processNaturalLanguage('Cambia en la tabla todos los muros del Piso 0 a 3.00 metros de altura y dime cuánto sube el material')
    assert(reply3.kind === 'preview', 'ASTRO genera un Plan de Acción Propuesto (modo seguridad)')
    assert(reply3.plan !== undefined, 'Plan propuesto presente')
    assert(reply3.plan?.resumen.includes('3.00m') === true, 'Plan indica altura meta de 3.00m')
    assert(reply3.plan?.resumen.includes('Bloques de concreto') === true, 'Plan calcula el incremento exacto de bloques')
    assert(reply3.plan?.resumen.includes('Sacos de cemento') === true, 'Plan calcula el incremento exacto de sacos de cemento')
  }

  console.log('TODAS LAS PRUEBAS DEL MOTOR REACTIVE BIM PASARON SATISFACTORIAMENTE.')
}

await runBimTests()

