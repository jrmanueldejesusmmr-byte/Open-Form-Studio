import { describe, it, expect } from 'vitest'
import { parseIfc, splitIfcArgs, ifcString, ifcNumber, ifcRef, planIfcImport, type ParsedIfc } from '../import/ifcImport'

const SAMPLE_IFC = `ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('ViewDefinition [DesignTransferView_V1.0]'),'2;1');
FILE_NAME('test.ifc','2026-01-01T00:00:00',('Test'),('Test'),'Test','Test','');
FILE_SCHEMA(('IFC4'));
ENDSEC;
DATA;
#1=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);
#2=IFCUNITASSIGNMENT((#1));
#3=CARTESIAN_POINT('',(0.,0.,0.));
#4=DIRECTION('',(0.,0.,1.));
#5=DIRECTION('',(1.,0.));
#6=IFCAXIS2PLACEMENT3D($,#3,#4,#5);
#7=IFCLOCALPLACEMENT($,#6);
#8=IFCPROJECT('Test Project',#0000000000000000000001,$,$,$,$,$,$,(#7),#2);
#9=IFCSITE('Site',#0000000000000000000002,$,$,$,#7,$,$,.ELEMENT.,$,$,$,$,$);
#10=IFCBUILDING('Building',#0000000000000000000003,$,$,$,#7,$,$,.ELEMENT.,$,$,$);
#11=CARTESIAN_POINT('',(0.,0.,0.));
#12=DIRECTION('',(0.,0.,1.));
#13=DIRECTION('',(1.,0.));
#14=IFCAXIS2PLACEMENT3D($,#11,#12,#13);
#15=IFCLOCALPLACEMENT(#7,#14);
#16=IFCBUILDINGSTOREY('Storey',#000000000000000000000A,$,$,$,#15,$,$,.ELEMENT.,0.);
#17=IFCRELAGGREGATES('x',#0000000000000000000004,$,$,$,#8,(#10));
#18=IFCRELAGGREGATES('x',#0000000000000000000005,$,$,$,#10,(#16));
#19=CARTESIAN_POINT('',(0.,0.,0.));
#20=DIRECTION('',(0.,0.,1.));
#21=DIRECTION('',(1.,0.));
#22=IFCAXIS2PLACEMENT3D($,#19,#20,#21);
#23=IFCRECTANGLEPROFILEDEF(.AREA.,'Perfil',$,#22,8.,0.2.);
#24=CARTESIAN_POINT('',(0.,0.,0.));
#25=DIRECTION('',(0.,0.,1.));
#26=IFCEXTRUDEDAREASOLID($,#23,#24,#22,2.8.);
#27=CARTESIAN_POINT('',(4.,0.,0.));
#28=DIRECTION('',(0.,0.,1.));
#29=DIRECTION('',(1.,0.));
#30=IFCAXIS2PLACEMENT3D($,#27,#28,#29);
#31=IFCLOCALPLACEMENT(#15,#30);
#32=IFCWALLSTANDARDCASE('Muro 1',#000000000000000000000B,$,$,$,#31,$,#26,$,$);
#33=IFCRELCONTAINEDINSPATIALSTRUCTURE('Muro 1',#000000000000000000000C,$,$,$,(#32),#16);
#34=CARTESIAN_POINT('',(0.,0.,0.));
#35=DIRECTION('',(0.,0.,1.));
#36=DIRECTION('',(1.,0.));
#37=IFCAXIS2PLACEMENT3D($,#34,#35,#36);
#38=IFCRECTANGLEPROFILEDEF(.AREA.,'Perfil Puerta',$,#37,0.9,0.05.);
#39=CARTESIAN_POINT('',(0.,0.,0.));
#40=DIRECTION('',(0.,0.,1.));
#41=IFCEXTRUDEDAREASOLID($,#38,#39,#37,2.1.);
#42=CARTESIAN_POINT('',(4.,2.,0.));
#43=DIRECTION('',(0.,0.,1.));
#44=DIRECTION('',(1.,0.));
#45=IFCAXIS2PLACEMENT3D($,#42,#43,#44);
#46=IFCLOCALPLACEMENT(#15,#45);
#47=IFCDOOR('Puerta 1',#000000000000000000000D,$,$,$,#46,$,#41,$,$);
#48=IFCRELCONTAINEDINSPATIALSTRUCTURE('Puerta 1',#000000000000000000000E,$,$,$,(#47),#16);
ENDSEC;
ENDISO-10303-21;`

describe('importar IFC4', () => {
  it('parseIfc lee entidades y unidades', () => {
    const parsed = parseIfc(SAMPLE_IFC)
    expect(parsed.lengthUnit).toBe('METRE')
    expect(parsed.projectName).toBe('Test Project')
    const walls = parsed.entities.filter((e) => e.type === 'IFCWALLSTANDARDCASE')
    expect(walls.length).toBe(1)
    const doors = parsed.entities.filter((e) => e.type === 'IFCDOOR')
    expect(doors.length).toBe(1)
  })

  it('splitIfcArgs divide argumentos respetando parentesis', () => {
    const args = splitIfcArgs("'Muro',#000000000000000000000B,$,$,$,#31,$,#26,$,$")
    expect(args.length).toBe(10)
    expect(args[0]).toBe("'Muro'")
    expect(args[1]).toBe('#000000000000000000000B')
  })

  it('ifcString extrae texto entre comillas', () => {
    expect(ifcString("'Hola Mundo'")).toBe('Hola Mundo')
    expect(ifcString('$')).toBeNull()
    expect(ifcString('#42')).toBeNull()
  })

  it('ifcNumber y ifcRef extraen valores', () => {
    expect(ifcNumber('8.')).toBe(8)
    expect(ifcNumber('0.2.')).toBe(0.2)
    expect(ifcNumber('$')).toBeNull()
    expect(ifcRef('#31')).toBe(31)
    expect(ifcRef('$')).toBeNull()
  })

  it('planIfcImport extrae muros y puertas con medidas', () => {
    const parsed = parseIfc(SAMPLE_IFC)
    const plan = planIfcImport(parsed)
    expect(plan.walls.length).toBe(1)
    expect(plan.openings.length).toBe(1)

    const wall = plan.walls[0]
    // Muro en (4,0) con largo 8, espesor 0.2, alto 2.8
    expect(wall.x).toBeCloseTo(4, 5)
    expect(wall.z).toBeCloseTo(0, 5)
    expect(wall.length).toBeCloseTo(8, 5)
    expect(wall.thickness).toBeCloseTo(0.2, 5)
    expect(wall.height).toBeCloseTo(2.8, 5)

    const door = plan.openings[0]
    expect(door.kind).toBe('door')
    expect(door.x).toBeCloseTo(4, 5)
    expect(door.y).toBeCloseTo(2, 5)
    expect(door.z).toBeCloseTo(0, 5)
    expect(door.width).toBeCloseTo(0.9, 5)
    expect(door.height).toBeCloseTo(2.1, 5)
  })
})
